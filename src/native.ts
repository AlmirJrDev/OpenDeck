export interface NativeAudioFile {
  name: string;
  path: string;
}

interface OpenDeckNative {
  pickAudio: (kind: "files" | "folder") => Promise<NativeAudioFile[]>;
  readAudio: (path: string) => Promise<ArrayBuffer>;
  platform: string;
}

declare global {
  interface Window {
    opendeckNative?: OpenDeckNative;
  }
}

/** The Electron bridge, or undefined when running in a plain browser. */
export const native = typeof window === "undefined" ? undefined : window.opendeckNative;
