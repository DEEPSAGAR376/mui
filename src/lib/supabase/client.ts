'use client';

/**
 * Browser Supabase client.
 *
 * Memoized on purpose. `createBrowserClient` is cheap to call but each instance
 * spins up its own auth listener and token-refresh timer — creating one per
 * component render means several clients racing to refresh the same session,
 * which is where the "Multiple GoTrueClient instances" warning comes from.
 *
 * Cookie handling is the library's default here (document.cookie), which is
 * what keeps the browser session and the server session looking at the same
 * store.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

type Client = ReturnType<typeof createBrowserClient<Database>>;

let client: Client | undefined;

export function createClient(): Client {
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}

/**
 * Get a user id, minting an anonymous session if there isn't one yet.
 *
 * Deliberately NOT called on page load. Every call to `signInAnonymously()`
 * writes a real `auth.users` row, so calling it while merely browsing would let
 * any crawler mint rows — and Supabase counts them toward MAU. Call it at the
 * point of the first write (a like, a playlist action) and never before.
 *
 * The id survives an upgrade to a real account via `updateUser({ email })`, so
 * likes and playlists carry over. That is the whole reason for preferring this
 * over a localStorage device id.
 */
export async function ensureSession(): Promise<string | null> {
  const supabase = createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const existing = claims?.claims?.sub;
  if (existing) return existing;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    // Anonymous sign-ins are a dashboard toggle (Auth > Sign In / Providers).
    // If they're off, this is the error the user will see, so name the fix.
    console.error(
      'Anonymous sign-in failed. Is "Anonymous sign-ins" enabled in the Supabase dashboard?',
      error.message,
    );
    return null;
  }
  return data.user?.id ?? null;
}
