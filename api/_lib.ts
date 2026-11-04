import { S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

/** Largest audio file accepted, in bytes. */
export const MAX_FILE_BYTES = 500 * 1024 ** 2;
/** Lifetime of upload and download links, in seconds. */
export const LINK_SECONDS = 15 * 60;

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "flac", "ogg", "m4a", "aac", "aif", "aiff", "opus"]);

const env = (name: string, fallback?: string) => {
  const value = process.env[name] ?? (fallback ? process.env[fallback] : undefined);
  if (!value) throw new HttpError(500, `Server is missing the ${name} setting`);
  return value;
};

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// The API authenticates with a bearer token, not cookies, so any origin may call it:
// the web app, a local dev server, and the desktop app's app:// origin.
const CORS = {
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...CORS, "content-type": "application/json" }, status });

export const preflight = () => new Response(null, { headers: CORS, status: 204 });

export const r2 = () =>
  new S3Client({
    credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
    endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    region: "auto",
  });

export const bucket = () => env("R2_BUCKET");

/** Returns the signed-in user's id, from the Supabase access token in the request. */
export const requireUser = async (request: Request) => {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Sign in first");
  const supabase = createClient(env("SUPABASE_URL", "VITE_SUPABASE_URL"), env("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Your session expired. Sign in again");
  return data.user.id;
};

export interface TrackRef {
  hash: string;
  ext: string;
}

/** Validates the file reference in a request body. */
export const readTrackRef = (body: unknown): TrackRef => {
  const { hash, ext } = (body ?? {}) as Record<string, unknown>;
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) throw new HttpError(400, "Invalid file hash");
  if (typeof ext !== "string" || !AUDIO_EXTENSIONS.has(ext)) throw new HttpError(400, "Unsupported audio format");
  return { ext, hash };
};

/** Each user has a private prefix; one object per distinct file. */
export const objectKey = (userId: string, { hash, ext }: TrackRef) => `users/${userId}/audio/${hash}.${ext}`;

export const handle = (run: (request: Request) => Promise<Response>) => async (request: Request) => {
  try {
    return await run(request);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: "Unexpected server error" }, 500);
  }
};
