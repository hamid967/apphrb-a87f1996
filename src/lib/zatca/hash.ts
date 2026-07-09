/**
 * SHA-256 hex digest using Web Crypto (available in Cloudflare Workers).
 */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < arr.length; i++) {
    hex += arr[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/** ZATCA invoice hash chaining seed used when no previous invoice exists. */
export const ZATCA_GENESIS_HASH =
  "0000000000000000000000000000000000000000000000000000000000000000";
