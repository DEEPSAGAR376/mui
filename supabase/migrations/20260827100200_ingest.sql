-- ============================================================================
-- Ingest RPCs
-- ============================================================================
-- Why these exist at all: supabase-js cannot open a transaction. A client-side
-- artist -> album -> track insert sequence that fails on step 3 leaves an
-- orphaned artist and album behind. Each function here is ONE statement from the
-- client's perspective, so it runs in one implicit transaction and is all-or-
-- nothing.
--
-- Every function is SECURITY INVOKER (the default), not DEFINER. The is_admin()
-- assertions below exist to produce a clear error message, but they are not the
-- security boundary — RLS on the underlying tables is. If an assertion were ever
-- wrong, the write would still be refused. A DEFINER function here would bypass
-- RLS entirely and make that assertion the only thing standing between an
-- anonymous visitor and write access to the whole library.
--
-- Idempotency is the other design goal: re-running an identical batch must
-- change nothing and raise nothing, so a failed upload run can simply be retried.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Tolerant numeric casts
-- ---------------------------------------------------------------------------
-- The review grid lets a human type into year / track no / disc no. A stray
-- "1998?" would otherwise abort an entire batch with a cast error, so unparseable
-- input degrades to null instead.

create or replace function public.safe_int(input text)
returns int
language plpgsql
immutable
set search_path = ''
as $$
begin
  return nullif(btrim(input), '')::int;
exception when others then
  return null;
end;
$$;

create or replace function public.safe_numeric(input text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  return nullif(btrim(input), '')::numeric;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- upsert_artist
-- ---------------------------------------------------------------------------
-- Get-or-create keyed on name_normalized. Returns null for blank input so
-- callers can treat "no artist tag" uniformly.
--
-- The select-then-insert-then-reselect shape is deliberate. ON CONFLICT alone
-- would work, but it burns a uuid and takes a row lock on every already-known
-- artist — and during a folder ingest almost every artist is already known. The
-- trailing re-select covers the race where a concurrent upload inserted the same
-- artist between our select and our insert.

create or replace function public.upsert_artist(p_name text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_norm text := public.normalize_name(p_name);
  v_id   uuid;
begin
  if v_norm is null or v_norm = '' then
    return null;
  end if;

  select id into v_id from public.artists where name_normalized = v_norm;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.artists (name)
  values (btrim(p_name))
  on conflict (name_normalized) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.artists where name_normalized = v_norm;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- upsert_album
-- ---------------------------------------------------------------------------
-- Keyed on (artist_id, title_normalized), where artist_id is the ALBUM artist.
--
-- Cover handling is fill-only: an existing cover is never overwritten. Tracks in
-- one album often carry slightly different embedded artwork, and whichever track
-- happened to upload last should not get to redefine the album's cover.
-- Re-covering an album is an explicit admin action, not an ingest side effect.

create or replace function public.upsert_album(
  p_title      text,
  p_artist_id  uuid,
  p_year       int  default null,
  p_cover_url  text default null,
  p_cover_key  text default null,
  p_cover_hash text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_norm text := public.normalize_name(p_title);
  v_id   uuid;
begin
  if v_norm is null or v_norm = '' or p_artist_id is null then
    return null;
  end if;

  select id into v_id
  from public.albums
  where artist_id = p_artist_id and title_normalized = v_norm;

  if v_id is null then
    insert into public.albums (title, artist_id, year, cover_url, cover_key, cover_hash)
    values (btrim(p_title), p_artist_id, p_year, p_cover_url, p_cover_key, p_cover_hash)
    on conflict (artist_id, title_normalized) do nothing
    returning id into v_id;

    if v_id is not null then
      return v_id;
    end if;

    select id into v_id
    from public.albums
    where artist_id = p_artist_id and title_normalized = v_norm;
  end if;

  -- Backfill only the columns still empty.
  update public.albums
  set year       = coalesce(year, p_year),
      cover_url  = coalesce(cover_url, p_cover_url),
      cover_key  = coalesce(cover_key, p_cover_key),
      cover_hash = coalesce(cover_hash, p_cover_hash)
  where id = v_id
    and (year is null or cover_url is null);

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- ingest_preflight
-- ---------------------------------------------------------------------------
-- Called ONCE per batch, before any bytes leave the browser. This is the single
-- biggest win in the pipeline: re-dropping a folder that is already in the
-- library uploads nothing at all.
--
--   p_track_hashes -> SHA-256 of each candidate audio file
--   p_cover_hashes -> SHA-256 of each distinct embedded cover image
--
-- Returns:
--   { "existing_tracks": ["<hash>", ...],
--     "known_covers":    { "<hash>": {"url": "...", "key": "..."} } }
--
-- The client drops every hash in existing_tracks from the queue outright, and for
-- anything in known_covers reuses the stored URL instead of re-uploading the
-- image — so a 12-track album whose cover is already on disk uploads 12 files,
-- not 13.

create or replace function public.ingest_preflight(
  p_track_hashes text[] default '{}',
  p_cover_hashes text[] default '{}'
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tracks jsonb;
  v_covers jsonb;
begin
  if not public.is_admin() then
    raise exception 'ingest_preflight: admin role required'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(t.content_hash), '[]'::jsonb)
  into v_tracks
  from public.tracks t
  where t.content_hash = any (coalesce(p_track_hashes, '{}'));

  select coalesce(jsonb_object_agg(x.cover_hash, jsonb_build_object('url', x.cover_url, 'key', x.cover_key)), '{}'::jsonb)
  into v_covers
  from (
    select distinct on (a.cover_hash) a.cover_hash, a.cover_url, a.cover_key
    from public.albums a
    where a.cover_hash = any (coalesce(p_cover_hashes, '{}'))
      and a.cover_url is not null
    order by a.cover_hash, a.created_at
  ) x;

  return jsonb_build_object('existing_tracks', v_tracks, 'known_covers', v_covers);
end;
$$;

-- ---------------------------------------------------------------------------
-- ingest_track
-- ---------------------------------------------------------------------------
-- Commits one fully-uploaded track. Atomic and idempotent.
--
-- Expected payload (nulls fine except where noted):
--   title*, artist*, album_artist, album, year, track_no, disc_no,
--   duration_seconds, genre[], audio_url*, audio_key*, content_hash*,
--   file_size, mime_type, codec, bitrate,
--   cover_url, cover_key, cover_hash
--
-- Returns { "track_id": uuid, "created": bool }. created=false means the
-- content_hash was already present and nothing was written.
--
-- album_artist defaults to artist when absent. Keeping them distinct is what
-- makes compilations come out right: every track keeps its own performer while
-- the album groups under "Various Artists".

create or replace function public.ingest_track(payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_hash            text := btrim(payload ->> 'content_hash');
  v_title           text := btrim(payload ->> 'title');
  v_artist          text := payload ->> 'artist';
  v_album_artist    text := coalesce(nullif(btrim(coalesce(payload ->> 'album_artist', '')), ''), payload ->> 'artist');
  v_album           text := payload ->> 'album';
  v_artist_id       uuid;
  v_album_artist_id uuid;
  v_album_id        uuid;
  v_genre           text[] := '{}';
  v_track_id        uuid;
begin
  if not public.is_admin() then
    raise exception 'ingest_track: admin role required'
      using errcode = '42501';
  end if;

  if v_hash is null or v_hash = '' then
    raise exception 'ingest_track: content_hash is required';
  end if;
  if v_title is null or v_title = '' then
    raise exception 'ingest_track: title is required (hash %)', v_hash;
  end if;
  if coalesce(btrim(payload ->> 'audio_url'), '') = ''
     or coalesce(btrim(payload ->> 'audio_key'), '') = '' then
    raise exception 'ingest_track: audio_url and audio_key are required (hash %)', v_hash;
  end if;

  -- Fast path: already ingested. Cheaper than letting the insert conflict, and
  -- it avoids creating artist/album rows for a track we are about to skip.
  select id into v_track_id from public.tracks where content_hash = v_hash;
  if v_track_id is not null then
    return jsonb_build_object('track_id', v_track_id, 'created', false);
  end if;

  v_artist_id := public.upsert_artist(v_artist);
  if v_artist_id is null then
    raise exception 'ingest_track: artist is required (hash %)', v_hash;
  end if;

  if jsonb_typeof(payload -> 'genre') = 'array' then
    select coalesce(array_agg(distinct btrim(g)), '{}')
    into v_genre
    from jsonb_array_elements_text(payload -> 'genre') as g
    where btrim(g) <> '';
  end if;

  -- Album is optional: singles and loose files land with album_id null.
  if coalesce(btrim(coalesce(v_album, '')), '') <> '' then
    v_album_artist_id := coalesce(public.upsert_artist(v_album_artist), v_artist_id);
    v_album_id := public.upsert_album(
      v_album,
      v_album_artist_id,
      public.safe_int(payload ->> 'year'),
      nullif(btrim(coalesce(payload ->> 'cover_url', '')), ''),
      nullif(btrim(coalesce(payload ->> 'cover_key', '')), ''),
      nullif(btrim(coalesce(payload ->> 'cover_hash', '')), '')
    );
  end if;

  insert into public.tracks (
    title, artist_id, album_id, track_no, disc_no, duration_seconds, year, genre,
    audio_url, audio_key, file_size, mime_type, codec, bitrate, content_hash
  )
  values (
    v_title,
    v_artist_id,
    v_album_id,
    public.safe_int(payload ->> 'track_no'),
    public.safe_int(payload ->> 'disc_no'),
    public.safe_numeric(payload ->> 'duration_seconds'),
    public.safe_int(payload ->> 'year'),
    v_genre,
    btrim(payload ->> 'audio_url'),
    btrim(payload ->> 'audio_key'),
    public.safe_int(payload ->> 'file_size'),
    nullif(btrim(coalesce(payload ->> 'mime_type', '')), ''),
    nullif(btrim(coalesce(payload ->> 'codec', '')), ''),
    public.safe_int(payload ->> 'bitrate'),
    v_hash
  )
  on conflict (content_hash) do nothing
  returning id into v_track_id;

  if v_track_id is null then
    -- Lost a race with a concurrent upload of the same bytes.
    select id into v_track_id from public.tracks where content_hash = v_hash;
    return jsonb_build_object('track_id', v_track_id, 'created', false);
  end if;

  return jsonb_build_object('track_id', v_track_id, 'created', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_track
-- ---------------------------------------------------------------------------
-- Deleting a row is only half the job: the audio file and possibly its cover are
-- still sitting in UploadThing, and storage is the metered resource. This returns
-- every storage key that just became unreferenced so the caller can pass them
-- straight to UTApi.deleteFiles().
--
-- Ordering matters. The track goes first, which is what lets the follow-up
-- queries see the album and artist as empty. A cover key is only surrendered once
-- its album has no tracks left — sharing means a still-referenced album must keep
-- its image.
--
-- Storage deletion cannot join this transaction (it is a remote HTTP call), so on
-- a partial failure the rows are gone and the files linger. That is the right way
-- round: an orphaned file wastes quota, whereas a row pointing at a deleted file
-- is a broken player.

create or replace function public.delete_track(p_track_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_audio_key  text;
  v_album_id   uuid;
  v_artist_id  uuid;
  v_cover_keys text[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'delete_track: admin role required'
      using errcode = '42501';
  end if;

  select audio_key, album_id, artist_id
  into v_audio_key, v_album_id, v_artist_id
  from public.tracks
  where id = p_track_id;

  if v_audio_key is null then
    return jsonb_build_object('deleted', false, 'keys', '[]'::jsonb);
  end if;

  delete from public.tracks where id = p_track_id;

  -- Album now empty? Take its cover with it.
  if v_album_id is not null then
    delete from public.albums a
    where a.id = v_album_id
      and not exists (select 1 from public.tracks t where t.album_id = a.id)
    returning array_remove(array[a.cover_key], null) into v_cover_keys;
  end if;

  -- Artists with nothing left to their name.
  delete from public.artists ar
  where ar.id in (v_artist_id, (select artist_id from public.albums where id = v_album_id))
    and not exists (select 1 from public.tracks t where t.artist_id = ar.id)
    and not exists (select 1 from public.albums al where al.artist_id = ar.id);

  return jsonb_build_object(
    'deleted', true,
    'keys', to_jsonb(array_prepend(v_audio_key, coalesce(v_cover_keys, '{}')))
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Postgres grants EXECUTE on new functions to PUBLIC by default. The is_admin()
-- assertions and RLS already refuse unauthorized callers, but there is no reason
-- for an unauthenticated visitor to be able to invoke these at all.

revoke execute on function public.ingest_preflight(text[], text[]) from public, anon;
revoke execute on function public.ingest_track(jsonb)             from public, anon;
revoke execute on function public.delete_track(uuid)              from public, anon;
revoke execute on function public.upsert_artist(text)             from public, anon;
revoke execute on function public.upsert_album(text, uuid, int, text, text, text) from public, anon;

grant execute on function public.ingest_preflight(text[], text[]) to authenticated;
grant execute on function public.ingest_track(jsonb)              to authenticated;
grant execute on function public.delete_track(uuid)               to authenticated;
