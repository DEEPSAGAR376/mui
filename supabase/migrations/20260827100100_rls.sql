-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Shape of access:
--
--   library (artists/albums/tracks)  world-readable, admin-writable
--   profiles                          own row readable, NEVER user-writable
--   likes / playlists                 owner-only
--
-- Two patterns are load-bearing throughout:
--
--   1. (select auth.uid())  — always wrapped in a subselect, never bare.
--      Postgres then treats it as a stable scalar it can hoist out of the row
--      loop and match against an index. Bare auth.uid() degrades these policies
--      into sequential scans, which gets bad fast on a large library.
--
--   2. SECURITY DEFINER helpers for role checks. A policy on profiles that
--      itself queries profiles recurses; routing through a definer function
--      breaks the cycle.
--
-- Table-level GRANTs are left to Supabase's default privileges for the public
-- schema. RLS is the gate here, not GRANT.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  )
$$;

comment on function public.is_admin() is
  'True when the caller is an admin. SECURITY DEFINER so policies on profiles do not recurse.';


-- Distinguishes a Supabase anonymous sign-in from a permanent account.
--
-- Three caller shapes to keep straight:
--   unauthenticated visitor -> postgres role "anon",          auth.uid() null
--   anonymous sign-in       -> postgres role "authenticated", is_anonymous true
--   permanent account       -> postgres role "authenticated", is_anonymous false
--
-- So owner-keyed policies work unchanged for anonymous users; this function only
-- exists to withhold the few capabilities they should not have.
create or replace function public.is_anon_session()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
$$;

comment on function public.is_anon_session() is
  'True for a Supabase anonymous sign-in (is_anonymous JWT claim). False for permanent accounts and for unauthenticated callers.';


-- ---------------------------------------------------------------------------
-- Enable RLS everywhere. Any table left out here is wide open.
-- ---------------------------------------------------------------------------
alter table public.artists          enable row level security;
alter table public.albums           enable row level security;
alter table public.tracks           enable row level security;
alter table public.profiles         enable row level security;
alter table public.playlists        enable row level security;
alter table public.playlist_tracks  enable row level security;
alter table public.likes            enable row level security;


-- ---------------------------------------------------------------------------
-- Library: public read, admin write
-- ---------------------------------------------------------------------------
-- Anonymous visitors can browse and play the whole library. That is the point
-- of the site. Only an admin mutates it.

create policy "artists: public read"
  on public.artists for select to anon, authenticated
  using (true);

create policy "artists: admin write"
  on public.artists for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "albums: public read"
  on public.albums for select to anon, authenticated
  using (true);

create policy "albums: admin write"
  on public.albums for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "tracks: public read"
  on public.tracks for select to anon, authenticated
  using (true);

create policy "tracks: admin write"
  on public.tracks for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- profiles: readable by its owner, writable by nobody
-- ---------------------------------------------------------------------------
-- There is deliberately NO insert/update/delete policy for users.
--
-- profiles.role is the only thing standing between an anonymous visitor and
-- admin rights over the entire library. Anonymous sign-in is open to the world,
-- so any self-service write path here is a privilege-escalation vector. Rows are
-- created by the on_auth_user_created trigger (SECURITY DEFINER, bypasses RLS)
-- and the admin role is granted once by hand:
--
--   update public.profiles set role = 'admin' where id = '<your-uuid>';
--
-- To add editable profile fields later, add a narrow UPDATE policy with
-- `with check (role = (select p.role from public.profiles p where p.id = id))`
-- so role cannot ride along in the same statement.

create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: admin reads all"
  on public.profiles for select to authenticated
  using (public.is_admin());


-- ---------------------------------------------------------------------------
-- likes: owner-only
-- ---------------------------------------------------------------------------
-- `to authenticated` covers anonymous sign-ins too, since they hold a real JWT.
-- An unauthenticated visitor has no auth.uid() and so matches nothing here —
-- the client signs in anonymously on the first like, lazily.

create policy "likes: read own"
  on public.likes for select to authenticated
  using (user_id = (select auth.uid()));

create policy "likes: insert own"
  on public.likes for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "likes: delete own"
  on public.likes for delete to authenticated
  using (user_id = (select auth.uid()));


-- ---------------------------------------------------------------------------
-- playlists: owner-only, plus opt-in public sharing for permanent accounts
-- ---------------------------------------------------------------------------

create policy "playlists: read own or public"
  on public.playlists for select to anon, authenticated
  using (is_public or owner_id = (select auth.uid()));

-- Anonymous sessions get private playlists only. Publishing is a spam vector and
-- anonymous sign-up is unauthenticated by definition, so it is withheld until
-- the session is upgraded to a real account.
create policy "playlists: insert own"
  on public.playlists for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (is_public = false or not public.is_anon_session())
  );

create policy "playlists: update own"
  on public.playlists for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (is_public = false or not public.is_anon_session())
  );

create policy "playlists: delete own"
  on public.playlists for delete to authenticated
  using (owner_id = (select auth.uid()));


-- ---------------------------------------------------------------------------
-- playlist_tracks: inherits visibility from its parent playlist
-- ---------------------------------------------------------------------------
-- Read follows the playlist's own read rule (own or public); write requires
-- ownership. Both policies apply to SELECT and are OR'd, which is what allows
-- reading a public playlist you do not own.

create policy "playlist_tracks: read via playlist"
  on public.playlist_tracks for select to anon, authenticated
  using (exists (
    select 1 from public.playlists p
    where p.id = playlist_tracks.playlist_id
      and (p.is_public or p.owner_id = (select auth.uid()))
  ));

create policy "playlist_tracks: write via owned playlist"
  on public.playlist_tracks for all to authenticated
  using (exists (
    select 1 from public.playlists p
    where p.id = playlist_tracks.playlist_id
      and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.playlists p
    where p.id = playlist_tracks.playlist_id
      and p.owner_id = (select auth.uid())
  ));
