import { CardGridSkeleton, PageHeaderSkeleton } from '@/components/ui/Skeleton';

export default function PlaylistsLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* The action here is the "New playlist" field plus button, so it is wider. */}
      <PageHeaderSkeleton actionWidth="w-64" />
      <CardGridSkeleton />
    </div>
  );
}
