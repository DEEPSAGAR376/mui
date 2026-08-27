/**
 * Triage — turn a parse result into a queue row, and decide whether a human
 * needs to look at it.
 *
 * The whole point of the upload screen is that most files never reach the grid.
 * Tags come first, inference fills the gaps, and only what is still missing after
 * both gets flagged.
 */

import { hashBytes } from './hash';
import {
  directoryOf,
  guessFromFilename,
  guessFromPath,
  probeDuration,
} from './fallbacks';
import type {
  Candidate,
  CoverArt,
  FlagReason,
  ParseRequest,
  ParseResponse,
} from './types';

/**
 * Flags that hold a row back from auto-queueing.
 *
 * Title and artist are genuinely required — the database rejects a track without
 * them. Album and cover are judgement calls: a library of loose singles has
 * neither, and the grid's "queue anyway" action exists for exactly that case.
 * They are included because a folder ingest that silently dropped album art
 * would be worse than one that asked.
 */
export const BLOCKING_FLAGS: readonly FlagReason[] = [
  'missing-title',
  'missing-artist',
  'missing-album',
  'missing-cover',
  'parse-failed',
];

function blank(value: string | null | undefined): boolean {
  return !value || value.trim() === '';
}

/** Recomputed after every grid edit, so flags clear as the human fills fields in. */
export function computeFlags(candidate: Candidate): FlagReason[] {
  const flags: FlagReason[] = [];
  if (blank(candidate.title)) flags.push('missing-title');
  if (blank(candidate.artist)) flags.push('missing-artist');
  if (blank(candidate.album)) flags.push('missing-album');
  if (!candidate.cover) flags.push('missing-cover');
  if (candidate.durationSeconds === null) flags.push('missing-duration');
  return flags;
}

export function isBlocked(flags: FlagReason[]): boolean {
  return flags.some((flag) => BLOCKING_FLAGS.includes(flag));
}

/**
 * Whether a flagged row may be pushed through as it stands.
 *
 * The grid's "queue anyway" is for the judgement-call flags — no album, no
 * artwork. Title and artist are not negotiable: they are NOT NULL in the schema,
 * so a row without them would fail at the commit rather than at the button.
 */
export function canForceQueue(candidate: Candidate): boolean {
  return candidate.title.trim() !== '' && candidate.artist.trim() !== '';
}

/** Apply the current flags to the status. Used on build and after every edit. */
export function retriage(candidate: Candidate): Candidate {
  const flags = computeFlags(candidate);
  return { ...candidate, flags, status: isBlocked(flags) ? 'review' : 'ready' };
}

/** Read a sibling image file into a hashed CoverArt, same shape as embedded art. */
export async function loadSiblingCover(file: File): Promise<CoverArt> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    hash: await hashBytes(bytes),
    mime: file.type || 'image/jpeg',
    bytes,
  };
}

/**
 * Build the queue row for one parsed file.
 *
 * Precedence is strict and one-directional: embedded tag, then filename, then
 * folder path. Inference only ever writes into a field the layer above left
 * empty — a guess must never overwrite something the file actually claims about
 * itself.
 *
 * `albumArtist` falling back to `artist` is what makes compilations come out
 * right: each track keeps its own performer, and the album groups under whatever
 * the ALBUMARTIST tag says (typically "Various Artists").
 */
export async function buildCandidate(
  request: ParseRequest,
  response: ParseResponse,
  siblingCovers: Map<string, File>,
): Promise<Candidate> {
  const { id, file, relativePath } = request;
  const fromName = guessFromFilename(file.name);
  const fromPath = guessFromPath(relativePath);

  const parsed = response.ok ? response : null;

  const title = parsed?.title ?? fromName.title ?? null;
  const artist = parsed?.artist ?? fromName.artist ?? fromPath.artist ?? null;
  const album = parsed?.album ?? fromPath.album ?? null;
  const albumArtist = parsed?.albumArtist ?? artist;

  let cover: CoverArt | null = parsed?.cover ?? null;
  if (!cover) {
    const sibling = siblingCovers.get(directoryOf(relativePath));
    if (sibling) {
      try {
        cover = await loadSiblingCover(sibling);
      } catch {
        // A cover we can't read is the same as no cover — it gets flagged, not
        // thrown. Never let artwork failure lose the audio.
      }
    }
  }

  let durationSeconds = parsed?.durationSeconds ?? null;
  if (durationSeconds === null) {
    durationSeconds = await probeDuration(file);
  }

  const candidate: Candidate = {
    id,
    file,
    relativePath,
    contentHash: response.contentHash ?? '',
    fileSize: file.size,
    mimeType: file.type || null,
    codec: parsed?.codec ?? null,
    bitrate: parsed?.bitrate ?? null,
    title: title ?? '',
    artist: artist ?? '',
    albumArtist: albumArtist ?? '',
    album: album ?? '',
    year: parsed?.year ?? null,
    trackNo: parsed?.trackNo ?? fromName.trackNo ?? null,
    discNo: parsed?.discNo ?? fromPath.discNo ?? null,
    genre: parsed?.genre ?? [],
    durationSeconds,
    cover,
    status: 'ready',
    flags: [],
    progress: 0,
  };

  const triaged = retriage(candidate);

  // A file whose tags could not be read at all is worth marking as such, even
  // when filename inference happened to fill every field — the human should get
  // the chance to look before it lands in the library.
  if (!response.ok) {
    const reason: FlagReason = response.unsupported ? 'unsupported' : 'parse-failed';
    return {
      ...triaged,
      flags: [reason, ...triaged.flags],
      status: 'review',
      error: response.reason,
    };
  }

  return triaged;
}

/** Human-readable chip text for the review grid. */
export const FLAG_LABELS: Record<FlagReason, string> = {
  'missing-title': 'no title',
  'missing-artist': 'no artist',
  'missing-album': 'no album',
  'missing-cover': 'no cover art',
  'missing-duration': 'no duration',
  unsupported: 'unsupported container',
  'parse-failed': 'tags unreadable',
};
