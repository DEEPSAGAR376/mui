/**
 * Site header.
 *
 * A Server Component so the admin links can be decided before anything reaches
 * the browser. That is presentation, not protection: the RPCs behind the upload
 * screen assert `is_admin()` themselves, so hiding a link never has to be the
 * thing keeping someone out.
 */

import Link from 'next/link';
import { MusicIcon } from '@/components/icons';
import { NavLinks, type NavItem } from '@/components/NavLinks';
import { isAdmin } from '@/lib/supabase/server';

export async function SiteHeader() {
  const admin = await isAdmin();

  const items: NavItem[] = [
    { href: '/', label: 'Library' },
    { href: '/likes', label: 'Favourites' },
    { href: '/playlists', label: 'Playlists' },
  ];

  if (admin) {
    items.push({ href: '/admin/upload', label: 'Upload' }, { href: '/admin/tracks', label: 'Manage' });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-white">
          <MusicIcon className="size-5 text-accent-bright" />
          <span className="text-sm font-semibold tracking-tight">newmv</span>
        </Link>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <NavLinks items={items} />
        </div>

        <Link
          href="/login"
          className="shrink-0 rounded-full border border-ink-700 px-3 py-1.5 text-xs text-muted transition-colors hover:border-ink-600 hover:text-white"
        >
          {admin ? 'Account' : 'Sign in'}
        </Link>
      </div>
    </header>
  );
}
