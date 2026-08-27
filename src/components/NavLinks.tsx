'use client';

/** Navigation, split out only because the active-link state needs the pathname. */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  href: string;
  label: string;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {items.map((item) => {
        // Exact match for the root, prefix match elsewhere, so /playlists/<id>
        // still lights up "Playlists".
        const active =
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
              active
                ? 'bg-ink-800 font-medium text-white'
                : 'text-muted hover:bg-ink-850 hover:text-white'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
