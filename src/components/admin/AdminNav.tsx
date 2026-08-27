'use client';

/**
 * Admin sub-navigation. Client-only for `usePathname`, same as the site header.
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
    <nav className="flex items-center gap-1 border-b border-ink-800 pb-3">
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              active ? 'bg-ink-800 text-white' : 'text-muted hover:text-white'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
