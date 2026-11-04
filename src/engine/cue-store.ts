import type { TrackCues } from "./engine";

/**
 * Cue points saved on this computer, so they survive a restart without the
 * cloud. Tracks are known by file hash once analysed; cues imported from other
 * software are known by file path and file name until the track is analysed.
 */
interface Saved {
  hashes: Record<string, TrackCues>;
  files: Record<string, TrackCues>;
}

const KEY = "opendeck.cues.v1";

const read = (): Saved => {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Saved>) : {};
    return { files: parsed.files ?? {}, hashes: parsed.hashes ?? {} };
  } catch {
    return { files: {}, hashes: {} };
  }
};

const write = (saved: Saved) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Storage full or blocked: cues still live for this session.
  }
};

/** Lookup keys for a file path or bare file name: full path first, then name. */
export const fileKeys = (file: string) => {
  const norm = file.replace(/\\/g, "/").toLowerCase();
  const name = norm.slice(norm.lastIndexOf("/") + 1);
  return norm.includes("/") ? [`path:${norm}`, `name:${name}`] : [`name:${name}`];
};

export const hasCues = (cues?: TrackCues) => !!cues && (cues.cue !== null || cues.hotCues.some((t) => t !== null));

/** Saved cues for a track: by hash, else by its file path or name. */
export const lookupCues = (hash?: string, file?: string): TrackCues | undefined => {
  const saved = read();
  if (hash && saved.hashes[hash]) return saved.hashes[hash];
  if (!file) return undefined;
  for (const key of fileKeys(file)) if (saved.files[key]) return saved.files[key];
  return undefined;
};

export const rememberCues = (hash: string | undefined, cues: TrackCues) => {
  if (!hash) return;
  const saved = read();
  saved.hashes[hash] = cues;
  write(saved);
};

/** Stores imported cues by file. Returns how many files got cues. */
export const importFileCues = (entries: { files: string[]; cues: TrackCues }[]) => {
  const saved = read();
  for (const { files, cues } of entries) {
    for (const file of files) for (const key of fileKeys(file)) saved.files[key] = cues;
  }
  write(saved);
  return entries.length;
};
