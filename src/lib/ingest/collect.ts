/**
 * Getting files out of the browser, folders included.
 *
 * Two entry points, because the two ways a user hands over a folder have nothing
 * in common:
 *
 *   · `<input type="file" webkitdirectory>` yields a flat FileList where each
 *     File carries `webkitRelativePath`
 *   · a drag-and-drop gives DataTransferItems that must be walked recursively
 *     through the non-standard-but-universal `webkitGetAsEntry()` API, building
 *     the relative path by hand as you descend
 *
 * The relative path is not incidental — it is what folder-based inference reads
 * to recover artist and album for untagged files.
 */

export interface RawFile {
  file: File;
  /** Path relative to the dropped root, forward-slashed. Bare name if unknown. */
  relativePath: string;
}

/** From a directory or multiple-file `<input>`. */
export function collectFromInput(files: FileList | null): RawFile[] {
  if (!files) return [];
  return Array.from(files).map((file) => ({
    file,
    // webkitRelativePath is '' for a plain multi-file selection.
    relativePath: file.webkitRelativePath || file.name,
  }));
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const entries: FileSystemEntry[] = [];
    // readEntries yields at most 100 per call and signals completion with an
    // empty batch. Calling it once — the obvious mistake here — silently
    // truncates any album folder with more than 100 files.
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(entries);
          return;
        }
        entries.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

function fileFromEntry(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(resolve, () => resolve(null));
  });
}

async function walk(entry: FileSystemEntry, prefix: string, out: RawFile[]): Promise<void> {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;

  if (entry.isFile) {
    const file = await fileFromEntry(entry as FileSystemFileEntry);
    // A null file is a permission or transient-read failure on one entry; skip it
    // rather than aborting the whole drop.
    if (file) out.push({ file, relativePath: path });
    return;
  }

  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children = await readAllEntries(reader);
    // Sequential, not Promise.all: a deep library tree would otherwise open
    // thousands of directory readers at once.
    for (const child of children) {
      await walk(child, path, out);
    }
  }
}

/**
 * From a drop event's DataTransfer.
 *
 * The synchronous first pass is mandatory. `DataTransferItemList` is emptied as
 * soon as the drop handler yields, so every `webkitGetAsEntry()` has to be called
 * before the first `await` — collect the entries, then recurse.
 */
export async function collectFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<RawFile[]> {
  const entries: FileSystemEntry[] = [];
  const looseFiles: File[] = [];

  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry();
    if (entry) {
      entries.push(entry);
    } else {
      // No entry API available for this item; a plain file is still recoverable.
      const file = item.getAsFile();
      if (file) looseFiles.push(file);
    }
  }

  const out: RawFile[] = looseFiles.map((file) => ({ file, relativePath: file.name }));
  for (const entry of entries) {
    await walk(entry, '', out);
  }

  // Fallback for browsers that gave us neither entries nor items.
  if (out.length === 0 && dataTransfer.files.length > 0) {
    return collectFromInput(dataTransfer.files);
  }

  return out;
}
