'use client';

/**
 * The bar at the bottom of every page.
 *
 * Rendered from the root layout, next to `PlayerProvider`, so it survives
 * navigation along with the audio element it controls. It holds no playback state
 * of its own — everything comes from `usePlayer()` — with one exception: while the
 * position slider is being dragged, the thumb follows the pointer instead of the
 * track, and the seek is committed on release rather than on every pixel of
 * movement.
 */

import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
  MusicIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  VolumeIcon,
  VolumeMutedIcon,
} from '@/components/icons';
import { formatDuration } from '@/lib/format';
import { LikeButton } from './LikeButton';
import { usePlayer } from './PlayerProvider';

/** Feeds the `--fill` custom property that `.range` uses to colour the played part. */
function fillStyle(value: number, max: number): React.CSSProperties {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return { '--fill': `${percent}%` } as React.CSSProperties;
}

function IconButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`rounded-full p-2 transition-colors ${
        active ? 'text-accent-bright' : 'text-muted hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

export function PlayerBar() {
  const player = usePlayer();
  const { current, duration, currentTime, isPlaying, volume, muted, shuffle, repeat } = player;

  /** Non-null only while the position slider is being dragged. */
  const [scrub, setScrub] = useState<number | null>(null);

  // Keyboard shortcuts, guarded against firing while someone is typing — the
  // upload screen is full of text inputs, and space is a legal character in all
  // of them.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))
      ) {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        player.toggle();
      } else if (event.key === 'ArrowRight' && event.shiftKey) {
        player.next();
      } else if (event.key === 'ArrowLeft' && event.shiftKey) {
        player.previous();
      } else if (event.key === 'ArrowRight') {
        player.seek(currentTime + 5);
      } else if (event.key === 'ArrowLeft') {
        player.seek(currentTime - 5);
      } else if (event.key.toLowerCase() === 'm') {
        player.toggleMute();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentTime, player]);

  // Nothing playing and nothing restored: no bar, and no dead space where one
  // would have been.
  if (!current) return null;

  const shown = scrub ?? currentTime;

  const commitScrub = () => {
    if (scrub === null) return;
    player.seek(scrub);
    setScrub(null);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-900/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-ink-800 sm:size-14">
            {current.album_cover_url ? (
              <Image
                src={current.album_cover_url}
                alt=""
                fill
                sizes="56px"
                className="object-cover"
              />
            ) : (
              <MusicIcon className="absolute inset-0 m-auto size-5 text-muted-dim" />
            )}
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{current.title}</p>
            <p className="truncate text-xs text-muted">
              {current.artist_name}
              {current.album_title ? (
                <span className="text-muted-dim"> · {current.album_title}</span>
              ) : null}
            </p>
          </div>

          <LikeButton trackId={current.id} className="hidden shrink-0 sm:block" />
        </div>

        <div className="flex flex-[1.4] flex-col items-center gap-0.5">
          <div className="flex items-center gap-1 sm:gap-2">
            <IconButton label="Shuffle" active={shuffle} onClick={player.toggleShuffle}>
              <ShuffleIcon className="size-4" />
            </IconButton>

            <IconButton label="Previous track" onClick={player.previous}>
              <SkipBackIcon className="size-5" />
            </IconButton>

            <button
              type="button"
              onClick={player.toggle}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              title={isPlaying ? 'Pause' : 'Play'}
              className="flex size-10 items-center justify-center rounded-full bg-white text-ink-950 transition-transform hover:scale-105 active:scale-95"
            >
              {isPlaying ? (
                <PauseIcon className="size-4" />
              ) : (
                <PlayIcon className="size-4 translate-x-px" />
              )}
            </button>

            <IconButton label="Next track" onClick={player.next}>
              <SkipForwardIcon className="size-5" />
            </IconButton>

            <IconButton
              label={repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat off'}
              active={repeat !== 'off'}
              onClick={player.cycleRepeat}
            >
              {repeat === 'one' ? (
                <RepeatOneIcon className="size-4" />
              ) : (
                <RepeatIcon className="size-4" />
              )}
            </IconButton>
          </div>

          <div className="flex w-full items-center gap-2">
            <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-dim">
              {formatDuration(shown)}
            </span>
            <input
              type="range"
              className="range"
              style={fillStyle(shown, duration)}
              min={0}
              max={duration || 0}
              step={0.5}
              value={Math.min(shown, duration || 0)}
              aria-label="Seek"
              onChange={(event) => setScrub(Number(event.target.value))}
              onPointerUp={commitScrub}
              onKeyUp={commitScrub}
              onBlur={commitScrub}
            />
            <span className="w-10 shrink-0 text-[11px] tabular-nums text-muted-dim">
              {formatDuration(duration)}
            </span>
          </div>
        </div>

        {/* Volume, hidden on phones where the hardware keys own this job. */}
        <div className="hidden flex-1 items-center justify-end gap-2 sm:flex">
          <IconButton label={muted ? 'Unmute' : 'Mute'} onClick={player.toggleMute}>
            {muted || volume === 0 ? (
              <VolumeMutedIcon className="size-4" />
            ) : (
              <VolumeIcon className="size-4" />
            )}
          </IconButton>
          <input
            type="range"
            className="range max-w-28"
            style={fillStyle(muted ? 0 : volume, 1)}
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            aria-label="Volume"
            onChange={(event) => player.setVolume(Number(event.target.value))}
          />
        </div>
      </div>
    </div>
  );
}
