import type { Metadata, Viewport } from 'next';
import { Inter, Sora } from 'next/font/google';
import './globals.css';
import { NowPlayingBackdrop } from '@/components/CoverBackdrop';
import { ResourceHints } from '@/components/ResourceHints';
import { SiteHeader } from '@/components/SiteHeader';
import { LikesProvider } from '@/components/player/LikesProvider';
import { PlayerBar } from '@/components/player/PlayerBar';
import { PlayerProvider } from '@/components/player/PlayerProvider';
import { likedTrackIds } from '@/lib/actions/likes';

/**
 * Two variable faces, self-hosted and preloaded by `next/font` — so no
 * third-party request and no layout shift. `Inter` carries the UI and body text
 * (its tabular figures matter here: durations are everywhere), `Sora` the
 * headings, the wordmark and the now-playing title.
 *
 * Called at module scope because `next/font` requires it, and exposed as CSS
 * variables rather than `className` so `globals.css` can name them in a
 * `@theme inline` block and every `font-sans` / `font-display` utility resolves.
 */
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
const sora = Sora({ subsets: ['latin'], display: 'swap', variable: '--font-sora' });

/**
 * `metadataBase` is what makes the relative `url` below and the generated
 * `opengraph-image` resolve to absolute URLs — Open Graph consumers reject
 * relative ones, and without a base Next has nothing to resolve against.
 *
 * `title.template` applies to child segments only, never this one, which is why
 * `default` is required alongside it: the layout's own title comes from `default`
 * and each page supplies just its own name ('Search' → 'Search · newmv').
 *
 * Deliberately no `openGraph.images` or `twitter.images`. File-based metadata
 * overrides the config object, so `opengraph-image.tsx` and `twitter-image.tsx`
 * already emit the tags with the right dimensions and alt text; declaring images
 * here as well would be config that never takes effect.
 */
export const metadata: Metadata = {
  metadataBase: new URL('https://deepmp3.vercel.app'),
  title: {
    default: 'newmv',
    template: '%s · newmv',
  },
  description: 'A personal music library, streamed from the browser.',
  applicationName: 'newmv',
  openGraph: {
    type: 'website',
    siteName: 'newmv',
    url: '/',
    title: 'newmv',
    description: 'A personal music library, streamed from the browser.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'newmv',
    description: 'A personal music library, streamed from the browser.',
  },
};

/**
 * `themeColor` and `colorScheme` belong on `viewport`, not `metadata` — both were
 * deprecated on `metadata` in Next 14. The colour is `--color-ink-950`, so a
 * mobile browser's chrome matches the page instead of framing it in white, and
 * `colorScheme: 'dark'` is the metadata counterpart of the `color-scheme: dark`
 * already set on `<html>` in `globals.css`.
 */
export const viewport: Viewport = {
  themeColor: '#07080b',
  colorScheme: 'dark',
};

/**
 * `PlayerProvider` and `PlayerBar` are mounted here rather than in a page, and
 * that placement is the whole reason playback survives navigation: the App Router
 * keeps layout client components mounted while pages change beneath them. It also
 * means `PlayerProvider` must never end up inside a `<Suspense>` boundary — a
 * fallback swap would unmount the `<audio>` element and stop playback.
 *
 * `NowPlayingBackdrop` is mounted here for the same reason: one blurred cover
 * behind the whole document, replaced when the track changes rather than when the
 * route does.
 *
 * The liked-track ids are read once here and handed to `LikesProvider`, so the
 * hundreds of hearts in a listing share one query instead of making one each.
 * Reading cookies makes every page dynamic — correct for a per-visitor library,
 * and the reason there is no static caching to reason about.
 *
 * The promise is passed down **unawaited**, and that is the difference between a
 * document that flushes immediately and one that waits on Supabase twice. This
 * layout is nobody's `loading.tsx` — one wraps its segment's page and nested
 * layouts, never the layout beside it — so an `await` here is dead time on every
 * navigation with no skeleton allowed to cover it, and `likedTrackIds()` costs an
 * `auth.getUser()` round trip before its own query. Handing the promise over
 * instead means the shell, the header and the page's own skeleton all reach the
 * browser first and the hearts fill in a frame later. `SiteHeader` does the same
 * with `isAdmin()`, behind its own boundary.
 *
 * `.catch` here rather than in the provider: a rejected promise crossing the
 * server/client boundary surfaces as an error where it is read, and an empty set
 * of hearts is the right failure — the page must not fall over because a like
 * lookup did.
 *
 * The skip link is the first tab stop and it exists because of the two fixed
 * surfaces: the header is sticky and the player bar is fixed, so without it every
 * route change means tabbing through the whole nav again to reach the list.
 */
export default function RootLayout({ children }: LayoutProps<'/'>) {
  const liked = likedTrackIds().catch(() => [] as string[]);

  return (
    <html lang="en" className={`${inter.variable} ${sora.variable}`}>
      <body className="min-h-dvh">
        <ResourceHints />

        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink-950"
        >
          Skip to content
        </a>

        <PlayerProvider>
          <LikesProvider initialLiked={liked}>
              <NowPlayingBackdrop />
              <SiteHeader />
              {/* pb-32 leaves room for the fixed player bar. */}
              <main id="main" className="mx-auto w-full max-w-7xl px-4 pt-6 pb-32">
                {children}
              </main>
              <PlayerBar />
          </LikesProvider>
        </PlayerProvider>
      </body>
    </html>
  );
}
