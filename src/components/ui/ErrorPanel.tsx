'use client';

/**
 * The body of every `error.tsx` in the app.
 *
 * Why the boundaries exist at all: before them, a failed query bubbled past the
 * root layout — which is where `PlayerProvider` and its `<audio>` element live —
 * so one bad request tore down playback. An `error.tsx` under the layout replaces
 * only the page beneath it, so the header, the player bar and whatever is playing
 * all survive the failure. That is the actual feature here; the panel is just
 * what fills the hole.
 *
 * `retry`, not `reset`. `retry()` re-fetches and re-renders the boundary's
 * children, which is what recovers a failed query; `reset()` only clears the
 * error state and re-renders with the same data, so it would bounce straight back
 * to this panel. (`reset` is still passed by the runtime — it is simply the wrong
 * one to reach for here.)
 *
 * `error.message` is deliberately not shown. Server-side messages are redacted in
 * production and replaced by a `digest`, so printing the message would show
 * developers a stack-adjacent string and everyone else a generic sentence. The
 * digest is the thing worth surfacing: it is the handle that matches this failure
 * to a server log line.
 */

import { AlertIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';

export function ErrorPanel({
  title,
  description,
  digest,
  retry,
}: {
  title: string;
  description: string;
  digest?: string;
  retry: () => void;
}) {
  return (
    <div className="glass flex flex-col items-center gap-4 rounded-2xl border border-hairline px-6 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-danger/15 text-danger">
        <AlertIcon className="size-6" />
      </span>

      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
        <p className="max-w-sm text-sm text-muted">{description}</p>
      </div>

      {/* No "back to the library" link beside it, on purpose: this boundary sits
          under the root layout, so the header's nav is still on screen and still
          works. A second way home would be the third one. */}
      <Button variant="primary" onClick={() => retry()}>
        Try again
      </Button>

      {digest ? (
        <p className="text-xs text-muted-dim">
          Reference <span className="font-mono tabular-nums">{digest}</span>
        </p>
      ) : null}
    </div>
  );
}
