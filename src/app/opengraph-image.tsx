import { ImageResponse } from 'next/og';

/**
 * The social card.
 *
 * Rendered once at build time from JSX by `ImageResponse`, so there is no image
 * file to keep in sync with the theme — the colours below are the same tokens
 * `globals.css` defines.
 *
 * No custom font, on purpose. `next/font` downloads Inter and Sora into the build
 * cache rather than to a stable path, so feeding either to `ImageResponse` would
 * mean either committing a `.ttf` or fetching from Google during the build — a
 * network dependency in a step that currently has none, to change the shape of
 * letters in a card. It renders in the bundled default face instead, and the
 * design carries the weight: deep black, one accent light source, and a mock of
 * the app's own player bar, which is the thing that makes the card look like this
 * app rather than like a template.
 *
 * `alt`, `size` and `contentType` are exported beside the default function
 * because that is how the convention picks up `og:image:alt` and the dimensions.
 */

export const alt = 'newmv — a personal music library, streamed from the browser';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const NOTE_PATH = 'M9 18V6l11-2v12';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          backgroundColor: '#07080b',
          backgroundImage:
            'radial-gradient(950px 620px at 10% -12%, rgba(167,139,250,0.36), transparent 62%)',
          color: '#e8eaf0',
        }}
      >
        {/* Wordmark, at the header's own arrangement: glyph, then name. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: 16,
              backgroundImage: 'linear-gradient(135deg, #a78bfa 0%, #6d55c6 100%)',
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24">
              <path
                d={NOTE_PATH}
                fill="none"
                stroke="#07080b"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="6" cy="18" r="3.2" fill="#07080b" />
              <circle cx="17" cy="16" r="3.2" fill="#07080b" />
            </svg>
          </div>
          <div style={{ fontSize: 40, letterSpacing: '-0.02em', color: '#ffffff' }}>newmv</div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 64,
            lineHeight: 1.1,
            // Satori tightens letters but not word spaces, so the app's -0.03em
            // display tracking exaggerates the gaps between words here. Eased off.
            letterSpacing: '-0.015em',
            color: '#ffffff',
          }}
        >
          <div>A personal music library,</div>
          <div style={{ color: '#a78bfa' }}>streamed from the browser.</div>
        </div>

        {/* The player bar, mocked. Blurred glass cannot be rendered here, so the
            translucency is baked in as a flat colour over the black. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            width: '100%',
            padding: 24,
            borderRadius: 24,
            backgroundColor: '#0e1017',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 88,
              height: 88,
              borderRadius: 12,
              backgroundColor: '#161a23',
            }}
          >
            <svg width="34" height="34" viewBox="0 0 24 24">
              <path
                d={NOTE_PATH}
                fill="none"
                stroke="#3d4453"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="6" cy="18" r="3" fill="#3d4453" />
              <circle cx="17" cy="16" r="3" fill="#3d4453" />
            </svg>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, gap: 14 }}>
            <div style={{ width: 340, height: 16, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.24)' }} />
            <div style={{ width: 220, height: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)' }} />
            <div style={{ display: 'flex', width: '100%', height: 6, borderRadius: 999, backgroundColor: '#2b313f' }}>
              <div
                style={{
                  width: '62%',
                  height: '100%',
                  borderRadius: 999,
                  backgroundImage: 'linear-gradient(90deg, #8f74f5 0%, #a78bfa 100%)',
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: 999,
              backgroundColor: '#a78bfa',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24">
              <path
                d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11.14-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z"
                fill="#07080b"
              />
            </svg>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
