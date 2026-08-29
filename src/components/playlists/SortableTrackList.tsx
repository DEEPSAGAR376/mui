'use client';

/**
 * A playlist, in the order you dragged it into.
 *
 * The reorder is optimistic — the row moves under the pointer and the server is
 * told afterwards, because a list that waits for a round trip before moving feels
 * broken. A rejected move snaps back and says why.
 *
 * Only the moved track is written. `movePlaylistTrack` resolves the drop index
 * against the server's own ordering and writes one row at a fractional position
 * between its new neighbours, so dropping a track at the top of a long playlist
 * is a single UPDATE rather than a renumber of everything below it.
 */

import { useCallback, useState, useTransition } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripIcon, MusicIcon } from '@/components/icons';
import { TrackRow } from '@/components/player/TrackRow';
import { usePlayer } from '@/components/player/PlayerProvider';
import type { PlaylistOption } from '@/components/playlists/PlaylistPicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { movePlaylistTrack, removeFromPlaylist } from '@/lib/actions/playlists';
import type { TrackView } from '@/lib/supabase/types';

function SortableRow({
  track,
  index,
  playlists,
  isCurrent,
  isPlaying,
  onPlay,
  onRemove,
}: {
  track: TrackView;
  index: number;
  playlists: PlaylistOption[];
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: (index: number) => void;
  onRemove: (trackId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: track.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 ${isDragging ? 'relative z-10 opacity-80' : ''}`}
    >
      {/* A dedicated handle rather than a draggable row: the row itself is the play
          button, and making the whole thing draggable would swallow every click. */}
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        aria-label={`Reorder ${track.title}`}
        className="shrink-0 cursor-grab touch-none rounded p-1 text-muted-dim transition-colors hover:text-white active:cursor-grabbing"
      >
        <GripIcon className="size-4" />
      </button>

      <div className="min-w-0 flex-1">
        <TrackRow
          track={track}
          index={index}
          playlists={playlists}
          isCurrent={isCurrent}
          isPlaying={isPlaying}
          onPlay={onPlay}
          onRemove={onRemove}
        />
      </div>
    </li>
  );
}

export function SortableTrackList({
  playlistId,
  tracks,
  playlists,
  canEdit,
}: {
  playlistId: string;
  tracks: TrackView[];
  playlists: PlaylistOption[];
  /** Someone else's public playlist is readable but not editable. */
  canEdit: boolean;
}) {
  const { current, isPlaying, play } = usePlayer();
  const [items, setItems] = useState<TrackView[]>(tracks);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // A few pixels of travel before a drag starts, so a plain click on the handle
  // still behaves like a click instead of a zero-distance drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from === -1 || to === -1) return;

    const previous = items;
    const reordered = arrayMove(items, from, to);
    setItems(reordered);
    setError(null);

    startTransition(async () => {
      try {
        await movePlaylistTrack(playlistId, String(active.id), to);
      } catch (cause) {
        setItems(previous);
        setError(cause instanceof Error ? cause.message : 'Could not save that order.');
      }
    });
  };

  const handlePlay = useCallback((index: number) => play(items, index), [items, play]);

  const remove = useCallback(
    (trackId: string) => {
      const previous = items;
      setItems((prev) => prev.filter((item) => item.id !== trackId));
      setError(null);

      startTransition(async () => {
        try {
          await removeFromPlaylist(playlistId, trackId);
        } catch (cause) {
          setItems(previous);
          setError(cause instanceof Error ? cause.message : 'Could not remove that track.');
        }
      });
    },
    [items, playlistId],
  );

  if (items.length === 0) {
    return (
      <EmptyState icon={<MusicIcon className="size-6" />}>
        Empty. Add tracks from the library with the + button on any row.
      </EmptyState>
    );
  }

  // Read-only view: no handles, no remove buttons, same rows.
  if (!canEdit) {
    return (
      <ul className="flex flex-col divide-y divide-hairline">
        {items.map((track, index) => (
          <li key={track.id}>
            <TrackRow
              track={track}
              index={index}
              playlists={playlists}
              isCurrent={current?.id === track.id}
              isPlaying={isPlaying}
              onPlay={handlePlay}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col">
            {items.map((track, index) => (
              <SortableRow
                key={track.id}
                track={track}
                index={index}
                playlists={playlists}
                isCurrent={current?.id === track.id}
                isPlaying={isPlaying}
                onPlay={handlePlay}
                onRemove={remove}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
