-- ============================================================================
-- Shared storage pool: Supabase Storage alongside UploadThing
-- ============================================================================
-- UploadThing's free tier stops at 2 GB. Supabase — already here for the
-- database and auth — ships a separate 1 GB storage allowance that was sitting
-- unused. This migration makes the two readable as one pool, which moves the
-- ceiling from roughly 340 tracks to roughly 510 at the library's measured
-- average of 5.92 MB per track.
--
-- The design rule the whole thing obeys: nothing outside ingest, deletion and
-- byte-counting may learn that a file has a provider. Playback assigns
-- `audio.src = track.audio_url` and must keep working unchanged.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Buckets
-- ---------------------------------------------------------------------------
-- Public, because the player is a plain <audio> element pointed at a URL —
-- signing every playback URL would mean a round trip before every track starts,
-- and the file contents are not the secret here. The size limits mirror the
-- UploadThing route caps in src/app/api/uploadthing/core.ts so a file that
-- would be refused by one provider is refused by both.
--
-- allowed_mime_types stays NULL deliberately. Browsers report an empty
-- file.type for .flac / .opus / .m4a often enough that a MIME allowlist here
-- would silently reject real music — the same reason core.ts lists `blob`
-- beside `audio`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio',  'audio',  true, 134217728, null),   -- 128 MB
       ('covers', 'covers', true,   8388608, null)    --   8 MB
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- Storage policies
-- ---------------------------------------------------------------------------
-- A storage endpoint is plain HTTP that table RLS cannot reach, so these
-- policies are the real boundary — exactly as assertAdmin() is for the
-- UploadThing route. public.is_admin() is reused rather than reimplemented so
-- there stays one definition of "admin" in the system.
--
-- No update policy: an object is written once under a content-hash name and
-- never mutated. Overwriting would let a second upload redefine bytes that
-- existing track rows already point at.

drop policy if exists "storage: public read"  on storage.objects;
drop policy if exists "storage: admin insert" on storage.objects;
drop policy if exists "storage: admin delete" on storage.objects;

create policy "storage: public read"
  on storage.objects for select
  using (bucket_id in ('audio', 'covers'));

create policy "storage: admin insert"
  on storage.objects for insert
  with check (bucket_id in ('audio', 'covers') and public.is_admin());

create policy "storage: admin delete"
  on storage.objects for delete
  using (bucket_id in ('audio', 'covers') and public.is_admin());


-- ---------------------------------------------------------------------------
-- Provider columns
-- ---------------------------------------------------------------------------
-- Defaulted to 'uploadthing' so every row already in the library stays correct
-- with no backfill — the pre-existing files are all there.
--
-- The meaning of audio_key / cover_key is unchanged: "whatever identifier the
-- holder needs in order to delete this". For Supabase that is the object path
-- inside the bucket; for UploadThing it is the file key. The provider column is
-- what tells the deletion sweep which of those it is looking at.

alter table public.tracks
  add column if not exists audio_provider text not null default 'uploadthing';
alter table public.albums
  add column if not exists cover_provider text not null default 'uploadthing';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tracks_audio_provider_check') then
    alter table public.tracks add constraint tracks_audio_provider_check
      check (audio_provider in ('uploadthing', 'supabase'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'albums_cover_provider_check') then
    alter table public.albums add constraint albums_cover_provider_check
      check (cover_provider in ('uploadthing', 'supabase'));
  end if;
end $$;

comment on column public.tracks.audio_provider is
  'Which storage service holds audio_key. Set at ingest from remaining headroom.';
comment on column public.albums.cover_provider is
  'Which storage service holds cover_key.';


-- ---------------------------------------------------------------------------
-- tracks_view
-- ---------------------------------------------------------------------------
-- Recreated rather than altered: Postgres will not let a column be added to the
-- middle of an existing view. security_invoker = true is REQUIRED — without it
-- the view runs as its owner and silently bypasses RLS on the base tables.

drop view if exists public.tracks_view;

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
  t.audio_provider,
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
  al.cover_provider as album_cover_provider,
  al.artist_id   as album_artist_id,
  aa.name        as album_artist_name
from public.tracks t
  join      public.artists ar on ar.id = t.artist_id
  left join public.albums  al on al.id = t.album_id
  left join public.artists aa on aa.id = al.artist_id;

comment on view public.tracks_view is
  'Denormalized track listing. security_invoker=true so RLS on the base tables still applies.';
