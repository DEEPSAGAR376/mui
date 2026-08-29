'use client';

/**
 * Admin. Worth its own wording: the two likely causes here are specific, and
 * neither is obvious from a generic message.
 *
 * Client Component, because an error boundary has to be — it holds the retry
 * callback. The prop is `retry`, not the `reset` that older App Router code
 * used: see `ErrorPanel` for why that distinction matters here.
 */

import { ErrorPanel } from '@/components/ui/ErrorPanel';

export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorPanel
      title="The admin screen didn’t load"
      description="Either the query failed, or this session no longer carries an admin claim. Signing in again fixes the second."
      digest={error.digest}
      retry={retry}
    />
  );
}
