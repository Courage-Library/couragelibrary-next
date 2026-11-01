import type { Metadata } from "next";

/** UX-FIX-1: not linked from the nav / footer until it has real published content — every page here is noindex. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
