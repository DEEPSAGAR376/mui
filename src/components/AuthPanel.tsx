'use client';

/**
 * Session panel.
 *
 * The interesting case is the middle one. An anonymous session that adds an email
 * keeps the SAME user id, so every like and playlist made before signing up
 * carries over untouched — that is the reason this app uses anonymous auth instead
 * of a device id in localStorage, and it only works through `updateUser`, never by
 * signing in again as someone new.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { SpinnerIcon } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';

type Mode = 'anonymous' | 'permanent' | 'none';

export function AuthPanel({ mode, email }: { mode: Mode; email: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const redirectTo = () =>
    typeof window === 'undefined' ? undefined : `${window.location.origin}/auth/callback`;

  /** Attach an email to the session that already exists, keeping its user id. */
  const upgrade = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: failure } = await supabase.auth.updateUser(
        { email: value.trim() },
        { emailRedirectTo: redirectTo() },
      );

      if (failure) setError(failure.message);
      else setMessage('Check that inbox — the link confirms the address and keeps this session.');
    });
  };

  /** Sign in to an existing account. Note this REPLACES the current session. */
  const signIn = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: failure } = await supabase.auth.signInWithOtp({
        email: value.trim(),
        options: { emailRedirectTo: redirectTo() },
      });

      if (failure) setError(failure.message);
      else setMessage('Check that inbox for a sign-in link.');
    });
  };

  const signOut = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.refresh();
    });
  };

  return (
    <div className="flex max-w-lg flex-col gap-4 rounded-xl border border-ink-800 bg-ink-900 p-5">
      {mode === 'permanent' ? (
        <>
          <div>
            <p className="text-sm text-white">Signed in{email ? ` as ${email}` : ''}.</p>
            <p className="mt-1 text-xs text-muted">
              Likes and playlists are attached to this account.
            </p>
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={pending}
            className="self-start rounded-full border border-ink-700 px-4 py-2 text-sm text-muted transition-colors hover:border-ink-600 hover:text-white disabled:opacity-40"
          >
            Sign out
          </button>
        </>
      ) : (
        <>
          <div>
            <p className="text-sm text-white">
              {mode === 'anonymous' ? 'Keep this session' : 'Sign in'}
            </p>
            <p className="mt-1 text-xs text-muted">
              {mode === 'anonymous'
                ? 'This browser has a guest session holding your likes and playlists. Add an email and it becomes a real account — same id, nothing lost.'
                : 'A link arrives by email. No password to remember.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="you@example.com"
              className="min-w-56 flex-1 rounded-full border border-ink-700 bg-ink-950 px-4 py-2 text-sm outline-none transition-colors focus:border-accent"
            />
            <button
              type="button"
              onClick={mode === 'anonymous' ? upgrade : signIn}
              disabled={pending || !value.includes('@')}
              className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-bright disabled:opacity-40"
            >
              {pending ? <SpinnerIcon className="size-4" /> : null}
              {mode === 'anonymous' ? 'Save my session' : 'Send link'}
            </button>
          </div>

          {mode === 'anonymous' ? (
            <button
              type="button"
              onClick={signOut}
              disabled={pending}
              className="self-start text-xs text-muted-dim underline-offset-4 hover:underline"
            >
              Discard this guest session
            </button>
          ) : null}
        </>
      )}

      {message ? <p className="text-xs text-ok">{message}</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
