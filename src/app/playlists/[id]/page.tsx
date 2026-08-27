/**
 * One playlist.
 *
 * Readable if it is yours or public — that decision belongs to the RLS policy, so
 * a missing row here means "not visible to you" and "does not exist" without
 * distinguishing them, which is the right amount to tell a stranger.
 */

import { notFound } from 'next/navigation';
import { PlayAllButtons } from '@/components/player/TrackList';
import { PlaylistActions } from '@/components/playlists/PlaylistActions';
import { SortableTrackList } from '@/components/playlists/SortableTrackList';
import { myPlaylists, playlistWithTracks } from '@/lib/actions/playlists';
import { plural } from '@/lib/format';
import { getUserId } from '@/lib/supabase/server';

export default async function PlaylistPage({ params }: PageProps<'/playlists/[id]'>) {
  const { id } = await params;

  const [data, userId, playlists] = await Promise.all([
    playlistWithTracks(id),
    getUserId(),
    myPlaylists(),
  ]);

  if (!data) notFound();

  const { playlist, tracks } = data;
  const canEdit = Boolean(userId) && playlist.owner_id === userId;
  const options = playlists.map((entry) => ({ id: entry.id, name: entry.name }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-white">
            {playlist.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {plural(tracks.length, 'track')}
            {playlist.is_public ? ' · public' : ''}
            {canEdit ? '' : ' · read-only'}
          </p>
          {playlist.description ? (
            <p className="mt-2 max-w-prose text-sm text-muted-dim">{playlist.description}</p>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          <PlayAllButtons tracks={tracks} />
          {canEdit ? (
            <PlaylistActions
              playlistId={playlist.id}
              name={playlist.name}
              isPublic={playlist.is_public}
            />
          ) : null}
        </div>
      </div>

      <SortableTrackList
        playlistId={playlist.id}
        tracks={tracks}
        playlists={options}
        canEdit={canEdit}
      />
    </div>
  );
}
