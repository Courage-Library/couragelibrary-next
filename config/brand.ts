/**
 * Brand colours for places CSS variables cannot reach: the `theme-color` meta tag and the web manifest.
 * They must equal the design tokens in app/globals.css (`--color-primary-600`, `--color-ink-50`); the design
 * ratchet (R-7) fails if they drift. Everything else uses the tokens directly.
 */
export const BRAND_THEME_COLOR = "#5000f0";
export const BRAND_BACKGROUND_COLOR = "#f8fafc";
