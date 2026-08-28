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

/** How many matches a search shows. Well under PostgREST's `max_rows`, so that cap never truncates silently. */
export const SEARCH_LIMIT = 200;

export interface SearchResult {
  tracks: TrackView[];
  /** The query as it was actually searched for — shown in the subtitle, never written back into the box. */
  terms: string[];
}

/**
 * A character that may appear inside a search term.
 *
 * A positive allowlist, and that is the whole safety argument: `.or()` appends
 * its argument to the query string with no escaping at all, so the guarantee has
 * to come from what can never enter a term. This set holds `0-9`, `A-Za-z` and
 * letter ranges from U+00C0 up — no ASCII punctuation and no ASCII whitespace.
 * Every character PostgREST's filter grammar reads (comma, parentheses, quote,
 * backslash) and both LIKE metacharacters (`%` and `_`) is ASCII punctuation, so
 * none of them can reach the wire.
 *
 * The gaps are deliberate: U+00A0–U+00BF (NBSP and Latin-1 punctuation),
 * U+2000–U+2BFF (curly quotes, dashes, ellipsis), U+2FF0–U+3040 (CJK
 * punctuation) and everything from U+D800 (surrogate pairs, so emoji) are
 * boundaries. `\p{...}` is not an option: tsconfig targets ES2017 and TypeScript
 * rejects Unicode property escapes below ES2018.
 */
const TERM_CHAR = /^[0-9A-Za-z\u00C0-\u024F\u0370-\u1FFF\u2C00-\u2FEF\u3041-\uD7FF\uF900-\uFAFF]$/;

/** Unreachable given TERM_CHAR. Kept as the enforcement point if that set is ever widened. */
const UNSAFE = /[,()"'\%_*.:&=#+\s]/;

const MAX_TERMS = 6;
const MAX_TERM_LENGTH = 40;
const MAX_QUERY_LENGTH = 200;

/**
 * Break a raw query into the terms that will be required.
 *
 * Punctuation is a boundary rather than something stripped inside one pattern,
 * and that is what makes matching work as well as what makes it safe: `Earth,
 * Wind & Fire` becomes earth + wind + fire, all three required, so it matches
 * whether or not the punctuation was typed. A lone ASCII letter is dropped — it
 * would match almost every row — but a lone CJK glyph is a real query and is kept.
 */
export function searchTerms(query: string): string[] {
  const terms: string[] = [];
  let current = '';

  const flush = () => {
    const term = current.slice(0, MAX_TERM_LENGTH);
    current = '';
    if (term === '') return;
    if (term.length < 2 && !/[^\x00-\x7F]/.test(term)) return;
    if (UNSAFE.test(term)) return;
    if (!terms.includes(term)) terms.push(term);
  };

  for (const char of query.slice(0, MAX_QUERY_LENGTH).normalize('NFC')) {
    if (TERM_CHAR.test(char)) current += char.toLowerCase();
    else flush();
    if (terms.length >= MAX_TERMS) return terms;
  }
  flush();
  return terms;
}

/**
 * Substring search over the four text columns of `tracks_view`.
 *
 * Every term must match, each across all four columns — one `or` group per term,
 * ANDed by PostgREST the way any two top-level filters are. The `filter` pass
 * afterwards is not decoration: it requires the same terms over the same four
 * columns in JS, so the rendered list is exactly right even if the server-side
 * conjunction were ever looser than intended.
 *
 * Only `text` columns are touched. `genre` is `text[]`, and `year`, `track_no`,
 * `created_at` and the uuids are not text — `ilike` on any of them is a 400 that
 * fails the whole request rather than returning a partial result.
 */
export async function searchTracks(query: string, limit = SEARCH_LIMIT): Promise<SearchResult> {
  const terms = searchTerms(query);
  if (terms.length === 0) return { tracks: [], terms };

  const supabase = await createClient();

  let filtered = supabase.from('tracks_view').select('*');
  for (const term of terms) {
    const pattern = `%${term}%`;
    filtered = filtered.or(
      `title.ilike.${pattern},artist_name.ilike.${pattern},album_title.ilike.${pattern},album_artist_name.ilike.${pattern}`,
    );
  }

  const { data, error } = await filtered
    .order('album_artist_name', { ascending: true, nullsFirst: false })
    .order('album_title', { ascending: true, nullsFirst: false })
    .order('disc_no', { ascending: true, nullsFirst: true })
    .order('track_no', { ascending: true, nullsFirst: true })
    .order('title', { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(`Could not search the library: ${error.message}`);

  const tracks = asTrackViews(data ?? []).filter((row) => {
    const haystack = [row.title, row.artist_name, row.album_title, row.album_artist_name]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });

  return { tracks, terms };
}
