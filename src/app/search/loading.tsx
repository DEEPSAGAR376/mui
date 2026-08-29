/**
 * Search, loading.
 *
 * The form is mirrored rather than skipped: it sits between the header and the
 * results, so leaving it out would let the header and the result rows meet and
 * then spring apart when the real page arrives.
 */

import { PageHeaderSkeleton, Skeleton, TrackListSkeleton } from '@/components/ui/Skeleton';

export default function SearchLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />

      <div className="flex items-center gap-2">
        <Skeleton className="h-10 min-w-0 flex-1 rounded-full sm:max-w-md" />
        <Skeleton className="h-10 w-24 shrink-0 rounded-full" />
      </div>

      <TrackListSkeleton rows={6} />
    </div>
  );
}
