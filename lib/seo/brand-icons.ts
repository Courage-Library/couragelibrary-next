/**
 * SEO-1 (2026-11-22): the site icons come from the final logo suite (public/brand/courage-library-logo-suite), served
 * as static files — no redirect, no database read. One source for the page metadata, the web manifest and the root
 * /favicon.ico + /apple-touch-icon.png rewrites (next.config). Gated by scripts/test_seo1.cjs (files exist, sizes).
 *
 * The /brand/icon/[size] route (HOME-1: an uploaded square mark) stays for links that still point at it.
 */
export const BRAND_SUITE = "/brand/courage-library-logo-suite";

export const SITE_ICONS = {
  icon: [
    { url: `${BRAND_SUITE}/favicon/favicon.ico`, sizes: "any" },
    { url: `${BRAND_SUITE}/favicon/favicon.svg`, type: "image/svg+xml" },
    { url: `${BRAND_SUITE}/favicon/favicon-32.png`, sizes: "32x32", type: "image/png" },
    { url: `${BRAND_SUITE}/app/icon-192.png`, sizes: "192x192", type: "image/png" },
  ],
  shortcut: `${BRAND_SUITE}/favicon/favicon.ico`,
  apple: { url: `${BRAND_SUITE}/app/apple-touch-icon-180.png`, sizes: "180x180", type: "image/png" },
} as const;

export const MANIFEST_ICONS = [
  { src: `${BRAND_SUITE}/app/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
  { src: `${BRAND_SUITE}/app/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
  { src: `${BRAND_SUITE}/app/icon-maskable-192.png`, sizes: "192x192", type: "image/png", purpose: "maskable" },
  { src: `${BRAND_SUITE}/app/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
] as const;

/** The Organization logo for structured data: the square mark (Google: at least 112 × 112, square works everywhere). */
export const ORGANIZATION_LOGO_PATH = `${BRAND_SUITE}/png/mark-512.png`;
