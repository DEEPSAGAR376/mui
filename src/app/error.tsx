'use client';

/**
 * The catch-all for anything under the root layout that has no closer
 * boundary of its own — the library page and `/login`, in practice. Sections
 * with their own wording get their own `error.tsx` beside their page.
 *
 * Client Component, because an error boundary has to be — it holds the retry
 * callback. The prop is `retry`, not the `reset` that older App Router code
 * used: see `ErrorPanel` for why that distinction matters here.
 */

import { ErrorPanel } from '@/components/ui/ErrorPanel';

export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorPanel
      title="This page didn’t load"
      description="A query failed on the way to the database. Whatever was playing is still playing — the player sits above this boundary, so a failure here cannot stop it."
      digest={error.digest}
      retry={retry}
    />
  );
}
