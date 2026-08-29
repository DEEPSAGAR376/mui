import { PageHeaderSkeleton, TrackListSkeleton } from '@/components/ui/Skeleton';

export default function LikesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />
      {/* Shorter than the library's: a favourites list is usually a handful. */}
      <TrackListSkeleton rows={6} />
    </div>
  );
}
