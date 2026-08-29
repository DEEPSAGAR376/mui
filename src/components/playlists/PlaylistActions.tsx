'use client';

/**
 * Rename, publish, delete. Owner-only, and RLS says so too.
 *
 * The delete confirmation is a modal `ConfirmDialog` rather than the pair of
 * buttons that used to replace the trigger in place: swapping the trigger out
 * dropped focus on the floor, and there was no Escape. Keeping the trash button
 * mounted underneath is what lets the dialog hand focus back to it on close.
 *
 * The Public/Private pill stays hand-written on purpose. It is a two-state control
 * and no `Button` variant expresses the "on" half; appending the accent classes to
 * `secondary` would put two `border-color` and two `text-color` utilities from the
 * same namespace in conflict, which Tailwind resolves by *sheet* order rather than
 * by the order they appear in the attribute. Its padding already matches
 * `size="sm"`.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CheckIcon, SpinnerIcon, TrashIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import {
  deletePlaylist,
  renamePlaylist,
  setPlaylistVisibility,
} from '@/lib/actions/playlists';

export function PlaylistActions({
  playlistId,
  name,
  isPublic,
}: {
  playlistId: string;
  name: string;
  isPublic: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await work();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'That did not work.');
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <Input
              autoFocus
              size="md"
              aria-label="Playlist name"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setDraft(name);
                  setEditing(false);
                }
                if (event.key === 'Enter') {
                  run(async () => {
                    await renamePlaylist(playlistId, draft);
                    setEditing(false);
                  });
                }
              }}
              className="w-44"
            />
            <Button
              variant="primary"
              shape="square"
              onClick={() =>
                run(async () => {
                  await renamePlaylist(playlistId, draft);
                  setEditing(false);
                })
              }
              aria-label="Save name"
            >
              {pending ? <SpinnerIcon className="size-4" /> : <CheckIcon className="size-4" />}
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Rename
          </Button>
        )}

        <button
          type="button"
          onClick={() => run(() => setPlaylistVisibility(playlistId, !isPublic))}
          aria-pressed={isPublic}
          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
            isPublic
              ? 'border-accent bg-accent/15 text-accent-bright'
              : 'border-ink-700 text-muted hover:border-ink-600 hover:text-white'
          }`}
        >
          {isPublic ? 'Public' : 'Private'}
        </button>

        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label="Delete playlist"
          title="Delete playlist"
          className="rounded-full border border-ink-700 p-2 text-muted-dim transition-colors duration-fast hover:border-danger hover:text-danger"
        >
          <TrashIcon className="size-4" />
        </button>
      </div>

      {error ? (
        <p aria-live="polite" className="max-w-xs text-right text-xs text-danger">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title="Delete this playlist?"
        confirmLabel="Delete for good"
        cancelLabel="Keep"
        pending={pending}
        onConfirm={() =>
          run(async () => {
            await deletePlaylist(playlistId);
            router.push('/playlists');
          })
        }
        onCancel={() => setConfirming(false)}
      >
        <span className="font-medium text-white">{name}</span> is deleted for everyone it
        was shared with. The tracks in it are untouched — a playlist only ever held
        references to them.
      </ConfirmDialog>
    </div>
  );
}
