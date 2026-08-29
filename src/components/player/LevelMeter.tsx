/**
 * The three-bar level meter shown against whatever is playing.
 *
 * `animate-meter` is a real `scaleY` keyframe registered in `globals.css`, not
 * Tailwind's `pulse`: `pulse` animates opacity, so three bars fading in unison
 * read as a loading spinner rather than as audio. Two details do the rest of the
 * work:
 *
 * - `origin-bottom`, so the bars grow off the baseline instead of the centre.
 * - a **negative** `animation-delay` per bar, so all three are already mid-cycle
 *   on the first frame. A positive delay would hold them at full height until it
 *   elapsed, which is exactly the wrong first impression.
 *
 * Durations are set inline, and differ per bar, so the three never resynchronise
 * into one moving block. Inline style beats the utility's `animation` shorthand,
 * which is what makes overriding just the duration possible.
 *
 * Under `prefers-reduced-motion` the `*` sweep in `globals.css` wins on
 * `!important` and the bars simply hold their staggered heights — the right
 * outcome for something purely decorative, and the reason this is `aria-hidden`.
 */

const BARS = [
  { height: '55%', duration: '760ms', delay: '-520ms' },
  { height: '100%', duration: '1120ms', delay: '-140ms' },
  { height: '70%', duration: '900ms', delay: '-880ms' },
];

/** `className` replaces the default height rather than adding to it. */
export function LevelMeter({ className }: { className?: string }) {
  return (
    <span className={`flex items-end gap-[2px] ${className ?? 'h-3'}`} aria-hidden="true">
      {BARS.map((bar) => (
        <span
          key={bar.delay}
          className="w-[2px] origin-bottom animate-meter rounded-full bg-accent-bright"
          style={{
            height: bar.height,
            animationDuration: bar.duration,
            animationDelay: bar.delay,
          }}
        />
      ))}
    </span>
  );
}
