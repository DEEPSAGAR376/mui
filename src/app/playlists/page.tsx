/** Playlist index: what you have, and a box to make another. */

import Link from 'next/link';
import { NewPlaylistForm } from '@/components/playlists/NewPlaylistForm';
import { myPlaylists } from '@/lib/actions/playlists';
import { plural } from '@/lib/format';

export default async function PlaylistsPage() {
  const playlists = await myPlaylists();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Playlists</h1>
          <p className="mt-1 text-sm text-muted">
            {playlists.length === 0 ? 'None yet.' : plural(playlists.length, 'playlist')}
          </p>
        </div>

        <NewPlaylistForm />
      </div>

      {playlists.length === 0 ? (
        <p className="rounded-lg border border-dashed border-ink-700 px-4 py-10 text-center text-sm text-muted-dim">
          Playlists you create live here. They stay private unless you publish them,
          and publishing needs a permanent account.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <Link
                href={`/playlists/${playlist.id}`}
                className="flex flex-col gap-1 rounded-xl border border-ink-800 bg-ink-900 p-4 transition-colors hover:border-ink-600 hover:bg-ink-850"
              >
                <span className="truncate text-sm font-medium text-white">{playlist.name}</span>
                <span className="text-xs text-muted-dim">
                  {plural(playlist.trackCount, 'track')}
                  {playlist.is_public ? ' · public' : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
