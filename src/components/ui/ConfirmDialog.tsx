'use client';

/**
 * The destructive confirmation, in one place.
 *
 * Two things in the app are unrecoverable — deleting a track, which also sweeps
 * the audio out of storage, and deleting a playlist — and both asked "are you
 * sure" with an inline banner: no focus move, no Escape, no announcement. In
 * `TrackAdminList` the banner rendered at the *top* of the screen while focus
 * stayed on the row you clicked, which on a two-thousand-track library is several
 * screens down. The warning was, for anyone not using a mouse, invisible.
 *
 * ## Why a native `<dialog>`, again
 *
 * Same reasoning as `NowPlaying`: `showModal()` supplies the focus trap, Escape,
 * focus restoration to the trigger and the top layer, and there is no portal or
 * modal utility in this project to reuse. Two deliberate differences from that
 * file, both about the role:
 *
 * - **`role="alertdialog"`**, overriding the element's implicit `role="dialog"`.
 *   That is the role for a dialog interrupting to confirm something
 *   consequential, and it is what makes AT read the message on open rather than
 *   just the dialog's name.
 * - **`aria-modal="true"` *is* set here**, which `NowPlaying` deliberately omits.
 *   It is redundant there because HTML-AAM maps a modal `<dialog>` to
 *   `role=dialog` *with* `aria-modal=true` — but that mapping describes the
 *   implicit role, and this file replaces the role. Declaring it keeps the
 *   modality attached to the role actually exposed.
 *
 * ## Two details that are load-bearing
 *
 * **Focus goes to the safe action**, so Enter on arrival cancels rather than
 * deletes. `showModal()` focuses the first focusable child otherwise, and
 * `autoFocus` is not dependable for this: React focuses imperatively on mount
 * while the browser focuses during `showModal()`, and the order between them is
 * not something to hang a delete button on. One `.focus()` after the open is.
 *
 * **No margin utility.** The UA sheet centres a modal dialog with `inset: 0` plus
 * `margin: auto`, and — checked in `node_modules/tailwindcss/preflight.css`, which
 * contains no `dialog` rule at all — Tailwind does not reset it. So the centring
 * is inherited and `m-0` would destroy it. `max-w-none` *is* needed: the UA's
 * `max-width: calc(100% - 6px - 2em)` would otherwise clamp the width below.
 */

import { useEffect, useId, useRef } from 'react';
import { Button } from '@/components/ui/Button';

export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  cancelLabel = 'Cancel',
  pending = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Disables the destructive button while the action is in flight. */
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** The consequences, in prose. Becomes the dialog's accessible description. */
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const safeRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      safeRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      // Escape fires `cancel`, which would close the element directly and strand
      // the caller's `open` at true. Going through state keeps one source of
      // truth for open/closed, exactly as in `NowPlaying`.
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="w-[min(30rem,calc(100vw-2rem))] max-w-none rounded-2xl bg-transparent p-0 text-fg outline-none backdrop:bg-ink-950/70 backdrop:backdrop-blur-sm"
    >
      {/* Mounted only while open, so the description is not in the a11y tree of a
          closed dialog and `useId` still gives it a stable id when it returns. */}
      {open ? (
        <div className="glass flex flex-col gap-3 rounded-2xl border border-danger/30 p-5">
          <h2 id={`${id}-title`} className="font-display text-base font-semibold text-white">
            {title}
          </h2>

          <p id={`${id}-body`} className="text-sm text-muted">
            {children}
          </p>

          <div className="mt-1 flex items-center justify-end gap-2">
            <Button ref={safeRef} variant="secondary" size="sm" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button variant="danger" size="sm" disabled={pending} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
