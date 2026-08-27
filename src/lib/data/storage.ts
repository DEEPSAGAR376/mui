import 'server-only';

/**
 * Storage accounting, from both sides.
 *
 * The library's own numbers come from Postgres (`file_size`, summed). The real
 * quota comes from UploadThing, and the two are worth showing together: they
 * should agree, and when they don't the difference is orphaned files — bytes
 * being paid for that no track row points at. `prune_orphans()` exists for
 * exactly that gap.
 */

import { UTApi } from 'uploadthing/server';
import { createClient, isAdmin } from '@/lib/supabase/server';

export interface LibrarySize {
  tracks: number;
  bytes: number;
  /** Albums holding a stored cover image — one upload each, however many tracks. */
  covers: number;
}

export async function librarySize(): Promise<LibrarySize> {
  const supabase = await createClient();

  const [sizes, covers] = await Promise.all([
    supabase.from('tracks').select('file_size'),
    supabase.from('albums').select('id', { count: 'exact', head: true }).not('cover_key', 'is', null),
  ]);

  const rows = sizes.data ?? [];
  return {
    tracks: rows.length,
    bytes: rows.reduce((total, row) => total + (row.file_size ?? 0), 0),
    covers: covers.count ?? 0,
  };
}

export interface QuotaUsage {
  /** Bytes stored across the whole UploadThing account. */
  totalBytes: number;
  /** Bytes stored by this app alone. */
  appTotalBytes: number;
  filesUploaded: number;
  limitBytes: number;
}

/**
 * Real quota, straight from UploadThing.
 *
 * Admin-gated and null-on-failure rather than throwing: this is a status line on
 * an admin page, and a rate-limited or down API should not take the upload
 * screen with it. `UTApi` reads `UPLOADTHING_TOKEN` from the environment, which
 * is why this can only ever run server-side.
 */
export async function quotaUsage(): Promise<QuotaUsage | null> {
  if (!(await isAdmin())) return null;

  try {
    const info = await new UTApi().getUsageInfo();
    return {
      totalBytes: info.totalBytes,
      appTotalBytes: info.appTotalBytes,
      filesUploaded: info.filesUploaded,
      limitBytes: info.limitBytes,
    };
  } catch {
    return null;
  }
}
