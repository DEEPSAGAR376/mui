'use client';

/** A heart. State comes from `LikesProvider`, so this stays a leaf with no data of its own. */

import { useTransition } from 'react';
import { HeartIcon } from '@/components/icons';
import { useLikes } from './LikesProvider';

export function LikeButton({
  trackId,
  className,
  size = 'md',
}: {
  trackId: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const { isLiked, toggle } = useLikes();
  const [pending, startTransition] = useTransition();
  const liked = isLiked(trackId);

  return (
    <button
      type="button"
      onClick={(event) => {
        // Rows are clickable to play; the heart must not also start the track.
        event.stopPropagation();
        startTransition(async () => {
          await toggle(trackId);
        });
      }}
      aria-pressed={liked}
      aria-label={liked ? 'Remove from favourites' : 'Add to favourites'}
      title={liked ? 'Remove from favourites' : 'Add to favourites'}
      className={`rounded-full p-1.5 transition-colors ${
        liked ? 'text-danger hover:text-danger/80' : 'text-muted-dim hover:text-white'
      } ${pending ? 'opacity-60' : ''} ${className ?? ''}`}
    >
      <HeartIcon filled={liked} className={size === 'sm' ? 'size-4' : 'size-5'} />
    </button>
  );
}
