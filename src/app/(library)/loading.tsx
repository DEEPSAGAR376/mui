/**
 * Library, loading.
 *
 * Note what this does *not* cover: the root layout awaits two cookie reads
 * (`likedTrackIds()` and `isAdmin()` inside `SiteHeader`), and `loading.tsx`
 * wraps `page.js` and nested layouts but never the layout in its own segment. So
 * the header still blocks the first paint; this covers everything under it.
 *
 * The `(library)` route group is what this file is doing here rather than at
 * `app/loading.tsx`, and the reason is measured rather than stylistic. A
 * `loading.tsx` is a Suspense boundary, and it wraps *nested* layouts too — so at
 * the root it also wrapped `admin/layout.tsx`, whose `redirect('/login')` then
 * resolved after the shell had already been flushed. Measured against `next
 * start`: an unauthenticated `GET /admin/tracks` returned **200** with a
 * `<meta http-equiv="refresh">` instead of **307**, so the visitor saw a flash of
 * admin chrome on the way out. Moving the file into a group that `/admin` is not
 * part of restores the 307 and keeps the skeleton — the group does not appear in
 * the URL, so `/` is unchanged.
 *
 * The same mechanism still costs `/playlists/[id]` its status code: `notFound()`
 * inside a boundary cannot set 404 either, so a stale playlist link answers 200.
 * That one is left alone deliberately — the themed 404 page renders identically
 * to the visitor either way, and the trade is a wrong status for a crawler
 * against a skeleton on every legitimate playlist open.
 */

import { PageHeaderSkeleton, TrackListSkeleton } from '@/components/ui/Skeleton';

export default function LibraryLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />
      <TrackListSkeleton />
    </div>
  );
}
