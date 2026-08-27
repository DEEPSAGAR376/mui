/// <reference lib="webworker" />

/**
 * Tag parser. One instance per pool slot.
 *
 * Everything expensive happens here rather than on the main thread: reading the
 * file, parsing its tag regions, and both SHA-256 digests. A folder of 200
 * tracks would otherwise lock the UI for the duration.
 *
 * `music-metadata` resolves to `lib/core.js` in a browser bundle — its exports
 * map has a `default` condition pointing there, deliberately free of Node
 * built-ins. No Buffer or stream shim is needed under Turbopack.
 */

import { parseBlob, selectCover } from 'music-metadata';
import { hashBytes, hashFile } from './hash';
import type { ParseRequest, ParseResponse } from './types';

/** ID3v1 packs multiple genres into one string; split the common separators. */
function normalizeGenres(input: string[] | undefined): string[] {
  if (!input?.length) return [];
  const out = new Set<string>();
  for (const raw of input) {
    for (const part of raw.split(/[;/|]/)) {
      const trimmed = part.trim();
      if (trimmed) out.add(trimmed);
    }
  }
  return [...out];
}

/**
 * Year, from whichever tag actually carries it.
 *
 * `common.year` is absent more often than you'd expect — Vorbis comments
 * frequently carry only DATE ("1998-05-12"), and some rips only set
 * ORIGINALYEAR. Taking the leading four digits covers all three.
 */
function pickYear(year?: number, date?: string, originalyear?: number): number | null {
  if (typeof year === 'number' && year > 0) return year;
  const fromDate = date?.match(/\d{4}/)?.[0];
  if (fromDate) return Number(fromDate);
  if (typeof originalyear === 'number' && originalyear > 0) return originalyear;
  return null;
}

self.onmessage = async (event: MessageEvent<ParseRequest>) => {
  const { id, file } = event.data;

  // Hash first and unconditionally. Dedup must work even for a file whose tags
  // are unreadable — an untagged file the library already has should still be
  // skipped rather than re-uploaded and sent to the review grid a second time.
  let contentHash: string | null = null;
  try {
    contentHash = await hashFile(file);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      contentHash: null,
      reason: error instanceof Error ? error.message : 'hash failed',
      unsupported: false,
    } satisfies ParseResponse);
    return;
  }

  try {
    // `duration: true` lets it scan for a duration when the header has none
    // (VBR MP3s without a Xing frame). That reads far into the file, but the
    // bytes are already in the OS cache from hashing, so it is close to free.
    const meta = await parseBlob(file, { duration: true });
    const { common, format } = meta;

    const picture = selectCover(common.picture);
    let cover: { hash: string; mime: string; bytes: Uint8Array } | null = null;
    if (picture?.data?.byteLength) {
      // Standalone copy: the parser's Uint8Array is often a view onto a larger
      // pooled buffer, and it has to survive being transferred out of here.
      const bytes = new Uint8Array(picture.data.byteLength);
      bytes.set(picture.data);
      cover = {
        hash: await hashBytes(bytes),
        mime: picture.format || 'image/jpeg',
        bytes,
      };
    }

    const response: ParseResponse = {
      id,
      ok: true,
      contentHash,
      title: common.title?.trim() || null,
      artist: common.artist?.trim() || common.artists?.[0]?.trim() || null,
      albumArtist: common.albumartist?.trim() || null,
      album: common.album?.trim() || null,
      year: pickYear(common.year, common.date, common.originalyear),
      trackNo: common.track?.no ?? null,
      discNo: common.disk?.no ?? null,
      genre: normalizeGenres(common.genre),
      durationSeconds: typeof format.duration === 'number' ? format.duration : null,
      codec: format.codec ?? null,
      // format.bitrate is bits/sec; kbps is what a UI shows and what the int
      // column is sized for.
      bitrate: typeof format.bitrate === 'number' ? Math.round(format.bitrate / 1000) : null,
      cover,
    };

    // Transfer the cover buffer rather than copying it across the boundary.
    self.postMessage(response, cover ? [cover.bytes.buffer] : []);
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const message = error instanceof Error ? error.message : 'parse failed';
    self.postMessage({
      id,
      ok: false,
      contentHash,
      reason: message,
      // Not an audio file, or a container music-metadata doesn't know. Worth
      // distinguishing: these get dropped, whereas a genuine parse error on a
      // real audio file goes to the review grid for a manual fix.
      unsupported:
        name === 'CouldNotDetermineFileTypeError' || name === 'UnsupportedFileTypeError',
    } satisfies ParseResponse);
  }
};
