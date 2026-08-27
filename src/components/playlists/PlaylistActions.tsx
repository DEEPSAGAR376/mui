'use client';

/** Rename, publish, delete. Owner-only, and RLS says so too. */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CheckIcon, SpinnerIcon, TrashIcon } from '@/components/icons';
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
            <input
              autoFocus
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
              className="w-44 rounded-full border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() =>
                run(async () => {
                  await renamePlaylist(playlistId, draft);
                  setEditing(false);
                })
              }
              className="rounded-full bg-accent p-2 text-white hover:bg-accent-bright"
              aria-label="Save name"
            >
              {pending ? <SpinnerIcon className="size-4" /> : <CheckIcon className="size-4" />}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full border border-ink-700 px-3 py-1.5 text-xs text-muted transition-colors hover:border-ink-600 hover:text-white"
          >
            Rename
          </button>
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

        {confirming ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                run(async () => {
                  await deletePlaylist(playlistId);
                  router.push('/playlists');
                })
              }
              className="rounded-full bg-danger px-3 py-1.5 text-xs font-medium text-ink-950"
            >
              Delete for good
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full border border-ink-700 px-3 py-1.5 text-xs text-muted hover:text-white"
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label="Delete playlist"
            title="Delete playlist"
            className="rounded-full border border-ink-700 p-2 text-muted-dim transition-colors hover:border-danger hover:text-danger"
          >
            <TrashIcon className="size-4" />
          </button>
        )}
      </div>

      {error ? <p className="max-w-xs text-right text-xs text-danger">{error}</p> : null}
    </div>
  );
}
