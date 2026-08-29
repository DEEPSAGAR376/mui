'use client';

/**
 * A listing, and the buttons that start it.
 *
 * The list is the queue: clicking row 5 of an album plays that album from track 5,
 * so "next" continues through what you were looking at. Passing a single track
 * would make every list a set of disconnected one-song queues.
 *
 * One `useCallback` serves every row rather than one closure per row, because
 * `TrackRow` is memoised and a fresh `() => play(tracks, index)` per render would
 * defeat it — see the note in that file.
 */

import { useCallback } from 'react';
import { MusicIcon, PlayIcon, ShuffleIcon } from '@/components/icons';
import type { PlaylistOption } from '@/components/playlists/PlaylistPicker';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
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
  const handlePlay = useCallback((index: number) => play(tracks, index), [play, tracks]);

  if (tracks.length === 0) {
    return (
      <EmptyState icon={<MusicIcon className="size-6" />}>{emptyMessage}</EmptyState>
    );
  }

  return (
    // A real list, so a screen reader can say "list, 42 items" and jump by item.
    // The separators live here rather than on the row: `divide-y` skips the last
    // child, which is exactly "a hairline between rows and nowhere else".
    <ul className="flex flex-col divide-y divide-hairline">
      {tracks.map((track, index) => (
        <li key={track.id}>
          <TrackRow
            track={track}
            index={index}
            playlists={playlists}
            isCurrent={current?.id === track.id}
            isPlaying={isPlaying}
            showAlbum={showAlbum}
            onPlay={handlePlay}
            onRemove={onRemove}
          />
        </li>
      ))}
    </ul>
  );
}

/** Play / shuffle the whole list. Lives with the list because it shares its queue semantics. */
export function PlayAllButtons({ tracks }: { tracks: TrackView[] }) {
  const { play, playShuffled } = usePlayer();
  if (tracks.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Button variant="primary" onClick={() => play(tracks, 0)}>
        <PlayIcon className="size-4" /> Play
      </Button>
      <Button variant="secondary" onClick={() => playShuffled(tracks)}>
        <ShuffleIcon className="size-4" /> Shuffle
      </Button>
    </div>
  );
}
