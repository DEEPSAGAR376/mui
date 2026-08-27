-- ============================================================================
-- Core library schema
-- ============================================================================
-- Design notes worth knowing before editing this file:
--
--   * The *_normalized generated columns + unique indexes are what make
--     tag-driven ingest idempotent. "The Beatles", "the beatles" and
--     "The  Beatles" all collapse onto one artist row, so re-ingesting a
--     folder does not fan out into near-duplicate artists.
--
--   * tracks.content_hash is unique. Re-uploading a file the library already
--     has is a no-op rather than a duplicate-key error.
--
--   * playlist_tracks.position is numeric, not integer. Moving a track between
--     two neighbours is one UPDATE to the midpoint of their positions instead
--     of renumbering every row after the insertion point.
-- ============================================================================


-- Normalization used by the generated columns below AND by ingest lookups, so
-- both sides agree on what "the same artist" means.
--
-- MUST stay IMMUTABLE: generated columns reject STABLE/VOLATILE functions. That
-- rules out unaccent(), which is only STABLE, so accented duplicates
-- ("Bjork" vs "Björk") are a known, accepted limitation.
--
-- Never redefine this without backfilling: stored generated values are computed
-- at write time and will silently disagree with the new definition.
create or replace function public.normalize_name(input text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select lower(regexp_replace(btrim(input), '\s+', ' ', 'g'))
$$;

comment on function public.normalize_name(text) is
  'Case- and whitespace-insensitive key for artist/album dedup. Immutable so it can back a generated column.';


-- ---------------------------------------------------------------------------
-- artists
-- ---------------------------------------------------------------------------
create table public.artists (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (btrim(name) <> ''),
  name_normalized text generated always as (public.normalize_name(name)) stored,
  image_url       text,
  image_key       text,
  created_at      timestamptz not null default now()
);

create unique index artists_name_normalized_key
  on public.artists (name_normalized);


-- ---------------------------------------------------------------------------
-- albums
-- ---------------------------------------------------------------------------
-- artist_id here is the ALBUM artist (from the albumartist tag), which on a
-- compilation differs from each track's own artist. See tracks.artist_id.
create table public.albums (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (btrim(title) <> ''),
  title_normalized text generated always as (public.normalize_name(title)) stored,
  artist_id        uuid not null references public.artists (id) on delete cascade,
  year             int  check (year is null or year between 1000 and 2200),
  cover_url        text,
  cover_key        text,
  -- SHA-256 of the cover image bytes. Lets a later batch discover the cover is
  -- already stored and skip re-uploading it entirely.
  cover_hash       text,
  created_at       timestamptz not null default now()
);

create unique index albums_artist_title_key
  on public.albums (artist_id, title_normalized);

create index albums_cover_hash_idx
  on public.albums (cover_hash)
  where cover_hash is not null;


-- ---------------------------------------------------------------------------
-- tracks
-- ---------------------------------------------------------------------------
create table public.tracks (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (btrim(title) <> ''),

  -- Deliberately independent of albums.artist_id so compilations keep each
  -- track's real performer. ON DELETE RESTRICT: you cannot delete an artist who
  -- still has tracks. Delete the tracks first; orphaned artists are swept by
  -- public.prune_orphans() in the maintenance migration.
  artist_id        uuid not null references public.artists (id) on delete restrict,
  album_id         uuid references public.albums (id) on delete set null,

  track_no         int check (track_no is null or track_no > 0),
  disc_no          int check (disc_no is null or disc_no > 0),
  duration_seconds numeric(10, 3) check (duration_seconds is null or duration_seconds >= 0),
  year             int check (year is null or year between 1000 and 2200),
  genre            text[] not null default '{}',

  -- audio_key is stored alongside audio_url on purpose. It is required to delete
  -- the file from UploadThing, and it means playback can be switched to a
  -- Range-forwarding proxy route later without a migration.
  audio_url        text not null,
  audio_key        text not null,

  file_size        bigint check (file_size is null or file_size > 0),
  mime_type        text,
  codec            text,
  bitrate          int,

  -- SHA-256 of the audio file bytes. The unique index is what makes re-dropping
  -- an already-uploaded folder cost nothing.
  content_hash     text not null,

  created_at       timestamptz not null default now()
);

create unique index tracks_content_hash_key
  on public.tracks (content_hash);

-- Album running order. NULLS FIRST on disc_no so single-disc albums (disc_no
-- null) sort ahead of any later-added disc 2.
create index tracks_album_order_idx
  on public.tracks (album_id, disc_no nulls first, track_no nulls last);

create index tracks_artist_idx  on public.tracks (artist_id);
create index tracks_recent_idx  on public.tracks (created_at desc);


-- ---------------------------------------------------------------------------
-- profiles  (role lives here; auth.users is managed by Supabase)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         text not null default 'user' check (role in ('admin', 'user')),
  display_name text,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile for every new auth user, anonymous ones included.
-- SECURITY DEFINER because the inserting role is the auth system, not the user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- playlists
-- ---------------------------------------------------------------------------
create table public.playlists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null check (btrim(name) <> ''),
  description text,
  is_public   boolean not null default false,
  cover_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index playlists_owner_idx  on public.playlists (owner_id);
create index playlists_public_idx on public.playlists (is_public) where is_public;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger playlists_touch_updated_at
  before update on public.playlists
  for each row execute function public.touch_updated_at();


-- Composite PK prevents the same track appearing twice in one playlist. That is
-- the sane default; swap to a surrogate id if duplicates are ever wanted.
create table public.playlist_tracks (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  track_id    uuid not null references public.tracks (id) on delete cascade,
  position    numeric not null,
  added_at    timestamptz not null default now(),
  primary key (playlist_id, track_id)
);

create index playlist_tracks_order_idx
  on public.playlist_tracks (playlist_id, position);


-- ---------------------------------------------------------------------------
-- likes
-- ---------------------------------------------------------------------------
create table public.likes (
  user_id    uuid not null references auth.users (id) on delete cascade,
  track_id   uuid not null references public.tracks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

create index likes_track_idx        on public.likes (track_id);
create index likes_user_recent_idx  on public.likes (user_id, created_at desc);


-- ---------------------------------------------------------------------------
-- tracks_view — flattened read model for listings
-- ---------------------------------------------------------------------------
-- security_invoker = true is REQUIRED. Without it a view executes with its
-- owner's privileges (postgres) and silently bypasses RLS on the base tables.
create view public.tracks_view
with (security_invoker = true) as
select
  t.id,
  t.title,
  t.track_no,
  t.disc_no,
  t.duration_seconds,
  t.year,
  t.genre,
  t.audio_url,
  t.audio_key,
  t.file_size,
  t.mime_type,
  t.codec,
  t.bitrate,
  t.created_at,
  t.artist_id,
  ar.name        as artist_name,
  t.album_id,
  al.title       as album_title,
  al.year        as album_year,
  al.cover_url   as album_cover_url,
  al.artist_id   as album_artist_id,
  aa.name        as album_artist_name
from public.tracks t
  join      public.artists ar on ar.id = t.artist_id
  left join public.albums  al on al.id = t.album_id
  left join public.artists aa on aa.id = al.artist_id;

comment on view public.tracks_view is
  'Denormalized track listing. security_invoker=true so RLS on the base tables still applies.';
