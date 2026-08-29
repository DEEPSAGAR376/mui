'use client';

/**
 * Playlists, and every playlist under it — `/playlists/[id]` has no boundary of
 * its own, so a failure there lands here.
 *
 * Client Component, because an error boundary has to be — it holds the retry
 * callback. The prop is `retry`, not the `reset` that older App Router code
 * used: see `ErrorPanel` for why that distinction matters here.
 */

import { ErrorPanel } from '@/components/ui/ErrorPanel';

export default function PlaylistsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorPanel
      title="Your playlists didn’t load"
      description="The playlist query failed. Nothing was changed by the attempt, so retrying is safe."
      digest={error.digest}
      retry={retry}
    />
  );
}
