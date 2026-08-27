/**
 * Favourites.
 *
 * Empty for a visitor who has never liked anything — including the case where no
 * session exists yet, since one is only created on the first like. That is by
 * design: browsing must not mint `auth.users` rows.
 */

import { likedTracks } from '@/lib/actions/likes';
import { PlayAllButtons, TrackList } from '@/components/player/TrackList';
import { myPlaylists } from '@/lib/actions/playlists';
import { plural } from '@/lib/format';

export default async function LikesPage() {
  const [tracks, playlists] = await Promise.all([likedTracks(), myPlaylists()]);
  const options = playlists.map((playlist) => ({ id: playlist.id, name: playlist.name }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Favourites</h1>
          <p className="mt-1 text-sm text-muted">
            {tracks.length === 0 ? 'Nothing yet.' : `${plural(tracks.length, 'track')}, newest first`}
          </p>
        </div>

        <PlayAllButtons tracks={tracks} />
      </div>

      <TrackList
        tracks={tracks}
        playlists={options}
        emptyMessage="Tap the heart on any track and it will show up here."
      />
    </div>
  );
}
