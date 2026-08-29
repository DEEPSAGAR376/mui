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
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
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
    <div className="glass flex max-w-lg flex-col gap-4 rounded-2xl border border-hairline p-5">
      {mode === 'permanent' ? (
        <>
          <div>
            <p className="text-sm text-white">Signed in{email ? ` as ${email}` : ''}.</p>
            <p className="mt-1 text-xs text-muted">
              Likes and playlists are attached to this account.
            </p>
          </div>
          <Button variant="secondary" onClick={signOut} disabled={pending} className="self-start">
            Sign out
          </Button>
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
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              tone="sunken"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              className="min-w-56 flex-1"
            />
            <Button
              variant="primary"
              onClick={mode === 'anonymous' ? upgrade : signIn}
              disabled={pending || !value.includes('@')}
            >
              {pending ? <SpinnerIcon className="size-4" /> : null}
              {mode === 'anonymous' ? 'Save my session' : 'Send link'}
            </Button>
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
