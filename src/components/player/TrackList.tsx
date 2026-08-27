'use client';

/**
 * A listing, and the buttons that start it.
 *
 * The list is the queue: clicking row 5 of an album plays that album from track 5,
 * so "next" continues through what you were looking at. Passing a single track
 * would make every list a set of disconnected one-song queues.
 */

import { PlayIcon, ShuffleIcon } from '@/components/icons';
import type { PlaylistOption } from '@/components/playlists/PlaylistPicker';
import type { TrackView } from '@/lib/supabase/types';
import { usePlayer } from './PlayerProvider';
import { TrackRow } from './TrackRow';

export function TrackList({
  tracks,
  playlists,
  showAlbum = true,
  emptyMessage = 'Nothing here yet.',
  onRemove,
}: {
  tracks: TrackView[];
  playlists: PlaylistOption[];
  showAlbum?: boolean;
  emptyMessage?: string;
  onRemove?: (trackId: string) => void;
}) {
  const { current, isPlaying, play } = usePlayer();

  if (tracks.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-ink-700 px-4 py-10 text-center text-sm text-muted-dim">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {tracks.map((track, index) => (
        <TrackRow
          key={track.id}
          track={track}
          index={index}
          playlists={playlists}
          isCurrent={current?.id === track.id}
          isPlaying={isPlaying}
          showAlbum={showAlbum}
          onPlay={() => play(tracks, index)}
          onRemove={onRemove ? () => onRemove(track.id) : undefined}
        />
      ))}
    </div>
  );
}

/** Play / shuffle the whole list. Lives with the list because it shares its queue semantics. */
export function PlayAllButtons({ tracks }: { tracks: TrackView[] }) {
  const { play, playShuffled } = usePlayer();
  if (tracks.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => play(tracks, 0)}
        className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-bright"
      >
        <PlayIcon className="size-4" /> Play
      </button>
      <button
        type="button"
        onClick={() => playShuffled(tracks)}
        className="flex items-center gap-2 rounded-full border border-ink-600 px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-ink-500 hover:text-white"
      >
        <ShuffleIcon className="size-4" /> Shuffle
      </button>
    </div>
  );
}
