import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { bucket, handle, json, LINK_SECONDS, objectKey, preflight, r2, readTrackRef, requireUser } from "./_lib.js";

/** POST { hash, ext } -> { url } for a direct GET from R2, inside the caller's own prefix. */
export const POST = handle(async (request) => {
  const userId = await requireUser(request);
  const ref = readTrackRef(await request.json());
  const url = await getSignedUrl(r2(), new GetObjectCommand({ Bucket: bucket(), Key: objectKey(userId, ref) }), {
    expiresIn: LINK_SECONDS,
  });
  return json({ url });
});

export const OPTIONS = preflight;
