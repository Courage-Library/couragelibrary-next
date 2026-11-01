import { AppShell } from "@/components/shell/app-shell";

/**
 * PERF-HOME-1: every route except the cached public pages lives in this group and keeps the session-aware shell
 * (header with the account, the student bottom nav). The URLs are unchanged — a route group adds no path segment.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
