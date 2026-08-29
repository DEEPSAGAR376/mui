/**
 * "There is nothing here" — the dashed panel three lists reach for.
 *
 * `icon` has no default. A `MusicIcon` is right above "no tracks yet" and wrong
 * above "playlists you create live here", and a shared component guessing at that
 * is worse than the call site saying it.
 */

export function EmptyState({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-ink-700 px-6 py-12 text-center">
      {icon ? <span className="text-muted-dim">{icon}</span> : null}
      <p className="max-w-sm text-sm text-muted-dim">{children}</p>
    </div>
  );
}
