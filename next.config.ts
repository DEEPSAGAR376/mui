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

const nextConfig: NextConfig = {
  images: {
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
};

export default nextConfig;
