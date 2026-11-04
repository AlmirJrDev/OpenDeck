// Reads hot cues from a djay Pro media library (MediaLibrary.db).
//
// djay keeps its library in a YapDatabase (SQLite): one row per object in
// `database2`, whose `data` column holds the object in Algoriddim's "TSAF"
// binary format. This file only reads; it works on a copy of the database.
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

export const HOT_CUES = 8;

export const defaultLibraryPath = () =>
  path.join(os.homedir(), "Music", "djay", "djay Media Library", "MediaLibrary.db");

/**
 * Decodes one TSAF object. Values come before their keys; strings are stored
 * once and referenced by index afterwards; numbers are aligned to their size.
 */
export const parseTsaf = (buf) => {
  const d = Buffer.from(buf);
  if (d.toString("latin1", 0, 4) !== "TSAF") throw new Error("Not a TSAF object");
  const strings = [];
  let p = 20;
  const align = (n) => {
    p = Math.ceil(p / n) * n;
  };
  const u32 = () => {
    align(4);
    const v = d.readUInt32LE(p);
    p += 4;
    return v;
  };
  const str = () => {
    const tag = d[p++];
    if (tag === 0x08) {
      const end = d.indexOf(0, p);
      const s = d.toString("utf8", p, end);
      p = end + 1;
      strings.push(s);
      return s;
    }
    if (tag === 0x05) return strings[d[p++]];
    if (tag === 0x06) {
      const i = d.readUInt16LE(p);
      p += 2;
      return strings[i];
    }
    throw new Error(`Unexpected string tag 0x${tag.toString(16)} at ${p - 1}`);
  };
  const value = () => {
    switch (d[p]) {
      case 0x05:
      case 0x06:
      case 0x08:
        return str();
      case 0x02:
        p += 2;
        return d[p - 1];
      case 0x14: {
        p++;
        align(8);
        const v = d.readDoubleLE(p);
        p += 8;
        return v;
      }
      case 0x15: {
        p++;
        const n = u32();
        const blob = d.subarray(p, p + n);
        p += n;
        align(4);
        return blob;
      }
      case 0x18: {
        p++;
        const n = u32();
        const o = {};
        for (let i = 0; i < n; i++) {
          const v = value();
          o[str()] = v;
        }
        return o;
      }
      case 0x21: {
        p++;
        const url = str();
        if (d[p] === 0x00) p++;
        else value();
        return { url };
      }
      case 0x0a:
      case 0x0b: {
        p++;
        const n = u32();
        const a = [];
        for (let i = 0; i < n; i++) a.push(value());
        return a;
      }
      case 0x2b: {
        p++;
        const o = { $class: str() };
        while (d[p] !== 0x00) {
          const v = value();
          o[str()] = v;
        }
        p++;
        return o;
      }
      default:
        throw new Error(`Unexpected tag 0x${d[p].toString(16)} at ${p}`);
    }
  };
  return value();
};

const fileFromUrl = (url) => {
  try {
    // djay writes Windows paths as file:///C:%5CUsers%5C..., with escaped backslashes.
    return url.startsWith("file:") ? path.normalize(decodeURIComponent(url.replace(/^file:\/+/, ""))) : null;
  } catch {
    try {
      return fileURLToPath(url);
    } catch {
      return null;
    }
  }
};

/**
 * Hot cues per track: `{ files, title, artist, hotCues }`, where `files` are
 * the paths djay knows for the track and `hotCues[i]` is the time of cue i + 1
 * in seconds (saved loops become a cue at their start).
 */
export const readDjayCues = async (dbPath) => {
  if (!existsSync(dbPath)) throw new Error(`djay library not found at ${dbPath}`);
  // Work on a copy, with its write-ahead log, so djay can keep running untouched.
  const dir = await mkdtemp(path.join(os.tmpdir(), "opendeck-djay-"));
  try {
    const copy = path.join(dir, "MediaLibrary.db");
    await copyFile(dbPath, copy);
    for (const ext of ["-wal", "-shm"]) {
      if (existsSync(dbPath + ext)) await copyFile(dbPath + ext, copy + ext);
    }
    const db = new DatabaseSync(copy);
    try {
      const rows = (collection) => db.prepare("select key, data from database2 where collection = ?").all(collection);
      const locations = new Map();
      for (const row of rows("localMediaItemLocations")) {
        try {
          const loc = parseTsaf(row.data);
          locations.set(row.key, (loc.sourceURIs ?? []).map((u) => u && fileFromUrl(u.url)).filter(Boolean));
        } catch {
          // Skip records this reader does not understand.
        }
      }
      const tracks = [];
      let skipped = 0;
      for (const row of rows("mediaItemUserData")) {
        let data;
        try {
          data = parseTsaf(row.data);
        } catch {
          skipped++;
          continue;
        }
        const hotCues = Array(HOT_CUES).fill(null);
        for (const cue of data.cuePoints ?? []) {
          const slot = Math.round(cue?.number ?? 0) - 1;
          if (slot >= 0 && slot < HOT_CUES && cue.time >= 0) hotCues[slot] = cue.time;
        }
        if (hotCues.every((t) => t === null)) continue;
        const title = data.titleIDs?.[0] ?? {};
        tracks.push({
          artist: title.artist ?? "",
          files: locations.get(row.key) ?? [],
          hotCues,
          title: title.title ?? "",
        });
      }
      return { skipped, tracks };
    } finally {
      db.close();
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
};
