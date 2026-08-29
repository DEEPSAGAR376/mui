'use client';

/**
 * Favourites.
 *
 * Client Component, because an error boundary has to be — it holds the retry
 * callback. The prop is `retry`, not the `reset` that older App Router code
 * used: see `ErrorPanel` for why that distinction matters here.
 */

import { ErrorPanel } from '@/components/ui/ErrorPanel';

export default function LikesError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorPanel
      title="Your favourites didn’t load"
      description="The likes query failed. Nothing was lost — likes live server-side, keyed to your session, and reading them is all that went wrong."
      digest={error.digest}
      retry={retry}
    />
  );
}
