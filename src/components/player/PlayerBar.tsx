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
import { useEffect, useRef, useState } from 'react';
import {
  MusicIcon,
  SpinnerIcon,
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
import { NowPlaying } from './NowPlaying';
import { usePlayer } from './PlayerProvider';
import { Scrubber, fillStyle } from './Scrubber';

export function PlayerBar() {
  const player = usePlayer();
  const { current, isPlaying, volume, muted, shuffle, repeat } = player;

  const [expanded, setExpanded] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  /** Measured by the morph as the flight's other end. Never animated from here. */
  const barCoverRef = useRef<HTMLSpanElement>(null);

  // Keyboard shortcuts, guarded against firing while someone is typing — the
  // upload screen is full of text inputs, and space is a legal character in all
  // of them.
  //
  // Seeking goes through `seekBy` rather than `seek(currentTime ± 5)`, which is
  // what lets this component stay off the four-times-a-second time context: the
  // bar re-rendered on every `timeupdate` purely to keep that one number fresh
  // for two key handlers.
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
        player.seekBy(5);
      } else if (event.key === 'ArrowLeft') {
        player.seekBy(-5);
      } else if (event.key.toLowerCase() === 'm') {
        player.toggleMute();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player]);

  // Nothing playing and nothing restored: no bar, and no dead space where one
  // would have been.
  if (!current) return null;

  /**
   * Opened here, imperatively, rather than from an effect inside `NowPlaying`.
   * The morph measures the sheet's cover to find where the flight ends, and a
   * dialog that is still `display: none` at measurement time measures 0x0 — the
   * cover then launches from the viewport corner. Calling `showModal()` in the
   * handler puts the dialog in the top layer before React re-renders at all.
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
            {/* The thumbnail inside is the far end of the cover morph: the sheet
                measures it and flies its own cover down onto this box. Nothing
                here moves, so the clip and the rounding can live on the inner
                span, where they belong anyway. */}
            <button
              type="button"
              onClick={openSheet}
              aria-label="Open now playing"
              aria-expanded={expanded}
              title="Open now playing"
              className="relative size-12 shrink-0 rounded-lg transition-transform duration-fast hover:scale-[1.04] sm:size-16"
            >
              {/* Hidden while expanded, never unmounted, and the difference
                  matters twice: `visibility: hidden` keeps the layout box, so the
                  collapse still has somewhere to measure and fly back down to, and
                  a window resize with the sheet open re-measures correctly instead
                  of aiming at a stale rectangle. `display: none` would give up
                  both. */}
              <span
                ref={barCoverRef}
                className={`absolute inset-0 block overflow-hidden rounded-lg bg-ink-800 shadow-lift ${
                  expanded ? 'invisible' : ''
                }`}
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
              </span>
            </button>

            <button
              type="button"
              onClick={openSheet}
              aria-label="Open now playing"
              aria-expanded={expanded}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-sm font-medium text-white">{current.title}</span>
              {/* The failure takes the subtitle's place rather than adding a
                  row, so a dead track cannot change the bar's height while it is
                  fixed over the page. `role="status"` announces it once without
                  stealing focus from whatever the listener was doing. */}
              {player.failed ? (
                <span role="status" className="block truncate text-xs text-danger">
                  Couldn&rsquo;t play this one — skip, or try again
                </span>
              ) : (
                <span className="block truncate text-xs text-muted">
                  {current.artist_name}
                  {current.album_title ? (
                    <span className="text-muted-dim"> · {current.album_title}</span>
                  ) : null}
                </span>
              )}
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
                {/* Buffering wins over the play/pause glyph, because the store's
                    first byte can take a second or more and a button that has
                    already flipped to "pause" over silence reads as broken. The
                    label deliberately stays "Pause": the control still pauses,
                    and renaming it mid-wait would move the goalposts for anyone
                    listening to it. */}
                {player.stalled && isPlaying ? (
                  <SpinnerIcon className="size-4" />
                ) : isPlaying ? (
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

      <NowPlaying
        dialogRef={dialogRef}
        peerRef={barCoverRef}
        open={expanded}
        onClose={() => setExpanded(false)}
      />
    </>
  );
}
