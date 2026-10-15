import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { constructMetadata } from "@/lib/seo/metadata";
import { AppShell } from "@/components/shell/app-shell";
import { BRAND_THEME_COLOR } from "@/config/brand";
import "./globals.css";

// UX-1a: one Latin family, self-hosted by next/font at build time (no runtime request to Google).
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = constructMetadata();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  // UX-1b: brand violet (primary-600); config/brand.ts mirrors the token (design ratchet R-7).
  themeColor: BRAND_THEME_COLOR,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${inter.variable}`}>
      <body className="flex min-h-full flex-col bg-canvas text-fg antialiased selection:bg-primary-100 selection:text-primary-900">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
