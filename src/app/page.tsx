/**
 * The library.
 *
 * Newest first, because the first thing anyone does after an upload is look for
 * what just landed. The whole list becomes the play queue, so "next" walks the
 * same order that is on screen.
 */

import { PlayAllButtons, TrackList } from '@/components/player/TrackList';
import { myPlaylists } from '@/lib/actions/playlists';
import { listRecentTracks, libraryStats } from '@/lib/data/tracks';
import { plural } from '@/lib/format';

export default async function LibraryPage() {
  const [tracks, stats, playlists] = await Promise.all([
    listRecentTracks(),
    libraryStats(),
    myPlaylists(),
  ]);

  const options = playlists.map((playlist) => ({ id: playlist.id, name: playlist.name }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Library</h1>
          <p className="mt-1 text-sm text-muted">
            {stats.tracks === 0
              ? 'Nothing uploaded yet.'
              : `${plural(stats.tracks, 'track')} · ${plural(stats.albums, 'album')} · ${plural(stats.artists, 'artist')}`}
          </p>
        </div>

        <PlayAllButtons tracks={tracks} />
      </div>

      <TrackList
        tracks={tracks}
        playlists={options}
        emptyMessage="No tracks yet. Drop a folder on the upload screen to fill this in."
      />

      {tracks.length >= 500 ? (
        <p className="text-center text-xs text-muted-dim">
          Showing the 500 most recent tracks.
        </p>
      ) : null}
    </div>
  );
}
