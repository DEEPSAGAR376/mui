import 'server-only';

/**
 * Server Supabase client — Server Components, Server Actions, Route Handlers.
 *
 * Not memoized, unlike the browser client: each request has its own cookie jar,
 * so a module-level singleton would leak one user's session into another
 * request. Call this per request.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './types';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot write cookies. That is fine: `proxy.ts`
            // already refreshed the session on this request, so there is
            // nothing here that still needs persisting.
          }
          // The adapter's second argument is a set of no-store response headers
          // (Cache-Control/Expires/Pragma). Deliberately ignored here — there is
          // no response object to attach them to from a Server Component, and
          // writing them through `cookieStore.set` would create cookies literally
          // named "Cache-Control". `proxy.ts` is where they get applied, and any
          // route reading cookies is already dynamic, so nothing caches it.
        },
      },
    },
  );
}

/**
 * The verified current user id, or null.
 *
 * `getClaims()` rather than `getSession()`: cookies are user-writable, so a
 * session read straight out of them is untrusted input. getClaims verifies the
 * JWT signature (locally against the JWKS when the project uses asymmetric
 * keys, otherwise via the auth server).
 */
export async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
}

/**
 * True when the caller is an admin.
 *
 * Delegates to the `is_admin()` SQL function rather than reading `profiles`
 * here, so there is exactly one definition of "admin" and it is the same one
 * every RLS policy consults.
 *
 * This is for UI decisions and early redirects only. It is NOT the security
 * boundary — RLS and the `is_admin()` assertions inside the ingest RPCs are.
 * Next 16's own proxy docs make the reason explicit: Server Functions are POSTs
 * to whatever route they're used from, so a proxy matcher can skip them
 * entirely. Every mutation re-checks server-side.
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('is_admin');
  if (error) return false;
  return data === true;
}
