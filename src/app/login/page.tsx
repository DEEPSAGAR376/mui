/**
 * Account.
 *
 * Three states, and the session decides which: no session at all (nothing has
 * been liked yet), a guest session created by a like or a playlist, or a
 * permanent account. The JWT is read with `getClaims()` rather than `getUser()`
 * because it verifies the signature locally instead of trusting a cookie.
 */

import { AuthPanel } from '@/components/AuthPanel';
import { createClient, isAdmin } from '@/lib/supabase/server';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data }, admin] = await Promise.all([supabase.auth.getClaims(), isAdmin()]);
  const claims = data?.claims;

  const mode = !claims ? 'none' : claims.is_anonymous === true ? 'anonymous' : 'permanent';
  const email = typeof claims?.email === 'string' ? claims.email : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Account</h1>
        <p className="mt-1 text-sm text-muted">
          Listening needs no account at all. This page exists so a guest session can
          become a permanent one without losing anything.
        </p>
      </div>

      {typeof error === 'string' && error ? (
        <p className="max-w-lg rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <AuthPanel mode={mode} email={email} />

      {admin ? (
        <p className="text-xs text-muted-dim">
          This account is an admin — the upload and manage screens are yours.
        </p>
      ) : mode === 'permanent' ? (
        <p className="max-w-lg text-xs text-muted-dim">
          Not an admin. Admin is granted once, by hand, in SQL:
          <code className="ml-1 rounded bg-ink-850 px-1.5 py-0.5 text-[11px] text-muted">
            update public.profiles set role = &apos;admin&apos; where id = &apos;…&apos;;
          </code>
        </p>
      ) : null}
    </div>
  );
}
