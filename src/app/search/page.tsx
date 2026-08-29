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

import type { Metadata } from 'next';
import Form from 'next/form';
import { SearchIcon } from '@/components/icons';
import { PlayAllButtons, TrackList } from '@/components/player/TrackList';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { myPlaylists } from '@/lib/actions/playlists';
import { SEARCH_LIMIT, searchTracks, type SearchResult } from '@/lib/data/tracks';
import { plural } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search the library by title, artist or album.',
};

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
      <PageHeader title="Search" subtitle={subtitle} actions={<PlayAllButtons tracks={tracks} />} />

      <Form action="/search" className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-dim" />
          <Input
            name="q"
            type="search"
            defaultValue={raw}
            maxLength={120}
            autoComplete="off"
            aria-label="Search titles, artists and albums"
            placeholder="Titles, artists, albums"
            className="w-full pl-9"
          />
        </div>
        <Button type="submit" variant="primary">
          Search
        </Button>
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
