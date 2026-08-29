'use server';

/**
 * Ingest server actions.
 *
 * These wrap the three ingest RPCs. Two reasons they are actions rather than
 * direct `supabase.rpc()` calls from the browser:
 *
 *   · deletion has to sweep UploadThing storage, and `UTApi` needs the secret
 *     token — that can only happen server-side
 *   · one place to shape errors, so the upload UI gets a message it can display
 *     instead of a raw PostgREST envelope
 *
 * Authorization is NOT enforced here. Every RPC asserts `is_admin()` itself and
 * RLS sits behind that. This matters more than it sounds: Next 16's proxy docs
 * note that Server Functions are POSTs to whatever route they're used from, so a
 * proxy matcher can skip them entirely — a guard here or in a layout is a
 * convenience, never the boundary.
 */

import { revalidatePath } from 'next/cache';
import { UTApi } from 'uploadthing/server';
import { createClient } from '@/lib/supabase/server';
import { isProvider, type Bucket, type Provider, type StorageKey } from '@/lib/storage/provider';
import type {
  DeleteTrackResult,
  IngestTrackResult,
  Json,
  PreflightResult,
} from '@/lib/supabase/types';

/**
 * Ask what the library already has, before a single byte is uploaded.
 *
 * The one call that makes re-dropping a folder free. Track hashes come back as a
 * list to drop from the queue; cover hashes come back as a hash -> {url, key}
 * map so an album whose art is already stored reuses the URL instead of
 * uploading the image again.
 */
export async function preflight(
  trackHashes: string[],
  coverHashes: string[],
): Promise<PreflightResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('ingest_preflight', {
    p_track_hashes: trackHashes,
    p_cover_hashes: coverHashes,
  });

  if (error) throw new Error(`Preflight failed: ${error.message}`);

  const result = data as unknown as PreflightResult | null;
  return {
    existing_tracks: result?.existing_tracks ?? [],
    known_covers: result?.known_covers ?? {},
  };
}

/** Payload accepted by the `ingest_track` RPC. Snake_case to match the SQL. */
export interface IngestTrackPayload {
  title: string;
  artist: string;
  album_artist?: string | null;
  album?: string | null;
  year?: number | null;
  track_no?: number | null;
  disc_no?: number | null;
  duration_seconds?: number | null;
  genre?: string[];
  audio_url: string;
  audio_key: string;
  /** Which service holds `audio_key`. Absent means uploadthing, for compatibility. */
  audio_provider?: Provider;
  content_hash: string;
  file_size?: number | null;
  mime_type?: string | null;
  codec?: string | null;
  bitrate?: number | null;
  cover_url?: string | null;
  cover_key?: string | null;
  cover_hash?: string | null;
  cover_provider?: Provider | null;
}

/**
 * Commit one uploaded track.
 *
 * Atomic and idempotent inside Postgres — artist, album and track land together
 * or not at all, and a repeat call for the same `content_hash` returns
 * `created: false` rather than erroring. That is what makes retrying a
 * half-failed batch safe.
 */
export async function commitTrack(
  payload: IngestTrackPayload,
): Promise<IngestTrackResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('ingest_track', {
    payload: payload as unknown as Json,
  });

  if (error) throw new Error(`${payload.title || 'track'}: ${error.message}`);

  return data as unknown as IngestTrackResult;
}

/**
 * Drop the cached listings after the library changes.
 *
 * Both pages read the whole library and neither had any invalidation before. A
 * fresh upload only appeared because the client router cache had a zero-second
 * window and every navigation refetched; `next.config.ts` now holds dynamic
 * segments for 30s, which would turn that accident into a stale list.
 *
 * Deliberately **not** called from `commitTrack`. A mass upload commits once per
 * file, three at a time, and a Server Action that revalidates makes the client
 * refetch the RSC payload for the route it was called from -- so a 30-file batch
 * meant 30 mid-flight refreshes of `/admin/upload`, each re-running `isAdmin()`
 * and the page's own queries while files were still uploading. The review grid
 * stuttered and the progress bars crawled for no gain at all, because
 * `UploadManager` already calls `router.refresh()` once when the batch resolves
 * and that clears the whole client router cache. Deletion is different -- one
 * action, one call, and nothing else refreshes afterwards.
 */
function revalidateListings() {
  revalidatePath('/');
  revalidatePath('/search');
  revalidatePath('/admin/tracks');
}

/**
 * Delete a track and the storage it was holding.
 *
 * Storage is a pool across two services now, so this partitions the keys the RPC
 * surrendered and runs one sweep per provider. Neither can share a transaction
 * with the database — both are remote HTTP calls — and the database still goes
 * first deliberately. If a sweep then fails, the outcome is an orphaned file
 * wasting quota; the other ordering would leave a row pointing at a file that no
 * longer exists, which is a broken player. A wasted megabyte beats a dead play
 * button, and two providers make partial failure likelier, not less.
 *
 * `delete_track` decides which keys are genuinely unreferenced — a cover is only
 * surrendered once its album has no tracks left — and tags each one with the
 * service that holds it, so nothing here has to guess.
 */
export async function deleteTrack(
  trackId: string,
): Promise<{ deleted: boolean; storageDeleted: number; storageError?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('delete_track', { p_track_id: trackId });
  if (error) throw new Error(`Delete failed: ${error.message}`);

  const result = data as unknown as DeleteTrackResult;
  if (!result?.deleted) return { deleted: false, storageDeleted: 0 };

  revalidateListings();

  const keys = normalizeKeys(result.keys);
  if (keys.length === 0) return { deleted: true, storageDeleted: 0 };

  let storageDeleted = 0;
  const failures: string[] = [];

  const uploadthing = keys.filter((entry) => entry.provider === 'uploadthing').map((e) => e.key);
  if (uploadthing.length > 0) {
    try {
      const { deletedCount } = await new UTApi().deleteFiles(uploadthing);
      storageDeleted += deletedCount;
    } catch (cause) {
      failures.push(cause instanceof Error ? cause.message : 'UploadThing cleanup failed');
    }
  }

  // One remove() per bucket — the API takes a path list, not a bucket-qualified one.
  for (const bucket of ['audio', 'covers'] as Bucket[]) {
    const paths = keys
      .filter((entry) => entry.provider === 'supabase' && entry.bucket === bucket)
      .map((entry) => entry.key);
    if (paths.length === 0) continue;

    const { data: removed, error: removeError } = await supabase.storage.from(bucket).remove(paths);
    if (removeError) failures.push(`Supabase ${bucket}: ${removeError.message}`);
    else storageDeleted += removed?.length ?? 0;
  }

  // Reported, not thrown: the row is already gone, so the caller's UI should
  // reflect a successful delete. `prune_orphans()` is the backstop for the files
  // left behind.
  return failures.length > 0
    ? { deleted: true, storageDeleted, storageError: failures.join('; ') }
    : { deleted: true, storageDeleted };
}

/**
 * Accept both key shapes.
 *
 * `delete_track` used to return a flat array of UploadThing keys, and rows
 * committed before this migration are still described that way in any cached
 * response. A bare string therefore means UploadThing — the only place a file
 * could have been at the time.
 */
function normalizeKeys(raw: DeleteTrackResult['keys']): StorageKey[] {
  const entries = (raw ?? []) as unknown[];
  const keys: StorageKey[] = [];

  for (const entry of entries) {
    if (typeof entry === 'string' && entry) {
      keys.push({ provider: 'uploadthing', bucket: 'audio', key: entry });
      continue;
    }
    if (entry && typeof entry === 'object') {
      const { provider, bucket, key } = entry as Record<string, unknown>;
      if (typeof key !== 'string' || !key) continue;
      keys.push({
        provider: isProvider(provider) ? provider : 'uploadthing',
        bucket: bucket === 'covers' ? 'covers' : 'audio',
        key,
      });
    }
  }

  return keys;
}
