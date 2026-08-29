/**
 * The block every page opens with: title, one line of context, actions on the
 * right. Six pages had written it out identically, which is what made lifting it
 * safe — nothing had drifted yet.
 *
 * No optional `CoverBackdrop` here, despite the plan floating one. The backdrop is
 * already mounted once in the root layout, fixed behind the whole document, so
 * album art is behind these headers as it is. A second instance per header would
 * mean a second blur layer painting the same image for no visible difference — and
 * on `/search` it would put the *now-playing* cover behind an unrelated title.
 */

export function PageHeader({
  title,
  subtitle,
  actions,
  /** Truncate long titles — user-supplied playlist names, in practice. */
  truncate,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  truncate?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1
          className={`font-display text-display font-semibold text-white${truncate ? ' truncate' : ''}`}
        >
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        {children}
      </div>

      {actions}
    </div>
  );
}
