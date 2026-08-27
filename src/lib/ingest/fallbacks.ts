/**
 * Metadata inference for files whose tags fall short.
 *
 * This module is what keeps the review grid small. A folder of untagged rips
 * would otherwise send every row to a human; filename and folder conventions
 * recover most of it, and the grid ends up holding only the genuinely ambiguous
 * files. Everything here is a guess, so it only ever fills a field the tags left
 * empty — inference never overwrites a real tag.
 */

/** Containers `music-metadata` can read. Anything else is skipped, not flagged. */
const AUDIO_EXTENSIONS = new Set([
  'mp3', 'flac', 'm4a', 'm4b', 'mp4', 'aac', 'ogg', 'oga', 'opus', 'wav',
  'wma', 'aiff', 'aif', 'aifc', 'ape', 'wv', 'mka', 'mpc', 'dsf', 'dff',
  'spx', 'tta', 'alac',
]);

const COVER_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']);

/** Sibling image filenames worth trusting as album art, best first. */
const COVER_BASENAMES = [
  'cover', 'folder', 'front', 'albumart', 'album', 'artwork', 'thumb', 'sleeve',
];

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? name : name.slice(0, dot);
}

/**
 * Extension, not MIME type. Browsers report an empty `file.type` for .flac,
 * .opus and .m4a often enough that a MIME check would silently drop real music.
 */
export function isAudioFile(file: File): boolean {
  return AUDIO_EXTENSIONS.has(extensionOf(file.name));
}

export function isImageFile(file: File): boolean {
  return COVER_EXTENSIONS.has(extensionOf(file.name));
}

/** Directory portion of a relative path; '' for a loose file. */
export function directoryOf(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  return slash === -1 ? '' : normalized.slice(0, slash);
}

/** Path segments, empty ones dropped. */
function segments(relativePath: string): string[] {
  return relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
}

/** Underscores-as-spaces and doubled spaces, which rippers leave everywhere. */
function tidy(value: string): string {
  return value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface FilenameGuess {
  trackNo: number | null;
  title: string | null;
  artist: string | null;
}

/**
 * Read what the filename encodes.
 *
 * Handles, in order of specificity:
 *   "03 - Artist - Title"   -> all three
 *   "03 - Title" / "03. Title" / "03 Title"
 *   "Artist - Title"
 *   "Title"
 *
 * The leading-number rule is capped at three digits so a title that opens with a
 * year ("1979" by Smashing Pumpkins) is not read as track 1979. Two digits is
 * the overwhelming convention; three covers box sets that number 101 onward.
 */
export function guessFromFilename(fileName: string): FilenameGuess {
  const base = tidy(stripExtension(fileName));
  const empty: FilenameGuess = { trackNo: null, title: null, artist: null };
  if (!base) return empty;

  // Leading track number, followed by a separator that is not part of a word.
  const numbered = base.match(/^(\d{1,3})\s*[-–.)_]\s*(.+)$/);
  let trackNo: number | null = null;
  let rest = base;
  if (numbered) {
    trackNo = Number(numbered[1]);
    rest = numbered[2].trim();
  } else {
    // "03 Title" — bare space. Only when what follows doesn't start with a digit,
    // so "01 2 3" style oddities don't get mangled.
    const spaced = base.match(/^(\d{1,3})\s+(\D.*)$/);
    if (spaced) {
      trackNo = Number(spaced[1]);
      rest = spaced[2].trim();
    }
  }

  // "Artist - Title" in whatever remains. Split on the FIRST dash only: titles
  // contain dashes far more often than artist names do.
  const dashed = rest.match(/^(.+?)\s+[-–]\s+(.+)$/);
  if (dashed) {
    return { trackNo, artist: tidy(dashed[1]) || null, title: tidy(dashed[2]) || null };
  }

  return { trackNo, title: rest || null, artist: null };
}

export interface PathGuess {
  artist: string | null;
  album: string | null;
  discNo: number | null;
}

/**
 * Read the folder structure — `webkitRelativePath`, which a directory picker or
 * a folder drop both provide.
 *
 * ".../Artist/Album/track.mp3" is the layout nearly every library uses, so the
 * last directory is the album and the one above it is the artist. Two extra
 * cases are worth handling because they are so common:
 *
 *   · "Artist - Album" as a single folder name, from one-level-deep libraries
 *   · "CD2" / "Disc 2" as the innermost folder, which is a disc number rather
 *     than an album name; the album is then the folder above it
 */
export function guessFromPath(relativePath: string): PathGuess {
  const parts = segments(relativePath);
  // Drop the filename.
  parts.pop();
  const result: PathGuess = { artist: null, album: null, discNo: null };
  if (parts.length === 0) return result;

  let albumIndex = parts.length - 1;

  const discMatch = parts[albumIndex].match(/^(?:cd|disc|disk)\s*[-_]?\s*(\d{1,2})$/i);
  if (discMatch) {
    result.discNo = Number(discMatch[1]);
    albumIndex -= 1;
    if (albumIndex < 0) return result;
  }

  const folder = tidy(parts[albumIndex]);
  const split = folder.match(/^(.+?)\s+[-–]\s+(.+)$/);
  if (split && albumIndex === 0) {
    // Only trust "Artist - Album" when there is no parent folder to read the
    // artist from — otherwise a legitimately hyphenated album title would lose
    // its first half.
    result.artist = tidy(split[1]) || null;
    result.album = tidy(split[2]) || null;
  } else {
    result.album = folder || null;
    if (albumIndex > 0) result.artist = tidy(parts[albumIndex - 1]) || null;
  }

  // A leading year on the album folder — "1998 - OK Computer", "(1998) Album".
  if (result.album) {
    const dated = result.album.match(/^\(?(\d{4})\)?\s*[-–.]?\s+(.+)$/);
    if (dated) result.album = tidy(dated[2]) || result.album;
  }

  return result;
}

/**
 * Pick one cover image per directory from the non-audio files in a drop.
 *
 * Ranked by filename, because a folder often holds several images —
 * cover.jpg alongside back.jpg and scan001.jpg — and "back" is the one thing you
 * definitely don't want as the album art. Anything unrecognized is kept as a
 * last resort at the bottom of the ranking, which handles "AlbumArt_{GUID}.jpg"
 * from Windows Media Player and similar.
 */
export function indexSiblingCovers(
  files: { file: File; relativePath: string }[],
): Map<string, File> {
  const best = new Map<string, { rank: number; file: File }>();

  for (const { file, relativePath } of files) {
    if (!isImageFile(file)) continue;

    const base = stripExtension(file.name).toLowerCase();
    // Explicitly reject the ones that are never the front cover.
    if (/\b(back|rear|inlay|cd|disc|booklet|inside|scan)\b/.test(base)) continue;

    let rank = COVER_BASENAMES.findIndex((name) => base === name);
    if (rank === -1) rank = COVER_BASENAMES.findIndex((name) => base.includes(name));
    if (rank === -1) rank = COVER_BASENAMES.length;

    const dir = directoryOf(relativePath);
    const current = best.get(dir);
    if (!current || rank < current.rank) best.set(dir, { rank, file });
  }

  return new Map([...best].map(([dir, { file }]) => [dir, file]));
}

/**
 * Duration from the browser's own decoder, for formats where the tag doesn't
 * carry one.
 *
 * Last resort: it costs a decode pass and only works for containers the browser
 * can play, so a WMA or APE file still comes out null. Times out rather than
 * hanging a batch on one bad file.
 */
export function probeDuration(file: File, timeoutMs = 5000): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';

    let done = false;
    const finish = (value: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    audio.onloadedmetadata = () => {
      const { duration } = audio;
      // Infinity is what a stream-like or seek-less source reports.
      finish(Number.isFinite(duration) && duration > 0 ? duration : null);
    };
    audio.onerror = () => finish(null);

    audio.src = url;
  });
}
