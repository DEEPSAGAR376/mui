'use client';

/**
 * One row in a track listing.
 *
 * The row is clickable everywhere, but what makes it clickable is a real
 * `<button>` around the title whose `::before` is stretched across the whole row
 * — not a `div role="button"` wrapping the lot. That swap fixes three defects at
 * once:
 *
 *  - **Space did the wrong thing.** A `div role="button"` gets no native key
 *    handling, and this one's `onKeyDown` answered Enter only. Space fell through
 *    to `PlayerBar`'s window handler, which skips `INPUT|TEXTAREA|SELECT|BUTTON`
 *    but not `DIV` — so Space on a focused row toggled *global* playback instead
 *    of playing the row, and arrows seeked while scrolling the page at the same
 *    time. A real button is already in that guard list, so all of it falls out
 *    correctly without weakening the list.
 *  - **The controls were nested inside it.** A heart, a menu button and a remove
 *    button inside `role="button"` is invalid nesting, and it flattened the row's
 *    accessible name to "1 Title Artist Album 3:45".
 *  - Only the button carries `onClick`. Activating it — mouse, Enter or Space —
 *    dispatches one `click`, so there is exactly one code path and nothing that
 *    can double-fire.
 *
 * The controls sit in a `relative z-10` group so they stay above the stretched
 * overlay and keep taking their own clicks. Nothing bubbles into a play handler
 * any more, so the `stopPropagation` calls left in `LikeButton` and
 * `PlaylistPicker` are now belt-and-braces rather than load-bearing — kept
 * because both are shared with the player bar and the sheet.
 *
 * The root is a `<div>` rather than an `<li>` on purpose: both lists that render
 * it supply the `<ul>`/`<li>`, and the sortable one needs its `<li>` to also hold
 * the drag handle — which must sit *outside* this row's click area.
 */

import Image from 'next/image';
import { MusicIcon, PlayIcon, TrashIcon } from '@/components/icons';
import { formatDuration } from '@/lib/format';
import { PlaylistPicker, type PlaylistOption } from '@/components/playlists/PlaylistPicker';
import type { TrackView } from '@/lib/supabase/types';
import { LevelMeter } from './LevelMeter';
import { LikeButton } from './LikeButton';

export function TrackRow({
  track,
  index,
  playlists,
  isCurrent,
  isPlaying,
  showAlbum = true,
  onPlay,
  onRemove,
}: {
  track: TrackView;
  index: number;
  playlists: PlaylistOption[];
  isCurrent: boolean;
  isPlaying: boolean;
  showAlbum?: boolean;
  onPlay: () => void;
  /** Present only on playlist pages, where a row can be taken out again. */
  onRemove?: () => void;
}) {
  return (
    <div
      aria-current={isCurrent ? 'true' : undefined}
      className={`group relative flex cursor-default items-center gap-3 rounded-lg px-2 py-1.5 transition-colors duration-fast ${
        isCurrent ? 'bg-accent/10' : 'hover:bg-white/5'
      }`}
    >
      {/* Index, replaced by a play glyph on hover — or by level bars when this is
          the track currently playing. */}
      <span className="relative grid w-6 shrink-0 place-items-center">
        {isCurrent && isPlaying ? (
          <LevelMeter />
        ) : (
          <>
            <span
              className={`text-xs tabular-nums transition-opacity duration-fast ease-glide group-hover:opacity-0 ${
                isCurrent ? 'text-accent-bright' : 'text-muted-dim'
              }`}
            >
              {index + 1}
            </span>
            <PlayIcon className="absolute size-3 text-white opacity-0 transition-opacity duration-fast ease-glide group-hover:opacity-100" />
          </>
        )}
      </span>

      <div className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-ink-800">
        {track.album_cover_url ? (
          <Image src={track.album_cover_url} alt="" fill sizes="44px" className="object-cover" />
        ) : (
          <MusicIcon className="absolute inset-0 m-auto size-4 text-muted-dim" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {/* `before:inset-0` resolves against the row, the nearest positioned
            ancestor, so this one button is the hit area for the whole row. */}
        <button
          type="button"
          onClick={onPlay}
          className={`block w-full truncate text-left text-sm before:absolute before:inset-0 before:rounded-lg ${
            isCurrent ? 'font-medium text-accent-bright' : 'text-white'
          }`}
        >
          {track.title}
        </button>
        <p className="truncate text-xs text-muted">{track.artist_name}</p>
      </div>

      {showAlbum ? (
        <p className="hidden min-w-0 flex-1 truncate text-xs text-muted lg:block">
          {track.album_title ?? ''}
        </p>
      ) : null}

      {/* Controls stay in the layout at all times — appearing on hover would make
          the row jump, and they need to be reachable by keyboard regardless.
          `z-10` keeps them above the stretched overlay. */}
      <div className="relative z-10 flex shrink-0 items-center gap-0.5">
        <LikeButton trackId={track.id} size="sm" />
        <PlaylistPicker trackId={track.id} playlists={playlists} />
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${track.title} from this playlist`}
            title="Remove from this playlist"
            className="rounded-full p-1.5 text-muted-dim transition-colors duration-fast hover:text-danger"
          >
            <TrashIcon className="size-4" />
          </button>
        ) : null}
      </div>

      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-dim">
        {formatDuration(track.duration_seconds)}
      </span>
    </div>
  );
}
