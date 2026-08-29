'use client';

/**
 * The last resort: the root layout itself failed.
 *
 * `error.tsx` boundaries sit *under* the layout they belong to, so nothing there
 * can catch a throw from the root layout — and the root layout is where the two
 * cookie reads happen. This file replaces the whole document when that happens,
 * which is why it renders its own `<html>` and `<body>`.
 *
 * Everything is an inline style, and that is the point rather than laziness.
 * A `global-error` gets no global stylesheet unless it imports one, and importing
 * `globals.css` here would make the page that exists for when the app is broken
 * depend on the app's CSS chunk loading. Same reasoning excludes `next/font`: the
 * system stack cannot fail to arrive. The colours are the theme's tokens copied
 * literally (`ink-950`, `fg`, `muted`, `accent`) so it still looks like this app.
 *
 * `metadata` is not supported in a Client Component, so the tab title comes from
 * React's `<title>` element, which is hoisted into `<head>`.
 *
 * Note what is gone while this renders: the layout is replaced, so `PlayerProvider`
 * and its `<audio>` are unmounted and playback has already stopped. Nothing here
 * can preserve it — that is the difference between this file and `error.tsx`.
 */

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '1.5rem',
          backgroundColor: '#07080b',
          color: '#e8eaf0',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <title>Something went wrong · newmv</title>

        <main style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1
            style={{
              margin: 0,
              fontSize: '1.5rem',
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
              fontWeight: 600,
            }}
          >
            newmv couldn’t start
          </h1>

          <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem', color: '#8b91a3' }}>
            The page failed before it could render. Reloading is usually enough; if it
            is not, the reference below matches the failure in the server log.
          </p>

          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: '1.5rem',
              padding: '0.5rem 1rem',
              border: 0,
              borderRadius: '999px',
              backgroundColor: '#8f74f5',
              color: '#07080b',
              font: 'inherit',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>

          {error.digest ? (
            <p style={{ margin: '1.5rem 0 0', fontSize: '0.75rem', color: '#7b8296' }}>
              Reference <span style={{ fontFamily: 'ui-monospace, monospace' }}>{error.digest}</span>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
