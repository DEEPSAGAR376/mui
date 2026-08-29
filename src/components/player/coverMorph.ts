/**
 * The shared-element morph between the bar's thumbnail and the sheet's cover,
 * hand-rolled on the Web Animations API.
 *
 * ## Why not a library
 *
 * This replaces `motion`'s `layoutId`, which was 42 KB gzipped on *every* route —
 * `PlayerBar` lives in the root layout, so none of it was code-split away — in
 * exchange for one animation. FLIP is two `getBoundingClientRect()` calls and one
 * `element.animate()`; the rest of that bundle was never reached.
 *
 * It also settles the question the UI plan flagged as unverified: whether a
 * `layoutId` pair behaves when one half of it is in the **top layer**, where
 * `showModal()` puts it. Measuring two rectangles and transforming a real element
 * does not know the top layer exists.
 *
 * ## Reduced motion
 *
 * Checked here rather than in CSS, and that is not redundancy. The lever in
 * `globals.css` works by overriding `--default-transition-duration` and forcing
 * `animation-duration`; a script-driven WAAPI animation reads neither.
 */

/** Matches `--transition-duration-sheet` and `--ease-glide` in `globals.css`. */
const DURATION = 320;
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

function stillMoves(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Clear anything already running on an element.
 *
 * The dialog is permanently mounted, and the collapse animation holds its last
 * frame (`fill: 'both'`) so the cover does not snap back before React unmounts
 * the sheet. That held frame has to be cleared on the way in, or the second open
 * inherits `opacity: 0`.
 */
function clear(element: Element): void {
  for (const animation of element.getAnimations()) animation.cancel();
}

function radiusOf(element: Element): number {
  return Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
}

/** Where `element` has to be to sit exactly on top of `peer`, and where it lives. */
function flip(element: HTMLElement, peer: HTMLElement) {
  const box = element.getBoundingClientRect();
  const peerBox = peer.getBoundingClientRect();
  // A hidden or unmounted peer measures 0×0, and dividing by that would fling the
  // cover somewhere outside the viewport. Skipping the flight is the safe answer.
  if (box.width === 0 || peerBox.width === 0) return null;

  // Centre onto centre. `transform-origin` is the box centre by default, so
  // translating the centres together and scaling about them needs no origin maths
  // and no per-corner bookkeeping. Both covers are square, so one scale factor
  // does not distort anything.
  const scale = peerBox.width / box.width;
  const dx = peerBox.left + peerBox.width / 2 - (box.left + box.width / 2);
  const dy = peerBox.top + peerBox.height / 2 - (box.top + box.height / 2);

  return {
    /** The peer's box, expressed as a transform of the element's own. */
    peerFrame: {
      transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
      // The scale applies to the rounding too, so a 16px radius would read as
      // under 2px at the small end. Divide it back out and the corners stay put.
      borderRadius: `${radiusOf(peer) / scale}px`,
    },
    ownFrame: {
      transform: 'translate(0px, 0px) scale(1)',
      borderRadius: `${radiusOf(element)}px`,
    },
  };
}

/**
 * Fly the cover up out of the bar as the sheet opens.
 *
 * The surroundings are faded on the dialog itself with weighted offsets rather
 * than linearly: they brighten in over the first third of the flight, so what the
 * eye follows is the artwork moving rather than a panel assembling around it.
 */
export function morphSheetIn(
  dialog: HTMLDialogElement | null,
  cover: HTMLElement | null,
  peer: HTMLElement | null,
): void {
  if (!dialog || !stillMoves()) return;

  clear(dialog);
  dialog.animate(
    [
      { opacity: 0, offset: 0 },
      { opacity: 1, offset: 0.3 },
      { opacity: 1, offset: 1 },
    ],
    { duration: DURATION, easing: 'linear' },
  );

  if (!cover || !peer) return;
  clear(cover);
  const pair = flip(cover, peer);
  if (!pair) return;
  cover.animate([pair.peerFrame, pair.ownFrame], { duration: DURATION, easing: EASE });
}

/**
 * Fly it back down. Resolves `true` once the flight has finished, which is the
 * caller's cue to unmount the sheet — so this is what keeps the dialog on screen
 * for the length of the animation instead of vanishing on the first frame.
 *
 * Resolves `false` if the animation was cancelled (a reopen mid-collapse), where
 * closing afterwards would be exactly wrong.
 */
export function morphSheetOut(
  dialog: HTMLDialogElement | null,
  cover: HTMLElement | null,
  peer: HTMLElement | null,
): Promise<boolean> {
  if (!dialog || !stillMoves()) return Promise.resolve(true);

  clear(dialog);
  // `fill: 'both'` on both animations: `finished` resolves a frame or more before
  // React commits the unmount, and without a held final frame the sheet would
  // flash back to full size in between.
  const running: Promise<Animation>[] = [
    dialog.animate(
      [
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: 0.55 },
        { opacity: 0, offset: 1 },
      ],
      { duration: DURATION, easing: 'linear', fill: 'both' },
    ).finished,
  ];

  if (cover && peer) {
    clear(cover);
    const pair = flip(cover, peer);
    if (pair) {
      running.push(
        cover.animate([pair.ownFrame, pair.peerFrame], {
          duration: DURATION,
          easing: EASE,
          fill: 'both',
        }).finished,
      );
    }
  }

  return Promise.all(running).then(
    () => true,
    // `finished` rejects with an AbortError when an animation is cancelled.
    () => false,
  );
}
