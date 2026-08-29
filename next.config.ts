import { networkInterfaces } from 'node:os';
import type { NextConfig } from 'next';

/**
 * Cover art is served from whichever provider holds it, and next/image refuses
 * any remote host not listed here — so both sides of the storage pool need an
 * entry.
 *
 * UploadThing's hostname is <appId>.ufs.sh, derived from
 * NEXT_PUBLIC_UPLOADTHING_APP_ID at build time; if that env var is missing the
 * build still succeeds and every cover silently 400s, which is why the fallback
 * below is a wildcard rather than nothing. Supabase's is the project host, parsed
 * out of NEXT_PUBLIC_SUPABASE_URL — inside try/catch for the same reason, since a
 * missing or malformed URL must not fail the build.
 */
const appId = process.env.NEXT_PUBLIC_UPLOADTHING_APP_ID;

function supabaseHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const host = supabaseHost();

/**
 * Every address this machine can be reached on, plus its subnet.
 *
 * `next dev` prints one of these itself as the "Network" URL, and that URL is
 * dead without an entry here -- so deriving the list beats hand-listing it. The
 * last octet becomes a `*` so a phone on the same Wi-Fi is covered too;
 * `isCsrfOriginAllowed` matches per dot-separated segment, with no numeric
 * ranges, which is why the wildcard has to sit on a whole segment.
 */
function lanHosts(): string[] {
  const hosts = new Set<string>();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      // Node reports `family` as 'IPv4' since 18; older majors used 4.
      const isV4 = entry.family === 'IPv4' || (entry.family as unknown) === 4;
      if (!isV4 || entry.internal) continue;
      hosts.add(entry.address);
      hosts.add(entry.address.replace(/\.\d+$/, '.*'));
    }
  }
  return [...hosts];
}

const nextConfig: NextConfig = {
  /**
   * Hosts allowed to request dev-only assets.
   *
   * `next dev` blocks cross-origin requests to `/_next/*` and rejects the HMR
   * socket unless the requesting origin is on this list, which by default holds
   * `localhost` and nothing else. The failure is total and looks nothing like a
   * config problem: the HTML server-renders fine, then every client chunk comes
   * back `403`, hydration never runs, and the page sits there fully drawn and
   * completely dead -- no player, no upload widget, no navigation. Only some
   * chunks carry `crossorigin=""`, which is what makes them send an `Origin`
   * header and get caught, so the console shows a handful of 403s rather than a
   * clean wall of them.
   *
   * `127.0.0.1` is not the same host as `localhost` to this check, and neither is
   * the LAN address a phone would use -- nor, for that matter, the "Network" URL
   * `next dev` prints in its own banner. Verified in
   * `next/dist/server/lib/router-utils/block-cross-site-dev.js`: the default list
   * is `['**.localhost', 'localhost']` plus whatever the server was started with
   * as `--hostname`, and nothing else.
   *
   * `192.168.*.*` is kept as a safety net for the common home subnet even when
   * this machine currently sits on a different one. If a blocked host still turns
   * up, the dev-server warning names it -- add it here.
   *
   * Development only; `next build` and `next start` ignore it.
   */
  allowedDevOrigins: ['127.0.0.1', '[::1]', '192.168.*.*', ...lanHosts()],

  images: {
    /**
     * 31 days, against a default of 4 hours.
     *
     * The effective max-age is whichever is larger, this or the upstream
     * `Cache-Control` -- and upstream is `public, max-age=86400`, so the default
     * leaves the optimiser re-fetching and re-encoding every cover several times a
     * day. Cover art is immutable in practice: ingest derives the object key from
     * the file, so a changed picture is a new URL rather than new bytes at the old
     * one. There is no invalidation mechanism, which is exactly why a long TTL is
     * only safe when the URL changes with the content -- it does here.
     *
     * The gain is not the bytes. Both storage hosts sit behind a trans-Pacific
     * origin fetch (UploadThing measures 1.0-2.6s TTFB from here regardless of
     * size), and every optimiser miss pays it.
     */
    minimumCacheTTL: 2678400,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: appId ? `${appId}.ufs.sh` : '*.ufs.sh',
        pathname: '/f/**',
      },
      // Legacy host, still returned by older uploads.
      { protocol: 'https', hostname: 'utfs.io', pathname: '/f/**' },
      // Supabase Storage public objects. `*.supabase.co` when the project URL is
      // absent, so a build without env still renders the right shape of URL.
      {
        protocol: 'https' as const,
        hostname: host ?? '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  experimental: {
    /**
     * Client-side router cache, in seconds.
     *
     * `dynamic` has defaulted to 0 since v15 -- every navigation refetches the RSC
     * payload, so moving between the four library tabs pays a fresh round of
     * Supabase queries each time (~330ms warm from here, and the page cannot paint
     * without them). 30s is long enough that flipping between tabs is instant and
     * short enough that a change made elsewhere still turns up on its own.
     *
     * Safe because every mutation invalidates explicitly: the like, playlist and
     * ingest actions all call `revalidatePath`, and a Server Action's response
     * clears the client cache regardless of this window. So the stale window only
     * ever covers changes made outside this browser.
     */
    staleTimes: { dynamic: 30, static: 300 },
  },
};

export default nextConfig;
