/**
 * Brand colours for places CSS variables cannot reach: the `theme-color` meta tag, the web manifest and the admin
 * AI image brief (plain text). BRAND-3 (decision #84): Brand Colour System v3 — blue primary, cyan accent, navy ink, no yellow. Every value here must equal its design token
 * in app/globals.css; the design ratchet (R-7) and scripts/test_brand1.cjs fail if they drift. This file and the token
 * file are the only places hex colour values may appear in app code. Everything else uses the tokens directly.
 */
export const BRAND_THEME_COLOR = "#1d4ed8";
export const BRAND_BACKGROUND_COLOR = "#f7f8fc";

/** token name (app/globals.css, without --color-) → value; mirrored, never a second source */
export const BRAND_PALETTE = {
  "primary-700": "#1d4ed8",
  "primary-800": "#1e40af",
  "primary-900": "#0b1b4d",
  "accent-400": "#22c7dc",
  "accent-700": "#0e7490",
  "ink-900": "#0b1b4d",
  "ink-700": "#33415c",
  "ink-50": "#f7f8fc",
  "brand-violet": "#5000f0",
} as const;
