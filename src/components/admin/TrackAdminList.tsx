'use client';

/**
 * The manage list — the only place a track can be deleted.
 *
 * Deletion is confirmed rather than immediate, because unlike removing a track
 * from a playlist it is not recoverable: `delete_track` drops the row and then
 * the audio file is swept out of UploadThing storage. The confirmation names the
 * track so a mis-click on a dense list is caught before it costs anything.
 */

import { useState, useTransition } from 'react';
import { deleteTrack } from '@/lib/actions/ingest';
import { formatBytes, plural } from '@/lib/format';
import { TrackList } from '@/components/player/TrackList';
import type { PlaylistOption } from '@/components/playlists/PlaylistPicker';
import type { TrackView } from '@/lib/supabase/types';

export function TrackAdminList({
  tracks,
  playlists,
}: {
  tracks: TrackView[];
  playlists: PlaylistOption[];
}) {
  const [rows, setRows] = useState(tracks);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<TrackView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const bytes = rows.reduce((total, row) => total + (row.file_size ?? 0), 0);

  const remove = (track: TrackView) => {
    setConfirming(null);
    setNotice(null);

    startTransition(async () => {
      try {
        const result = await deleteTrack(track.id);
        if (!result.deleted) {
          setNotice(`${track.title} was already gone.`);
          return;
        }
        setRows((prev) => prev.filter((row) => row.id !== track.id));
        // The row is gone either way — a failed storage sweep leaves a paid-for
        // file behind, which is worth saying out loud rather than swallowing.
        setNotice(
          result.storageError
            ? `${track.title} was deleted, but its file could not be removed from storage: ${result.storageError}`
            : `${track.title} deleted, ${result.storageDeleted} ${plural(result.storageDeleted, 'file')} removed from storage.`,
        );
      } catch (cause) {
        setNotice(cause instanceof Error ? cause.message : 'Delete failed.');
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        {rows.length} {plural(rows.length, 'track')} · {formatBytes(bytes)}. Rows play on
        click, same as anywhere else.
      </p>

      {confirming ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3">
          <p className="text-sm text-white">
            Delete <span className="font-medium">{confirming.title}</span> by{' '}
            {confirming.artist_name}? The audio file is removed from storage too. Cover
            art is kept until the album has no tracks left.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="rounded-md border border-ink-700 px-3 py-1.5 text-sm text-muted transition-colors hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => remove(confirming)}
              className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}

      {notice ? <p className="text-sm text-muted-dim">{notice}</p> : null}

      <TrackList
        tracks={rows}
        playlists={playlists}
        emptyMessage="The library is empty. Drop a folder on the upload screen."
        onRemove={(trackId) => {
          const track = rows.find((row) => row.id === trackId);
          if (track) setConfirming(track);
        }}
      />
    </div>
  );
}
