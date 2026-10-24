/**
 * Brand colours for places CSS variables cannot reach: the `theme-color` meta tag, the web manifest and the admin
 * AI image brief (plain text). BRAND-1 (decision #70): Navy + Saffron. Every value here must equal its design token
 * in app/globals.css; the design ratchet (R-7) and scripts/test_brand1.cjs fail if they drift. This file and the token
 * file are the only places hex colour values may appear in app code. Everything else uses the tokens directly.
 */
export const BRAND_THEME_COLOR = "#1e3a8a";
export const BRAND_BACKGROUND_COLOR = "#f8fafc";

/** token name (app/globals.css, without --color-) → value; mirrored, never a second source */
export const BRAND_PALETTE = {
  "primary-600": "#1e3a8a",
  "primary-500": "#1d4ed8",
  "accent-500": "#f59e0b",
  "accent-700": "#b45309",
  "ink-900": "#0f172a",
  "ink-600": "#475569",
  "ink-50": "#f8fafc",
} as const;
