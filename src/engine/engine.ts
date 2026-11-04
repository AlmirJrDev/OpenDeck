import { createAnalyserTap, type AnalyserTap } from "@/hooks/use-audio-analyser";
import { dbToGain } from "@/lib/decibels";

import { readCached } from "@/cloud/cache";
import { extensionOf } from "@/cloud/config";
import { sha256Hex } from "@/cloud/hash";
import { native, type NativeAudioFile } from "@/native";

import type { TrackAnalysis } from "./analysis";
import { analyzeBuffer } from "./analyze-buffer";
import { Deck, type DeckId } from "./deck";
import { DEMO_SPECS, renderDemoTrack, type DemoSpec } from "./demo-tracks";
import type { MusicalKey } from "./key";
import { Sampler } from "./sampler";
import { Store } from "./store";

export interface TrackCues {
  cue: number | null;
  hotCues: (number | null)[];
}

/** Where a track is in the cloud library. Undefined for tracks that cannot sync, such as demos. */
export type CloudState = "local" | "uploading" | "synced" | "remote" | "downloading";

export interface LibraryTrack {
  id: string;
  title: string;
  artist: string;
  /** "remote": only in the cloud library, not on this computer yet. */
  status: "queued" | "analyzing" | "ready" | "error" | "remote";
  duration?: number;
  bpm?: number;
  error?: string;
  analysis?: TrackAnalysis;
  /** Key from the cloud library, shown before the track is analyzed here. */
  key?: MusicalKey | null;
  /** SHA-256 of the file: its identity in the cloud library. */
  hash?: string;
  ext?: string;
  size?: number;
  cloud?: CloudState;
  /** Upload or download progress, 0..1. */
  progress?: number;
  /** Cue points saved for this track, restored when a deck loads it. */
  cues?: TrackCues;
}

export interface RemoteTrack {
  hash: string;
  ext: string;
  size: number;
  title: string;
  artist: string;
  duration: number | null;
  bpm: number | null;
  key: MusicalKey | null;
  cues: TrackCues;
}

type TrackSource =
  | { kind: "file"; file: File }
  | { kind: "native"; path: string }
  | { kind: "demo"; spec: DemoSpec }
  | { kind: "buffer"; buffer: AudioBuffer }
  | { kind: "cache"; hash: string; ext: string };

const ANALYSIS_CONCURRENCY = 2;
const AUDIO_FILE = /\.(mp3|wav|flac|ogg|m4a|aac|aiff?|opus)$/i;

interface EngineState {
  library: LibraryTrack[];
  crossfader: number;
  /** Decks sent to the headphones. */
  cue: Record<DeckId, boolean>;
  /** 0 is cue only, 1 is master only. */
  cueMix: number;
  /** Output device ids; null is the system default (master) or off (phones). */
  masterDevice: string | null;
  phonesDevice: string | null;
  deviceError: string | null;
}

const titleFromFile = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ");

const splitArtist = (title: string) => {
  const parts = title.split(" - ");
  return parts.length > 1
    ? { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() }
    : { artist: "", title };
};

export class Engine extends Store<EngineState> {
  readonly ctx = new AudioContext({ latencyHint: "interactive" });
  readonly decks: Record<DeckId, Deck>;
  readonly masterTap: AnalyserTap;
  readonly sampler: Sampler;
  private readonly xfA: GainNode;
  private readonly xfB: GainNode;
  private readonly master: GainNode;
  private readonly cueSends: Record<DeckId, GainNode>;
  private readonly cueBus: GainNode;
  private readonly masterToPhones: GainNode;
  private readonly phones: GainNode;
  private phonesStream: MediaStreamAudioDestinationNode | null = null;
  private phonesCtx: AudioContext | null = null;
  private nextId = 1;
  // Decoded audio is large, so the library keeps where each track comes from
  // and decodes it again when a deck loads it.
  private readonly sources = new Map<string, TrackSource>();
  private readonly queue: string[] = [];
  private analyzing = 0;

  constructor() {
    super({
      crossfader: 0,
      cue: { A: false, B: false },
      cueMix: 0,
      deviceError: null,
      library: [],
      masterDevice: null,
      phonesDevice: null,
    });
    const ctx = this.ctx;
    this.master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    this.master.connect(limiter).connect(ctx.destination);
    this.masterTap = createAnalyserTap(ctx, limiter, { channels: "stereo" });

    this.decks = { A: new Deck(ctx, "A"), B: new Deck(ctx, "B") };
    this.xfA = ctx.createGain();
    this.xfB = ctx.createGain();
    this.decks.A.output.connect(this.xfA).connect(this.master);
    this.decks.B.output.connect(this.xfB).connect(this.master);
    this.setCrossfader(0);
    this.sampler = new Sampler(ctx);
    this.sampler.output.connect(this.master);

    this.cueBus = ctx.createGain();
    this.masterToPhones = ctx.createGain();
    this.phones = ctx.createGain();
    this.cueSends = { A: ctx.createGain(), B: ctx.createGain() };
    for (const id of ["A", "B"] as const) {
      this.cueSends[id].gain.value = 0;
      this.decks[id].preFader.connect(this.cueSends[id]).connect(this.cueBus);
    }
    limiter.connect(this.masterToPhones);
    this.cueBus.connect(this.phones);
    this.masterToPhones.connect(this.phones);
    this.setCueMix(0);

    const follow = (leader: Deck, follower: Deck) => {
      leader.onTempoChange = () => {
        if (follower.getSnapshot().synced) follower.followTempo(leader);
      };
    };
    follow(this.decks.A, this.decks.B);
    follow(this.decks.B, this.decks.A);
  }

  other(id: DeckId) {
    return this.decks[id === "A" ? "B" : "A"];
  }

  /** Equal-power crossfader, -1 is full A and 1 is full B. */
  setCrossfader(value: number) {
    const x = (value + 1) / 2;
    const now = this.ctx.currentTime;
    this.xfA.gain.setTargetAtTime(Math.cos((x * Math.PI) / 2), now, 0.005);
    this.xfB.gain.setTargetAtTime(Math.sin((x * Math.PI) / 2), now, 0.005);
    this.set({ crossfader: value });
  }

  setMasterGain(db: number) {
    this.master.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.01);
  }

  toggleCue(id: DeckId) {
    const cue = { ...this.state.cue, [id]: !this.state.cue[id] };
    this.cueSends[id].gain.setTargetAtTime(cue[id] ? 1 : 0, this.ctx.currentTime, 0.005);
    this.set({ cue });
  }

  setCueMix(value: number) {
    const now = this.ctx.currentTime;
    this.cueBus.gain.setTargetAtTime(Math.cos((value * Math.PI) / 2), now, 0.01);
    this.masterToPhones.gain.setTargetAtTime(Math.sin((value * Math.PI) / 2), now, 0.01);
    this.set({ cueMix: value });
  }

  setPhonesGain(db: number) {
    this.phones.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.01);
  }

  async setMasterDevice(id: string | null) {
    try {
      await this.ctx.setSinkId(id ?? "");
      this.set({ deviceError: null, masterDevice: id });
    } catch (error) {
      this.set({ deviceError: `Master output: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  /**
   * Headphones play through a second AudioContext on their own device, fed
   * from this graph through a MediaStream (one context has one output).
   */
  async setPhonesDevice(id: string | null) {
    try {
      if (id === null) {
        await this.phonesCtx?.close();
        this.phonesCtx = null;
        if (this.phonesStream) this.phones.disconnect(this.phonesStream);
        this.phonesStream = null;
      } else {
        if (!this.phonesStream) {
          this.phonesStream = this.ctx.createMediaStreamDestination();
          this.phones.connect(this.phonesStream);
        }
        if (!this.phonesCtx) {
          this.phonesCtx = new AudioContext({ latencyHint: "interactive" });
          this.phonesCtx.createMediaStreamSource(this.phonesStream.stream).connect(this.phonesCtx.destination);
        }
        await this.phonesCtx.setSinkId(id);
        await this.phonesCtx.resume();
      }
      this.set({ deviceError: null, phonesDevice: id });
    } catch (error) {
      this.set({ deviceError: `Headphones: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  /** Resumes both contexts; browsers need a user gesture first. */
  resume() {
    void this.ctx.resume();
    void this.phonesCtx?.resume();
  }

  /** Called after a track is analyzed, so cloud sync can react. */
  onTrackChange: ((track: LibraryTrack) => void) | null = null;

  updateTrack(id: string, patch: Partial<LibraryTrack>) {
    this.set({
      library: this.state.library.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
  }

  findTrack(predicate: (track: LibraryTrack) => boolean) {
    return this.state.library.find(predicate);
  }

  /** Raw bytes of a track that came from a file, for hashing and upload. Null for demos. */
  async sourceBytes(id: string): Promise<ArrayBuffer | null> {
    const source = this.sources.get(id);
    switch (source?.kind) {
      case "file":
        return source.file.arrayBuffer();
      case "native":
        if (!native) throw new Error("Native file access is only available in the desktop app");
        return native.readAudio(source.path);
      case "cache":
        return readCached(source.hash, source.ext);
      default:
        return null;
    }
  }

  private async decode(id: string): Promise<AudioBuffer> {
    const source = this.sources.get(id);
    if (!source) throw new Error("Unknown track");
    if (source.kind === "buffer") return source.buffer;
    if (source.kind === "demo") {
      const buffer = await renderDemoTrack(source.spec);
      this.sources.set(id, { buffer, kind: "buffer" });
      return buffer;
    }
    const bytes = await this.sourceBytes(id);
    if (!bytes) throw new Error("Track has no audio data");
    return this.ctx.decodeAudioData(bytes);
  }

  private enqueue(meta: Partial<LibraryTrack> & { title: string; artist: string }, source: TrackSource) {
    const id = `t${this.nextId++}`;
    this.sources.set(id, source);
    this.queue.push(id);
    this.set({ library: [...this.state.library, { id, ...meta, status: "queued" }] });
    this.pump();
    return id;
  }

  private pump() {
    while (this.analyzing < ANALYSIS_CONCURRENCY && this.queue.length > 0) {
      const id = this.queue.shift()!;
      this.analyzing += 1;
      void this.analyze(id).finally(() => {
        this.analyzing -= 1;
        this.pump();
      });
    }
  }

  private async analyze(id: string) {
    this.updateTrack(id, { status: "analyzing" });
    try {
      const source = this.sources.get(id);
      // Files are hashed while their bytes are in memory; the hash links them to the cloud library.
      let hashPatch: Partial<LibraryTrack> = {};
      if (source?.kind === "file" || source?.kind === "native") {
        const bytes = await this.sourceBytes(id);
        if (bytes) {
          const name = source.kind === "file" ? source.file.name : source.path;
          hashPatch = { ext: extensionOf(name), hash: await sha256Hex(bytes), size: bytes.byteLength };
        }
      }
      const buffer = await this.decode(id);
      const analysis = await analyzeBuffer(buffer);
      const track = this.state.library.find((t) => t.id === id);
      this.updateTrack(id, {
        ...hashPatch,
        analysis,
        bpm: analysis.bpm,
        cloud: track?.cloud ?? (hashPatch.hash ? "local" : undefined),
        duration: buffer.duration,
        status: "ready",
      });
    } catch (error) {
      this.updateTrack(id, {
        error: error instanceof Error ? error.message : String(error),
        status: "error",
      });
    }
    const track = this.state.library.find((t) => t.id === id);
    if (track) this.onTrackChange?.(track);
  }

  addFiles(files: Iterable<File>) {
    for (const file of files) {
      if (file.type.startsWith("audio/") || AUDIO_FILE.test(file.name)) {
        this.enqueue(splitArtist(titleFromFile(file.name)), { file, kind: "file" });
      }
    }
  }

  addNativeFiles(files: NativeAudioFile[]) {
    for (const file of files) {
      this.enqueue(splitArtist(titleFromFile(file.name)), { kind: "native", path: file.path });
    }
  }

  addDemoTracks() {
    for (const spec of DEMO_SPECS) {
      this.enqueue({ artist: spec.artist, title: spec.title }, { kind: "demo", spec });
    }
  }

  /** Adds a cloud track that is not on this computer yet. */
  addRemoteTrack(remote: RemoteTrack) {
    const id = `t${this.nextId++}`;
    const track: LibraryTrack = {
      artist: remote.artist,
      bpm: remote.bpm ?? undefined,
      cloud: "remote",
      cues: remote.cues,
      duration: remote.duration ?? undefined,
      ext: remote.ext,
      hash: remote.hash,
      id,
      key: remote.key,
      size: remote.size,
      status: "remote",
      title: remote.title,
    };
    this.set({ library: [...this.state.library, track] });
    return id;
  }

  /** Adds a cloud track whose file is already in the local cache. */
  addCachedTrack(remote: RemoteTrack) {
    return this.enqueue(
      {
        artist: remote.artist,
        cloud: "synced",
        cues: remote.cues,
        ext: remote.ext,
        hash: remote.hash,
        key: remote.key,
        size: remote.size,
        title: remote.title,
      },
      { ext: remote.ext, hash: remote.hash, kind: "cache" }
    );
  }

  /** Switches a remote track to its freshly downloaded cache copy and analyzes it. */
  attachCache(id: string) {
    const track = this.state.library.find((t) => t.id === id);
    if (!track?.hash || !track.ext) return;
    this.sources.set(id, { ext: track.ext, hash: track.hash, kind: "cache" });
    this.updateTrack(id, { cloud: "synced", progress: undefined, status: "queued" });
    this.queue.push(id);
    this.pump();
  }

  removeTrack(id: string) {
    this.sources.delete(id);
    this.set({ library: this.state.library.filter((t) => t.id !== id) });
  }

  async loadToDeck(trackId: string, deckId: DeckId) {
    const track = this.state.library.find((t) => t.id === trackId);
    if (!track?.analysis) return;
    const buffer = await this.decode(trackId);
    const deck = this.decks[deckId];
    deck.load({ analysis: track.analysis, artist: track.artist, buffer, id: track.id, title: track.title });
    if (track.cues) deck.restoreCues(track.cues);
  }
}
