'use client';

/**
 * The manage list — the only place a track can be deleted.
 *
 * Deletion is confirmed rather than immediate, because unlike removing a track
 * from a playlist it is not recoverable: `delete_track` drops the row and then
 * the audio file is swept out of UploadThing storage. The confirmation names the
 * track so a mis-click on a dense list is caught before it costs anything.
 *
 * That confirmation used to be an inline banner rendered above the list, which on
 * a two-thousand-row library put the warning several screens away from the row you
 * clicked and left focus behind on the row. It is a modal `ConfirmDialog` now —
 * see that file for why the native `<dialog>` is doing the work.
 *
 * The wrapper below is a layout stack, not a list, and deliberately stays a
 * `<div>`: the list semantics live in `TrackList`, which is a real `ul`/`li`.
 */

import { useState, useTransition } from 'react';
import { deleteTrack } from '@/lib/actions/ingest';
import { formatBytes, plural } from '@/lib/format';
import { TrackList } from '@/components/player/TrackList';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
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

      {/* `aria-live` because the outcome arrives after the dialog has closed and
          focus has gone back to a row — nothing would otherwise announce it. */}
      {notice ? (
        <p aria-live="polite" className="text-sm text-muted-dim">
          {notice}
        </p>
      ) : null}

      <TrackList
        tracks={rows}
        playlists={playlists}
        emptyMessage="The library is empty. Drop a folder on the upload screen."
        onRemove={(trackId) => {
          const track = rows.find((row) => row.id === trackId);
          if (track) setConfirming(track);
        }}
      />

      <ConfirmDialog
        open={confirming !== null}
        title="Delete this track?"
        confirmLabel="Delete"
        pending={pending}
        onConfirm={() => confirming && remove(confirming)}
        onCancel={() => setConfirming(null)}
      >
        {confirming ? (
          <>
            <span className="font-medium text-white">{confirming.title}</span> by{' '}
            {confirming.artist_name} will be removed from the library, and its audio file
            from storage. Cover art is kept until the album has no tracks left.
          </>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
