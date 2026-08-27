/**
 * Where every emailed link lands.
 *
 * Two shapes arrive here and both have to work:
 *
 *   · `?code=…`                     PKCE magic-link sign-in
 *   · `?token_hash=…&type=…`        email confirmation / email change
 *
 * The exchange must happen on the server, in a Route Handler, because that is the
 * only place in the App Router that can both read the incoming query and write the
 * session cookies back. Doing it in a page would leave the browser holding a token
 * it cannot persist.
 */

import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  // Only ever a path, never an absolute URL: taking `next` verbatim would make
  // this an open redirect that any emailed link could point anywhere.
  const requested = searchParams.get('next') ?? '/';
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/';

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('That link is missing its token.')}`);
}
