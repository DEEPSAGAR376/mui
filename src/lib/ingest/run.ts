/**
 * Upload and commit orchestration.
 *
 * Order is the whole design:
 *
 *   1. covers, deduplicated by hash — a 12-track album ships ONE image, and an
 *      album whose art the library already has ships none
 *   2. audio, a few at a time
 *   3. each track committed as soon as its own upload lands
 *
 * Committing per track rather than after the batch means a failure at file 180 of
 * 200 leaves 179 tracks in the library, not zero. Combined with the RPC's
 * idempotency, re-running the same drop then picks up exactly where it stopped.
 *
 * Storage is a shared pool across two providers. UploadThing is filled first —
 * it is the larger allowance and the better-worn path, so a library that fits in
 * 2 GB never exercises the Supabase code at all. Only when a file no longer fits
 * does the batch start routing to Supabase Storage.
 */

import { commitTrack, type IngestTrackPayload } from '@/lib/actions/ingest';
import { storageHeadroom } from '@/lib/actions/storage';
import { objectPath, uploadOne } from '@/lib/storage/upload';
import type { Provider } from '@/lib/storage/provider';
import type { Candidate, CandidateStatus, CoverArt } from './types';

export interface IngestHandlers {
  onProgress: (id: string, progress: number) => void;
  onStatus: (id: string, status: CandidateStatus, error?: string) => void;
  /** Fired once per unique cover so the UI can show cover-phase progress. */
  onCoverProgress?: (done: number, total: number) => void;
}

export interface IngestSummary {
  committed: number;
  duplicates: number;
  failed: number;
  coversUploaded: number;
  coversReused: number;
  bytesUploaded: number;
  /** Where the batch's bytes actually went, for the finish line. */
  bytesByProvider: Record<Provider, number>;
}

/** A cover the batch can point a track at, wherever it happens to live. */
interface StoredCover {
  url: string;
  key: string;
  provider: Provider;
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};

/**
 * Name the cover after its hash.
 *
 * Not cosmetic — it is how the upload result gets matched back to the album it
 * belongs to, and on the Supabase side it is also the object path, which makes
 * an identical re-upload overwrite itself instead of accumulating copies.
 */
function coverToFile(cover: CoverArt): File {
  const ext = MIME_EXTENSIONS[cover.mime.toLowerCase()] ?? 'jpg';
  // Copy into a plain ArrayBuffer-backed view: the parser's Uint8Array may be
  // backed by a SharedArrayBuffer after transfer, which BlobPart rejects.
  const bytes = new Uint8Array(cover.bytes.byteLength);
  bytes.set(cover.bytes);
  return new File([bytes], `${cover.hash}.${ext}`, { type: cover.mime });
}

/**
 * Remaining headroom on each provider, drawn down as the batch proceeds.
 *
 * Fetched once per batch rather than per file — the numbers only move because of
 * this batch, so a local tally is both cheaper and more accurate mid-run than
 * re-asking a quota API that lags behind its own uploads.
 */
class Pool {
  private free: Record<Provider, number | null> = { uploadthing: null, supabase: null };

  static async open(): Promise<Pool> {
    const pool = new Pool();
    try {
      for (const entry of await storageHeadroom()) {
        pool.free[entry.provider] = entry.freeBytes;
      }
    } catch {
      // Both stay null, which means "unknown" — see choose().
    }
    return pool;
  }

  /**
   * Claim room for `bytes` and say who is holding it, or null if nobody can.
   *
   * Choosing and debiting in one synchronous step is deliberate: three workers
   * run concurrently, and a check-then-upload-then-debit sequence would let all
   * three pick the provider that only has room for one.
   *
   * A provider whose headroom is unknown (its API did not answer) is treated as
   * available rather than full. Refusing to upload because a quota endpoint was
   * briefly down would be a worse failure than overshooting a soft limit, and
   * both providers enforce their own caps server-side regardless.
   */
  reserve(bytes: number): Provider | null {
    for (const provider of ['uploadthing', 'supabase'] as const) {
      const free = this.free[provider];
      if (free === null) return provider;
      if (free >= bytes) {
        this.free[provider] = free - bytes;
        return provider;
      }
    }
    return null;
  }

  /** Hand the room back when the upload it was claimed for did not happen. */
  refund(provider: Provider, bytes: number): void {
    const free = this.free[provider];
    if (free !== null) this.free[provider] = free + bytes;
  }
}

/**
 * Upload every distinct cover the batch needs, and return a hash -> StoredCover
 * map covering both the new uploads and the ones preflight already knew about.
 *
 * Deduplication happens on the hash, so twelve tracks sharing one embedded image
 * collapse to a single upload. Covers already in the library are reused wherever
 * they live — an album whose art sits in UploadThing is never re-uploaded to
 * Supabase just because the new tracks are going there.
 */
async function uploadCovers(
  candidates: Candidate[],
  knownCovers: Record<string, { url: string; key: string; provider?: Provider }>,
  pool: Pool,
  handlers: IngestHandlers,
  signal?: AbortSignal,
): Promise<{ map: Map<string, StoredCover>; uploaded: number; reused: number }> {
  const map = new Map<string, StoredCover>();
  let reused = 0;

  // Seed with what the server already has. A cover stored before providers
  // existed is on UploadThing by definition.
  for (const [hash, value] of Object.entries(knownCovers)) {
    map.set(hash, { url: value.url, key: value.key, provider: value.provider ?? 'uploadthing' });
  }

  const pending = new Map<string, CoverArt>();
  for (const candidate of candidates) {
    const cover = candidate.cover;
    if (!cover) continue;
    if (map.has(cover.hash)) {
      reused++;
      continue;
    }
    if (!pending.has(cover.hash)) pending.set(cover.hash, cover);
  }

  if (pending.size === 0) {
    return { map, uploaded: 0, reused };
  }

  const files = [...pending.values()].map(coverToFile);
  handlers.onCoverProgress?.(0, files.length);

  let uploaded = 0;
  for (const file of files) {
    if (signal?.aborted) break;

    const provider = pool.reserve(file.size);
    if (provider === null) {
      // Out of room everywhere. Tracks still commit, just without artwork —
      // audio is what the library is for.
      console.error(`No storage headroom for cover ${file.name}; continuing without it.`);
      continue;
    }

    // The filename IS the hash — see coverToFile.
    const hash = file.name.replace(/\.[^.]+$/, '');
    try {
      const result = await uploadOne('covers', file, provider, {}, { key: file.name, signal });
      map.set(hash, result);
    } catch (cause) {
      pool.refund(provider, file.size);
      throw cause;
    }
    uploaded++;
    handlers.onCoverProgress?.(uploaded, files.length);
  }

  return { map, uploaded, reused };
}

/**
 * Upload one track's audio, then commit it.
 *
 * The two steps are deliberately adjacent. Uploading everything and committing
 * afterwards would mean a browser closed mid-batch leaves a pile of paid-for
 * files with no rows pointing at them — invisible, and only findable by hand.
 */
async function uploadAndCommit(
  candidate: Candidate,
  covers: Map<string, StoredCover>,
  pool: Pool,
  handlers: IngestHandlers,
  signal?: AbortSignal,
): Promise<{ outcome: 'committed' | 'duplicate' | 'failed'; provider?: Provider }> {
  let provider: Provider | null = null;
  try {
    provider = pool.reserve(candidate.fileSize);
    if (provider === null) {
      handlers.onStatus(candidate.id, 'error', 'storage full on both providers');
      return { outcome: 'failed' };
    }

    handlers.onStatus(candidate.id, 'uploading');

    const uploaded = await uploadOne(
      'audio',
      candidate.file,
      provider,
      { onProgress: (progress) => handlers.onProgress(candidate.id, progress) },
      { key: objectPath(candidate.contentHash, candidate.file.name), signal },
    );
    handlers.onStatus(candidate.id, 'committing');

    const cover = candidate.cover ? covers.get(candidate.cover.hash) : undefined;

    const payload: IngestTrackPayload = {
      title: candidate.title,
      artist: candidate.artist,
      album_artist: candidate.albumArtist || candidate.artist,
      album: candidate.album || null,
      year: candidate.year,
      track_no: candidate.trackNo,
      disc_no: candidate.discNo,
      duration_seconds: candidate.durationSeconds,
      genre: candidate.genre,
      audio_url: uploaded.url,
      audio_key: uploaded.key,
      audio_provider: uploaded.provider,
      content_hash: candidate.contentHash,
      file_size: candidate.fileSize,
      mime_type: candidate.mimeType,
      codec: candidate.codec,
      bitrate: candidate.bitrate,
      cover_url: cover?.url ?? null,
      cover_key: cover?.key ?? null,
      cover_hash: candidate.cover?.hash ?? null,
      cover_provider: cover?.provider ?? null,
    };

    const result = await commitTrack(payload);
    handlers.onProgress(candidate.id, 100);
    handlers.onStatus(candidate.id, result.created ? 'done' : 'duplicate');
    return { outcome: result.created ? 'committed' : 'duplicate', provider: uploaded.provider };
  } catch (cause) {
    if (provider) pool.refund(provider, candidate.fileSize);
    const message = cause instanceof Error ? cause.message : 'upload failed';
    handlers.onStatus(candidate.id, 'error', message);
    return { outcome: 'failed' };
  }
}

/**
 * Run a whole batch.
 *
 * Concurrency is capped at three. UploadThing will happily accept more, but the
 * browser's own per-host connection limit means extra parallel PUTs just queue in
 * the network layer while making every individual progress bar crawl — worse
 * feedback for the same throughput.
 */
export async function runIngest(
  candidates: Candidate[],
  knownCovers: Record<string, { url: string; key: string; provider?: Provider }>,
  handlers: IngestHandlers,
  options: { concurrency?: number; signal?: AbortSignal } = {},
): Promise<IngestSummary> {
  const summary: IngestSummary = {
    committed: 0,
    duplicates: 0,
    failed: 0,
    coversUploaded: 0,
    coversReused: 0,
    bytesUploaded: 0,
    bytesByProvider: { uploadthing: 0, supabase: 0 },
  };

  if (candidates.length === 0) return summary;

  const pool = await Pool.open();

  // Covers first and as a barrier: a track row references its cover's URL, so
  // there is nothing to gain from interleaving them.
  let covers = new Map<string, StoredCover>();
  try {
    const result = await uploadCovers(candidates, knownCovers, pool, handlers, options.signal);
    covers = result.map;
    summary.coversUploaded = result.uploaded;
    summary.coversReused = result.reused;
  } catch (cause) {
    // Artwork is not worth losing a batch over. Every track still commits, just
    // without a cover, and re-running the drop later fills it in — `upsert_album`
    // backfills a null cover but never overwrites one.
    console.error('Cover upload failed; continuing without artwork.', cause);
  }

  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, candidates.length));
  let next = 0;

  const worker = async () => {
    while (next < candidates.length) {
      if (options.signal?.aborted) return;
      const candidate = candidates[next++];

      const { outcome, provider } = await uploadAndCommit(
        candidate, covers, pool, handlers, options.signal,
      );
      if (outcome === 'committed') {
        summary.committed++;
        summary.bytesUploaded += candidate.fileSize;
        if (provider) summary.bytesByProvider[provider] += candidate.fileSize;
      } else if (outcome === 'duplicate') {
        summary.duplicates++;
      } else {
        summary.failed++;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  return summary;
}
