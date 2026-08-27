'use client';

/**
 * The drop target and the two file inputs behind it.
 *
 * Three ways in, because people reach for different ones: drag a folder from the
 * file manager, pick a folder through the OS dialog, or select loose files. All
 * three end up as `RawFile[]` with a relative path attached, which is what
 * folder-based inference needs — see `collect.ts` for why a drop and a directory
 * input have nothing in common under the hood.
 */

import { useEffect, useRef, useState } from 'react';
import { collectFromDataTransfer, collectFromInput, type RawFile } from '@/lib/ingest/collect';
import { FolderIcon, SpinnerIcon, UploadIcon } from '@/components/icons';

interface FilePickerProps {
  onFiles: (files: RawFile[]) => void;
  busy?: boolean;
}

export function FilePicker({ onFiles, busy = false }: FilePickerProps) {
  const [dragging, setDragging] = useState(false);
  const dirInput = useRef<HTMLInputElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  /** Nested dragenter/dragleave pairs fire constantly; count them instead of
   *  toggling, or the highlight flickers as the pointer crosses child elements. */
  const depth = useRef(0);

  // `webkitdirectory` is set imperatively: it is non-standard, so React's JSX
  // types don't know it, and every browser that matters still needs it to turn a
  // file input into a folder picker.
  useEffect(() => {
    const input = dirInput.current;
    if (!input) return;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
  }, []);

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        // Without this the browser opens the file instead of firing `drop`.
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        depth.current -= 1;
        if (depth.current <= 0) {
          depth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        if (busy) return;
        // Read the DataTransfer synchronously — `collectFromDataTransfer` calls
        // every `webkitGetAsEntry()` before its first await for the same reason.
        void collectFromDataTransfer(event.dataTransfer).then(onFiles);
      }}
      className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
        dragging ? 'border-accent bg-accent/5' : 'border-ink-800 bg-ink-900/40'
      }`}
    >
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        <span className="text-muted-dim">
          {busy ? <SpinnerIcon className="size-7" /> : <UploadIcon className="size-7" />}
        </span>

        <p className="text-sm text-muted">
          Drop a folder here. Sub-folders, cover images and whatever else is in there
          are all fine — only audio gets queued.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => dirInput.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-ink-950 transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <FolderIcon className="size-4" />
            Choose a folder
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-muted transition-colors hover:border-ink-600 hover:text-white disabled:opacity-40"
          >
            Choose files
          </button>
        </div>
      </div>

      {/* Both inputs clear their value after each pick, so choosing the same
          folder twice in a row still fires `change`. */}
      <input
        ref={dirInput}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          onFiles(collectFromInput(event.target.files));
          event.target.value = '';
        }}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        accept="audio/*,.mp3,.flac,.m4a,.ogg,.opus,.wav,.aiff,.wma"
        hidden
        onChange={(event) => {
          onFiles(collectFromInput(event.target.files));
          event.target.value = '';
        }}
      />
    </div>
  );
}
