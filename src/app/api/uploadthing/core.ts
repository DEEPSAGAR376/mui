/**
 * UploadThing file router.
 *
 * Two endpoints, because audio and cover art are uploaded on different
 * schedules: covers go first and are deduplicated by hash, so a 12-track album
 * ships one image instead of twelve.
 *
 * Neither endpoint writes to the database. The client orchestrates — upload
 * covers, then audio, then commit each track through the `ingest_track` RPC —
 * because a track row needs its cover's URL, and only the client knows which
 * cover belongs to which track. Committing inside `onUploadComplete` would mean
 * one row per file with no way to relate them.
 */

import { createUploadthing, type FileRouter } from 'uploadthing/next';
import { UploadThingError } from 'uploadthing/server';
import { createClient } from '@/lib/supabase/server';

const f = createUploadthing();

/**
 * Every endpoint gates on this. The upload route is a plain HTTP endpoint that
 * RLS cannot protect — the file lands in UploadThing, not Postgres — so this
 * check is the only thing standing between an anonymous visitor and a full
 * storage quota.
 */
async function assertAdmin() {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) throw new UploadThingError('Sign in required');

  const { data: admin } = await supabase.rpc('is_admin');
  if (admin !== true) throw new UploadThingError('Admin role required');

  return { userId };
}

export const ourFileRouter = {
  /**
   * Audio.
   *
   * 128MB covers lossless: a 60-minute FLAC album rip runs 300–500MB total but
   * individual tracks land well under this. `blob` is listed alongside `audio`
   * on purpose — browsers report an empty `file.type` for some containers
   * (.opus, .m4a, and .flac on Windows), and UploadThing validates on MIME
   * type, so an audio-only config rejects real music files. The endpoint is
   * admin-gated, so the looser type is not an exposure.
   */
  audioUploader: f(
    {
      audio: { maxFileSize: '128MB', maxFileCount: 500 },
      blob: { maxFileSize: '128MB', maxFileCount: 500 },
    },
    { awaitServerData: false },
  )
    .middleware(async () => assertAdmin())
    .onUploadComplete(async ({ file }) => {
      // Returned for logging only; the client uses `file.ufsUrl` / `file.key`
      // off its own upload result.
      return { key: file.key };
    }),

  /** Cover art. Small, and one per album rather than one per track. */
  coverUploader: f(
    { image: { maxFileSize: '8MB', maxFileCount: 200 } },
    { awaitServerData: false },
  )
    .middleware(async () => assertAdmin())
    .onUploadComplete(async ({ file }) => {
      return { key: file.key };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
