import { native } from "@/native";

export const AUDIO_EXTENSIONS = ["mp3", "wav", "flac", "ogg", "m4a", "aac", "aif", "aiff", "opus"];

export interface FolderEntry {
  name: string;
  size: number;
}

export interface FormatTotal {
  count: number;
  bytes: number;
}

export interface FolderScan {
  folder: string;
  tracks: number;
  bytes: number;
  formats: Record<string, FormatTotal>;
  /** Files that are not audio, left out of the totals. */
  otherFiles: number;
  otherBytes: number;
}

const extensionOf = (name: string) => name.slice(name.lastIndexOf(".") + 1).toLowerCase();

export const summarize = (folder: string, entries: FolderEntry[]): FolderScan => {
  const scan: FolderScan = { bytes: 0, folder, formats: {}, otherBytes: 0, otherFiles: 0, tracks: 0 };
  for (const { name, size } of entries) {
    const ext = extensionOf(name);
    if (!AUDIO_EXTENSIONS.includes(ext)) {
      scan.otherFiles += 1;
      scan.otherBytes += size;
      continue;
    }
    const key = ext === "aif" ? "aiff" : ext;
    scan.formats[key] ??= { bytes: 0, count: 0 };
    scan.formats[key].count += 1;
    scan.formats[key].bytes += size;
    scan.tracks += 1;
    scan.bytes += size;
  }
  return scan;
};

interface DirectoryHandle {
  name: string;
  values: () => AsyncIterable<{ kind: "file" | "directory"; name: string; getFile?: () => Promise<File> } & DirectoryHandle>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: "read" }) => Promise<DirectoryHandle>;
  }
}

const walk = async (dir: DirectoryHandle, out: FolderEntry[], onProgress: (files: number) => void) => {
  for await (const entry of dir.values()) {
    if (entry.kind === "directory") {
      await walk(entry, out, onProgress);
    } else if (entry.getFile) {
      const file = await entry.getFile();
      out.push({ name: file.name, size: file.size });
      if (out.length % 200 === 0) onProgress(out.length);
    }
  }
};

/** True when the browser can pick a folder directly; otherwise use a directory file input. */
export const canPickDirectory = () => Boolean(native) || typeof window.showDirectoryPicker === "function";

/**
 * Lets the user pick a music folder and measures it. Only file sizes are read,
 * never the audio, so a large library scans in seconds. Returns null on cancel.
 */
export const scanPickedFolder = async (onProgress: (files: number) => void): Promise<FolderScan | null> => {
  if (native) {
    const result = await native.scanFolder();
    return result ? summarize(result.folder, result.files) : null;
  }
  if (!window.showDirectoryPicker) throw new Error("Folder picking is not available in this browser");
  let dir: DirectoryHandle;
  try {
    dir = await window.showDirectoryPicker({ mode: "read" });
  } catch {
    return null;
  }
  const entries: FolderEntry[] = [];
  await walk(dir, entries, onProgress);
  return summarize(dir.name, entries);
};

/** Fallback for browsers without showDirectoryPicker: a `webkitdirectory` file input. */
export const scanFileList = (files: FileList): FolderScan | null => {
  if (files.length === 0) return null;
  const folder = files[0].webkitRelativePath.split("/")[0] || "Selected folder";
  return summarize(folder, [...files].map((f) => ({ name: f.name, size: f.size })));
};
