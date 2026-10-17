/**
 * Browser-side audio cache, built on the Cache API.
 *
 * Every function guards `typeof caches` so it is safe to import from a module
 * that may be evaluated during SSR — it simply returns "nothing cached" on the
 * server. No Service Worker is needed: `PlayerProvider` checks the cache itself
 * before setting `audio.src`, so cached tracks play from local storage with
 * zero network latency.
 *
 * The cache name is namespaced to avoid collisions with anything else the
 * origin may store:
 */

const CACHE_NAME = 'mv:audio';

/** Whether the Cache API is available in this environment. */
function hasCache(): boolean {
  return typeof caches !== 'undefined';
}

export async function openCache(): Promise<Cache | null> {
  if (!hasCache()) return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

/**
 * Resolve an audio URL to a blob URL if it is cached, otherwise return the
 * original URL unchanged.
 *
 * The blob URL lets the `<audio>` element read from local storage — no network
 * request, no range-request negotiation, and playback starts instantly.
 */
export async function resolveAudioSrc(url: string): Promise<string> {
  const cache = await openCache();
  if (!cache) return url;

  const match = await cache.match(url);
  if (!match) return url;

  try {
    const blob = await match.blob();
    return URL.createObjectURL(blob);
  } catch {
    return url;
  }
}
