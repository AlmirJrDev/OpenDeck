export interface NativeAudioFile {
  name: string;
  path: string;
}

/** One djay track with hot cues; `hotCues[i]` is cue i + 1 in seconds. */
export interface DjayTrackCues {
  files: string[];
  title: string;
  artist: string;
  hotCues: (number | null)[];
}

interface OpenDeckNative {
  /** Null when the user cancels picking the library file. */
  importDjayCues: () => Promise<{ tracks: DjayTrackCues[]; skipped: number } | null>;
  pickAudio: (kind: "files" | "folder") => Promise<NativeAudioFile[]>;
  readAudio: (path: string) => Promise<ArrayBuffer>;
  scanFolder: () => Promise<{ folder: string; files: { name: string; size: number }[] } | null>;
  platform: string;
}

declare global {
  interface Window {
    opendeckNative?: OpenDeckNative;
  }
}

/** The Electron bridge, or undefined when running in a plain browser. */
export const native = typeof window === "undefined" ? undefined : window.opendeckNative;
