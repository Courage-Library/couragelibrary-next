import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { constructMetadata } from "@/lib/seo/metadata";
import { BRAND_THEME_COLOR } from "@/config/brand";
import { LITE_MODE_SCRIPT } from "@/lib/ui/lite-mode";
import { AUTH_HINT_SCRIPT } from "@/lib/ui/auth-hint";
import "./globals.css";

// BRAND-2 (bilingual typography) + BUILD-FONT-1: the three families are committed woff2 files in app/fonts (SIL OFL 1.1,
// see app/fonts/NOTICE.md) loaded by next/font/local — the build never fetches from Google. Each subset is its own
// instance sharing ONE family name, so the browser downloads a file only when the page has a character in its
// unicode-range (an English page downloads no Devanagari file; font budget ≤ 160 KB, gated). Only Poppins 700 Latin
// (the hero H1) is preloaded; every other face swaps in over a size-adjusted Arial fallback (no visible jump).
// next/font options must be literals (no shared constants): the unicode ranges are Google Fonts' own subset ranges.
const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-inter",
  preload: false,
  adjustFontFallback: "Arial",
  declarations: [
    { prop: "font-family", value: "'CL Inter'" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});
const interExt = localFont({
  src: "./fonts/inter-latin-ext.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-inter-ext",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'CL Inter'" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
});
const poppins = localFont({
  src: "./fonts/poppins-700-latin.woff2",
  weight: "700",
  display: "swap",
  variable: "--font-poppins",
  preload: true,
  adjustFontFallback: "Arial",
  declarations: [
    { prop: "font-family", value: "'CL Poppins'" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});
const poppins600 = localFont({
  src: "./fonts/poppins-600-latin.woff2",
  weight: "600",
  display: "swap",
  variable: "--font-poppins-600",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'CL Poppins'" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});
const poppinsExt = localFont({
  src: [
    { path: "./fonts/poppins-600-latin-ext.woff2", weight: "600" },
    { path: "./fonts/poppins-700-latin-ext.woff2", weight: "700" },
  ],
  display: "swap",
  variable: "--font-poppins-ext",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'CL Poppins'" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
});
const poppinsHi = localFont({
  src: [
    { path: "./fonts/poppins-600-devanagari.woff2", weight: "600" },
    { path: "./fonts/poppins-700-devanagari.woff2", weight: "700" },
  ],
  display: "swap",
  variable: "--font-poppins-hi",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'CL Poppins'" },
    {
      prop: "unicode-range",
      value: "U+0900-097F, U+1CD0-1CF4, U+1CF7-1CF9, U+200C-200D, U+20A8, U+20B9, U+20F0, U+25CC, U+A830-A839, U+A8E0-A8FF, U+11B00-11B0A",
    },
  ],
});
const devanagari = localFont({
  src: "./fonts/noto-sans-devanagari-devanagari.woff2",
  weight: "400 600",
  display: "swap",
  variable: "--font-devanagari",
  preload: false,
  adjustFontFallback: "Arial",
  declarations: [
    { prop: "font-family", value: "'CL Noto Sans Devanagari'" },
    {
      prop: "unicode-range",
      value: "U+0900-097F, U+1CD0-1CF4, U+1CF7-1CF9, U+200C-200D, U+20A8, U+20B9, U+20F0, U+25CC, U+A830-A839, U+A8E0-A8FF, U+11B00-11B0A",
    },
  ],
});
const FONT_VARIABLES = [inter, interExt, poppins, poppins600, poppinsExt, poppinsHi, devanagari].map((f) => f.variable).join(" ");

export const metadata: Metadata = constructMetadata();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  // brand primary-600; config/brand.ts mirrors the token (design ratchet R-7).
  themeColor: BRAND_THEME_COLOR,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the lite-mode script may add `lite` to <html> before React hydrates (by design)
    <html lang="en" className={`h-full ${FONT_VARIABLES}`} suppressHydrationWarning>
      <head>
        {/* BRAND-2: low-end devices get solid surfaces (no blur) before first paint — see lib/ui/lite-mode.ts */}
        <script dangerouslySetInnerHTML={{ __html: LITE_MODE_SCRIPT }} />
        {/* PERF-HOME-1: which link set the cached public pages show (before the first paint) — lib/ui/auth-hint.ts */}
        <script dangerouslySetInnerHTML={{ __html: AUTH_HINT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-canvas text-fg antialiased selection:bg-primary-100 selection:text-primary-900">
        {/* PERF-HOME-1: the shell lives in the route groups — app/(site)/layout.tsx (session) and app/(public)/layout.tsx (cookie-free, cached) */}
        {children}
      </body>
    </html>
  );
}
