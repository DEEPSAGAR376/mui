'use client';

/**
 * Search.
 *
 * Client Component, because an error boundary has to be — it holds the retry
 * callback. The prop is `retry`, not the `reset` that older App Router code
 * used: see `ErrorPanel` for why that distinction matters here.
 */

import { ErrorPanel } from '@/components/ui/ErrorPanel';

export default function SearchError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorPanel
      title="The search didn’t run"
      description="The query failed on its way to the database. Trying again re-runs exactly the same search."
      digest={error.digest}
      retry={retry}
    />
  );
}
