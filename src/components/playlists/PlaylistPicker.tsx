'use client';

/**
 * "Add to playlist" — a small menu, opened per row.
 *
 * The playlist list is passed in from the page rather than fetched here: a library
 * page renders hundreds of these, and each one fetching its own copy would be
 * hundreds of identical queries. Creating a playlist from inside the menu is
 * supported because that is when people realise they want one.
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { addToPlaylist, createPlaylist } from '@/lib/actions/playlists';
import { CheckIcon, PlusIcon, SpinnerIcon } from '@/components/icons';

export interface PlaylistOption {
  id: string;
  name: string;
}

export function PlaylistPicker({
  trackId,
  playlists,
  className,
}: {
  trackId: string;
  playlists: PlaylistOption[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const root = useRef<HTMLDivElement | null>(null);

  // Close on outside click and on Escape. Both, because a menu that only closes
  // one way is the kind of thing you notice every single time.
  useEffect(() => {
    if (!open) return;

    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const add = (playlistId: string) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await addToPlaylist(playlistId, trackId);
        setDone(result.added ? 'Added' : 'Already there');
        setTimeout(() => {
          setDone(null);
          setOpen(false);
        }, 900);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not add that.');
      }
    });
  };

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createPlaylist(trimmed);
        await addToPlaylist(id, trackId);
        setName('');
        setCreating(false);
        setDone('Added');
        setTimeout(() => {
          setDone(null);
          setOpen(false);
        }, 900);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not create that playlist.');
      }
    });
  };

  return (
    <div ref={root} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label="Add to playlist"
        aria-expanded={open}
        title="Add to playlist"
        className="rounded-full p-1.5 text-muted-dim transition-colors hover:text-white"
      >
        {pending ? <SpinnerIcon className="size-4" /> : <PlusIcon className="size-4" />}
      </button>

      {open ? (
        <div
          onClick={(event) => event.stopPropagation()}
          className="absolute right-0 bottom-full z-50 mb-1 w-56 overflow-hidden rounded-lg border border-ink-600 bg-ink-850 shadow-xl shadow-black/50"
        >
          {done ? (
            <p className="flex items-center gap-2 px-3 py-2.5 text-sm text-ok">
              <CheckIcon className="size-4" /> {done}
            </p>
          ) : (
            <>
              <div className="max-h-56 overflow-y-auto">
                {playlists.length === 0 ? (
                  <p className="px-3 py-2.5 text-xs text-muted-dim">No playlists yet.</p>
                ) : (
                  playlists.map((playlist) => (
                    <button
                      key={playlist.id}
                      type="button"
                      onClick={() => add(playlist.id)}
                      className="block w-full truncate px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-ink-700 hover:text-white"
                    >
                      {playlist.name}
                    </button>
                  ))
                )}
              </div>

              <div className="border-t border-ink-700">
                {creating ? (
                  <div className="flex items-center gap-1 p-2">
                    <input
                      autoFocus
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') create();
                      }}
                      placeholder="Playlist name"
                      className="min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={create}
                      className="rounded-md bg-accent px-2 py-1.5 text-xs font-medium text-white hover:bg-accent-bright"
                    >
                      Add
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-ink-700 hover:text-white"
                  >
                    <PlusIcon className="size-4" /> New playlist
                  </button>
                )}
              </div>
            </>
          )}

          {error ? <p className="px-3 pb-2 text-xs text-danger">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
