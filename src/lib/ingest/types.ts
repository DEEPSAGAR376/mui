/**
 * Shared shapes for the ingest pipeline.
 *
 * One `Candidate` per audio file, carried from selection through parsing,
 * triage, upload and commit. It accumulates fields as it moves — `contentHash`
 * after parsing, `audioUrl`/`audioKey` after upload — rather than being
 * transformed into a new type at each stage, so the UI can render the whole
 * queue from a single array regardless of how far along each row is.
 */

/** What tags the parser could not supply. Drives the review grid's reason chips. */
export type FlagReason =
  | 'missing-title'
  | 'missing-artist'
  | 'missing-album'
  | 'missing-cover'
  | 'missing-duration'
  | 'unsupported'
  | 'parse-failed';

export type CandidateStatus =
  | 'parsing'
  | 'ready'        // complete tags, auto-queued
  | 'review'       // something is missing, needs a human
  | 'duplicate'    // preflight says the library already has these bytes
  | 'uploading'
  | 'committing'
  | 'done'
  | 'error';

/** Embedded (or sibling-file) cover art, before it becomes an upload. */
export interface CoverArt {
  /** SHA-256 of the image bytes. The dedup key — identical art hashes alike. */
  hash: string;
  mime: string;
  bytes: Uint8Array;
  /** Set once uploaded, or straight from preflight when the server already has it. */
  url?: string;
  key?: string;
}

/** Editable metadata. Exactly the columns the review grid exposes. */
export interface TrackFields {
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  year: number | null;
  trackNo: number | null;
  discNo: number | null;
  genre: string[];
  durationSeconds: number | null;
}

export interface Candidate extends TrackFields {
  /** Client-side id. Not the database id — that arrives with the commit. */
  id: string;
  file: File;
  /** `webkitRelativePath` when available, else the bare name. Drives folder inference. */
  relativePath: string;
  contentHash: string;
  fileSize: number;
  mimeType: string | null;
  codec: string | null;
  bitrate: number | null;
  cover: CoverArt | null;
  audioUrl?: string;
  audioKey?: string;
  status: CandidateStatus;
  flags: FlagReason[];
  /** 0–100, per file. */
  progress: number;
  error?: string;
}

/** Worker request. `file` is structured-cloned, not copied byte-by-byte. */
export interface ParseRequest {
  id: string;
  file: File;
  relativePath: string;
}

/** What the worker sends back. It does the hashing too, to keep the main thread free. */
export interface ParseSuccess {
  id: string;
  ok: true;
  contentHash: string;
  title: string | null;
  artist: string | null;
  albumArtist: string | null;
  album: string | null;
  year: number | null;
  trackNo: number | null;
  discNo: number | null;
  genre: string[];
  durationSeconds: number | null;
  codec: string | null;
  bitrate: number | null;
  cover: { hash: string; mime: string; bytes: Uint8Array } | null;
}

export interface ParseFailure {
  id: string;
  ok: false;
  /** Still returned when possible — dedup works even if tags don't parse. */
  contentHash: string | null;
  reason: string;
  unsupported: boolean;
}

export type ParseResponse = ParseSuccess | ParseFailure;
