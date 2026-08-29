/** Playlist index: what you have, and a box to make another. */

import type { Metadata } from 'next';
import { NewPlaylistForm } from '@/components/playlists/NewPlaylistForm';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { myPlaylists } from '@/lib/actions/playlists';
import { plural } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Playlists',
  description: 'Playlists you have made, and a box to make another.',
};

export default async function PlaylistsPage() {
  const playlists = await myPlaylists();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Playlists"
        subtitle={playlists.length === 0 ? 'None yet.' : plural(playlists.length, 'playlist')}
        actions={<NewPlaylistForm />}
      />

      {playlists.length === 0 ? (
        <EmptyState>
          Playlists you create live here. They stay private unless you publish them,
          and publishing needs a permanent account.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <Card href={`/playlists/${playlist.id}`}>
                <span className="truncate text-sm font-medium text-white">{playlist.name}</span>
                <span className="text-xs text-muted-dim">
                  {plural(playlist.trackCount, 'track')}
                  {playlist.is_public ? ' · public' : ''}
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
