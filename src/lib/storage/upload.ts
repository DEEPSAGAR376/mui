/**
 * One upload call, either provider.
 *
 * The whole point of this module is that `run.ts` never branches on provider
 * again after selection: both paths return the same `UploadResult`, so the
 * commit payload is assembled identically whichever service took the bytes.
 *
 * Client-only — it reaches for `XMLHttpRequest` and the UploadThing browser
 * client.
 */

import { uploadFiles } from '@/lib/uploadthing';
import { uploadToSupabase } from './supabaseUpload';
import type { Bucket, Provider, UploadResult } from './provider';

export interface UploadOneHandlers {
  onProgress?: (progress: number) => void;
}

export interface UploadOneOptions {
  /** Object path for Supabase. Ignored by UploadThing, which mints its own key. */
  key: string;
  signal?: AbortSignal;
}

const ENDPOINTS = {
  audio: 'audioUploader',
  covers: 'coverUploader',
} as const;

export async function uploadOne(
  bucket: Bucket,
  file: File,
  provider: Provider,
  handlers: UploadOneHandlers = {},
  options: UploadOneOptions,
): Promise<UploadResult> {
  if (provider === 'supabase') {
    return uploadToSupabase(file, bucket, options.key, handlers, options.signal);
  }

  const [uploaded] = await uploadFiles(ENDPOINTS[bucket], {
    files: [file],
    signal: options.signal,
    onUploadProgress: ({ progress }) => handlers.onProgress?.(progress),
  });
  return { url: uploaded.ufsUrl, key: uploaded.key, provider: 'uploadthing' };
}

/** `<hash>.<ext>` — content-addressed, so a re-upload overwrites rather than duplicates. */
export function objectPath(hash: string, fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const ext = dot === -1 ? 'bin' : fileName.slice(dot + 1).toLowerCase();
  return `${hash}.${ext.replace(/[^a-z0-9]/g, '') || 'bin'}`;
}
