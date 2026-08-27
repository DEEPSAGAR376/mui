'use client';

/**
 * One row in a track listing.
 *
 * The whole row is the play button — clicking anywhere that is not a control
 * starts the track, which is what people expect from every player they already
 * use. That is also why the heart and the playlist menu call `stopPropagation`:
 * without it, liking a song would start playing it.
 */

import Image from 'next/image';
import { MusicIcon, PlayIcon, TrashIcon } from '@/components/icons';
import { formatDuration } from '@/lib/format';
import { PlaylistPicker, type PlaylistOption } from '@/components/playlists/PlaylistPicker';
import type { TrackView } from '@/lib/supabase/types';
import { LikeButton } from './LikeButton';

/** Three bars, animated only while audio is actually playing. */
function NowPlayingBars() {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
      <span className="w-[2px] animate-[pulse_1s_ease-in-out_infinite] bg-accent-bright" style={{ height: '60%' }} />
      <span className="w-[2px] animate-[pulse_1.3s_ease-in-out_infinite] bg-accent-bright" style={{ height: '100%' }} />
      <span className="w-[2px] animate-[pulse_0.8s_ease-in-out_infinite] bg-accent-bright" style={{ height: '40%' }} />
    </span>
  );
}

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
      role="button"
      tabIndex={0}
      onClick={onPlay}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onPlay();
        }
      }}
      aria-current={isCurrent ? 'true' : undefined}
      className={`group flex cursor-default items-center gap-3 rounded-lg px-2 py-1.5 transition-colors ${
        isCurrent ? 'bg-ink-800/70' : 'hover:bg-ink-800/70'
      }`}
    >
      {/* Index, replaced by a play glyph on hover — or by level bars when this is
          the track currently playing. */}
      <span className="relative grid w-6 shrink-0 place-items-center">
        {isCurrent && isPlaying ? (
          <NowPlayingBars />
        ) : (
          <>
            <span
              className={`text-xs tabular-nums transition-opacity group-hover:opacity-0 ${
                isCurrent ? 'text-accent-bright' : 'text-muted-dim'
              }`}
            >
              {index + 1}
            </span>
            <PlayIcon className="absolute size-3 text-white opacity-0 transition-opacity group-hover:opacity-100" />
          </>
        )}
      </span>

      <div className="relative size-10 shrink-0 overflow-hidden rounded bg-ink-800">
        {track.album_cover_url ? (
          <Image src={track.album_cover_url} alt="" fill sizes="40px" className="object-cover" />
        ) : (
          <MusicIcon className="absolute inset-0 m-auto size-4 text-muted-dim" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm ${isCurrent ? 'font-medium text-accent-bright' : 'text-white'}`}
        >
          {track.title}
        </p>
        <p className="truncate text-xs text-muted">{track.artist_name}</p>
      </div>

      {showAlbum ? (
        <p className="hidden min-w-0 flex-1 truncate text-xs text-muted lg:block">
          {track.album_title ?? ''}
        </p>
      ) : null}

      {/* Controls stay in the layout at all times — appearing on hover would make
          the row jump, and they need to be reachable by keyboard regardless. */}
      <div className="flex shrink-0 items-center gap-0.5">
        <LikeButton trackId={track.id} size="sm" />
        <PlaylistPicker trackId={track.id} playlists={playlists} />
        {onRemove ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            aria-label="Remove from this playlist"
            title="Remove from this playlist"
            className="rounded-full p-1.5 text-muted-dim transition-colors hover:text-danger"
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
