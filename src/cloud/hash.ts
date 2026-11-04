/** SHA-256 of a file's bytes, as lowercase hex: the file's identity in the cloud library. */
export const sha256Hex = async (data: ArrayBuffer) => {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
