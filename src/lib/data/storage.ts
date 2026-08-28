import 'server-only';

/**
 * Storage accounting, from both sides.
 *
 * The library's own numbers come from Postgres (`file_size`, summed). The real
 * quota comes from the storage providers, and the two are worth showing together:
 * they should agree, and when they don't the difference is orphaned files — bytes
 * being paid for that no track row points at. `prune_orphans()` exists for
 * exactly that gap.
 */

import { createClient, isAdmin } from '@/lib/supabase/server';
import { storageHeadroom, type ProviderHeadroom } from '@/lib/actions/storage';
import type { Provider } from '@/lib/storage/provider';

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

export interface ProviderUsage {
  provider: Provider;
  usedBytes: number;
  limitBytes: number;
  files: number | null;
  /** True when this provider's numbers could not be read at all. */
  unavailable: boolean;
}

export interface QuotaUsage {
  /** Bytes stored across the pool, both providers together. */
  appTotalBytes: number;
  /** The pool's ceiling: the providers' limits summed. */
  limitBytes: number;
  filesUploaded: number;
  providers: ProviderUsage[];
  /** At least one provider did not answer, so the totals are an undercount. */
  partial: boolean;
}

/**
 * The pool, as one number and as its parts.
 *
 * Two free tiers read as one ceiling — UploadThing's 2 GB plus whatever
 * SUPABASE_STORAGE_LIMIT_BYTES says Supabase Storage allows (1 GB by default,
 * since Supabase publishes no quota API to ask).
 *
 * Admin-gated, and degrades rather than disappears: if one provider's API is
 * rate-limited or down, the other is still reported and `partial` says the totals
 * are short. Returning null there would blank the whole upload screen over a
 * transient hiccup on a service that may be holding none of the library.
 */
export async function quotaUsage(): Promise<QuotaUsage | null> {
  if (!(await isAdmin())) return null;

  let headroom: ProviderHeadroom[];
  try {
    headroom = await storageHeadroom();
  } catch {
    return null;
  }

  const providers: ProviderUsage[] = headroom.map((entry) => ({
    provider: entry.provider,
    usedBytes: entry.usedBytes,
    limitBytes: entry.limitBytes,
    files: entry.files,
    unavailable: entry.freeBytes === null,
  }));

  return {
    appTotalBytes: providers.reduce((total, p) => total + p.usedBytes, 0),
    limitBytes: providers.reduce((total, p) => total + p.limitBytes, 0),
    filesUploaded: providers.reduce((total, p) => total + (p.files ?? 0), 0),
    providers,
    partial: providers.some((p) => p.unavailable),
  };
}
