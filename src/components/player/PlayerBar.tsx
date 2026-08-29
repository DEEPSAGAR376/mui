'use client';

/**
 * The bar at the bottom of every page, and the trigger for the expanded
 * now-playing sheet.
 *
 * Rendered from the root layout, next to `PlayerProvider`, so it survives
 * navigation along with the audio element it controls. It holds no playback state
 * of its own — everything comes from `usePlayer()` — with one exception:
 * open/closed for the sheet lives here rather than in the provider, so expanding
 * the view never re-renders `PlayerProvider` and therefore can never disturb the
 * `<audio>` element.
 *
 * The drag-in-progress position that used to live here moved into `Scrubber`,
 * which the sheet reuses.
 */

import Image from 'next/image';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
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
import { IconButton } from './IconButton';
import { LikeButton } from './LikeButton';
import { COVER_MORPH_ID, NowPlaying, useCoverMorph } from './NowPlaying';
import { usePlayer } from './PlayerProvider';
import { Scrubber, fillStyle } from './Scrubber';

export function PlayerBar() {
  const player = usePlayer();
  const { current, currentTime, isPlaying, volume, muted, shuffle, repeat } = player;

  const [expanded, setExpanded] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const morph = useCoverMorph();

  // Keyboard shortcuts, guarded against firing while someone is typing — the
  // upload screen is full of text inputs, and space is a legal character in all
  // of them.
  //
  // This needs no adjustment for the sheet, which is worth stating rather than
  // leaving to look like an oversight: keydowns from inside a modal dialog still
  // bubble to `window`, so Space keeps toggling playback; Escape closes the
  // dialog and then matches nothing here; and the guard list below already means
  // arrows on the sheet's scrubber move the slider instead of also seeking, and
  // Space on the sheet's play button activates the button instead of toggling
  // twice. Do not weaken that list.
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

  /**
   * Opened here, imperatively, rather than from an effect inside `NowPlaying`.
   * `motion` measures the sheet's cover to find the morph target, and a dialog
   * that is still `display: none` at measurement time measures 0x0 — the cover
   * then flies out of the viewport corner. Calling `showModal()` in the handler
   * puts the dialog in the top layer before React re-renders at all.
   */
  const openSheet = () => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    setExpanded(true);
  };

  return (
    <>
      <div className="glass fixed inset-x-0 bottom-0 z-40">
        {/* The lit top edge. A border would be a flat line across the full width;
            this reads as the bar catching light from the middle outwards. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-accent/50 to-transparent"
        />

        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
          {/* Three siblings, not two: `LikeButton` used to sit inside the same
              container as the artwork and the title, and making that container the
              expand trigger would have nested a button inside a button. */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {/* No `overflow-hidden` here. The artwork is the element that morphs
                into the sheet's full-size cover, and it travels far outside this
                box on the way — a clip on the button would sever the animation.
                The rounding and the clip live on the motion element instead. */}
            <button
              type="button"
              onClick={openSheet}
              aria-label="Open now playing"
              aria-expanded={expanded}
              title="Open now playing"
              className="relative size-12 shrink-0 rounded-lg transition-transform duration-fast hover:scale-[1.04] sm:size-16"
            >
              {/* Mounted only while collapsed. Two live elements sharing one
                  `layoutId` makes the older a follower projected onto the newer
                  box, which paints a stretched copy of this thumbnail at full
                  size behind the sheet. */}
              {expanded ? null : (
                <motion.span
                  layoutId={COVER_MORPH_ID}
                  transition={morph}
                  className="absolute inset-0 block overflow-hidden rounded-lg bg-ink-800 shadow-lift"
                >
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
                </motion.span>
              )}
            </button>

            <button
              type="button"
              onClick={openSheet}
              aria-label="Open now playing"
              aria-expanded={expanded}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-sm font-medium text-white">{current.title}</span>
              <span className="block truncate text-xs text-muted">
                {current.artist_name}
                {current.album_title ? (
                  <span className="text-muted-dim"> · {current.album_title}</span>
                ) : null}
              </span>
            </button>

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
                className="flex size-10 items-center justify-center rounded-full bg-white text-ink-950 shadow-glow transition-transform duration-fast hover:scale-105 active:scale-95"
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
                label={
                  repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat off'
                }
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

            <Scrubber />
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
              aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)}%`}
              onChange={(event) => player.setVolume(Number(event.target.value))}
            />
          </div>
        </div>
      </div>

      <NowPlaying dialogRef={dialogRef} open={expanded} onClose={() => setExpanded(false)} />
    </>
  );
}
