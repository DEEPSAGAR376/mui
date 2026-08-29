'use client';

/**
 * Admin sub-navigation. Client-only for `usePathname`, same as the site header.
 *
 * Deliberately the same pill as `NavLinks` down to the hover tint — it is the same
 * kind of control one level down, and the `rounded-md` it used before was the third
 * radius in a project that only wants three: `rounded-lg` for rows and controls,
 * `rounded-2xl` for panels, `rounded-full` for pills.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin/upload', label: 'Upload' },
  { href: '/admin/tracks', label: 'Manage' },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="flex items-center gap-1 border-b border-ink-800 pb-3">
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors duration-fast ${
              active
                ? 'bg-ink-800 font-medium text-white'
                : 'text-muted hover:bg-ink-850 hover:text-white'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
