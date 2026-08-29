/**
 * One playlist.
 *
 * Readable if it is yours or public — that decision belongs to the RLS policy, so
 * a missing row here means "not visible to you" and "does not exist" without
 * distinguishing them, which is the right amount to tell a stranger.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PlayAllButtons } from '@/components/player/TrackList';
import { PlaylistActions } from '@/components/playlists/PlaylistActions';
import { SortableTrackList } from '@/components/playlists/SortableTrackList';
import { PageHeader } from '@/components/ui/PageHeader';
import { myPlaylists, playlistWithTracks } from '@/lib/actions/playlists';
import { plural } from '@/lib/format';
import { getUserId } from '@/lib/supabase/server';

/**
 * `generateMetadata` and the page below both need the playlist, and this is a
 * Supabase query rather than a `fetch`, so Next's automatic request memoization
 * does not apply — React's `cache` is the documented substitute for exactly that
 * case. Without it, opening one playlist would run the query twice.
 */
const loadPlaylist = cache(playlistWithTracks);

/**
 * These are the URLs people actually paste to each other, so the title is worth
 * a query: 'Late night · newmv' rather than 'newmv'.
 *
 * A playlist that is private or absent comes back null from RLS either way, and
 * the fallback title says neither — the same non-answer the page gives.
 */
export async function generateMetadata({
  params,
}: PageProps<'/playlists/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const data = await loadPlaylist(id);
  if (!data) return { title: 'Playlist' };

  return {
    title: data.playlist.name,
    description: data.playlist.description ?? undefined,
  };
}

export default async function PlaylistPage({ params }: PageProps<'/playlists/[id]'>) {
  const { id } = await params;

  const [data, userId, playlists] = await Promise.all([
    loadPlaylist(id),
    getUserId(),
    myPlaylists(),
  ]);

  if (!data) notFound();

  const { playlist, tracks } = data;
  const canEdit = Boolean(userId) && playlist.owner_id === userId;
  const options = playlists.map((entry) => ({ id: entry.id, name: entry.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        truncate
        title={playlist.name}
        subtitle={
          <>
            {plural(tracks.length, 'track')}
            {playlist.is_public ? ' · public' : ''}
            {canEdit ? '' : ' · read-only'}
          </>
        }
        actions={
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
        }
      >
        {playlist.description ? (
          <p className="mt-2 max-w-prose text-sm text-muted-dim">{playlist.description}</p>
        ) : null}
      </PageHeader>

      <SortableTrackList
        playlistId={playlist.id}
        tracks={tracks}
        playlists={options}
        canEdit={canEdit}
      />
    </div>
  );
}
