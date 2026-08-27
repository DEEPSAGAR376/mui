/**
 * Content fingerprinting.
 *
 * Two hashes drive the whole pipeline:
 *   · audio bytes  -> track identity, so re-dropping a folder uploads nothing
 *   · picture bytes -> cover identity, so a 12-track album uploads ONE image
 *
 * SHA-256 through `crypto.subtle`, which is native and hardware-accelerated. It
 * needs a secure context (https or localhost) — on plain http over a LAN address
 * `crypto.subtle` is undefined, which is worth knowing before blaming the code.
 */

/** Lowercase hex, the form the `content_hash` / `cover_hash` columns store. */
function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/**
 * Hash a whole file.
 *
 * `crypto.subtle.digest` has no streaming API, so the file is read into memory
 * in one piece. At a 128MB ceiling that is acceptable, but it is the reason the
 * pool hashes a bounded number of files at a time rather than mapping over the
 * entire drop at once — twenty 100MB FLACs in flight would be 2GB resident.
 */
export async function hashFile(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  return toHex(await crypto.subtle.digest('SHA-256', buffer));
}

/** Hash raw bytes — used for embedded cover art already in memory. */
export async function hashBytes(bytes: Uint8Array): Promise<string> {
  // Copy into a fresh ArrayBuffer: a Uint8Array from a parser is often a view
  // onto a larger pooled buffer, and digesting the view's buffer directly would
  // hash the neighbouring bytes too.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return toHex(await crypto.subtle.digest('SHA-256', copy.buffer));
}

export function isSecureContextAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}
