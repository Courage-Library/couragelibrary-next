import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { constructMetadata } from "@/lib/seo/metadata";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { PublicHeaderWrapper } from "@/components/layout/public-header-wrapper";
import "./globals.css";

// UX-1a: one Latin family, self-hosted by next/font at build time (no runtime request to Google).
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = constructMetadata();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${inter.variable}`}>
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-900 antialiased selection:bg-blue-100 selection:text-blue-900">
        <PublicHeaderWrapper>
          <Header />
        </PublicHeaderWrapper>
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
