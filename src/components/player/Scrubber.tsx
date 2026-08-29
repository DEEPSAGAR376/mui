'use client';

/**
 * The position slider, shared by the collapsed bar and the expanded sheet.
 *
 * A real `<input type="range">` rather than a div with pointer maths: keyboard
 * stepping, arrow keys and screen-reader semantics come free, and none of that is
 * worth reimplementing. While it is being dragged the thumb follows the pointer
 * rather than the track, and the seek is committed on release — otherwise every
 * pixel of movement would be a seek.
 *
 * Each mount owns its own `scrub` state, which is correct rather than careless:
 * the sheet covers the bar, so only one of the two is ever on screen.
 *
 * This is also the only component in the app that renders the elapsed time, which
 * is what makes `usePlayerTime()` worth having: `timeupdate` fires about four
 * times a second, and subscribing to it separately from `usePlayer()` keeps that
 * cadence from re-rendering the bar, the sheet, the queue and every library row.
 */

import { useState } from 'react';
import { formatDuration } from '@/lib/format';
import { usePlayer, usePlayerTime } from './PlayerProvider';

/** Feeds the `--fill` custom property that `.range` uses to colour the played part. */
export function fillStyle(value: number, max: number): React.CSSProperties {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return { '--fill': `${percent}%` } as React.CSSProperties;
}

export function Scrubber({ variant = 'bar' }: { variant?: 'bar' | 'sheet' }) {
  const currentTime = usePlayerTime();
  const { duration, seek } = usePlayer();
  /** Non-null only while the slider is being dragged. */
  const [scrub, setScrub] = useState<number | null>(null);

  const shown = scrub ?? currentTime;

  const commit = () => {
    if (scrub === null) return;
    seek(scrub);
    setScrub(null);
  };

  const sheet = variant === 'sheet';
  const label = `${sheet ? 'w-12 text-xs' : 'w-10 text-[11px]'} shrink-0 tabular-nums text-muted-dim`;

  return (
    <div className="flex w-full items-center gap-2">
      <span className={`${label} text-right`}>{formatDuration(shown)}</span>
      <input
        type="range"
        className="range"
        style={fillStyle(shown, duration)}
        min={0}
        max={duration || 0}
        step={0.5}
        value={Math.min(shown, duration || 0)}
        aria-label="Seek"
        /* Without this a screen reader announces the raw number — "142". */
        aria-valuetext={`${formatDuration(shown)} of ${formatDuration(duration)}`}
        onChange={(event) => setScrub(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      {/* The sheet counts down, the bar shows the total. On the sheet the cover
          already says which track this is, so what is left matters more. */}
      <span className={label}>
        {sheet
          ? duration > 0
            ? `-${formatDuration(Math.max(0, duration - shown))}`
            : '--:--'
          : formatDuration(duration)}
      </span>
    </div>
  );
}
