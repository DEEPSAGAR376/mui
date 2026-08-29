'use client';

/**
 * The review grid — the only rows a human ever has to look at.
 *
 * Everything with complete tags has already been queued by the time this
 * renders, so what is left is genuinely incomplete: a rip with no ALBUM tag, a
 * folder with no artwork, a file whose container the parser could not read. The
 * design priority is therefore bulk editing, not per-row editing. A folder of
 * twelve files missing the same album artist is one action here, not twelve —
 * that is the difference between fixing a batch and giving up on it.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { canForceQueue, FLAG_LABELS } from '@/lib/ingest/triage';
import { directoryOf } from '@/lib/ingest/fallbacks';
import { formatBytes, plural } from '@/lib/format';
import type { Candidate, CoverArt, TrackFields } from '@/lib/ingest/types';
import { AlertIcon, CheckIcon, MusicIcon, TrashIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

/** Last path segment of the containing folder — the bulk "use folder as album" source. */
export function folderName(relativePath: string): string {
  const dir = directoryOf(relativePath);
  if (!dir) return '';
  const parts = dir.split('/');
  return parts[parts.length - 1] ?? '';
}

/**
 * Cover preview, and the drop target for replacing it.
 *
 * The bytes are already in memory from parsing, so the thumbnail is a blob URL
 * rather than a network fetch. It has to be revoked on unmount: a 200-file batch
 * that leaked one object URL per row would pin every cover image in memory for
 * the lifetime of the tab.
 */
function CoverThumb({
  cover,
  onPick,
}: {
  cover: CoverArt | null;
  onPick: (file: File) => void;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  const url = useMemo(() => {
    if (!cover) return null;
    // Copy first: a parser's Uint8Array can be a view onto a pooled or shared
    // buffer, which BlobPart rejects at runtime.
    const bytes = new Uint8Array(cover.bytes.byteLength);
    bytes.set(cover.bytes);
    return URL.createObjectURL(new Blob([bytes], { type: cover.mime }));
  }, [cover]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          const file = event.dataTransfer.files[0];
          if (file && file.type.startsWith('image/')) onPick(file);
        }}
        title="Drop an image here, or click to choose one"
        className={`grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border transition-colors duration-fast ${
          over ? 'border-accent bg-accent/10' : 'border-ink-800 bg-ink-850'
        }`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob URL, no loader
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <MusicIcon className="size-5 text-muted-dim" />
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          event.target.value = '';
        }}
      />
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-dim">
        {label}
      </span>
      <Input
        size="sm"
        tone="sunken"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full"
      />
    </label>
  );
}

/** Empty means "unknown", so the value is `number | null` rather than `number`. */
function NumberField({
  label,
  value,
  onChange,
  className = '',
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-dim">
        {label}
      </span>
      <Input
        size="sm"
        tone="sunken"
        type="number"
        inputMode="numeric"
        value={value ?? ''}
        onChange={(event) => {
          const raw = event.target.value.trim();
          const parsed = Number(raw);
          onChange(raw === '' || !Number.isFinite(parsed) ? null : parsed);
        }}
        className="w-full"
      />
    </label>
  );
}

/**
 * Bulk actions for the current selection.
 *
 * Only the fields you actually typed into are applied — a blank input is left
 * alone rather than written as an empty string, so "set the album artist for
 * these twelve" cannot quietly wipe their titles.
 */
function BulkBar({
  count,
  queueable,
  onApply,
  onFolderAlbum,
  onCoverAll,
  onQueueAnyway,
  onRemove,
}: {
  count: number;
  queueable: number;
  onApply: (patch: Partial<TrackFields>) => void;
  onFolderAlbum: () => void;
  onCoverAll: (file: File) => void;
  onQueueAnyway: () => void;
  onRemove: () => void;
}) {
  const [artist, setArtist] = useState('');
  const [albumArtist, setAlbumArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [year, setYear] = useState('');
  const coverInput = useRef<HTMLInputElement | null>(null);

  const apply = () => {
    const patch: Partial<TrackFields> = {};
    if (artist.trim()) patch.artist = artist.trim();
    if (albumArtist.trim()) patch.albumArtist = albumArtist.trim();
    if (album.trim()) patch.album = album.trim();
    const parsedYear = Number(year.trim());
    if (year.trim() && Number.isFinite(parsedYear)) patch.year = parsedYear;
    if (Object.keys(patch).length === 0) return;
    onApply(patch);
    setArtist('');
    setAlbumArtist('');
    setAlbum('');
    setYear('');
  };

  return (
    <div className="glass sticky top-0 z-10 flex flex-col gap-3 rounded-2xl border border-accent/30 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Artist" value={artist} onChange={setArtist} className="min-w-40 flex-1" />
        <Field
          label="Album artist"
          value={albumArtist}
          onChange={setAlbumArtist}
          className="min-w-40 flex-1"
        />
        <Field label="Album" value={album} onChange={setAlbum} className="min-w-40 flex-1" />
        <Field label="Year" value={year} onChange={setYear} className="w-20" />
        <Button variant="primary" onClick={apply}>
          Apply to {count}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Button size="sm" onClick={onFolderAlbum}>
          Use folder name as album
        </Button>
        <Button size="sm" onClick={() => coverInput.current?.click()}>
          Set cover for all
        </Button>
        <Button
          variant="ok-quiet"
          size="sm"
          disabled={queueable === 0}
          onClick={onQueueAnyway}
          title={
            queueable === 0 ? 'Every selected row still needs a title and an artist' : undefined
          }
        >
          Queue {queueable === count ? 'anyway' : `${queueable} anyway`}
        </Button>
        <Button variant="danger-quiet" size="sm" onClick={onRemove}>
          Remove from batch
        </Button>
      </div>

      <input
        ref={coverInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onCoverAll(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}

function ReviewRow({
  candidate,
  selected,
  onSelect,
  onEdit,
  onCover,
  onQueueAnyway,
  onRemove,
}: {
  candidate: Candidate;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onEdit: (patch: Partial<TrackFields>) => void;
  onCover: (file: File) => void;
  onQueueAnyway: () => void;
  onRemove: () => void;
}) {
  const queueable = canForceQueue(candidate);

  return (
    <div
      className={`rounded-2xl border p-3 transition-colors duration-fast ${
        selected ? 'border-accent/50 bg-accent/5' : 'border-ink-800 bg-ink-900/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelect(event.target.checked)}
          aria-label={`Select ${candidate.file.name}`}
          className="mt-1 size-4 accent-accent"
        />

        <CoverThumb cover={candidate.cover} onPick={onCover} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-white" title={candidate.relativePath}>
            {candidate.file.name}
          </p>
          <p className="truncate text-xs text-muted-dim">
            {directoryOf(candidate.relativePath) || 'loose file'} ·{' '}
            {formatBytes(candidate.fileSize)}
          </p>

          <div className="mt-1.5 flex flex-wrap gap-1">
            {candidate.flags.map((flag) => (
              <span
                key={flag}
                className="rounded-full bg-warn/10 px-2 py-0.5 text-[11px] text-warn"
              >
                {FLAG_LABELS[flag]}
              </span>
            ))}
            {candidate.error ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] text-danger"
                title={candidate.error}
              >
                <AlertIcon className="size-3" />
                {candidate.error.slice(0, 60)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ok-quiet"
            size="sm"
            disabled={!queueable}
            onClick={onQueueAnyway}
            title={queueable ? 'Queue this file as it is' : 'Needs a title and an artist first'}
          >
            <CheckIcon className="size-3.5" />
            Queue
          </Button>
          {/*
            Hand-written, and not `variant="ghost"` with the colour appended.
            `ghost` already carries `hover:bg-white/5 hover:text-white`, so adding
            `hover:text-danger` would put two `text-color` utilities from one
            namespace in conflict — which Tailwind resolves by *sheet* order, not by
            the order they appear in the attribute. The hover colour is the whole
            point of this control: it is the only thing that says destructive before
            you press it.
          */}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${candidate.file.name} from this batch`}
            className="shrink-0 rounded-full p-1.5 text-muted-dim transition-colors duration-fast hover:text-danger"
          >
            <TrashIcon className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <Field
          label="Title"
          value={candidate.title}
          onChange={(value) => onEdit({ title: value })}
          className="lg:col-span-3"
        />
        <Field
          label="Artist"
          value={candidate.artist}
          onChange={(value) => onEdit({ artist: value })}
          className="lg:col-span-3"
        />
        <Field
          label="Album artist"
          value={candidate.albumArtist}
          onChange={(value) => onEdit({ albumArtist: value })}
          placeholder="Various Artists"
          className="lg:col-span-2"
        />
        <Field
          label="Album"
          value={candidate.album}
          onChange={(value) => onEdit({ album: value })}
          className="lg:col-span-2"
        />
        <NumberField
          label="Year"
          value={candidate.year}
          onChange={(value) => onEdit({ year: value })}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Track"
            value={candidate.trackNo}
            onChange={(value) => onEdit({ trackNo: value })}
          />
          <NumberField
            label="Disc"
            value={candidate.discNo}
            onChange={(value) => onEdit({ discNo: value })}
          />
        </div>
        <Field
          label="Genre"
          value={candidate.genre.join(', ')}
          onChange={(value) =>
            onEdit({
              genre: value
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean),
            })
          }
          placeholder="Comma separated"
          className="lg:col-span-6"
        />
      </div>
    </div>
  );
}

export interface ReviewGridProps {
  candidates: Candidate[];
  /** Applied to many ids at once, so a bulk edit and a single edit share one path. */
  onEdit: (ids: string[], patch: Partial<TrackFields>) => void;
  onCover: (ids: string[], file: File) => void;
  onFolderAlbum: (ids: string[]) => void;
  onQueueAnyway: (ids: string[]) => void;
  onRemove: (ids: string[]) => void;
}

export function ReviewGrid({
  candidates,
  onEdit,
  onCover,
  onFolderAlbum,
  onQueueAnyway,
  onRemove,
}: ReviewGridProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Rows leave this list as they are queued or removed, so the selection is
  // filtered against what is actually on screen rather than pruned on every
  // change — a stale id in the set would otherwise send edits to a row that has
  // already moved into the upload queue.
  const present = useMemo(() => new Set(candidates.map((entry) => entry.id)), [candidates]);
  const selectedIds = useMemo(
    () => [...selected].filter((id) => present.has(id)),
    [present, selected],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const queueableSelected = useMemo(
    () => candidates.filter((entry) => selectedSet.has(entry.id) && canForceQueue(entry)).length,
    [candidates, selectedSet],
  );

  if (candidates.length === 0) return null;

  const allSelected = selectedIds.length === candidates.length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-sm font-semibold text-white">
            {candidates.length} {plural(candidates.length, 'file')} need a look
          </h2>
          <p className="text-xs text-muted-dim">
            Fill in what is missing, or queue a row as it stands. Everything else in the
            drop is already queued.
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) =>
              setSelected(
                event.target.checked ? new Set(candidates.map((entry) => entry.id)) : new Set(),
              )
            }
            className="size-4 accent-accent"
          />
          Select all
        </label>
      </div>

      {selectedIds.length > 0 ? (
        <BulkBar
          count={selectedIds.length}
          queueable={queueableSelected}
          onApply={(patch) => onEdit(selectedIds, patch)}
          onFolderAlbum={() => onFolderAlbum(selectedIds)}
          onCoverAll={(file) => onCover(selectedIds, file)}
          onQueueAnyway={() => onQueueAnyway(selectedIds)}
          onRemove={() => onRemove(selectedIds)}
        />
      ) : null}

      <div className="flex flex-col gap-2">
        {candidates.map((candidate) => (
          <ReviewRow
            key={candidate.id}
            candidate={candidate}
            selected={selectedSet.has(candidate.id)}
            onSelect={(next) =>
              setSelected((prev) => {
                const copy = new Set(prev);
                if (next) copy.add(candidate.id);
                else copy.delete(candidate.id);
                return copy;
              })
            }
            onEdit={(patch) => onEdit([candidate.id], patch)}
            onCover={(file) => onCover([candidate.id], file)}
            onQueueAnyway={() => onQueueAnyway([candidate.id])}
            onRemove={() => onRemove([candidate.id])}
          />
        ))}
      </div>
    </section>
  );
}
