'use client';

/**
 * Create a playlist.
 *
 * `ensureSession()` runs before the action, not on page load: the first playlist
 * is one of the two moments an anonymous session is worth creating (the other is
 * the first like).
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { PlusIcon, SpinnerIcon } from '@/components/icons';
import { createPlaylist } from '@/lib/actions/playlists';
import { ensureSession } from '@/lib/supabase/client';

export function NewPlaylistForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);

    startTransition(async () => {
      const userId = await ensureSession();
      if (!userId) {
        setError('Could not start a session. Enable Anonymous sign-ins in Supabase.');
        return;
      }

      try {
        const { id } = await createPlaylist(trimmed);
        setName('');
        router.push(`/playlists/${id}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not create that playlist.');
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
          placeholder="New playlist name"
          className="w-52 rounded-full border border-ink-700 bg-ink-900 px-4 py-2 text-sm outline-none transition-colors focus:border-accent"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || name.trim() === ''}
          className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-bright disabled:opacity-40"
        >
          {pending ? <SpinnerIcon className="size-4" /> : <PlusIcon className="size-4" />}
          Create
        </button>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
