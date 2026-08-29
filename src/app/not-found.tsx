/**
 * 404, in theme.
 *
 * Two jobs, and the second is the one that made this file necessary: it renders
 * for `notFound()` in `playlists/[id]/page.tsx`, and it renders for every URL the
 * app does not match at all. Without it both landed on Next's built-in page,
 * which follows the OS colour scheme rather than the app's — so anyone on a light
 * desktop got black-on-white in the middle of a black application.
 *
 * A Server Component, rendered inside the root layout, so the header, the nav and
 * the player bar are all still there and still playing. That is also why there is
 * no "back to the library" button: the nav above already is one.
 *
 * No `metadata` export — `metadata` is only collected from `layout` and `page`
 * files, so the tab keeps the root layout's title.
 */

import Link from 'next/link';

const LINK =
  'text-accent-bright underline decoration-accent/40 underline-offset-4 transition-colors duration-fast hover:decoration-accent-bright';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <p className="font-display text-hero font-semibold text-white/15 tabular-nums">404</p>

      <h1 className="font-display text-display font-semibold text-white">
        That page isn’t here
      </h1>

      <p className="max-w-md text-sm text-muted">
        The link may be stale — or, if it was a playlist, it may have been deleted or
        made private. A private playlist and one that never existed look the same from
        out here, on purpose.
      </p>

      <p className="text-sm text-muted-dim">
        Try the <Link href="/" className={LINK}>library</Link> or{' '}
        <Link href="/search" className={LINK}>search</Link> for it.
      </p>
    </div>
  );
}
