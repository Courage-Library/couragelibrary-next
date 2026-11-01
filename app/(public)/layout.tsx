import { PublicShell } from "@/components/shell/public-shell";

/**
 * PERF-HOME-1: the cached public pages ("/", "/exams", the category pages) — a shell that reads NO cookie and NO
 * request header, so the pages are rendered once and served from the CDN (ISR). Nothing user-specific may be in it.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
