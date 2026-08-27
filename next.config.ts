import type { NextConfig } from 'next';

/**
 * Cover art is served from UploadThing's CDN, and next/image refuses any remote
 * host not listed here. The hostname is <appId>.ufs.sh, so it is derived from
 * NEXT_PUBLIC_UPLOADTHING_APP_ID at build time — if that env var is missing the
 * build still succeeds and every cover silently 400s, which is why the fallback
 * below is a wildcard rather than nothing.
 */
const appId = process.env.NEXT_PUBLIC_UPLOADTHING_APP_ID;

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
    ],
  },
};

export default nextConfig;
