/**
 * The mass-upload screen.
 *
 * The server half is only the accounting line — everything about the ingest
 * itself happens in the browser, because that is where the files are. Tags are
 * parsed, artwork extracted and hashes computed locally, so the server is never
 * asked to accept a file it already has.
 */

import { formatBytes, plural } from '@/lib/format';
import { librarySize, quotaUsage } from '@/lib/data/storage';
import { UploadManager } from '@/components/upload/UploadManager';

export default async function UploadPage() {
  const [library, quota] = await Promise.all([librarySize(), quotaUsage()]);

  const percent =
    quota && quota.limitBytes > 0
      ? Math.min(100, Math.round((quota.appTotalBytes / quota.limitBytes) * 100))
      : null;

  // Bytes UploadThing is holding that no track row accounts for. Covers make the
  // two numbers differ legitimately, so this is only a signal above the noise —
  // `prune_orphans()` is what actually reconciles them.
  const unaccounted = quota ? quota.appTotalBytes - library.bytes : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Upload</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Drop a folder. Tags, cover art and durations are read out of the files
            themselves; anything the tags don&apos;t answer is guessed from the filename
            and folder names. Only what is still incomplete reaches the review grid.
          </p>
        </div>

        <dl className="flex gap-6 text-right text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-dim">In the library</dt>
            <dd className="text-white">
              {library.tracks} {plural(library.tracks, 'track')} · {formatBytes(library.bytes)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-dim">Storage used</dt>
            <dd className="text-white">
              {quota
                ? `${formatBytes(quota.appTotalBytes)} of ${formatBytes(quota.limitBytes)}${
                    percent === null ? '' : ` (${percent}%)`
                  }`
                : 'unavailable'}
            </dd>
          </div>
        </dl>
      </div>

      {quota && percent !== null ? (
        <div>
          <div className="h-1 overflow-hidden rounded-full bg-ink-800">
            <div
              className={`h-full rounded-full ${percent > 90 ? 'bg-danger' : 'bg-accent'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-dim">
            {quota.filesUploaded} {plural(quota.filesUploaded, 'file')} stored, covering{' '}
            {library.covers} {plural(library.covers, 'album cover')}.
            {unaccounted > 1024 * 1024
              ? ` ${formatBytes(unaccounted)} is not accounted for by track rows — cover art plus anything orphaned by a deletion that failed its storage sweep.`
              : ''}
          </p>
        </div>
      ) : null}

      <UploadManager />
    </div>
  );
}
