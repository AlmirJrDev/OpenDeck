import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { bucket, handle, HttpError, json, LINK_SECONDS, MAX_FILE_BYTES, objectKey, preflight, r2, readTrackRef, requireUser } from "./_lib.js";

/**
 * POST { hash, ext, size, contentType } -> { exists: true } when the file is
 * already stored, or { url } for a direct PUT to R2.
 */
export const POST = handle(async (request) => {
  const userId = await requireUser(request);
  const body = (await request.json()) as Record<string, unknown>;
  const ref = readTrackRef(body);
  const size = Number(body.size);
  if (!Number.isInteger(size) || size <= 0) throw new HttpError(400, "Invalid file size");
  if (size > MAX_FILE_BYTES) throw new HttpError(413, "File is larger than 500 MB");
  const contentType = typeof body.contentType === "string" && body.contentType.startsWith("audio/") ? body.contentType : "application/octet-stream";

  const client = r2();
  const key = objectKey(userId, ref);
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    if (head.ContentLength === size) return json({ exists: true });
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw error;
  }

  const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket(), ContentType: contentType, Key: key }), {
    expiresIn: LINK_SECONDS,
  });
  return json({ contentType, exists: false, url });
});

export const OPTIONS = preflight;
