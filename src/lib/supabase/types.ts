/**
 * The type surface application code imports.
 *
 * `./database.types.ts` is generated from the live schema and must not be edited.
 * This file is the thin hand-maintained layer over it: shorthands, and the RPC
 * return shapes the generator can only see as `Json`.
 */

import type { Database, Tables } from './database.types';
import type { Provider, StorageKey } from '@/lib/storage/provider';

export type {
  Database,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from './database.types';

export type Artist = Tables<'artists'>;
export type Album = Tables<'albums'>;
export type Track = Tables<'tracks'>;
export type Profile = Tables<'profiles'>;
export type Playlist = Tables<'playlists'>;

/**
 * Columns the generator marks nullable only because Postgres does not carry
 * `not null` through a view. Each one is `not null` on `public.tracks`, and
 * `artist_name` arrives over an inner join on a `not null` FK, so a row cannot
 * exist without it.
 *
 * Asserted here rather than null-checked at ~40 call sites: `audio.src =
 * current.audio_url` should not have to defend against a URL the schema
 * guarantees. If a column here ever loses its constraint, this is the one place
 * that has to change.
 */
type TrackViewRequired =
  | 'id'
  | 'title'
  | 'genre'
  | 'audio_url'
  | 'audio_key'
  | 'created_at'
  | 'artist_id'
  | 'artist_name';

/** The row shape every listing and the player queue are built from. */
export type TrackView = Omit<TrackViewRow, TrackViewRequired> & {
  [K in TrackViewRequired]: NonNullable<TrackViewRow[K]>;
};

/** Return shape of `ingest_preflight` — the hashes the server already has. */
export interface PreflightResult {
  existing_tracks: string[];
  known_covers: Record<string, { url: string; key: string; provider?: Provider }>;
}

/** Return shape of `ingest_track`. `created: false` means it was a duplicate. */
export interface IngestTrackResult {
  track_id: string;
  created: boolean;
}

/**
 * Return shape of `delete_track`.
 *
 * `keys` are provider-tagged so the caller knows which service to sweep. Bare
 * strings are the pre-shared-storage shape and mean UploadThing — the only place
 * a file could have been at the time.
 */
export interface DeleteTrackResult {
  deleted: boolean;
  keys: (StorageKey | string)[];
}

/** Raw `tracks_view` row as the generator sees it — every column nullable. */
export type TrackViewRow = Database['public']['Views']['tracks_view']['Row'];

/**
 * Narrow raw view rows to `TrackView`, at the data boundary.
 *
 * The Supabase client is typed from the generated `Database`, so a select on
 * `tracks_view` hands back `TrackViewRow`. This is the single place that crossing
 * happens: every read path funnels through it, so the assertion documented on
 * `TrackViewRequired` is made exactly once instead of at each consumer.
 */
export function asTrackViews(rows: TrackViewRow[]): TrackView[] {
  return rows as TrackView[];
}
