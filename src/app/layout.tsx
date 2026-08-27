import type { Metadata } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/SiteHeader';
import { LikesProvider } from '@/components/player/LikesProvider';
import { PlayerBar } from '@/components/player/PlayerBar';
import { PlayerProvider } from '@/components/player/PlayerProvider';
import { likedTrackIds } from '@/lib/actions/likes';

export const metadata: Metadata = {
  title: 'newmv',
  description: 'A personal music library, streamed from the browser.',
};

/**
 * `PlayerProvider` and `PlayerBar` are mounted here rather than in a page, and
 * that placement is the whole reason playback survives navigation: the App Router
 * keeps layout client components mounted while pages change beneath them.
 *
 * The liked-track ids are read once here and handed to `LikesProvider`, so the
 * hundreds of hearts in a listing share one query instead of making one each.
 * Reading cookies makes every page dynamic — correct for a per-visitor library,
 * and the reason there is no static caching to reason about.
 */
export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const liked = await likedTrackIds();

  return (
    <html lang="en">
      <body className="min-h-dvh">
        <PlayerProvider>
          <LikesProvider initialLiked={liked}>
            <SiteHeader />
            {/* pb-32 leaves room for the fixed player bar. */}
            <main className="mx-auto w-full max-w-7xl px-4 pt-6 pb-32">{children}</main>
            <PlayerBar />
          </LikesProvider>
        </PlayerProvider>
      </body>
    </html>
  );
}
