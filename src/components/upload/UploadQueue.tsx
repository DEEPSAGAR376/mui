'use client';

/**
 * The queue: everything that is going to be uploaded, and how far along it is.
 *
 * Per-file progress bars are the reason `src/lib/uploadthing.ts` uses
 * `genUploader` instead of the React hook — the hook only reports one aggregate
 * number for a whole batch, which on a 200-file drop is a single bar that says
 * almost nothing. Here each row moves on its own.
 *
 * Those bars were decorative spans — a width in a style attribute and nothing
 * else, so a screen reader was told only that an upload was "uploading" and never
 * how far. `role="progressbar"` with the three `aria-value*` attributes is what
 * makes the number itself readable, and the label names the file because a
 * 200-file drop puts a great many of them on one screen.
 */

import { formatBytes, plural } from '@/lib/format';
import type { Candidate, CandidateStatus } from '@/lib/ingest/types';
import type { IngestSummary } from '@/lib/ingest/run';
import { AlertIcon, CheckIcon, CloseIcon, SpinnerIcon, UploadIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';

const STATUS_TEXT: Record<CandidateStatus, string> = {
  parsing: 'reading tags',
  ready: 'queued',
  review: 'needs a look',
  duplicate: 'already in the library',
  uploading: 'uploading',
  committing: 'saving',
  done: 'done',
  error: 'failed',
};

const STATUS_CLASS: Record<CandidateStatus, string> = {
  parsing: 'text-muted-dim',
  ready: 'text-muted',
  review: 'text-warn',
  duplicate: 'text-muted-dim',
  uploading: 'text-accent-bright',
  committing: 'text-accent-bright',
  done: 'text-ok',
  error: 'text-danger',
};

function QueueRow({ candidate }: { candidate: Candidate }) {
  const active = candidate.status === 'uploading' || candidate.status === 'committing';

  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm odd:bg-ink-900/40">
      <span className="w-4 shrink-0 text-muted-dim">
        {candidate.status === 'done' ? (
          <CheckIcon className="size-4 text-ok" />
        ) : candidate.status === 'error' ? (
          <AlertIcon className="size-4 text-danger" />
        ) : active ? (
          <SpinnerIcon className="size-4 text-accent-bright" />
        ) : null}
      </span>

      <span className="min-w-0 flex-1 truncate" title={candidate.relativePath}>
        <span className="text-white">{candidate.title || candidate.file.name}</span>
        {candidate.artist ? (
          <span className="text-muted-dim"> — {candidate.artist}</span>
        ) : null}
      </span>

      {/* The bar only exists while there is something to watch; a static 0% or
          100% bar on every row is noise. */}
      {active ? (
        <span
          role="progressbar"
          aria-valuenow={Math.round(candidate.progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Upload progress for ${candidate.title || candidate.file.name}`}
          className="hidden h-1 w-28 overflow-hidden rounded-full bg-ink-800 sm:block"
        >
          <span
            className="block h-full rounded-full bg-accent transition-[width] duration-glide ease-glide"
            style={{ width: `${Math.round(candidate.progress)}%` }}
          />
        </span>
      ) : null}

      <span className={`w-36 shrink-0 truncate text-right text-xs ${STATUS_CLASS[candidate.status]}`}>
        {candidate.status === 'error' && candidate.error
          ? candidate.error
          : STATUS_TEXT[candidate.status]}
      </span>
    </li>
  );
}

export interface UploadQueueProps {
  candidates: Candidate[];
  /** Cover phase runs before any audio; null once it is finished or unnecessary. */
  coverPhase: { done: number; total: number } | null;
  summary: IngestSummary | null;
  running: boolean;
  onStart: () => void;
  onAbort: () => void;
  onRetryFailed: () => void;
  onClear: () => void;
}

export function UploadQueue({
  candidates,
  coverPhase,
  summary,
  running,
  onStart,
  onAbort,
  onRetryFailed,
  onClear,
}: UploadQueueProps) {
  if (candidates.length === 0) return null;

  const ready = candidates.filter((entry) => entry.status === 'ready');
  const duplicates = candidates.filter((entry) => entry.status === 'duplicate');
  const failed = candidates.filter((entry) => entry.status === 'error');
  const done = candidates.filter((entry) => entry.status === 'done');
  const pendingBytes = ready.reduce((total, entry) => total + entry.fileSize, 0);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-white">
            {ready.length > 0
              ? `${ready.length} ${plural(ready.length, 'track')} ready · ${formatBytes(pendingBytes)}`
              : `${done.length} of ${candidates.length} uploaded`}
          </h2>
          <p className="text-xs text-muted-dim">
            {duplicates.length > 0
              ? `${duplicates.length} skipped — the library already has ${
                  duplicates.length === 1 ? 'it' : 'them'
                }. `
              : ''}
            {coverPhase && coverPhase.total > 0
              ? `Covers: ${coverPhase.done}/${coverPhase.total}.`
              : 'Covers upload once per album, then tracks three at a time.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {running ? (
            <Button variant="danger-quiet" onClick={onAbort}>
              <CloseIcon className="size-4" />
              Stop
            </Button>
          ) : (
            <>
              {failed.length > 0 ? (
                <Button onClick={onRetryFailed}>Retry {failed.length} failed</Button>
              ) : null}
              <Button onClick={onClear}>Clear</Button>
              <Button variant="primary" disabled={ready.length === 0} onClick={onStart}>
                <UploadIcon className="size-4" />
                Upload {ready.length > 0 ? ready.length : ''}
              </Button>
            </>
          )}
        </div>
      </div>

      {summary ? (
        <div className="glass rounded-2xl border border-hairline px-4 py-3 text-sm">
          <p className="text-white">
            {summary.committed} {plural(summary.committed, 'track')} added
            {summary.duplicates > 0 ? `, ${summary.duplicates} already there` : ''}
            {summary.failed > 0 ? `, ${summary.failed} failed` : ''}.
          </p>
          <p className="mt-0.5 text-xs text-muted-dim">
            {formatBytes(summary.bytesUploaded)} of audio ·{' '}
            {summary.coversUploaded} {plural(summary.coversUploaded, 'cover')} uploaded
            {summary.coversReused > 0
              ? `, ${summary.coversReused} reused from what was already stored`
              : ''}
            .
          </p>
        </div>
      ) : null}

      <ul className="flex flex-col">
        {candidates.map((candidate) => (
          <QueueRow key={candidate.id} candidate={candidate} />
        ))}
      </ul>
    </section>
  );
}
