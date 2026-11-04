import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Where the /api functions live. Empty on the deployed web app (same origin);
 * the desktop app and the local dev server set VITE_API_BASE to the Vercel URL.
 */
export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? "").replace(/\/$/, "");

export const cloudConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

export const supabase = () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Cloud sync is not configured");
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
};

const CONTENT_TYPES: Record<string, string> = {
  aac: "audio/aac",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
};

export const contentTypeFor = (ext: string) => CONTENT_TYPES[ext] ?? "application/octet-stream";

export const extensionOf = (name: string) => {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return ext === "aif" ? "aiff" : ext;
};
