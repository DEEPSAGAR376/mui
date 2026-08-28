/**
 * Which storage service holds a file.
 *
 * Two free tiers — UploadThing's 2 GB and Supabase Storage's 1 GB — read as one
 * pool. The type lives on its own so both the client upload path and the
 * server-side accounting can import it without dragging either implementation
 * across the network boundary.
 */

export type Provider = 'uploadthing' | 'supabase';

/** Supabase buckets. UploadThing has one flat namespace and ignores this. */
export type Bucket = 'audio' | 'covers';

export interface UploadResult {
  url: string;
  /** Whatever the holder needs in order to delete this later. */
  key: string;
  provider: Provider;
}

/** A key paired with enough context to delete it, as `delete_track` returns it. */
export interface StorageKey {
  provider: Provider;
  bucket: Bucket;
  key: string;
}

export const PROVIDERS: Provider[] = ['uploadthing', 'supabase'];

export function isProvider(value: unknown): value is Provider {
  return value === 'uploadthing' || value === 'supabase';
}

/**
 * Supabase's own free-tier storage allowance, in bytes.
 *
 * Hardcoded-with-an-override because Supabase exposes no quota API — there is
 * nothing to ask. Override via SUPABASE_STORAGE_LIMIT_BYTES when the project
 * moves off the free tier, otherwise the bar on /admin/upload will keep
 * measuring against 1 GB that is no longer the real ceiling.
 */
export const SUPABASE_DEFAULT_LIMIT_BYTES = 1024 * 1024 * 1024;

export function supabaseLimitBytes(): number {
  const raw = Number(process.env.SUPABASE_STORAGE_LIMIT_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : SUPABASE_DEFAULT_LIMIT_BYTES;
}
