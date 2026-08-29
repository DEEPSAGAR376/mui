/**
 * The text field, in one place — and the reason this file exists at all.
 *
 * All six inputs in the app carried `outline-none` (or `focus:outline-none`)
 * alongside `focus:border-accent`. Tailwind emits both in the *utilities* layer,
 * while the designed focus ring in `globals.css` sits in the *base* layer — so
 * `outline-none` won, and every text field in the project announced focus with
 * nothing but a 1px border tint. That is the whole class of problem, and it
 * disappears by not writing `outline-none` here.
 *
 * No width in the base. Callers need `w-52`, `w-44`, `min-w-56 flex-1` and
 * `w-full`, and a width in the base would put two utilities from the same
 * namespace in conflict — which Tailwind resolves by *sheet* order, not by the
 * order the classes appear in the attribute, so an appended override may or may
 * not win. Same reasoning behind `tone` being a prop rather than an appended
 * `bg-*`: the sunken variant is for fields sitting on an already-raised panel.
 */

type Size = 'sm' | 'md' | 'lg';
type Tone = 'default' | 'sunken';

/**
 * `size` is `Omit`ted before being redeclared, not merely overwritten:
 * `ComponentProps<'input'>` already types it as the HTML `size` *attribute*
 * (`number`), and intersecting that with a string union collapses the property to
 * `never` — every `size="sm"` call site would fail to typecheck for a reason the
 * error message does not explain. Shadowing it is safe because the attribute
 * itself is a character-count hint for bare text fields and nothing here wants
 * one.
 */
export type InputProps = Omit<React.ComponentProps<'input'>, 'size'> & {
  size?: Size;
  tone?: Tone;
};

const BASE =
  'border border-ink-700 text-sm text-white transition-colors duration-fast placeholder:text-muted-dim focus:border-accent';

const TONES: Record<Tone, string> = {
  default: 'bg-ink-900',
  sunken: 'bg-ink-950',
};

/** The three shapes the app actually uses: a menu field, and two pills. */
const SIZES: Record<Size, string> = {
  sm: 'rounded-lg px-2 py-1.5',
  md: 'rounded-full px-3 py-1.5',
  lg: 'rounded-full px-4 py-2',
};

export function Input({ size = 'lg', tone = 'default', className, ...rest }: InputProps) {
  return (
    <input
      className={`${BASE} ${TONES[tone]} ${SIZES[size]}${className ? ` ${className}` : ''}`}
      {...rest}
    />
  );
}
