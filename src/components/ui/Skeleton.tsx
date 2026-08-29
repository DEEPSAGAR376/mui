/**
 * Loading skeletons.
 *
 * These exist because every navigation in this app used to be a blank pause on
 * the previous route: there was no `loading.tsx` anywhere, so the browser sat on
 * the old screen until the new one's queries came back. A skeleton that mirrors
 * the layout it is standing in for turns that pause into something that reads as
 * progress.
 *
 * `aria-hidden` throughout, and no `role="status"`: the point of a `loading.tsx`
 * is that the real content replaces it, and a screen reader announcing a dozen
 * grey rectangles is worse than announcing nothing. What AT gets instead is the
 * route change itself.
 *
 * Every measurement here is copied from the component being stood in for rather
 * than invented — `size-11` covers, a `w-6` index column, a `w-10` duration —
 * because a skeleton whose boxes land somewhere else than the real content makes
 * the swap jump.
 */

import { PageHeader } from '@/components/ui/PageHeader';

/** One shimmering block. `skeleton` is the gradient, `animate-shimmer` moves it. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton animate-shimmer block rounded${className ? ` ${className}` : ''}`}
    />
  );
}

/**
 * The header block, at the real thing's dimensions.
 *
 * `PageHeader` itself is reused rather than re-implemented, so the title line
 * cannot drift from the real one: a `Skeleton` goes in where the text would.
 */
export function PageHeaderSkeleton({ actionWidth = 'w-40' }: { actionWidth?: string }) {
  return (
    <PageHeader
      title={<Skeleton className="h-8 w-48 max-w-full rounded-lg" />}
      subtitle={<Skeleton className="h-4 w-64 max-w-full" />}
      actions={<Skeleton className={`h-9 ${actionWidth} max-w-full rounded-full`} />}
    />
  );
}

/**
 * A stand-in for `TrackList`, down to the `divide-y` separators.
 *
 * Ten rows: enough to fill a viewport without pretending to know how many tracks
 * are coming. The widths alternate so it does not read as a striped table.
 */
export function TrackListSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <ul aria-hidden="true" className="flex flex-col divide-y divide-hairline">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex items-center gap-3 px-2 py-1.5">
          <Skeleton className="h-3 w-6 shrink-0" />
          <Skeleton className="size-11 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className={`h-3.5 ${index % 3 === 0 ? 'w-52' : index % 3 === 1 ? 'w-64' : 'w-44'} max-w-full`} />
            <Skeleton className={`h-3 ${index % 2 === 0 ? 'w-28' : 'w-36'} max-w-full`} />
          </div>
          <Skeleton className="hidden h-3 w-32 shrink-0 lg:block" />
          <Skeleton className="h-3 w-10 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

/** The playlist grid: same `sm:grid-cols-2 lg:grid-cols-3` and same `Card` box. */
export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <ul aria-hidden="true" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: cards }, (_, index) => (
        <li
          key={index}
          className="glass flex flex-col gap-2 rounded-2xl border border-hairline p-4"
        >
          <Skeleton className={`h-4 ${index % 2 === 0 ? 'w-32' : 'w-40'} max-w-full`} />
          <Skeleton className="h-3 w-20" />
        </li>
      ))}
    </ul>
  );
}
