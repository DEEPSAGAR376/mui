/**
 * Next 16 replaced the `middleware` file convention with `proxy`. Same
 * mechanics, new name and a Node.js default runtime; `middleware.ts` still
 * works but the build prints "The 'middleware' file convention is deprecated.
 * Please use 'proxy' instead."
 *
 * Do not set `runtime` here — Proxy is Node.js by default in v16 and declaring
 * it throws.
 *
 * All this does is keep the Supabase session fresh. It is not a security gate;
 * see the comment in `lib/supabase/proxy.ts`.
 */

import type { NextRequest } from 'next/server';
import { refreshSession } from '@/lib/supabase/proxy';

export function proxy(request: NextRequest) {
  return refreshSession(request);
}

export const config = {
  /**
   * Skip Next internals and static assets. The negative lookahead also excludes
   * common image extensions so a page full of cover art doesn't run a session
   * refresh per thumbnail.
   */
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)'],
};
