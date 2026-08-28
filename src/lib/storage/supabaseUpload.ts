/**
 * Supabase Storage upload with real progress.
 *
 * `supabase.storage.from(...).upload()` emits no progress events at all — it is
 * a single `fetch`. The upload screen coalesces per-file `onProgress(id, pct)`
 * callbacks into row-level bars, so going through the SDK would leave every
 * Supabase-bound row frozen at 0% until it snapped to 100%.
 *
 * So: the server mints a one-shot signed upload URL (see
 * `@/lib/actions/storage`), and the bytes go up over `XMLHttpRequest`, whose
 * `upload.onprogress` supplies the numbers the UI already knows how to consume.
 * `fetch` cannot do this — request-body progress is still not a thing.
 *
 * The signed token is the authorization, so the browser session never needs
 * write access to `storage.objects` and the service-role key is nowhere near
 * this path.
 */

import type { Bucket, UploadResult } from './provider';
import { signUpload } from '@/lib/actions/storage';

export interface SupabaseUploadHandlers {
  onProgress?: (progress: number) => void;
}

export class UploadAbortedError extends Error {
  constructor() {
    super('upload aborted');
    this.name = 'UploadAbortedError';
  }
}

/**
 * Send one file to a Supabase bucket under `path`.
 *
 * `path` is expected to be content-addressed (`<sha256>.<ext>`), which makes the
 * upload naturally idempotent: re-uploading identical bytes overwrites itself
 * rather than accumulating copies. `x-upsert` is on for that reason — without
 * it a retry after a half-failed batch would 409 on every file that did land.
 */
export function uploadToSupabase(
  file: File,
  bucket: Bucket,
  path: string,
  handlers: SupabaseUploadHandlers = {},
  signal?: AbortSignal,
): Promise<UploadResult> {
  return new Promise<UploadResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadAbortedError());
      return;
    }

    signUpload(bucket, path).then(
      ({ signedUrl, publicUrl }) => {
        if (signal?.aborted) {
          reject(new UploadAbortedError());
          return;
        }

        const xhr = new XMLHttpRequest();

        const onAbort = () => xhr.abort();
        signal?.addEventListener('abort', onAbort, { once: true });
        const cleanup = () => signal?.removeEventListener('abort', onAbort);

        xhr.open('PUT', signedUrl, true);
        // Empty for .flac/.opus/.m4a in most browsers, and the endpoint requires
        // something — octet-stream keeps the upload from being rejected outright.
        xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
        xhr.setRequestHeader('cache-control', 'max-age=31536000');
        xhr.setRequestHeader('x-upsert', 'true');

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          handlers.onProgress?.(Math.round((event.loaded / event.total) * 100));
        };

        xhr.onload = () => {
          cleanup();
          if (xhr.status >= 200 && xhr.status < 300) {
            handlers.onProgress?.(100);
            resolve({ url: publicUrl, key: path, provider: 'supabase' });
          } else {
            reject(new Error(`Supabase Storage refused the upload (${xhr.status}): ${xhr.responseText.slice(0, 200)}`));
          }
        };
        xhr.onerror = () => {
          cleanup();
          reject(new Error('Supabase Storage upload failed'));
        };
        xhr.onabort = () => {
          cleanup();
          reject(new UploadAbortedError());
        };

        xhr.send(file);
      },
      (cause) => reject(cause instanceof Error ? cause : new Error('could not sign upload')),
    );
  });
}
