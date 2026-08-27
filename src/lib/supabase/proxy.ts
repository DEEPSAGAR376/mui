/**
 * Session refresh for `src/proxy.ts`.
 *
 * Server Components can read cookies but not write them, so a refreshed access
 * token would be dropped on the floor without something upstream persisting it.
 * That something is the proxy: it runs before the render, gets the rotated
 * tokens from `getClaims()`, and writes them onto both the outgoing response
 * (so the browser stores them) and the forwarded request (so the render that
 * follows sees them on this same pass, not the next one).
 *
 * This is NOT an authorization layer. Next 16's proxy docs are explicit that
 * Server Functions are POSTs to whatever route they're used from, so a matcher
 * that skips a path skips its Server Functions too. Authorization lives in RLS
 * and in the `is_admin()` assertions inside the RPCs.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from './types';

export async function refreshSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // Onto the request first: rebuilding the response from the mutated
          // request is what makes the new token visible to this render pass.
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // Cache-Control/Expires/Pragma, all no-store. A CDN caching a response
          // that carries auth cookies would hand one visitor's session to the
          // next one.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Load-bearing, despite the discarded result: this is the call that rotates an
  // expiring token and triggers setAll above. Removing it means sessions expire
  // mid-visit and users get logged out at random.
  await supabase.auth.getClaims();

  return response;
}
