/**
 * Inline icons.
 *
 * Hand-rolled rather than an icon package: the set is small and fixed, and an
 * icon library would be the largest dependency in the project for the sake of
 * fifteen paths. All of them inherit `currentColor` and size from `className`.
 */

type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'size-5'}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function PlayIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? 'size-5'} aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11.14-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

export function PauseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? 'size-5'} aria-hidden="true">
      <path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" />
    </svg>
  );
}

export function SkipBackIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? 'size-5'} aria-hidden="true">
      <path d="M6 5h2v14H6zM20 5.7v12.6a1 1 0 0 1-1.55.83l-9-6.3a1 1 0 0 1 0-1.66l9-6.3A1 1 0 0 1 20 5.7Z" />
    </svg>
  );
}

export function SkipForwardIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? 'size-5'} aria-hidden="true">
      <path d="M16 5h2v14h-2zM4 5.7v12.6a1 1 0 0 0 1.55.83l9-6.3a1 1 0 0 0 0-1.66l-9-6.3A1 1 0 0 0 4 5.7Z" />
    </svg>
  );
}

export function ShuffleIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M16 3h5v5" />
      <path d="M4 20 21 3" />
      <path d="M21 16v5h-5" />
      <path d="M15 15l6 6" />
      <path d="M4 4l5 5" />
    </Svg>
  );
}

export function RepeatIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </Svg>
  );
}

export function RepeatOneIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
      <path d="M11 10h1v5" />
    </Svg>
  );
}

export function VolumeIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </Svg>
  );
}

export function VolumeMutedIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="m16 9 5 6" />
      <path d="m21 9-5 6" />
    </Svg>
  );
}

export function HeartIcon({ className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'size-5'}
      aria-hidden="true"
    >
      <path d="M12 20.5s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 8.3a4.4 4.4 0 0 1 7.5 2.6c0 5-7.5 9.6-7.5 9.6Z" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M9 7V4h6v3" />
    </Svg>
  );
}

export function MusicIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 18V6l11-2v12" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </Svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </Svg>
  );
}

export function UploadIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Svg>
  );
}

export function FolderIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Svg>
  );
}

export function GripIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? 'size-5'} aria-hidden="true">
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m5 13 4 4L19 7" />
    </Svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function ChevronUpIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m6 15 6-6 6 6" />
    </Svg>
  );
}

/** Three list lines and a play glyph: what is queued, and that it is playable. */
export function QueueIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 7h11M4 12h11M4 17h7" />
      <path d="M16.5 13.5v7l5-3.5z" />
    </Svg>
  );
}

/** Arrow pointing down into a tray — "save for offline". */
export function DownloadIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Svg>
  );
}

/** Checkmark inside a tray — "already saved offline". */
export function DownloadedIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m7 11 3 3 7-7" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Svg>
  );
}

export function AlertIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </Svg>
  );
}

/**
 * Indeterminate work. CSS-animated so it costs nothing to keep on screen.
 *
 * `data-motion-keep` exempts it from the reduced-motion sweep in `globals.css`:
 * this animation carries information rather than decoration, and a spinner that
 * stops spinning is a broken loading indicator, not a calmer one.
 */
export function SpinnerIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`${className ?? 'size-5'} animate-spin`}
      aria-hidden="true"
      data-motion-keep
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
