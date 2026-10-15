import type { ReactNode } from "react";
import { isFeatureEnabled } from "@/config/features";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BottomNav } from "./bottom-nav";
import { HeaderBar } from "./header-bar";
import type { ShellFlags } from "./nav-config";
import type { ShellAccount } from "./shell-types";
import { SiteFooter } from "./site-footer";

/**
 * UX-1b app shell around every route: skip link, header (public or student), <main id="main-content">,
 * footer, and the student bottom nav on phones. Admin routes render only <main> (admin has its own layout).
 * Reads the session once; no database queries. <main> is at least one viewport tall so the footer starts
 * below the fold and never jumps while page content streams in (CLS).
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const flags: ShellFlags = { COURSES: isFeatureEnabled("COURSES"), BATTLES: isFeatureEnabled("BATTLES") };
  const role = (user?.app_metadata as { role?: string } | undefined)?.role;
  const account: ShellAccount | null = user
    ? {
        name: (user.user_metadata?.full_name as string | undefined)?.trim() || user.email?.split("@")[0] || "Student",
        email: user.email ?? null,
        isStaff: role === "admin" || role === "staff",
      }
    : null;

  return (
    <>
      <a
        href="#main-content"
        className="sr-only z-90 rounded-control bg-surface px-4 py-3 text-body-sm font-semibold text-primary-700 shadow-e2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus-ring"
      >
        Skip to content
      </a>
      <HeaderBar account={account} flags={flags} />
      <main id="main-content" tabIndex={-1} className="min-h-dvh flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
      {account && <BottomNav account={account} />}
    </>
  );
}
