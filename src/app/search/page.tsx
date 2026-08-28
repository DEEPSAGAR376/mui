/**
 * Search.
 *
 * `?q=` is the entire state, so a search is linkable, survives a refresh, and the
 * back button walks previous searches. Submit-driven rather than per-keystroke:
 * one query and one `myPlaylists()` per navigation, and the box shows what was
 * typed rather than what the tokeniser made of it.
 *
 * The results are the queue, exactly as on the library page.
 */

import Form from 'next/form';
import { SearchIcon } from '@/components/icons';
import { PlayAllButtons, TrackList } from '@/components/player/TrackList';
import { myPlaylists } from '@/lib/actions/playlists';
import { SEARCH_LIMIT, searchTracks, type SearchResult } from '@/lib/data/tracks';
import { plural } from '@/lib/format';

const EMPTY: SearchResult = { tracks: [], terms: [] };

export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
  const { q } = await searchParams;
  // Repeated `?q=a&q=b` legitimately arrives as an array; take the first.
  const raw = (Array.isArray(q) ? (q[0] ?? '') : (q ?? '')).slice(0, 200);
  const asked = raw.trim() !== '';

  const [{ tracks, terms }, playlists] = await Promise.all([
    asked ? searchTracks(raw) : Promise.resolve(EMPTY),
    myPlaylists(),
  ]);

  const options = playlists.map((playlist) => ({ id: playlist.id, name: playlist.name }));

  const subtitle = !asked
    ? 'Titles, artists and albums.'
    : terms.length === 0
      ? 'Nothing searchable in that — try letters or numbers.'
      : `${plural(tracks.length, 'match', 'matches')} for ${terms.join(' + ')}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Search</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>

        <PlayAllButtons tracks={tracks} />
      </div>

      <Form action="/search" className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-dim" />
          <input
            name="q"
            type="search"
            defaultValue={raw}
            maxLength={120}
            autoComplete="off"
            aria-label="Search titles, artists and albums"
            placeholder="Titles, artists, albums"
            className="w-full rounded-full border border-ink-700 bg-ink-900 py-2 pr-4 pl-9 text-sm outline-none transition-colors focus:border-accent"
          />
        </div>
        <button
          type="submit"
          className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-bright"
        >
          Search
        </button>
      </Form>

      {asked ? (
        <TrackList
          tracks={tracks}
          playlists={options}
          emptyMessage={
            terms.length === 0
              ? 'Type a word from a title, an artist or an album.'
              : `Nothing matches ${terms.join(' + ')}.`
          }
        />
      ) : null}

      {tracks.length >= SEARCH_LIMIT ? (
        <p className="text-center text-xs text-muted-dim">
          {`Showing the first ${SEARCH_LIMIT} matches. Add another word to narrow it.`}
        </p>
      ) : null}
    </div>
  );
}
