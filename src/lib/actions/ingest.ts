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

import { UTApi } from 'uploadthing/server';
import { createClient } from '@/lib/supabase/server';
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
  content_hash: string;
  file_size?: number | null;
  mime_type?: string | null;
  codec?: string | null;
  bitrate?: number | null;
  cover_url?: string | null;
  cover_key?: string | null;
  cover_hash?: string | null;
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
 * Delete a track and the storage it was holding.
 *
 * Two systems, and they cannot share a transaction — `UTApi.deleteFiles` is a
 * remote HTTP call. The database goes first deliberately. If the storage sweep
 * then fails, the outcome is an orphaned file wasting quota; the other ordering
 * would leave a row pointing at a file that no longer exists, which is a broken
 * player. A wasted megabyte beats a dead play button.
 *
 * `delete_track` decides which keys are genuinely unreferenced — a cover is only
 * surrendered once its album has no tracks left.
 */
export async function deleteTrack(
  trackId: string,
): Promise<{ deleted: boolean; storageDeleted: number; storageError?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('delete_track', { p_track_id: trackId });
  if (error) throw new Error(`Delete failed: ${error.message}`);

  const result = data as unknown as DeleteTrackResult;
  if (!result?.deleted) return { deleted: false, storageDeleted: 0 };

  const keys = (result.keys ?? []).filter(Boolean);
  if (keys.length === 0) return { deleted: true, storageDeleted: 0 };

  try {
    const { deletedCount } = await new UTApi().deleteFiles(keys);
    return { deleted: true, storageDeleted: deletedCount };
  } catch (cause) {
    // Reported, not thrown: the row is already gone, so the caller's UI should
    // reflect a successful delete. `prune_orphans()` is the backstop for the
    // files left behind.
    return {
      deleted: true,
      storageDeleted: 0,
      storageError: cause instanceof Error ? cause.message : 'storage cleanup failed',
    };
  }
}
