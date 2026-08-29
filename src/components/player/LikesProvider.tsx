'use client';

/**
 * Which tracks the visitor has liked, held once for the whole page.
 *
 * Every listing renders a heart, and each one needs to know its own state. Asking
 * per button would be one request per row; this loads the set once (server-side,
 * passed in as `initialLiked`) and keeps it in a context that the buttons read.
 *
 * That set arrives as a promise rather than an array, so the document does not
 * wait on it — the hearts start empty and fill a frame after paint. The read is
 * an effect and not `use()` on purpose, and the reason is playback: `use()`
 * suspends, this provider's nearest boundary is the root layout, and a fallback
 * swap there would unmount `PlayerProvider`'s `<audio>` mid-track. An effect
 * cannot suspend anything.
 *
 * The anonymous session is created HERE, on the first like — never on page load.
 * `signInAnonymously()` writes a real `auth.users` row, so calling it while
 * someone merely browses would let every crawler mint one, and Supabase counts
 * those toward monthly active users.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ensureSession } from '@/lib/supabase/client';
import { toggleLike } from '@/lib/actions/likes';

interface LikesApi {
  isLiked: (trackId: string) => boolean;
  toggle: (trackId: string) => Promise<void>;
  /** Set when a like could not be saved — usually anonymous sign-ins being off. */
  error: string | null;
  count: number;
}

const LikesContext = createContext<LikesApi | null>(null);

export function useLikes(): LikesApi {
  const context = useContext(LikesContext);
  if (!context) throw new Error('useLikes must be used inside <LikesProvider>');
  return context;
}

export function LikesProvider({
  initialLiked,
  children,
}: {
  /** Unawaited by the root layout, and already `.catch`ed there, so it cannot reject. */
  initialLiked: Promise<string[]>;
  children: React.ReactNode;
}) {
  const [liked, setLiked] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    initialLiked.then(
      (ids) => {
        // A union rather than a replace: these ids are what the server knew when
        // the request began, and a heart tapped in the meantime must not be undone
        // by them arriving. The length check keeps the common case — no session, no
        // likes — from costing a render for nothing.
        if (live && ids.length > 0) setLiked((prev) => new Set([...ids, ...prev]));
      },
      // Unreachable today; here so a future caller that forgets the layout's
      // `.catch` gets an empty set instead of an unhandled rejection.
      () => {},
    );

    return () => {
      live = false;
    };
  }, [initialLiked]);

  const toggle = useCallback(async (trackId: string) => {
    setError(null);

    const userId = await ensureSession();
    if (!userId) {
      setError('Could not start a session. Enable Anonymous sign-ins in Supabase to use likes.');
      return;
    }

    // Flip first, reconcile after. A heart that waits for a round trip feels
    // broken even when it is working.
    let wasLiked = false;
    setLiked((prev) => {
      wasLiked = prev.has(trackId);
      const next = new Set(prev);
      if (wasLiked) next.delete(trackId);
      else next.add(trackId);
      return next;
    });

    try {
      const result = await toggleLike(trackId);
      // Trust the server's answer over the optimistic guess: another tab may have
      // already flipped this row, in which case our delete found nothing.
      setLiked((prev) => {
        const next = new Set(prev);
        if (result.liked) next.add(trackId);
        else next.delete(trackId);
        return next;
      });
    } catch (cause) {
      setLiked((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(trackId);
        else next.delete(trackId);
        return next;
      });
      setError(cause instanceof Error ? cause.message : 'Could not save that like.');
    }
  }, []);

  const value = useMemo<LikesApi>(
    () => ({
      isLiked: (trackId: string) => liked.has(trackId),
      toggle,
      error,
      count: liked.size,
    }),
    [error, liked, toggle],
  );

  return <LikesContext.Provider value={value}>{children}</LikesContext.Provider>;
}
