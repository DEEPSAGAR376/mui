/**
 * Twitter/X uses the same card. A re-export rather than a copy: the convention
 * only needs a default function plus `alt`/`size`/`contentType` in a file named
 * `twitter-image`, and pointing all four at `opengraph-image` means one design to
 * maintain and one build-time render shared between them.
 */

export { default, alt, size, contentType } from './opengraph-image';
