'use server';

/**
 * Server side of the shared storage pool.
 *
 * Two jobs, both of which must happen on the server:
 *
 *   · `signUpload` mints a one-shot Supabase upload URL. The admin check here is
 *     the boundary for that path, exactly as `assertAdmin()` in the UploadThing
 *     route is for the other one — a storage endpoint is plain HTTP that table
 *     RLS cannot reach. The signed token is what authorizes the write, so the
 *     browser never needs a write-capable session.
 *
 *   · `storageHeadroom` reports how many bytes each provider has left, so the
 *     ingest run can route a file to whichever side can still hold it.
 *
 * Neither touches SUPABASE_SERVICE_ROLE_KEY.
 */

import { UTApi } from 'uploadthing/server';
import { createClient, isAdmin } from '@/lib/supabase/server';
import { supabaseLimitBytes, type Bucket, type Provider } from '@/lib/storage/provider';

export interface SignedUpload {
  signedUrl: string;
  publicUrl: string;
}

export async function signUpload(bucket: Bucket, path: string): Promise<SignedUpload> {
  if (!(await isAdmin())) {
    throw new Error('Admin role required');
  }
  // A caller-supplied path becomes part of a URL and an object name. Anything
  // outside the content-hash shape the ingest run generates is refused rather
  // than sanitized — a surprising path here would be a bug, not a preference.
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(path) || path.startsWith('.')) {
    throw new Error(`Refusing to sign an unexpected object path: ${path}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path, {
    // The path is the content hash, so an identical re-upload is the same bytes.
    // Without upsert, retrying a half-failed batch 409s on everything that landed.
    upsert: true,
  });
  if (error || !data) {
    throw new Error(`Could not sign upload for ${bucket}/${path}: ${error?.message ?? 'unknown error'}`);
  }

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return { signedUrl: data.signedUrl, publicUrl: pub.publicUrl };
}

export interface ProviderHeadroom {
  provider: Provider;
  usedBytes: number;
  limitBytes: number;
  /** limit - used, floored at zero. Null when the provider could not be reached. */
  freeBytes: number | null;
  /** Objects stored, as far as this provider will say. Null when unreachable. */
  files: number | null;
}

/**
 * Bytes still available on each side.
 *
 * A provider that cannot be reached comes back with `freeBytes: null` rather
 * than zero. Zero would silently reroute a whole batch to the other provider on
 * a transient API hiccup; null lets the caller treat it as unknown and skip it.
 */
export async function storageHeadroom(): Promise<ProviderHeadroom[]> {
  if (!(await isAdmin())) {
    throw new Error('Admin role required');
  }

  const [uploadthing, supabase] = await Promise.all([
    uploadthingHeadroom(),
    supabaseHeadroom(),
  ]);
  return [uploadthing, supabase];
}

async function uploadthingHeadroom(): Promise<ProviderHeadroom> {
  try {
    const info = await new UTApi().getUsageInfo();
    return {
      provider: 'uploadthing',
      usedBytes: info.appTotalBytes,
      limitBytes: info.limitBytes,
      freeBytes: Math.max(0, info.limitBytes - info.appTotalBytes),
      files: info.filesUploaded,
    };
  } catch {
    return { provider: 'uploadthing', usedBytes: 0, limitBytes: 0, freeBytes: null, files: null };
  }
}

/**
 * Supabase publishes no storage quota API, so usage is measured by listing the
 * two buckets and summing `metadata.size`. Paginated at 1000, which is well past
 * what a 1 GB allowance can hold at the library's ~6 MB average.
 */
async function supabaseHeadroom(): Promise<ProviderHeadroom> {
  const limitBytes = supabaseLimitBytes();
  try {
    const client = await createClient();
    const buckets: Bucket[] = ['audio', 'covers'];
    let usedBytes = 0;
    let files = 0;

    for (const bucket of buckets) {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await client.storage
          .from(bucket)
          .list('', { limit: 1000, offset });
        if (error) throw error;
        const page = data ?? [];
        for (const entry of page) {
          const size = (entry.metadata as { size?: number } | null)?.size;
          if (typeof size === 'number') usedBytes += size;
        }
        files += page.length;
        if (page.length < 1000) break;
      }
    }

    return {
      provider: 'supabase',
      usedBytes,
      limitBytes,
      freeBytes: Math.max(0, limitBytes - usedBytes),
      files,
    };
  } catch {
    return { provider: 'supabase', usedBytes: 0, limitBytes, freeBytes: null, files: null };
  }
}
