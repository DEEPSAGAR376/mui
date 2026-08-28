-- ============================================================================
-- Ingest RPCs, revised for two storage providers
-- ============================================================================
-- Split out from the bucket/column migration so the schema change and the
-- function bodies that depend on it stay separately reviewable. Everything here
-- supersedes the same-named function in 20260827100200_ingest.sql; the design
-- notes in that file still apply and are not repeated.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- upsert_album — one more column to carry
-- ---------------------------------------------------------------------------
-- The old 6-argument version is DROPPED rather than left alongside this one.
-- Adding a defaulted parameter creates an overload, and a 6-argument call would
-- then be ambiguous — PostgREST answers PGRST203 instead of doing the work.
--
-- Cover handling is unchanged and still fill-only: an existing cover is never
-- overwritten, so whichever track uploads last does not get to redefine the
-- album's art. cover_provider travels with cover_key because the two are
-- meaningless apart.

drop function if exists public.upsert_album(text, uuid, int, text, text, text);

create or replace function public.upsert_album(
  p_title          text,
  p_artist_id      uuid,
  p_year           int  default null,
  p_cover_url      text default null,
  p_cover_key      text default null,
  p_cover_hash     text default null,
  p_cover_provider text default 'uploadthing'
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_norm     text := public.normalize_name(p_title);
  v_provider text := coalesce(nullif(btrim(coalesce(p_cover_provider, '')), ''), 'uploadthing');
  v_id       uuid;
begin
  if v_norm is null or v_norm = '' or p_artist_id is null then
    return null;
  end if;

  select id into v_id
  from public.albums
  where artist_id = p_artist_id and title_normalized = v_norm;

  if v_id is null then
    insert into public.albums (title, artist_id, year, cover_url, cover_key, cover_hash, cover_provider)
    values (btrim(p_title), p_artist_id, p_year, p_cover_url, p_cover_key, p_cover_hash, v_provider)
    on conflict (artist_id, title_normalized) do nothing
    returning id into v_id;

    if v_id is not null then
      return v_id;
    end if;

    select id into v_id
    from public.albums
    where artist_id = p_artist_id and title_normalized = v_norm;
  end if;

  -- Backfill only the columns still empty. cover_provider is rewritten only in
  -- the same breath as the cover itself, so it can never drift away from the key
  -- it describes.
  update public.albums
  set year       = coalesce(year, p_year),
      cover_url  = coalesce(cover_url, p_cover_url),
      cover_key  = coalesce(cover_key, p_cover_key),
      cover_hash = coalesce(cover_hash, p_cover_hash),
      cover_provider = case
        when cover_url is null and p_cover_url is not null then v_provider
        else cover_provider
      end
  where id = v_id
    and (year is null or cover_url is null);

  return v_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- ingest_track — records which provider took the file
-- ---------------------------------------------------------------------------
-- Identical to the previous version except that audio_provider is read from the
-- payload and cover_provider is handed to upsert_album. Absent means
-- 'uploadthing', so a stale client that does not send the field still commits
-- correctly instead of failing a whole batch.

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
  v_audio_provider  text := coalesce(nullif(btrim(coalesce(payload ->> 'audio_provider', '')), ''), 'uploadthing');
  v_cover_provider  text := coalesce(nullif(btrim(coalesce(payload ->> 'cover_provider', '')), ''), 'uploadthing');
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
  if v_audio_provider not in ('uploadthing', 'supabase') then
    raise exception 'ingest_track: unknown audio_provider % (hash %)', v_audio_provider, v_hash;
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
      nullif(btrim(coalesce(payload ->> 'cover_hash', '')), ''),
      v_cover_provider
    );
  end if;

  insert into public.tracks (
    title, artist_id, album_id, track_no, disc_no, duration_seconds, year, genre,
    audio_url, audio_key, audio_provider, file_size, mime_type, codec, bitrate, content_hash
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
    v_audio_provider,
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
-- delete_track — surrenders keys tagged with their holder
-- ---------------------------------------------------------------------------
-- `keys` was a flat text array back when there was only one place a file could
-- be. It is now an array of objects:
--
--   [{"provider": "supabase", "bucket": "audio",  "key": "<hash>.mp3"},
--    {"provider": "uploadthing", "bucket": "covers", "key": "<utKey>"}]
--
-- `bucket` is only meaningful for the supabase provider — UploadThing has one
-- flat namespace — but it is always emitted so the caller never has to infer it
-- from position in the array.
--
-- Everything else is unchanged: the track row goes first so the follow-up
-- queries can see the album and artist as empty, and a cover key is surrendered
-- only once its album has no tracks left. Storage deletion cannot join this
-- transaction, so on a partial failure the rows are gone and the files linger —
-- an orphaned file wastes quota, whereas a row pointing at a deleted file is a
-- dead play button. Two providers make partial failure likelier, which is
-- exactly why that ordering was chosen.

create or replace function public.delete_track(p_track_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_audio_key      text;
  v_audio_provider text;
  v_album_id       uuid;
  v_artist_id      uuid;
  v_cover_key      text;
  v_cover_provider text;
  v_keys           jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'delete_track: admin role required'
      using errcode = '42501';
  end if;

  select audio_key, audio_provider, album_id, artist_id
  into v_audio_key, v_audio_provider, v_album_id, v_artist_id
  from public.tracks
  where id = p_track_id;

  if v_audio_key is null then
    return jsonb_build_object('deleted', false, 'keys', '[]'::jsonb);
  end if;

  delete from public.tracks where id = p_track_id;

  v_keys := v_keys || jsonb_build_object(
    'provider', coalesce(v_audio_provider, 'uploadthing'),
    'bucket',   'audio',
    'key',      v_audio_key
  );

  -- Album now empty? Take its cover with it.
  if v_album_id is not null then
    delete from public.albums a
    where a.id = v_album_id
      and not exists (select 1 from public.tracks t where t.album_id = a.id)
    returning a.cover_key, a.cover_provider
    into v_cover_key, v_cover_provider;

    if v_cover_key is not null then
      v_keys := v_keys || jsonb_build_object(
        'provider', coalesce(v_cover_provider, 'uploadthing'),
        'bucket',   'covers',
        'key',      v_cover_key
      );
    end if;
  end if;

  -- Artists with nothing left to their name.
  delete from public.artists ar
  where ar.id in (v_artist_id, (select artist_id from public.albums where id = v_album_id))
    and not exists (select 1 from public.tracks t where t.artist_id = ar.id)
    and not exists (select 1 from public.albums al where al.artist_id = ar.id);

  return jsonb_build_object('deleted', true, 'keys', v_keys);
end;
$$;

-- ---------------------------------------------------------------------------
-- prune_orphans — same tagging, so its output feeds the same sweep
-- ---------------------------------------------------------------------------
-- `orphaned_keys` now matches delete_track's `keys` shape. A caller that can
-- clean up after one can clean up after the other without a second code path.

create or replace function public.prune_orphans()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keys    jsonb := '[]'::jsonb;
  v_albums  int;
  v_artists int;
begin
  with gone as (
    delete from public.albums a
    where not exists (select 1 from public.tracks t where t.album_id = a.id)
    returning a.cover_key, a.cover_provider
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'provider', coalesce(cover_provider, 'uploadthing'),
      'bucket',   'covers',
      'key',      cover_key
    )) filter (where cover_key is not null), '[]'::jsonb),
    count(*)
  into v_keys, v_albums
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
    'orphaned_keys',   v_keys
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Re-stated because the upsert_album signature changed: the old revoke named a
-- 6-argument function that no longer exists, so without this the new overload
-- would keep Postgres's default EXECUTE-to-PUBLIC.

revoke execute on function public.upsert_album(text, uuid, int, text, text, text, text) from public, anon;
revoke execute on function public.ingest_track(jsonb) from public, anon;
revoke execute on function public.delete_track(uuid)  from public, anon;
revoke execute on function public.prune_orphans()     from public, anon, authenticated;

grant execute on function public.ingest_track(jsonb) to authenticated;
grant execute on function public.delete_track(uuid)  to authenticated;
