import { ImageResponse } from 'next/og';

/**
 * The iOS home-screen icon.
 *
 * A generated PNG rather than a file, because as a *static* file the `apple-icon`
 * convention accepts only `.jpg|.jpeg|.png` — no SVG — and hand-maintaining a
 * binary next to `icon.svg` means two things to keep in step. `ImageResponse`
 * renders this once at build time.
 *
 * Full-bleed and opaque, unlike `icon.svg`'s rounded square: iOS masks and rounds
 * the icon itself, so its own corner radius would be visible inside Apple's.
 */

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // A flat accent would read as a sticker; the wash gives it a light source,
          // the same one the app's glass surfaces are lit by.
          backgroundColor: '#8f74f5',
          backgroundImage: 'linear-gradient(135deg, #a78bfa 0%, #6d55c6 100%)',
        }}
      >
        <svg width="112" height="112" viewBox="0 0 24 24">
          <path
            d="M9 18V6l11-2v12"
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
    ),
    { ...size },
  );
}
