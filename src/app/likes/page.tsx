/**
 * Favourites.
 *
 * Empty for a visitor who has never liked anything — including the case where no
 * session exists yet, since one is only created on the first like. That is by
 * design: browsing must not mint `auth.users` rows.
 */

import type { Metadata } from 'next';
import { likedTracks } from '@/lib/actions/likes';
import { PlayAllButtons, TrackList } from '@/components/player/TrackList';
import { PageHeader } from '@/components/ui/PageHeader';
import { myPlaylists } from '@/lib/actions/playlists';
import { plural } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Favourites',
  description: 'Tracks you have liked, newest first.',
};

export default async function LikesPage() {
  const [tracks, playlists] = await Promise.all([likedTracks(), myPlaylists()]);
  const options = playlists.map((playlist) => ({ id: playlist.id, name: playlist.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Favourites"
        subtitle={
          tracks.length === 0 ? 'Nothing yet.' : `${plural(tracks.length, 'track')}, newest first`
        }
        actions={<PlayAllButtons tracks={tracks} />}
      />

      <TrackList
        tracks={tracks}
        playlists={options}
        emptyMessage="Tap the heart on any track and it will show up here."
      />
    </div>
  );
}
