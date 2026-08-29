'use client';

/**
 * Cover art as the interface's light source.
 *
 * Every `tracks_view` row already carries `album_cover_url`, and until now it was
 * only ever shown at 40-56px. Blurred to `--blur-backdrop` and held at 35%, the
 * same image becomes the ambient wash the glass surfaces sit on.
 *
 * `next/image` rather than a plain `<img>`, and the reason is cost rather than
 * taste: a bare `<img>` would point at the raw remote original, a different URL
 * from the `/_next/image?url=...&w=64` the player bar already fetched, so the
 * "cheap" option is a second full-size download. `sizes` is the bar's own
 * `"56px"` verbatim so the browser resolves the identical srcset candidate and
 * this layer costs zero extra bytes. `loading="eager"` because `priority` is
 * deprecated in v16, and no `quality` override because non-default values now
 * require an `images.qualities` array — pointless on a layer blurred 72px anyway.
 *
 * Contrast is not left to chance over arbitrary album art: the image is capped at
 * 35%, then an unconditional scrim and a `to-ink-950` gradient sit above it. When
 * `album_cover_url` is null — tracks with no album have no artwork at all — those
 * two render alone over the ink-950 body and nothing moves.
 */

import Image from 'next/image';
import { memo } from 'react';
import { usePlayer } from '@/components/player/PlayerProvider';

type CoverBackdropProps = {
  /** `album_cover_url` from any track row. Null and undefined are both normal. */
  url?: string | null;
  /**
   * Positioning belongs to the caller, because the homes differ: the page-level
   * wash is `fixed` behind the whole document, while a page header or the
   * expanded now-playing sheet wants `absolute` inside its own box.
   *
   * The default `-z-10` is correct only by construction. `body`'s background
   * propagates to the canvas, so a `fixed` negative-z child paints above the
   * canvas and below every block background and all text. It stops working the
   * moment `<body>` gains `isolate`, `transform`, `filter`, or a background of
   * its own — so don't add any of those.
   */
  className?: string;
};

/**
 * Memoised on its props, which in practice means on `url`: `usePlayer()`
 * re-renders roughly four times a second from `timeupdate`, and reconciling a
 * 72px blur layer that often is pure waste.
 */
export const CoverBackdrop = memo(function CoverBackdrop({ url, className }: CoverBackdropProps) {
  return (
    <div
      aria-hidden="true"
      className={className ?? 'pointer-events-none fixed inset-0 -z-10 overflow-hidden'}
    >
      {url ? (
        <Image
          key={url}
          src={url}
          alt=""
          fill
          sizes="56px"
          loading="eager"
          className="scale-125 object-cover opacity-35 blur-backdrop saturate-150"
        />
      ) : null}
      <div className="absolute inset-0 bg-ink-950/55" />
      <div className="absolute inset-0 bg-linear-to-b from-transparent via-ink-950/70 to-ink-950" />
    </div>
  );
});

/** The site-wide wash, driven by whatever is playing. Mounted once, in the root layout. */
export function NowPlayingBackdrop() {
  const { current } = usePlayer();
  return <CoverBackdrop url={current?.album_cover_url} />;
}
