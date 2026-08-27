-- ============================================================================
-- Maintenance
-- ============================================================================
-- Neither function is reachable by application code — both are revoked from anon
-- and authenticated. Run them from the SQL editor or attach them to pg_cron.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- cleanup_anonymous_users
-- ---------------------------------------------------------------------------
-- Anonymous sign-in writes a real auth.users row. The client only calls it lazily
-- (on a first like or playlist action, never on page load), which keeps crawlers
-- from minting rows just by browsing — but abandoned sessions still accumulate,
-- and Supabase counts them toward MAU.
--
-- Only deletes rows that are anonymous, older than the cutoff, AND have no likes
-- and no playlists. A visitor who hearted one track keeps their session forever;
-- losing their library to a cleanup job would be worse than the row.
--
-- SECURITY DEFINER is unavoidable: auth.users is not writable by app roles.
-- Cascades to public.profiles, likes, and playlists via their FKs.
--
--   select public.cleanup_anonymous_users();            -- default 30 days
--   select public.cleanup_anonymous_users(interval '7 days');
--
-- With pg_cron enabled:
--   select cron.schedule('cleanup-anon-users', '0 4 * * *',
--                        $$select public.cleanup_anonymous_users()$$);

create or replace function public.cleanup_anonymous_users(
  p_older_than interval default interval '30 days'
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  with doomed as (
    delete from auth.users u
    where u.is_anonymous
      and u.created_at < now() - p_older_than
      and not exists (select 1 from public.likes     l where l.user_id  = u.id)
      and not exists (select 1 from public.playlists p where p.owner_id = u.id)
    returning u.id
  )
  select count(*) into v_count from doomed;

  return v_count;
end;
$$;

revoke execute on function public.cleanup_anonymous_users(interval) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- prune_orphans
-- ---------------------------------------------------------------------------
-- delete_track() already sweeps the artist and album it touched, so this is a
-- backstop for rows orphaned some other way — a direct SQL delete, or a batch
-- that failed between upserting an artist and inserting its track.
--
-- Returns the storage keys of covers belonging to the albums it removed. Those
-- files still exist in UploadThing and must be deleted separately; nothing here
-- can do that from inside Postgres.
--
-- Albums go before artists so an artist whose only album just disappeared is
-- caught in the same pass.

create or replace function public.prune_orphans()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cover_keys text[] := '{}';
  v_albums     int;
  v_artists    int;
begin
  with gone as (
    delete from public.albums a
    where not exists (select 1 from public.tracks t where t.album_id = a.id)
    returning a.cover_key
  )
  select coalesce(array_agg(cover_key) filter (where cover_key is not null), '{}'), count(*)
  into v_cover_keys, v_albums
  from gone;

  with gone as (
    delete from public.artists ar
    where not exists (select 1 from public.tracks t  where t.artist_id  = ar.id)
      and not exists (select 1 from public.albums al where al.artist_id = ar.id)
    returning ar.id
  )
  select count(*) into v_artists from gone;

  return jsonb_build_object(
    'albums_deleted',  v_albums,
    'artists_deleted', v_artists,
    'orphaned_keys',   to_jsonb(v_cover_keys)
  );
end;
$$;

revoke execute on function public.prune_orphans() from public, anon, authenticated;
