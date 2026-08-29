/**
 * Site header.
 *
 * A Server Component so the admin links can be decided before anything reaches
 * the browser. That is presentation, not protection: the RPCs behind the upload
 * screen assert `is_admin()` themselves, so hiding a link never has to be the
 * thing keeping someone out.
 *
 * ## Why the admin half is suspended
 *
 * `isAdmin()` is a database round trip, and this header is mounted in the root
 * layout — so awaiting it at the top of this component held the entire document
 * back on every route, before a single byte of HTML could flush. No `loading.tsx`
 * can cover that: one wraps its segment's page and nested layouts, never the
 * layout it sits beside.
 *
 * Exactly two things depend on the answer — two extra nav items and one word in
 * the account pill — so those, and nothing else, sit behind a `<Suspense>`. The
 * fallback is the same subtree with `admin={false}`: identical geometry, correct
 * active state, fully interactive. For everyone who is not an admin the swap when
 * the query lands changes nothing on screen; for an admin, two pills appear.
 *
 * The boundary wraps a fragment of two siblings rather than a wrapper element, so
 * both places the answer surfaces are covered by one query without disturbing the
 * flex row. React's streaming placeholder is a `<template>`, which the UA sheet
 * hides, so it is not a flex item in any way that shows.
 */

import Link from 'next/link';
import { Suspense } from 'react';
import { MusicIcon } from '@/components/icons';
import { NavLinks, type NavItem } from '@/components/NavLinks';
import { isAdmin } from '@/lib/supabase/server';

const BASE_ITEMS: NavItem[] = [
  { href: '/', label: 'Library' },
  { href: '/search', label: 'Search' },
  { href: '/likes', label: 'Favourites' },
  { href: '/playlists', label: 'Playlists' },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: '/admin/upload', label: 'Upload' },
  { href: '/admin/tracks', label: 'Manage' },
];

export function SiteHeader() {
  return (
    <header className="glass sticky top-0 z-30 border-b border-hairline">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-white">
          <MusicIcon className="size-5 text-accent-bright" />
          <span className="font-display text-sm font-semibold tracking-tight">newmv</span>
        </Link>

        <Suspense fallback={<HeaderNav admin={false} />}>
          <AdminAwareNav />
        </Suspense>
      </div>
    </header>
  );
}

/** The only thing in the header that waits on the database. */
async function AdminAwareNav() {
  return <HeaderNav admin={await isAdmin()} />;
}

function HeaderNav({ admin }: { admin: boolean }) {
  return (
    <>
      <div className="min-w-0 flex-1 overflow-x-auto">
        <NavLinks items={admin ? [...BASE_ITEMS, ...ADMIN_ITEMS] : BASE_ITEMS} />
      </div>

      <Link
        href="/login"
        // Not a `Button`: that renders a `<button>`, and this navigates. The classes
        // are `Button`'s `secondary` / `size="sm"` recipe verbatim so the two read as
        // one family.
        className="shrink-0 rounded-full border border-ink-600 px-3 py-1.5 text-xs font-medium text-muted transition duration-fast hover:border-ink-500 hover:text-white"
      >
        {admin ? 'Account' : 'Sign in'}
      </Link>
    </>
  );
}
