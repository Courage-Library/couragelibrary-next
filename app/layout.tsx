import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Devanagari, Poppins } from "next/font/google";
import { constructMetadata } from "@/lib/seo/metadata";
import { AppShell } from "@/components/shell/app-shell";
import { BRAND_THEME_COLOR } from "@/config/brand";
import { LITE_MODE_SCRIPT } from "@/lib/ui/lite-mode";
import "./globals.css";

// BRAND-2 (bilingual typography): all three families are self-hosted by next/font at build time (no runtime request
// to Google, no npm dependency). Only Inter's Latin file is preloaded; Poppins and Noto Sans Devanagari load on
// demand through unicode-range, so an English page downloads no Devanagari file (font budget ≤ 160 KB, gated).
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const poppins = Poppins({ subsets: ["latin", "devanagari"], weight: ["600", "700"], display: "swap", variable: "--font-poppins", preload: false });
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "600"], display: "swap", variable: "--font-devanagari", preload: false });

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
    <html lang="en" className={`h-full ${inter.variable} ${poppins.variable} ${devanagari.variable}`} suppressHydrationWarning>
      <head>
        {/* BRAND-2: low-end devices get solid surfaces (no blur) before first paint — see lib/ui/lite-mode.ts */}
        <script dangerouslySetInnerHTML={{ __html: LITE_MODE_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-canvas text-fg antialiased selection:bg-primary-100 selection:text-primary-900">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
