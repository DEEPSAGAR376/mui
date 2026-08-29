/**
 * Opens the sockets to the storage hosts before anything asks for them.
 *
 * Two origins, and only two, because a preconnect nobody uses costs a handshake
 * and a socket held warm for nothing:
 *
 *  - `<appId>.ufs.sh` — the browser fetches raw audio straight from here, so the
 *    first play of a session otherwise pays DNS, TCP and TLS before a single byte
 *    of the file moves. Cover art goes through `/_next/image`, which is our own
 *    origin, so audio is the whole reason this entry exists — and it matters more
 *    than it looks: the host answers in 1.0-2.6s from this region regardless of
 *    file size, and a cold handshake on top of that is the gap between a press
 *    and a wait.
 *  - The Supabase project host — the browser client signs in anonymously on first
 *    load, and tracks held on the Supabase side of the storage pool stream their
 *    audio from it as well.
 *
 * Deliberately no `crossOrigin`. A bare `<audio src>` is a no-CORS, credentialed
 * fetch, and a connection opened as `crossorigin` (anonymous) does not match it —
 * the browser would open a second one, which is worse than not hinting at all.
 * Supabase's REST calls are CORS requests and would rather have the anonymous
 * socket, but they are not the latency that hurts.
 *
 * ## Why plain `<link>` and not `react-dom`'s `preconnect()`
 *
 * `preconnect('https://…')` from a Client Component is the mechanism the Next
 * docs show, and it does not work here — measured, not assumed. With a probe in
 * place the component server-renders, `ORIGINS` holds both hosts and `preconnect`
 * is a real function, yet `rel="preconnect"` appears nowhere in the served HTML
 * in either `next dev` or a production `next start`. The hint API writes through
 * a dispatcher that has to be the server one at that moment, and it evidently
 * isn't; the tag presumably arrives after hydration, which is most of the head
 * start given away.
 *
 * A rendered `<link>` has no such dependency: React 19 treats it as hoistable
 * metadata and lifts it into `<head>` from wherever it appears in the tree, in
 * the first bytes of the document. Confirmed in the served markup both ways —
 * both tags land before `</head>` in `next dev` and in `next start`. That also
 * makes this a Server Component: no `'use client'`, no bundle cost, nothing to
 * hydrate.
 */

function uploadthingOrigin(): string | null {
  const appId = process.env.NEXT_PUBLIC_UPLOADTHING_APP_ID;
  return appId ? `https://${appId}.ufs.sh` : null;
}

function supabaseOrigin(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Resolved once at module scope. Both are `NEXT_PUBLIC_`, so they are inlined at
 * build time; a missing one drops out of the list instead of hinting at
 * `https://undefined.ufs.sh`.
 */
const ORIGINS = [uploadthingOrigin(), supabaseOrigin()].filter(
  (origin): origin is string => origin !== null,
);

export function ResourceHints() {
  return (
    <>
      {ORIGINS.map((origin) => (
        <link key={origin} rel="preconnect" href={origin} />
      ))}
    </>
  );
}
