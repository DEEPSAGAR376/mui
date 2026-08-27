'use server';

/**
 * Playlists.
 *
 * The one idea worth knowing here is `position numeric`. A drag-and-drop reorder
 * writes ONE row — the moved track's new position is the midpoint between its two
 * new neighbours — instead of renumbering everything below the insertion point.
 * With integer positions, dragging track 2 to the top of a 300-track playlist is
 * 300 UPDATEs; here it is one.
 *
 * Ownership is enforced by RLS on every statement, including the requirement that
 * only permanent (non-anonymous) accounts may publish. `owner_id` is passed
 * explicitly so the insert satisfies its own WITH CHECK, not as a substitute for
 * that policy.
 */

import { revalidatePath } from 'next/cache';
import { createClient, getUserId } from '@/lib/supabase/server';
import { asTrackViews, type Playlist, type TrackView } from '@/lib/supabase/types';

const NO_SESSION =
  'No session yet. Playlists need a session; if this keeps happening, enable Anonymous sign-ins in the Supabase dashboard.';

/**
 * Smallest gap tolerated between neighbours before the playlist is renumbered.
 *
 * Halving a gap repeatedly is exact in `numeric` but not in the JS `number` these
 * positions travel through as JSON — around 50 successive drops between the same
 * two rows and the midpoint stops being strictly between them. Renumbering then
 * is cheap and invisible; skipping the check is a silent ordering bug.
 */
const MIN_GAP = 1e-6;

export interface PlaylistSummary extends Playlist {
  trackCount: number;
}

/** The caller's playlists, with track counts. */
export async function myPlaylists(): Promise<PlaylistSummary[]> {
  const userId = await getUserId();
  if (!userId) return [];

  const supabase = await createClient();

  const { data: playlists, error } = await supabase
    .from('playlists')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Could not read playlists: ${error.message}`);
  const rows = playlists ?? [];
  if (rows.length === 0) return [];

  // Counted in one round trip and tallied here. PostgREST cannot GROUP BY, and an
  // embedded `playlist_tracks(count)` would need a declared relationship on a
  // hand-written type. For a personal library this is a few hundred ids at most.
  const { data: members, error: membersError } = await supabase
    .from('playlist_tracks')
    .select('playlist_id')
    .in(
      'playlist_id',
      rows.map((row) => row.id),
    );

  if (membersError) throw new Error(`Could not count playlist tracks: ${membersError.message}`);

  const counts = new Map<string, number>();
  for (const row of members ?? []) {
    counts.set(row.playlist_id, (counts.get(row.playlist_id) ?? 0) + 1);
  }

  return rows.map((row) => ({ ...row, trackCount: counts.get(row.id) ?? 0 }));
}

/**
 * One playlist and its tracks, in playlist order.
 *
 * Readable by anyone if it is public — the RLS policy decides, not this function,
 * which is why there is no owner check here.
 */
export async function playlistWithTracks(
  playlistId: string,
): Promise<{ playlist: Playlist; tracks: TrackView[] } | null> {
  const supabase = await createClient();

  const { data: playlist, error } = await supabase
    .from('playlists')
    .select('*')
    .eq('id', playlistId)
    .maybeSingle();

  if (error) throw new Error(`Could not read playlist: ${error.message}`);
  if (!playlist) return null;

  const { data: members, error: membersError } = await supabase
    .from('playlist_tracks')
    .select('track_id, position')
    .eq('playlist_id', playlistId)
    .order('position', { ascending: true });

  if (membersError) throw new Error(`Could not read playlist tracks: ${membersError.message}`);

  const ids = (members ?? []).map((row) => row.track_id);
  if (ids.length === 0) return { playlist, tracks: [] };

  const { data: tracks, error: tracksError } = await supabase
    .from('tracks_view')
    .select('*')
    .in('id', ids);

  if (tracksError) throw new Error(`Could not read tracks: ${tracksError.message}`);

  // `in` returns rows in whatever order it likes; playlist order is the point.
  const rank = new Map(ids.map((id, index) => [id, index]));
  const ordered = asTrackViews(tracks ?? []).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

  return { playlist, tracks: ordered };
}

export async function createPlaylist(
  name: string,
  description?: string,
): Promise<{ id: string }> {
  const userId = await getUserId();
  if (!userId) throw new Error(NO_SESSION);

  const trimmed = name.trim();
  if (!trimmed) throw new Error('A playlist needs a name.');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('playlists')
    .insert({ owner_id: userId, name: trimmed, description: description?.trim() || null })
    .select('id')
    .single();

  if (error) throw new Error(`Could not create playlist: ${error.message}`);

  revalidatePath('/playlists');
  return { id: data.id };
}

export async function renamePlaylist(playlistId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('A playlist needs a name.');

  const supabase = await createClient();
  const { error } = await supabase
    .from('playlists')
    .update({ name: trimmed })
    .eq('id', playlistId);

  if (error) throw new Error(`Could not rename playlist: ${error.message}`);

  revalidatePath('/playlists');
  revalidatePath(`/playlists/${playlistId}`);
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  const supabase = await createClient();
  // playlist_tracks cascades from the FK; only the parent row is deleted here.
  const { error } = await supabase.from('playlists').delete().eq('id', playlistId);
  if (error) throw new Error(`Could not delete playlist: ${error.message}`);
  revalidatePath('/playlists');
}

/**
 * Publish or unpublish.
 *
 * An anonymous session is rejected by RLS, not by a check here — the error is
 * translated so the UI can say something useful instead of showing a policy
 * violation.
 */
export async function setPlaylistVisibility(
  playlistId: string,
  isPublic: boolean,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('playlists')
    .update({ is_public: isPublic })
    .eq('id', playlistId);

  if (error) {
    const denied = error.code === '42501' || /row-level security/i.test(error.message);
    throw new Error(
      denied && isPublic
        ? 'Public playlists need a permanent account. Add an email to this session first.'
        : `Could not change visibility: ${error.message}`,
    );
  }

  revalidatePath('/playlists');
  revalidatePath(`/playlists/${playlistId}`);
}

/**
 * Append a track.
 *
 * Position is "last + 1", read from the tail rather than a count — after a few
 * reorders the two disagree, and only the tail is the truth.
 */
export async function addToPlaylist(
  playlistId: string,
  trackId: string,
): Promise<{ added: boolean }> {
  const supabase = await createClient();

  const { data: last, error: lastError } = await supabase
    .from('playlist_tracks')
    .select('position')
    .eq('playlist_id', playlistId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) throw new Error(`Could not read playlist: ${lastError.message}`);

  const position = (last?.position ?? 0) + 1;

  const { error } = await supabase
    .from('playlist_tracks')
    .insert({ playlist_id: playlistId, track_id: trackId, position });

  if (error) {
    // 23505 on the composite key: the track is already in this playlist. The
    // composite PK is deliberate — a playlist holds a track once.
    if (error.code === '23505') return { added: false };
    throw new Error(`Could not add to playlist: ${error.message}`);
  }

  revalidatePath('/playlists');
  revalidatePath(`/playlists/${playlistId}`);
  return { added: true };
}

export async function removeFromPlaylist(playlistId: string, trackId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('playlist_tracks')
    .delete()
    .eq('playlist_id', playlistId)
    .eq('track_id', trackId);

  if (error) throw new Error(`Could not remove from playlist: ${error.message}`);

  revalidatePath('/playlists');
  revalidatePath(`/playlists/${playlistId}`);
}

/**
 * Move a track to `toIndex` in the playlist's current order.
 *
 * The index is resolved against the server's own ordering rather than positions
 * sent by the browser: a stale client — a second tab, or a drop that raced a
 * removal — would otherwise write a position between two rows that no longer sit
 * next to each other. One UPDATE in the normal case; a single bulk upsert in the
 * rare case the neighbours have been halved too many times to fit a value between.
 */
export async function movePlaylistTrack(
  playlistId: string,
  trackId: string,
  toIndex: number,
): Promise<void> {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from('playlist_tracks')
    .select('track_id, position')
    .eq('playlist_id', playlistId)
    .order('position', { ascending: true });

  if (error) throw new Error(`Could not read playlist: ${error.message}`);

  const current = rows ?? [];
  if (!current.some((row) => row.track_id === trackId)) return;

  // Neighbours are taken from the list with the moved row already lifted out, so
  // `toIndex` means the same thing the drag preview showed.
  const others = current.filter((row) => row.track_id !== trackId);
  const clamped = Math.min(Math.max(toIndex, 0), others.length);
  const before = others[clamped - 1]?.position;
  const after = others[clamped]?.position;

  let position: number;
  if (before === undefined && after === undefined) position = 1;
  else if (before === undefined) position = after! - 1;
  else if (after === undefined) position = before + 1;
  else position = (before + after) / 2;

  const tooTight = before !== undefined && after !== undefined && after - before < MIN_GAP;

  if (tooTight) {
    // Rewrite the whole playlist with integer positions in the intended order.
    // One round trip, and it happens roughly never.
    const reordered = [...others];
    reordered.splice(clamped, 0, { track_id: trackId, position: 0 });

    const { error: renumberError } = await supabase.from('playlist_tracks').upsert(
      reordered.map((row, index) => ({
        playlist_id: playlistId,
        track_id: row.track_id,
        position: index + 1,
      })),
    );

    if (renumberError) throw new Error(`Could not reorder playlist: ${renumberError.message}`);
  } else {
    const { error: moveError } = await supabase
      .from('playlist_tracks')
      .update({ position })
      .eq('playlist_id', playlistId)
      .eq('track_id', trackId);

    if (moveError) throw new Error(`Could not reorder playlist: ${moveError.message}`);
  }

  revalidatePath(`/playlists/${playlistId}`);
}
