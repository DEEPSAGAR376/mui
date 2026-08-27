/**
 * Typed UploadThing client helpers.
 *
 * `genUploader` rather than `@uploadthing/react`'s `useUploadThing` hook, and
 * that is a deliberate trade. The hook's `onUploadProgress` is aggregate — a
 * single `(p: number) => void` for the whole batch — whereas `uploadFiles`
 * reports per file: `{ file, progress, loaded, delta, totalLoaded,
 * totalProgress }`. A mass-upload screen needs the per-file numbers to show a
 * row-level bar, so the hook cannot express this UI.
 *
 * `createUpload` is the same thing plus pause/resume/abort handles, kept for the
 * queue controls.
 */

import { genUploader } from 'uploadthing/client';
import type { OurFileRouter } from '@/app/api/uploadthing/core';

export const { uploadFiles, createUpload, routeRegistry } = genUploader<OurFileRouter>();
