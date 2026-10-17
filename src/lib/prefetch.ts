/**
 * Background prefetch engine for zero-latency track transitions.
 *
 * Automatically downloads upcoming tracks into the Cache API while the current
 * one plays. When `resolveAudioSrc` runs at transition time, it finds a local
 * blob and returns a `blob:` URL — no network request, no TTFB, instant
 * playback.
 *
 * Design principles:
 * - Invisible: no React state, no re-renders, no progress UI
 * - Cancellable: AbortController per run, cancelled on queue change
 * - Respectful: skips on saveData / 2G, uses low fetch priority, checks quota
 * - Non-destructive: never evicts user-cached (manual) entries
 */

import { openCache } from './cache';

/* ------------------------------------------------------------------ */
/*  Network & storage guards                                           */
/* ------------------------------------------------------------------ */

/** Whether the network allows speculative fetching. */
function shouldPrefetch(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof caches === 'undefined') return false;
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (!connection) return true;
  if (connection.saveData) return false;
  return connection.effectiveType !== 'slow-2g' && connection.effectiveType !== '2g';
}

/** Max tracks to look ahead based on connection quality. */
function maxDepth(): number {
  if (typeof navigator === 'undefined') return 0;
  const connection = (
    navigator as Navigator & {
      connection?: { effectiveType?: string };
    }
  ).connection;
  if (!connection) return 3; // Unknown connection — optimistic
  switch (connection.effectiveType) {
    case '4g':
      return 3;
    case '3g':
      return 1;
    default:
      return 0;
  }
}

/** Whether the origin has enough storage quota for another prefetch. */
async function hasQuota(minBytes = 100 * 1024 * 1024): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return true;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return quota - usage > minBytes;
  } catch {
    return true;
  }
}

/* ------------------------------------------------------------------ */
/*  Prefetch engine                                                    */
/* ------------------------------------------------------------------ */

let currentController: AbortController | null = null;

export interface PrefetchTarget {
  trackId: string;
  audioUrl: string;
  coverUrl?: string | null;
}

/**
 * Download a single track into the Cache API, tagged as a prefetch entry.
 *
 * Returns `true` if the track is now in the cache (was already there, or
 * successfully downloaded). Returns `false` on failure or cancellation.
 */
async function prefetchOne(
  target: PrefetchTarget,
  signal: AbortSignal,
): Promise<boolean> {
  const cache = await openCache();
  if (!cache) return false;

  // Already cached? Nothing to do.
  const existing = await cache.match(target.audioUrl);
  if (existing) return true;

  // Quota check before downloading a potentially large file.
  if (!(await hasQuota())) return false;

  try {
    const init: RequestInit = { signal, priority: 'low' };

    const response = await fetch(target.audioUrl, init);
    if (!response.ok || signal.aborted) return false;

    const blob = await response.blob();
    if (signal.aborted) return false;

    // Tag the entry so auto-eviction can distinguish it from user-cached tracks.
    await cache.put(
      target.audioUrl,
      new Response(blob, {
        headers: {
          'Content-Type': blob.type || 'audio/mpeg',
          'X-Cache-Source': 'prefetch',
        },
      }),
    );

    // Cover art: best-effort, tagged the same way.
    if (target.coverUrl && !signal.aborted) {
      try {
        const coverResp = await fetch(target.coverUrl, { signal });
        if (coverResp.ok && !signal.aborted) {
          const coverBlob = await coverResp.blob();
          await cache.put(
            target.coverUrl,
            new Response(coverBlob, {
              headers: {
                'Content-Type': coverBlob.type || 'image/jpeg',
                'X-Cache-Source': 'prefetch',
              },
            }),
          );
        }
      } catch {
        // Cover caching is a nicety; the track still works without it.
      }
    }

    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return false;
    return false;
  }
}

/**
 * Prefetch upcoming tracks into the Cache API, sequentially.
 *
 * Cancels any in-flight prefetch from a previous call. Tracks are fetched one
 * at a time so a slow connection still finishes the most important one (N+1)
 * before starting N+2.
 *
 * After fetching, stale prefetch entries (tracks that were prefetched earlier
 * but are no longer upcoming) are evicted. Entries cached manually by the user
 * via the download button are never touched.
 */
export async function prefetchAhead(targets: PrefetchTarget[]): Promise<void> {
  // Cancel a previous run — its targets are stale.
  cancelPrefetch();

  if (!shouldPrefetch()) return;
  if (targets.length === 0) return;

  const depth = maxDepth();
  const limited = targets.slice(0, depth);
  if (limited.length === 0) return;

  const controller = new AbortController();
  currentController = controller;

  // Fetch sequentially: N+1 first, then N+2, then N+3.
  for (const target of limited) {
    if (controller.signal.aborted) break;
    await prefetchOne(target, controller.signal);
  }

  // Evict entries from earlier prefetches that are no longer upcoming.
  if (!controller.signal.aborted) {
    const keepUrls = new Set(targets.map((t) => t.audioUrl));
    await evictStalePrefetch(keepUrls);
  }

  if (currentController === controller) currentController = null;
}

/** Cancel any in-flight prefetch run. */
export function cancelPrefetch(): void {
  if (currentController) {
    currentController.abort();
    currentController = null;
  }
}

/* ------------------------------------------------------------------ */
/*  Eviction                                                           */
/* ------------------------------------------------------------------ */

/**
 * Remove prefetched entries that are no longer relevant.
 *
 * Only entries with `X-Cache-Source: prefetch` are considered; everything else
 * (user-cached via the download button, or entries predating the tagging
 * system) is left untouched.
 */
async function evictStalePrefetch(keepUrls: Set<string>): Promise<void> {
  const cache = await openCache();
  if (!cache) return;

  const keys = await cache.keys();
  for (const request of keys) {
    if (keepUrls.has(request.url)) continue;

    const response = await cache.match(request);
    if (!response) continue;

    const source = response.headers.get('X-Cache-Source');
    if (source === 'prefetch') {
      await cache.delete(request);
    }
  }
}
