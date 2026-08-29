/**
 * Admin, loading — one skeleton for both `/admin/upload` and `/admin/tracks`,
 * since it sits above them and their shapes agree down to the header.
 *
 * `AdminNav` is not stood in for: it lives in `admin/layout.tsx`, which this
 * boundary is nested *inside*, so it is already on screen by the time this shows.
 */

import { PageHeaderSkeleton, TrackListSkeleton } from '@/components/ui/Skeleton';

export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton actionWidth="w-48" />
      <TrackListSkeleton rows={8} />
    </div>
  );
}
