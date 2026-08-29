import { PageHeaderSkeleton, TrackListSkeleton } from '@/components/ui/Skeleton';

export default function PlaylistLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />
      <TrackListSkeleton rows={8} />
    </div>
  );
}
