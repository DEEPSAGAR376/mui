/**
 * The small round transport button, shared by the collapsed bar and the expanded
 * now-playing sheet.
 *
 * Extracted into its own module rather than exported from `PlayerBar`, because
 * `PlayerBar` imports `NowPlaying` — importing it back the other way would make
 * a cycle.
 *
 * `active` has no default, and that is deliberate: `aria-pressed={undefined}`
 * renders no attribute at all, whereas defaulting it to `false` would stamp
 * `aria-pressed="false"` onto ordinary buttons like previous and next and
 * announce every one of them as an un-pressed toggle.
 */

export function IconButton({
  label,
  active,
  onClick,
  className,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`rounded-full p-2 transition-colors duration-fast ${
        active ? 'text-accent-bright' : 'text-muted hover:text-white'
      } ${className ?? ''}`}
    >
      {children}
    </button>
  );
}
