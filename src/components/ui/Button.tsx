/**
 * The pill button, in one place.
 *
 * It was hand-written in six files with six slightly different class strings —
 * which is most of why the app read as unstyled rather than designed. This is a
 * Server Component (no `'use client'`): it holds no state, so it renders from a
 * page or from a client component equally, and the `onClick` callers were already
 * client components anyway.
 *
 * `variant` carries colour and `shape` carries padding, kept apart on purpose: a
 * single `icon` variant could not express the one icon-only button that is also
 * the primary action ("save this name"), and appending `p-2` to a base holding
 * `px-4 py-2` would not fix it — Tailwind resolves same-property conflicts by
 * *sheet* order, and `p-*` is emitted before `px-*`/`py-*`, so the append loses.
 *
 * Deliberately thin. Three things it does *not* do, each a place where reaching
 * further would quietly break working code:
 *
 * - **No default for `pressed`.** Only three controls in the app are toggles.
 *   `aria-pressed={undefined}` renders no attribute at all, whereas a default of
 *   `false` would stamp `aria-pressed="false"` onto every ordinary button and
 *   have a screen reader announce all of them as un-pressed toggles.
 * - **It never calls `stopPropagation`.** Four call sites do, and the reason is
 *   local to them: they sit inside a clickable row, and the row must not start
 *   playing when you hit the heart. Baking it in here would silently swallow
 *   bubbling for every future caller that wants it.
 * - **No focus ring of its own.** `globals.css` already gives `:focus-visible` a
 *   2px accent outline, and nothing here sets `outline-none` to beat it. (That is
 *   exactly the bug the sibling `Input` exists to fix.)
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-quiet' | 'ok-quiet';
type Shape = 'pill' | 'square';
type Size = 'sm' | 'md';

export type ButtonProps = Omit<React.ComponentProps<'button'>, 'aria-pressed'> & {
  variant?: Variant;
  shape?: Shape;
  size?: Size;
  /** Toggle state. Omit entirely on anything that is not a toggle. */
  pressed?: boolean;
};

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium transition duration-fast disabled:cursor-not-allowed disabled:opacity-40';

/*
 * `text-ink-950` on the coloured fills, not `text-white`. Measured from the
 * tokens: white on `accent` is 3.5:1 and drops to 2.7:1 on the `accent-bright`
 * hover — under the 4.5:1 floor in both states — while ink-950 on the same fills
 * is 5.7:1 rising to 7.4:1 on hover, and 6.7:1 on `danger`.
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-ink-950 hover:bg-accent-bright hover:shadow-glow',
  secondary: 'border border-ink-600 text-muted hover:border-ink-500 hover:text-white',
  ghost: 'text-muted-dim hover:bg-white/5 hover:text-white',
  danger: 'bg-danger text-ink-950 hover:brightness-110',
  /*
   * The two semantic outlines, added for the ingest screens: four controls there
   * ("Stop", "Remove from batch", and the two "Queue anyway"s) are outline chips
   * that carry meaning in their colour rather than in a fill. They are not
   * `danger`/`primary` — a solid red on "Stop" reads as unrecoverable when a
   * stopped upload is one click from resuming — and the alternative to a variant
   * was appending the colours to `secondary`, which puts two `border-color` and
   * two `text-color` utilities from the same namespace in conflict for Tailwind to
   * resolve by *sheet* order rather than attribute order.
   */
  'danger-quiet': 'border border-danger/40 text-danger hover:bg-danger/10',
  'ok-quiet': 'border border-ok/40 text-ok hover:bg-ok/10',
};

const PADDING: Record<Shape, Record<Size, string>> = {
  pill: { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' },
  square: { sm: 'p-1.5', md: 'p-2' },
};

export function Button({
  variant = 'secondary',
  shape = 'pill',
  size = 'md',
  pressed,
  className,
  // Destructured with a default so the spread below cannot reintroduce the
  // implicit `type="submit"` that a bare <button> in a <form> would have.
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={`${BASE} ${VARIANTS[variant]} ${PADDING[shape][size]}${className ? ` ${className}` : ''}`}
      {...rest}
    />
  );
}
