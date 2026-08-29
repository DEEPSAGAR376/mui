'use client';

/**
 * Navigation, split out only because the active-link state needs the pathname.
 *
 * `prefetch` is spelled out rather than left at its default, because the default
 * would do almost nothing here. Every one of these routes reads cookies, so all of
 * them are dynamic, and for a dynamic route the default (`auto`) prefetches only
 * as far as the nearest `loading.js` — the skeleton, not the data. `true` fetches
 * the whole segment, so with the router cache holding it for a while, moving
 * between the tabs is instant instead of paying a fresh round of Supabase queries
 * each way. Five or six links in a viewport-visible nav is well inside what this
 * is meant for.
 *
 * Only observable in a production build: prefetching is disabled in development.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  href: string;
  label: string;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  // The nav is named because the admin screens add a second one to the page, and
  // "navigation, navigation" in a landmark list tells you nothing.
  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {items.map((item) => {
        // Exact match for the root, prefix match elsewhere, so /playlists/<id>
        // still lights up "Playlists".
        const active =
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
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
