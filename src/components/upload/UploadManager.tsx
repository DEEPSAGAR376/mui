'use client';

/**
 * The mass-upload screen's brain.
 *
 * One client component drives the whole pipeline, in the order the plan lays out:
 *
 *   collect → parse (worker pool) → infer + triage → preflight → upload → commit
 *
 * Two properties are worth stating because everything here is arranged around
 * them. First, nothing is uploaded before the library has been asked what it
 * already has: re-dropping a folder you have already ingested transfers zero
 * bytes. Second, a track commits the moment its own upload lands, so a batch
 * that dies at file 180 of 200 leaves 179 tracks in the library rather than
 * nothing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { type RawFile } from '@/lib/ingest/collect';
import { indexSiblingCovers, isAudioFile } from '@/lib/ingest/fallbacks';
import { isSecureContextAvailable } from '@/lib/ingest/hash';
import { parseFiles } from '@/lib/ingest/pool';
import { buildCandidate, canForceQueue, loadSiblingCover, retriage } from '@/lib/ingest/triage';
import { runIngest, type IngestSummary } from '@/lib/ingest/run';
import { preflight } from '@/lib/actions/ingest';
import { plural } from '@/lib/format';
import type { Candidate, CandidateStatus, CoverArt, ParseRequest, TrackFields } from '@/lib/ingest/types';
import { FilePicker } from './FilePicker';
import { folderName, ReviewGrid } from './ReviewGrid';
import { UploadQueue } from './UploadQueue';

type Phase = 'idle' | 'parsing' | 'checking' | 'uploading';

/** Statuses an edit is allowed to touch. Anything uploaded is history. */
const EDITABLE: CandidateStatus[] = ['ready', 'review'];

/** Folder order, with numbers compared as numbers so track 10 follows track 9. */
function byPath(a: Candidate, b: Candidate): number {
  return a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true });
}

export function UploadManager() {
  const router = useRouter();

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [parseProgress, setParseProgress] = useState<{ done: number; total: number } | null>(null);
  const [coverPhase, setCoverPhase] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<IngestSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** hash -> {url, key} for covers the server already stores. Merged across drops. */
  const knownCovers = useRef<Record<string, { url: string; key: string }>>({});
  /** Rows a human explicitly waved through despite their flags. */
  const forced = useRef<Set<string>>(new Set());
  const abort = useRef<AbortController | null>(null);
  /** Mirror of `candidates`, so callbacks can read the latest without re-binding. */
  const latest = useRef<Candidate[]>([]);

  useEffect(() => {
    latest.current = candidates;
  }, [candidates]);

  /**
   * Progress coalescing.
   *
   * Three concurrent uploads emit progress far faster than the screen refreshes,
   * and each event would otherwise re-render every row in the queue. Patches are
   * accumulated and flushed once per frame instead — the bars look identical and
   * a 200-row batch stays responsive.
   */
  const pendingProgress = useRef(new Map<string, number>());
  const frame = useRef<number | null>(null);

  const flushProgress = useCallback(() => {
    frame.current = null;
    const patches = pendingProgress.current;
    if (patches.size === 0) return;
    pendingProgress.current = new Map();
    setCandidates((prev) =>
      prev.map((entry) => {
        const value = patches.get(entry.id);
        return value === undefined ? entry : { ...entry, progress: value };
      }),
    );
  }, []);

  const onProgress = useCallback(
    (id: string, progress: number) => {
      pendingProgress.current.set(id, progress);
      if (frame.current === null) frame.current = requestAnimationFrame(flushProgress);
    },
    [flushProgress],
  );

  useEffect(() => {
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      abort.current?.abort();
    };
  }, []);

  // Closing the tab mid-batch is survivable — committed tracks stay committed —
  // but it is still worth a confirmation prompt.
  useEffect(() => {
    if (phase !== 'uploading') return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [phase]);

  /**
   * Re-triage one row after an edit, honouring a "queue anyway" decision.
   *
   * `retriage` alone would push a waved-through row straight back into the review
   * list the next time any field changed, which would make the button feel
   * broken.
   */
  const settle = useCallback((entry: Candidate): Candidate => {
    const triaged = retriage(entry);
    if (forced.current.has(entry.id) && canForceQueue(triaged)) {
      return { ...triaged, status: 'ready' };
    }
    return triaged;
  }, []);

  const editFields = useCallback(
    (ids: string[], fields: Partial<TrackFields>) => {
      const target = new Set(ids);
      setCandidates((prev) =>
        prev.map((entry) =>
          target.has(entry.id) && EDITABLE.includes(entry.status)
            ? settle({ ...entry, ...fields })
            : entry,
        ),
      );
    },
    [settle],
  );

  const applyCover = useCallback(
    (ids: string[], cover: CoverArt) => {
      const target = new Set(ids);
      setCandidates((prev) =>
        prev.map((entry) =>
          target.has(entry.id) && EDITABLE.includes(entry.status)
            ? settle({ ...entry, cover })
            : entry,
        ),
      );
    },
    [settle],
  );

  const setCover = useCallback(
    async (ids: string[], file: File) => {
      try {
        // One CoverArt for every selected row: they share a hash, so the batch
        // uploads the image once no matter how many tracks point at it.
        applyCover(ids, await loadSiblingCover(file));
      } catch {
        setError('That image could not be read.');
      }
    },
    [applyCover],
  );

  /** "Use folder name as album" — per row, since each may sit in a different folder. */
  const applyFolderAlbum = useCallback(
    (ids: string[]) => {
      const target = new Set(ids);
      setCandidates((prev) =>
        prev.map((entry) => {
          if (!target.has(entry.id) || !EDITABLE.includes(entry.status)) return entry;
          const album = folderName(entry.relativePath);
          return album ? settle({ ...entry, album }) : entry;
        }),
      );
    },
    [settle],
  );

  const queueAnyway = useCallback((ids: string[]) => {
    for (const id of ids) forced.current.add(id);
    const target = new Set(ids);
    setCandidates((prev) =>
      prev.map((entry) =>
        target.has(entry.id) && entry.status === 'review' && canForceQueue(entry)
          ? // Flags are kept deliberately: the queue row should still say what was
            // missing, even though it is going up anyway.
            { ...entry, status: 'ready' }
          : entry,
      ),
    );
  }, []);

  const removeRows = useCallback((ids: string[]) => {
    const target = new Set(ids);
    for (const id of ids) forced.current.delete(id);
    setCandidates((prev) => prev.filter((entry) => !target.has(entry.id)));
  }, []);

  /**
   * Ask the server what it already has, and mark those rows off.
   *
   * Only the newly parsed rows are checked — anything from an earlier drop has
   * been through this already. Cover answers are merged rather than replaced for
   * the same reason.
   */
  const runPreflight = useCallback(async (rows: Candidate[]) => {
    const trackHashes = [...new Set(rows.map((row) => row.contentHash).filter(Boolean))];
    const coverHashes = [
      ...new Set(rows.map((row) => row.cover?.hash).filter((hash): hash is string => Boolean(hash))),
    ];
    if (trackHashes.length === 0 && coverHashes.length === 0) return;

    const result = await preflight(trackHashes, coverHashes);
    knownCovers.current = { ...knownCovers.current, ...result.known_covers };

    const existing = new Set(result.existing_tracks);
    if (existing.size === 0) return;

    setCandidates((prev) =>
      prev.map((entry) =>
        EDITABLE.includes(entry.status) && existing.has(entry.contentHash)
          ? { ...entry, status: 'duplicate', progress: 100 }
          : entry,
      ),
    );
  }, []);

  const handleFiles = useCallback(
    async (raw: RawFile[]) => {
      setError(null);
      setSummary(null);
      if (raw.length === 0) return;

      if (!isSecureContextAvailable()) {
        setError(
          'Hashing needs a secure context. Open this over https or on localhost — on a plain http LAN address the browser withholds crypto.subtle.',
        );
        return;
      }

      const audio = raw.filter((entry) => isAudioFile(entry.file));
      // Built from everything, not just the audio: cover.jpg is exactly the sort
      // of file that gets filtered out above and is still wanted.
      const siblingCovers = indexSiblingCovers(raw);
      const skipped = raw.length - audio.length;

      if (audio.length === 0) {
        setNotice(`Nothing to ingest — none of those ${raw.length} files look like audio.`);
        return;
      }
      setNotice(
        skipped > 0
          ? `${skipped} non-audio ${plural(skipped, 'file')} skipped; any cover art among them is still used.`
          : null,
      );

      const controller = new AbortController();
      abort.current = controller;
      setPhase('parsing');
      setParseProgress({ done: 0, total: audio.length });

      const requests: ParseRequest[] = audio.map((entry) => ({
        id: crypto.randomUUID(),
        file: entry.file,
        relativePath: entry.relativePath,
      }));
      const byId = new Map(requests.map((request) => [request.id, request]));

      const built: Candidate[] = [];
      const builds: Promise<void>[] = [];
      let settled = 0;

      try {
        // Results stream in as each worker finishes, so rows appear while the rest
        // of the folder is still being read.
        await parseFiles(
          requests,
          (response) => {
            const request = byId.get(response.id);
            if (!request) return;
            builds.push(
              buildCandidate(request, response, siblingCovers).then((candidate) => {
                built.push(candidate);
                setParseProgress({ done: ++settled, total: audio.length });
                setCandidates((prev) =>
                  // The same bytes twice in one session — dropping a folder that is
                  // already in the batch — collapse here, rather than becoming two
                  // rows racing for one content hash at commit time.
                  prev.some(
                    (entry) => entry.contentHash && entry.contentHash === candidate.contentHash,
                  )
                    ? prev
                    : [...prev, candidate].sort(byPath),
                );
              }),
            );
          },
          { signal: controller.signal },
        );

        // `parseFiles` resolves when the workers are done; the per-file inference
        // it kicked off (sibling cover reads, duration probes) may not be.
        await Promise.all(builds);

        setPhase('checking');
        try {
          await runPreflight(built);
        } catch (cause) {
          setNotice(
            cause instanceof Error
              ? `Could not check for duplicates: ${cause.message}. Uploading anyway is safe — the commit is idempotent.`
              : 'Could not check for duplicates.',
          );
        }
      } finally {
        setPhase('idle');
        setParseProgress(null);
        abort.current = null;
      }
    },
    [runPreflight],
  );

  const start = useCallback(
    async (rows?: Candidate[]) => {
      const ready = (rows ?? latest.current).filter((entry) => entry.status === 'ready');
      if (ready.length === 0) return;

      const controller = new AbortController();
      abort.current = controller;
      setError(null);
      setSummary(null);
      setPhase('uploading');

      try {
        const result = await runIngest(
          ready,
          knownCovers.current,
          {
            onProgress,
            onStatus: (id, status, message) =>
              setCandidates((prev) =>
                prev.map((entry) =>
                  entry.id === id ? { ...entry, status, error: message } : entry,
                ),
              ),
            onCoverProgress: (done, total) => setCoverPhase({ done, total }),
          },
          { signal: controller.signal },
        );

        // Land the last coalesced progress frame before the bars disappear.
        flushProgress();
        setSummary(result);
        // Nothing on this page depends on server data, but the header's counts and
        // the library listing do — this saves a manual reload to see them.
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The upload failed.');
      } finally {
        setPhase('idle');
        setCoverPhase(null);
        abort.current = null;
      }
    },
    [flushProgress, onProgress, router],
  );

  const retryFailed = useCallback(() => {
    // The revived array is passed straight to `start` rather than read back from
    // state, which would still be a render behind.
    const revived = latest.current.map((entry) =>
      entry.status === 'error'
        ? { ...entry, status: 'ready' as const, error: undefined, progress: 0 }
        : entry,
    );
    setCandidates(revived);
    void start(revived);
  }, [start]);

  const clear = useCallback(() => {
    forced.current.clear();
    setCandidates([]);
    setSummary(null);
    setNotice(null);
    setError(null);
  }, []);

  const review = candidates.filter((entry) => entry.status === 'review');
  const queued = candidates.filter((entry) => entry.status !== 'review');
  const busy = phase !== 'idle';

  return (
    <div className="flex flex-col gap-6">
      <FilePicker onFiles={handleFiles} busy={busy} />

      {phase === 'parsing' && parseProgress ? (
        <p className="text-sm text-muted">
          Reading tags — {parseProgress.done} of {parseProgress.total}. Nothing is
          uploaded yet.
        </p>
      ) : null}

      {phase === 'checking' ? (
        <p className="text-sm text-muted">Asking the library what it already has…</p>
      ) : null}

      {notice ? <p className="text-sm text-muted-dim">{notice}</p> : null}

      {error ? (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <ReviewGrid
        candidates={review}
        onEdit={editFields}
        onCover={setCover}
        onFolderAlbum={applyFolderAlbum}
        onQueueAnyway={queueAnyway}
        onRemove={removeRows}
      />

      <UploadQueue
        candidates={queued}
        coverPhase={coverPhase}
        summary={summary}
        running={phase === 'uploading'}
        onStart={() => void start()}
        onAbort={() => abort.current?.abort()}
        onRetryFailed={retryFailed}
        onClear={clear}
      />
    </div>
  );
}
