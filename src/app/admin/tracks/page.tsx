/**
 * Manage — the whole library in album order, with a delete on every row.
 *
 * Album order rather than newest-first: this is the screen you open to find a
 * bad rip, and a bad rip is found by looking at the album it belongs to.
 */

import { listTracksByAlbum } from '@/lib/data/tracks';
import { myPlaylists } from '@/lib/actions/playlists';
import { TrackAdminList } from '@/components/admin/TrackAdminList';

export default async function ManageTracksPage() {
  const [tracks, playlists] = await Promise.all([listTracksByAlbum(2000), myPlaylists()]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Manage</h1>
        <p className="mt-1 text-sm text-muted">
          Deleting a track removes its row and sweeps its audio file out of storage.
        </p>
      </div>

      <TrackAdminList tracks={tracks} playlists={playlists} />
    </div>
  );
}
