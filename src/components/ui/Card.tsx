/**
 * A glass card that is also a link — the playlist grid is the app's only card
 * grid, and every card in it navigates.
 *
 * `rounded-2xl` per the radius convention: `lg` for rows and controls, `2xl` for
 * panels and cards, `full` for pills, and nothing else. Three radii used
 * interchangeably is most of why the app read as unstyled.
 *
 * `transition` rather than `transition-colors`, because the hover state moves the
 * shadow as well as the border, and `transition-colors` would snap it.
 */

import Link from 'next/link';

export function Card({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`glass flex flex-col gap-1 rounded-2xl border border-hairline p-4 transition duration-glide ease-glide hover:border-ink-600 hover:shadow-lift${
        className ? ` ${className}` : ''
      }`}
    >
      {children}
    </Link>
  );
}
