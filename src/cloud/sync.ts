import type { Engine, LibraryTrack, RemoteTrack, TrackCues } from "@/engine/engine";
import { rememberCues } from "@/engine/cue-store";
import { Store } from "@/engine/store";

import { hasCached, requestPersistentStorage, writeCached } from "./cache";
import { API_BASE, cloudConfigured, contentTypeFor, supabase } from "./config";

interface TrackRow {
  hash: string;
  ext: string;
  size: number;
  title: string;
  artist: string;
  duration: number | null;
  bpm: number | null;
  first_beat: number | null;
  key_tonic: number | null;
  key_mode: "major" | "minor" | null;
  cue: number | null;
  hot_cues: (number | null)[];
  uploaded: boolean;
}

export interface CloudSyncState {
  configured: boolean;
  user: { id: string; email: string } | null;
  busy: "auth" | "refresh" | "upload" | "download" | null;
  /** Short status for the cloud bar, for example "Uploaded 12 of 40". */
  message: string | null;
  error: string | null;
}

const CONCURRENCY = 2;
const CUE_SAVE_DELAY_MS = 1500;

const toRemote = (row: TrackRow): RemoteTrack => ({
  artist: row.artist,
  bpm: row.bpm,
  cues: { cue: row.cue, hotCues: Array.isArray(row.hot_cues) ? row.hot_cues : [] },
  duration: row.duration,
  ext: row.ext,
  hash: row.hash,
  key: row.key_tonic !== null && row.key_mode ? { mode: row.key_mode, tonic: row.key_tonic } : null,
  size: row.size,
  title: row.title,
});

const errorText = (error: unknown) => {
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : String(error);
  return /failed to fetch|networkerror|load failed/i.test(message)
    ? "Could not reach the cloud service. Check the internet connection and the cloud settings."
    : message;
};

/** Runs `task` over `items`, `limit` at a time. */
const pool = async <T>(items: T[], limit: number, task: (item: T) => Promise<void>) => {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
};

const putWithProgress = (url: string, data: ArrayBuffer, contentType: string, onProgress: (p: number) => void) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed: network error or storage CORS settings"));
    xhr.send(data);
  });

const getWithProgress = async (url: string, onProgress: (p: number) => void) => {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status})`);
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (total) onProgress(received / total);
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
};

/**
 * Keeps the local library in step with the cloud library: Supabase holds the
 * track list and cue points, Cloudflare R2 holds the audio, and downloaded
 * files stay in a local cache so they play offline.
 */
export class CloudSync extends Store<CloudSyncState> {
  private readonly engine: Engine;
  private readonly rows = new Map<string, TrackRow>();
  private readonly cueTimers = new Map<string, number>();

  constructor(engine: Engine) {
    super({ busy: null, configured: cloudConfigured, error: null, message: null, user: null });
    this.engine = engine;
    // Cue memory works without the cloud too: reloading a track in the same session keeps its cues.
    this.watchCues();
    if (!cloudConfigured) return;

    engine.onTrackChange = (track) => this.linkLocalTrack(track);

    const auth = supabase().auth;
    void auth.getSession().then(({ data }) => this.setUser(data.session?.user ?? null));
    auth.onAuthStateChange((_event, session) => this.setUser(session?.user ?? null));
  }

  private setUser(user: { id: string; email?: string } | null) {
    const previous = this.state.user?.id;
    this.set({ user: user ? { email: user.email ?? "", id: user.id } : null });
    if (user && user.id !== previous) void this.refresh();
    if (!user && previous) this.forgetCloudTracks();
  }

  private async token() {
    const { data } = await supabase().auth.getSession();
    if (!data.session) throw new Error("Sign in first");
    return data.session.access_token;
  }

  private async api<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}/api/${path}`, {
      body: JSON.stringify(body),
      headers: { authorization: `Bearer ${await this.token()}`, "content-type": "application/json" },
      method: "POST",
    });
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(data.error ?? `Server error (${response.status})`);
    return data;
  }

  async signIn(email: string, password: string) {
    this.set({ busy: "auth", error: null, message: null });
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    this.set({ busy: null, error: error ? errorText(error) : null });
  }

  async signUp(email: string, password: string) {
    this.set({ busy: "auth", error: null, message: null });
    const { data, error } = await supabase().auth.signUp({ email, password });
    this.set({
      busy: null,
      error: error ? errorText(error) : null,
      message: !error && !data.session ? "Account created. Confirm it from the email Supabase sent, then sign in." : null,
    });
  }

  async signOut() {
    await supabase().auth.signOut();
  }

  /** Removes cloud-only rows from the view after sign-out. Local files stay. */
  private forgetCloudTracks() {
    this.rows.clear();
    for (const track of this.engine.getSnapshot().library) {
      if (track.status === "remote") this.engine.removeTrack(track.id);
      else if (track.cloud === "synced") this.engine.updateTrack(track.id, { cloud: "local" });
    }
    this.set({ message: null });
  }

  /** Loads the cloud track list and merges it with the local library. */
  async refresh() {
    this.set({ busy: "refresh", error: null });
    try {
      const { data, error } = await supabase().from("tracks").select("*").eq("uploaded", true).order("title");
      if (error) throw error;
      void requestPersistentStorage();
      this.rows.clear();
      for (const row of data as TrackRow[]) {
        this.rows.set(row.hash, row);
        const local = this.engine.findTrack((t) => t.hash === row.hash);
        if (local) {
          this.engine.updateTrack(local.id, { cloud: "synced", cues: local.cues ?? toRemote(row).cues });
        } else if (await hasCached(row.hash, row.ext)) {
          this.engine.addCachedTrack(toRemote(row));
        } else {
          this.engine.addRemoteTrack(toRemote(row));
        }
      }
      this.set({ busy: null, message: `${this.rows.size} tracks in your cloud library` });
    } catch (error) {
      this.set({ busy: null, error: errorText(error) });
    }
  }

  /** A local file finished analysis: link it to its cloud copy when one exists. */
  private linkLocalTrack(track: LibraryTrack) {
    if (!track.hash) return;
    const remoteTwin = this.engine.findTrack((t) => t.id !== track.id && t.hash === track.hash && t.status === "remote");
    const row = this.rows.get(track.hash);
    if (remoteTwin) this.engine.removeTrack(remoteTwin.id);
    if (row) {
      this.engine.updateTrack(track.id, { cloud: "synced", cues: track.cues ?? remoteTwin?.cues ?? toRemote(row).cues });
    }
  }

  /** Sends every local track that is not in the cloud yet. Already stored files are skipped. */
  async uploadAll() {
    const pending = this.engine.getSnapshot().library.filter((t) => t.status === "ready" && t.cloud === "local" && t.hash);
    if (pending.length === 0) return;
    this.set({ busy: "upload", error: null });
    let done = 0;
    const failures: string[] = [];
    await pool(pending, CONCURRENCY, async (track) => {
      try {
        await this.uploadOne(track);
      } catch (error) {
        failures.push(`${track.title}: ${errorText(error)}`);
        this.engine.updateTrack(track.id, { cloud: "local", progress: undefined });
      }
      done += 1;
      this.set({ message: `Uploaded ${done - failures.length} of ${pending.length}` });
    });
    this.set({
      busy: null,
      error: failures.length ? `${failures.length} uploads failed. ${failures[0]}` : null,
    });
  }

  private async uploadOne(track: LibraryTrack) {
    const { hash, ext } = track;
    if (!hash || !ext) return;
    const bytes = await this.engine.sourceBytes(track.id);
    if (!bytes) return;
    this.engine.updateTrack(track.id, { cloud: "uploading", progress: 0 });
    const contentType = contentTypeFor(ext);
    const target = await this.api<{ exists: boolean; url?: string; contentType?: string }>("upload-url", {
      contentType,
      ext,
      hash,
      size: bytes.byteLength,
    });
    if (!target.exists && target.url) {
      await putWithProgress(target.url, bytes, target.contentType ?? contentType, (p) =>
        this.engine.updateTrack(track.id, { progress: p })
      );
    }
    const latest = this.engine.findTrack((t) => t.id === track.id) ?? track;
    const key = latest.analysis?.key ?? latest.key ?? null;
    const row: TrackRow = {
      artist: latest.artist,
      bpm: latest.bpm ?? null,
      cue: latest.cues?.cue ?? null,
      duration: latest.duration ?? null,
      ext,
      first_beat: latest.analysis?.firstBeat ?? null,
      hash,
      hot_cues: latest.cues?.hotCues ?? [],
      key_mode: key?.mode ?? null,
      key_tonic: key?.tonic ?? null,
      size: bytes.byteLength,
      title: latest.title,
      uploaded: true,
    };
    const { error } = await supabase().from("tracks").upsert(row, { onConflict: "user_id,hash" });
    if (error) throw error;
    this.rows.set(hash, row);
    this.engine.updateTrack(track.id, { cloud: "synced", progress: undefined });
  }

  /** Downloads every cloud track that is not on this computer into the local cache. */
  async downloadAll() {
    const remote = this.engine.getSnapshot().library.filter((t) => t.status === "remote");
    if (remote.length === 0) return;
    this.set({ busy: "download", error: null });
    void requestPersistentStorage();
    let done = 0;
    const failures: string[] = [];
    await pool(remote, CONCURRENCY, async (track) => {
      try {
        await this.downloadOne(track.id);
      } catch (error) {
        failures.push(`${track.title}: ${errorText(error)}`);
        this.engine.updateTrack(track.id, { cloud: "remote", progress: undefined });
      }
      done += 1;
      this.set({ message: `Downloaded ${done - failures.length} of ${remote.length}` });
    });
    this.set({
      busy: null,
      error: failures.length ? `${failures.length} downloads failed. ${failures[0]}` : null,
    });
  }

  async downloadOne(id: string) {
    const track = this.engine.findTrack((t) => t.id === id);
    if (!track?.hash || !track.ext) return;
    this.engine.updateTrack(id, { cloud: "downloading", progress: 0 });
    const { url } = await this.api<{ url: string }>("download-url", { ext: track.ext, hash: track.hash });
    const data = await getWithProgress(url, (p) => this.engine.updateTrack(id, { progress: p }));
    await writeCached(track.hash, track.ext, data);
    this.engine.attachCache(id);
  }

  /** Saves hot cues and the cue point when they change on a deck, so they follow the track. */
  private watchCues() {
    for (const deck of Object.values(this.engine.decks)) {
      let last = deck.getSnapshot();
      deck.subscribe(() => {
        const next = deck.getSnapshot();
        const sameTrack = next.track && next.track.id === last.track?.id;
        const changed = next.hotCues !== last.hotCues || next.cue !== last.cue;
        last = next;
        if (!sameTrack || !changed || !next.track) return;
        const cues: TrackCues = { cue: next.cue, hotCues: next.hotCues };
        const track = this.engine.findTrack((t) => t.id === next.track?.id);
        if (JSON.stringify(track?.cues) === JSON.stringify(cues)) return;
        this.engine.updateTrack(next.track.id, { cues });
        rememberCues(track?.hash, cues);
        if (track?.hash && track.cloud === "synced" && this.state.user) this.scheduleCueSave(track.hash, cues);
      });
    }
  }

  private scheduleCueSave(hash: string, cues: TrackCues) {
    clearTimeout(this.cueTimers.get(hash));
    this.cueTimers.set(
      hash,
      window.setTimeout(async () => {
        this.cueTimers.delete(hash);
        const { error } = await supabase().from("tracks").update({ cue: cues.cue, hot_cues: cues.hotCues }).eq("hash", hash);
        if (error) this.set({ error: `Could not save cue points: ${error.message}` });
      }, CUE_SAVE_DELAY_MS)
    );
  }
}
