import { sha256Hex } from "./hash";

/**
 * Downloaded tracks, kept in the browser's origin-private file system so they
 * play offline. The desktop app uses the same storage inside its profile folder.
 */
const DIRECTORY = "opendeck-audio";

const directory = async () => {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIRECTORY, { create: true });
};

const fileName = (hash: string, ext: string) => `${hash}.${ext}`;

export const cacheAvailable = () => typeof navigator !== "undefined" && Boolean(navigator.storage?.getDirectory);

export const hasCached = async (hash: string, ext: string) => {
  try {
    await (await directory()).getFileHandle(fileName(hash, ext));
    return true;
  } catch {
    return false;
  }
};

export const readCached = async (hash: string, ext: string): Promise<ArrayBuffer> => {
  const handle = await (await directory()).getFileHandle(fileName(hash, ext));
  return (await handle.getFile()).arrayBuffer();
};

/** Stores a downloaded file after checking it against its hash. */
export const writeCached = async (hash: string, ext: string, data: ArrayBuffer) => {
  if ((await sha256Hex(data)) !== hash) throw new Error("Downloaded file is damaged. Try again");
  const handle = await (await directory()).getFileHandle(fileName(hash, ext), { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
};

/** Asks the browser not to clear the cache when disk space runs low. */
export const requestPersistentStorage = async () => {
  try {
    return (await navigator.storage.persist?.()) ?? false;
  } catch {
    return false;
  }
};

export const cacheUsage = async () => {
  const estimate = await navigator.storage.estimate();
  return { quota: estimate.quota ?? 0, usage: estimate.usage ?? 0 };
};
