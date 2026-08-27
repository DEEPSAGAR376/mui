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
 */

import { uploadFiles } from '@/lib/uploadthing';
import { commitTrack, type IngestTrackPayload } from '@/lib/actions/ingest';
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
 * belongs to. `uploadFiles` returns an array, and relying on it being in request
 * order would be a silent correctness bug the first time it isn't.
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
 * Upload every distinct cover the batch needs, and return a hash -> {url, key}
 * map covering both the new uploads and the ones preflight already knew about.
 *
 * Deduplication happens on the hash, so twelve tracks sharing one embedded image
 * collapse to a single upload. This is the difference between 24 uploads and 13
 * for a normal album.
 */
async function uploadCovers(
  candidates: Candidate[],
  knownCovers: Record<string, { url: string; key: string }>,
  handlers: IngestHandlers,
  signal?: AbortSignal,
): Promise<{ map: Map<string, { url: string; key: string }>; uploaded: number; reused: number }> {
  const map = new Map<string, { url: string; key: string }>();
  let reused = 0;

  // Seed with what the server already has.
  for (const [hash, value] of Object.entries(knownCovers)) {
    map.set(hash, value);
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

  const results = await uploadFiles('coverUploader', { files, signal });

  for (const result of results) {
    // Match on the filename, which is the hash — see coverToFile.
    const hash = result.name.replace(/\.[^.]+$/, '');
    map.set(hash, { url: result.ufsUrl, key: result.key });
  }
  handlers.onCoverProgress?.(files.length, files.length);

  return { map, uploaded: results.length, reused };
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
  covers: Map<string, { url: string; key: string }>,
  handlers: IngestHandlers,
  signal?: AbortSignal,
): Promise<'committed' | 'duplicate' | 'failed'> {
  try {
    handlers.onStatus(candidate.id, 'uploading');

    const [uploaded] = await uploadFiles('audioUploader', {
      files: [candidate.file],
      signal,
      onUploadProgress: ({ progress }) => handlers.onProgress(candidate.id, progress),
    });

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
      audio_url: uploaded.ufsUrl,
      audio_key: uploaded.key,
      content_hash: candidate.contentHash,
      file_size: candidate.fileSize,
      mime_type: candidate.mimeType,
      codec: candidate.codec,
      bitrate: candidate.bitrate,
      cover_url: cover?.url ?? null,
      cover_key: cover?.key ?? null,
      cover_hash: candidate.cover?.hash ?? null,
    };

    const result = await commitTrack(payload);
    handlers.onProgress(candidate.id, 100);
    handlers.onStatus(candidate.id, result.created ? 'done' : 'duplicate');
    return result.created ? 'committed' : 'duplicate';
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'upload failed';
    handlers.onStatus(candidate.id, 'error', message);
    return 'failed';
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
  knownCovers: Record<string, { url: string; key: string }>,
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
  };

  if (candidates.length === 0) return summary;

  // Covers first and as a barrier: a track row references its cover's URL, so
  // there is nothing to gain from interleaving them.
  let covers = new Map<string, { url: string; key: string }>();
  try {
    const result = await uploadCovers(candidates, knownCovers, handlers, options.signal);
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

      const outcome = await uploadAndCommit(candidate, covers, handlers, options.signal);
      if (outcome === 'committed') {
        summary.committed++;
        summary.bytesUploaded += candidate.fileSize;
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
