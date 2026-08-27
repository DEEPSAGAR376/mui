'use server';

/**
 * Likes.
 *
 * One row per (user, track), and the primary key is that pair — so the database
 * itself makes a double-tap harmless. RLS restricts every statement here to the
 * caller's own rows; the `user_id` we pass is belt-and-braces, not the boundary.
 *
 * These are server actions rather than browser queries for one reason: the
 * Favorites page is a Server Component, and `revalidatePath` is what makes an
 * unlike on the library page show up there without a manual refetch.
 */

import { revalidatePath } from 'next/cache';
import { createClient, getUserId } from '@/lib/supabase/server';
import { asTrackViews, type TrackView } from '@/lib/supabase/types';

/** Thrown when there is no session at all — the client should have created one. */
const NO_SESSION =
  'No session yet. Likes need a session; if this keeps happening, enable Anonymous sign-ins in the Supabase dashboard.';

/**
 * Flip a like, returning the state it landed in.
 *
 * Implemented as delete-then-insert rather than "select, decide, write": two tabs
 * clicking at once would otherwise both read "not liked" and both insert. Here the
 * delete's own row count is the decision, and a unique violation on the insert
 * means someone else won the race — which is the outcome we wanted anyway.
 */
export async function toggleLike(trackId: string): Promise<{ liked: boolean }> {
  const userId = await getUserId();
  if (!userId) throw new Error(NO_SESSION);

  const supabase = await createClient();

  const { data: removed, error: deleteError } = await supabase
    .from('likes')
    .delete()
    .eq('user_id', userId)
    .eq('track_id', trackId)
    .select('track_id');

  if (deleteError) throw new Error(`Could not unlike: ${deleteError.message}`);

  if (removed && removed.length > 0) {
    revalidatePath('/likes');
    return { liked: false };
  }

  const { error: insertError } = await supabase
    .from('likes')
    .insert({ user_id: userId, track_id: trackId });

  // 23505 = unique_violation: the row is already there, which is the goal state.
  if (insertError && insertError.code !== '23505') {
    throw new Error(`Could not like: ${insertError.message}`);
  }

  revalidatePath('/likes');
  return { liked: true };
}

/**
 * The caller's liked track ids.
 *
 * Ids rather than rows: listings render hundreds of buttons and only need to know
 * which are filled in. Returned as an array because a Set cannot cross the
 * Server Component boundary as a prop.
 */
export async function likedTrackIds(): Promise<string[]> {
  const userId = await getUserId();
  if (!userId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.from('likes').select('track_id').eq('user_id', userId);

  if (error) {
    console.error('Could not read likes:', error.message);
    return [];
  }
  return (data ?? []).map((row) => row.track_id);
}

/**
 * Liked tracks, newest first.
 *
 * Two queries on purpose. `tracks_view` is a view, so PostgREST cannot join it to
 * `likes` through a foreign key — there isn't one. Fetching the ids and then the
 * rows keeps the view usable as the single shape the player understands.
 */
export async function likedTracks(): Promise<TrackView[]> {
  const userId = await getUserId();
  if (!userId) return [];

  const supabase = await createClient();

  const { data: likes, error: likesError } = await supabase
    .from('likes')
    .select('track_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (likesError) throw new Error(`Could not read likes: ${likesError.message}`);
  const ids = (likes ?? []).map((row) => row.track_id);
  if (ids.length === 0) return [];

  const { data: tracks, error: tracksError } = await supabase
    .from('tracks_view')
    .select('*')
    .in('id', ids);

  if (tracksError) throw new Error(`Could not read tracks: ${tracksError.message}`);

  // Restore like-order, which the `in` filter does not preserve.
  const rank = new Map(ids.map((id, index) => [id, index]));
  return asTrackViews(tracks ?? []).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}
