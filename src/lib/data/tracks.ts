import 'server-only';

/**
 * Read paths for the listing pages.
 *
 * Everything selects from `tracks_view`, which is the one shape the player
 * understands — artist and album names already joined in, so a listing never has
 * to fan out into two more queries to render a row. The view is
 * `security_invoker`, so RLS on the base tables still decides what comes back.
 */

import { createClient } from '@/lib/supabase/server';
import { asTrackViews, type TrackView } from '@/lib/supabase/types';

/** Newest first — after an upload, that is what you want to look at. */
export async function listRecentTracks(limit = 500): Promise<TrackView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tracks_view')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not load the library: ${error.message}`);
  return asTrackViews(data ?? []);
}

/** Album order: artist, then album, then disc and track number. */
export async function listTracksByAlbum(limit = 1000): Promise<TrackView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tracks_view')
    .select('*')
    .order('album_artist_name', { ascending: true, nullsFirst: false })
    .order('album_title', { ascending: true, nullsFirst: false })
    .order('disc_no', { ascending: true, nullsFirst: true })
    .order('track_no', { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw new Error(`Could not load the library: ${error.message}`);
  return asTrackViews(data ?? []);
}

export interface LibraryStats {
  tracks: number;
  albums: number;
  artists: number;
}

/**
 * Counts only, via `head: true` — PostgREST returns the count in a header and no
 * rows at all, so this costs three cheap queries rather than pulling the library
 * into memory to call `.length` on it.
 */
export async function libraryStats(): Promise<LibraryStats> {
  const supabase = await createClient();

  const [tracks, albums, artists] = await Promise.all([
    supabase.from('tracks').select('id', { count: 'exact', head: true }),
    supabase.from('albums').select('id', { count: 'exact', head: true }),
    supabase.from('artists').select('id', { count: 'exact', head: true }),
  ]);

  return {
    tracks: tracks.count ?? 0,
    albums: albums.count ?? 0,
    artists: artists.count ?? 0,
  };
}
