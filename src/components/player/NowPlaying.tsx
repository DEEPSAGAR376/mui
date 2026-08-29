'use client';

/**
 * The expanded now-playing view: full-viewport cover, big transport, and the
 * queue in the order it will actually play.
 *
 * ## Why a native `<dialog>`
 *
 * `showModal()` supplies the focus trap, Escape, focus restoration to the
 * element that opened it, implicit modal semantics and the top layer. A
 * hand-rolled overlay has to get all five right, and there is no modal utility
 * in this project to reuse. Consequences worth knowing:
 *
 * - **No `aria-modal="true"`.** It is redundant on a modal `<dialog>` and can
 *   confuse assistive tech. `aria-label="Now playing"` is the whole contract.
 * - No `z-index` anywhere. The top layer already sits above the `z-40` bar.
 * - `showModal()` does **not** lock background scroll, so that is done by hand
 *   below — saving and restoring the previous value rather than blanking it.
 * - The UA stylesheet gives `dialog` a margin and `max-width: calc(100% - 6px -
 *   2em)`; `m-0 h-dvh max-h-none w-full max-w-none rounded-none p-0` overrides
 *   it whether or not Tailwind's preflight already did.
 *
 * ## Why `dialogRef` is a prop
 *
 * `showModal()` is called by `PlayerBar`, **synchronously in the click handler**,
 * before React re-renders. That ordering is not stylistic. The morph measures the
 * sheet's cover to work out where the flight starts, and a dialog that is still
 * `display: none` at measurement time measures 0×0 — the cover would launch from
 * the viewport corner. Opening it in the handler puts it in the top layer before
 * React renders at all. Hoisting the ref to the caller is what makes that
 * guarantee visible at the call site.
 *
 * ## Why closing is asynchronous
 *
 * Collapsing cannot simply flip `open` to false: that unmounts the cover, and
 * there is then nothing left to fly back down. So `requestClose` runs the exit
 * animation first and calls `onClose` when it finishes. Every route out of the
 * sheet — the chevron, Escape, the backdrop — goes through it.
 */

import Image from 'next/image';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CoverBackdrop } from '@/components/CoverBackdrop';
import {
  ChevronDownIcon,
  MusicIcon,
  PauseIcon,
  SpinnerIcon,
  PlayIcon,
  QueueIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from '@/components/icons';
import { formatDuration, plural } from '@/lib/format';
import type { TrackView } from '@/lib/supabase/types';
import { IconButton } from './IconButton';
import { LevelMeter } from './LevelMeter';
import { LikeButton } from './LikeButton';
import { morphSheetIn, morphSheetOut } from './coverMorph';
import { usePlayer } from './PlayerProvider';
import { Scrubber } from './Scrubber';

type NowPlayingProps = {
  /** Owned by `PlayerBar` — see the note on ordering above. */
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  /** The bar's artwork: the other half of the morph, measured but never touched. */
  peerRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
};

export function NowPlaying({ dialogRef, peerRef, open, onClose }: NowPlayingProps) {
  const coverRef = useRef<HTMLDivElement | null>(null);
  /** Re-entry guard: Escape twice, or Escape during the chevron's own collapse. */
  const closingRef = useRef(false);

  // The dialog is permanently mounted and only its *content* is conditional, so
  // that `showModal()` always has an element to call.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || open) return;
    if (dialog.open) dialog.close();
    // Only now that it has left the top layer, so the backdrop does not flash
    // back to full opacity for a frame on the way out.
    dialog.classList.remove('is-closing');
  }, [dialogRef, open]);

  /**
   * `useLayoutEffect`, so the flight starts before the browser has painted the
   * sheet at its final size — an ordinary effect runs after paint and the first
   * frame would be a snap.
   *
   * Safe on the server despite the usual warning: `PlayerBar` returns `null`
   * until there is a current track, and that only comes from `localStorage` in an
   * effect, so this component never renders during SSR.
   */
  useLayoutEffect(() => {
    if (!open) return;
    morphSheetIn(dialogRef.current, coverRef.current, peerRef.current);
  }, [dialogRef, open, peerRef]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const dialog = dialogRef.current;
    // Fades the `::backdrop`, which `element.animate()` cannot reach — see the
    // `dialog` rules in `globals.css`.
    dialog?.classList.add('is-closing');

    void morphSheetOut(dialog, coverRef.current, peerRef.current).then((finished) => {
      closingRef.current = false;
      if (finished) onClose();
    });
  }, [dialogRef, onClose, peerRef]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label="Now playing"
      // Escape fires `cancel`, which would close the element directly and strand
      // `open` at true. Cancelling it and going through state keeps one source of
      // truth for open/closed.
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={onClose}
      className="m-0 h-dvh max-h-none w-full max-w-none rounded-none border-0 bg-transparent p-0 text-fg outline-none backdrop:bg-ink-950/70 backdrop:backdrop-blur-sm"
    >
      {open ? <Sheet coverRef={coverRef} onCollapse={requestClose} /> : null}
    </dialog>
  );
}

/**
 * The sheet body, mounted only while open.
 *
 * Rendered as a child of the dialog rather than as the dialog itself so that the
 * dialog can stay in the top layer, at a stable size, while the content animates
 * in and out of it.
 */
function Sheet({
  coverRef,
  onCollapse,
}: {
  coverRef: React.RefObject<HTMLDivElement | null>;
  onCollapse: () => void;
}) {
  const player = usePlayer();
  const { current, isPlaying, shuffle, repeat } = player;
  const [queueOpen, setQueueOpen] = useState(false);

  if (!current) return null;

  const year = current.year ?? current.album_year;
  const repeatLabel =
    repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat off';

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-ink-950/80">
      <CoverBackdrop
        url={current.album_cover_url}
        className="pointer-events-none absolute inset-0 overflow-hidden"
      />

      {/* The backdrop above is absolutely positioned, so it would paint over
          normal-flow siblings. `relative z-10` puts the content back on top
          without needing a z-index on the backdrop. */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-3 sm:px-6">
          <IconButton label="Collapse now playing" onClick={onCollapse}>
            <ChevronDownIcon className="size-5" />
          </IconButton>

          <p className="text-center font-display text-[11px] font-semibold tracking-[0.18em] text-muted-dim uppercase">
            Now playing
          </p>

          {/* `invisible` rather than `hidden`, so the header stays a three-column
              grid on wide screens where the queue is always shown — and so the
              button leaves the tab order along with the sight of it. */}
          <IconButton
            label={queueOpen ? 'Hide queue' : 'Show queue'}
            active={queueOpen}
            onClick={() => setQueueOpen((value) => !value)}
            className="lg:invisible"
          >
            <QueueIcon className="size-5" />
          </IconButton>
        </div>

        <div className="grid min-h-0 flex-1 gap-6 px-3 pb-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10 lg:px-10">
          {/* On a phone the queue replaces this column rather than sharing the
              screen with it — 320px does not have room for both. */}
          <div
            className={`min-h-0 flex-col items-center justify-center gap-5 ${
              queueOpen ? 'hidden lg:flex' : 'flex'
            }`}
          >
            {/* No `overflow-hidden` on any ancestor of the morphing element: the
                cover flies well outside this box on the way down to the bar, and
                a clip anywhere above it would cut the animation in half. The
                rounding lives on the element itself for the same reason. */}
            <div
              ref={coverRef}
              className="relative aspect-square w-[min(58vh,26rem,80vw)] shrink-0 overflow-hidden rounded-2xl bg-ink-800 shadow-lift"
            >
              {current.album_cover_url ? (
                <Image
                  src={current.album_cover_url}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 26rem, 80vw"
                  className="object-cover"
                />
              ) : (
                <MusicIcon className="absolute inset-0 m-auto size-16 text-muted-dim" />
              )}
            </div>

            <div className="w-full max-w-xl shrink-0 text-center">
              <h2 className="font-display text-display font-semibold text-balance text-white lg:text-hero">
                {current.title}
              </h2>
              <p className="mt-2 truncate text-sm text-muted sm:text-base">
                {current.artist_name}
                {current.album_title ? (
                  <span className="text-muted-dim"> · {current.album_title}</span>
                ) : null}
                {year ? <span className="text-muted-dim"> · {year}</span> : null}
              </p>

              {/* Additive here rather than replacing the line, unlike the bar:
                  there is room, and the artist is worth keeping on screen. */}
              {player.failed ? (
                <p role="status" className="mt-2 text-sm text-danger">
                  Couldn&rsquo;t play this one. The file may be missing — skip to the
                  next track, or press play to retry.
                </p>
              ) : null}

              {/* `genre` rides on every view row and nothing else in the app
                  renders it. Capped at four, because ingest reads whatever the
                  file's tag happened to hold. */}
              {current.genre.length > 0 ? (
                <ul className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {current.genre.slice(0, 4).map((genre) => (
                    <li
                      key={genre}
                      className="rounded-full border border-hairline bg-ink-900/60 px-2.5 py-0.5 text-[11px] text-muted"
                    >
                      {genre}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="w-full max-w-xl shrink-0">
              <Scrubber variant="sheet" />

              <div className="mt-3 flex items-center justify-center gap-1 sm:gap-3">
                <IconButton label="Shuffle" active={shuffle} onClick={player.toggleShuffle}>
                  <ShuffleIcon className="size-5" />
                </IconButton>

                <IconButton label="Previous track" onClick={player.previous}>
                  <SkipBackIcon className="size-7" />
                </IconButton>

                <button
                  type="button"
                  onClick={player.toggle}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  title={isPlaying ? 'Pause' : 'Play'}
                  className="mx-1 flex size-16 items-center justify-center rounded-full bg-white text-ink-950 shadow-glow transition-transform duration-fast hover:scale-105 active:scale-95"
                >
                  {player.stalled && isPlaying ? (
                    <SpinnerIcon className="size-6" />
                  ) : isPlaying ? (
                    <PauseIcon className="size-6" />
                  ) : (
                    <PlayIcon className="size-6 translate-x-0.5" />
                  )}
                </button>

                <IconButton label="Next track" onClick={player.next}>
                  <SkipForwardIcon className="size-7" />
                </IconButton>

                <IconButton label={repeatLabel} active={repeat !== 'off'} onClick={player.cycleRepeat}>
                  {repeat === 'one' ? (
                    <RepeatOneIcon className="size-5" />
                  ) : (
                    <RepeatIcon className="size-5" />
                  )}
                </IconButton>
              </div>

              <div className="mt-1 flex justify-center">
                <LikeButton trackId={current.id} />
              </div>
            </div>
          </div>

          <QueuePanel mobileOpen={queueOpen} />
        </div>
      </div>
    </div>
  );
}

/**
 * What plays next, in the order it will actually play.
 *
 * The rows are built from `order` rather than from `queue`, and that is the whole
 * point of the panel: `queue` is album order, so with shuffle on it lists
 * something entirely unlike what comes next. Highlighting is on
 * `slot === position` rather than on `current.id === track.id`, so a track that
 * appears twice in one queue highlights the copy that is playing.
 *
 * Deliberately not `TrackRow`: that row is a `div role="button"` with interactive
 * controls nested inside it, and its `PlaylistPicker` menu opens upwards
 * (`absolute right-0 bottom-full`) which clips inside a scrolling panel. A real
 * `<button>` inside an `<li>` gets Enter, Space and list semantics from the
 * platform for a third of the markup.
 */
function QueuePanel({ mobileOpen }: { mobileOpen: boolean }) {
  const { queue, order, position, isPlaying, jumpTo } = usePlayer();
  const listRef = useRef<HTMLUListElement>(null);

  const rows = order
    .map((queueIndex, slot) => ({ slot, track: queue[queueIndex] }))
    .filter((row): row is { slot: number; track: TrackView } => Boolean(row.track));

  // Follow the track through a long queue. No `behavior`, so it jumps rather than
  // smooth-scrolls — which is both cheaper and already reduced-motion correct.
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center' });
  }, [position]);

  return (
    <aside
      aria-label="Queue"
      className={`glass min-h-0 flex-col overflow-hidden rounded-2xl border border-hairline lg:flex ${
        mobileOpen ? 'flex' : 'hidden'
      }`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <p className="font-display text-sm font-semibold text-white">Queue</p>
        <p className="text-[11px] text-muted-dim">{plural(rows.length, 'track')}</p>
      </div>

      <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {rows.map(({ slot, track }) => (
          <QueueRow
            key={`${slot}-${track.id}`}
            track={track}
            slot={slot}
            isCurrent={slot === position}
            isPlaying={isPlaying}
            onPlay={() => jumpTo(slot)}
          />
        ))}
      </ul>
    </aside>
  );
}

function QueueRow({
  track,
  slot,
  isCurrent,
  isPlaying,
  onPlay,
}: {
  track: TrackView;
  slot: number;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPlay}
        aria-current={isCurrent ? 'true' : undefined}
        className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors duration-fast ${
          isCurrent ? 'bg-white/10' : 'hover:bg-white/5'
        }`}
      >
        <span className="grid w-5 shrink-0 place-items-center">
          {isCurrent && isPlaying ? (
            <LevelMeter />
          ) : (
            <span
              className={`text-[11px] tabular-nums ${
                isCurrent ? 'text-accent-bright' : 'text-muted-dim'
              }`}
            >
              {slot + 1}
            </span>
          )}
        </span>

        <span className="relative block size-9 shrink-0 overflow-hidden rounded bg-ink-800">
          {track.album_cover_url ? (
            <Image src={track.album_cover_url} alt="" fill sizes="36px" className="object-cover" />
          ) : (
            <MusicIcon className="absolute inset-0 m-auto size-4 text-muted-dim" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm ${
              isCurrent ? 'font-medium text-accent-bright' : 'text-white'
            }`}
          >
            {track.title}
          </span>
          <span className="block truncate text-xs text-muted">{track.artist_name}</span>
        </span>

        <span className="shrink-0 text-[11px] tabular-nums text-muted-dim">
          {formatDuration(track.duration_seconds)}
        </span>
      </button>
    </li>
  );
}
