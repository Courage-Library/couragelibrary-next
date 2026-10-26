import type { ReactNode } from "react";
import { isFeatureEnabled } from "@/config/features";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { classifyAuthResult } from "@/lib/auth/session-state";
import { SessionUnavailableBanner } from "@/components/auth/session-unavailable";
import { BottomNav } from "./bottom-nav";
import { HeaderBar } from "./header-bar";
import type { ShellFlags } from "./nav-config";
import type { ShellAccount } from "./shell-types";
import { SiteFooter } from "./site-footer";
import { isOnboardingEnabled } from "@/lib/onboarding/flag";
import { isProfilesEnabled } from "@/lib/profile/flag";
import { getSignupAvailability } from "@/lib/auth/signup-availability";
import { isPracticeEnabled } from "@/lib/practice/flag";
import { isCoinsEnabled } from "@/lib/coins/flag";
import { CoinsFlagProvider } from "@/lib/coins/flag-context";

/**
 * UX-1b app shell around every route: skip link, header (public or student), <main id="main-content">,
 * footer, and the student bottom nav on phones. Admin routes render only <main> (admin has its own layout).
 * Reads the session once; no database queries. <main> is at least one viewport tall so the footer starts
 * below the fold and never jumps while page content streams in (CLS).
 */
/** Never rejects; streamed to the header so no page waits on the Supabase setting (UX-FIX-1, AUTH1-RESILIENCE-HANG). */
function signupOpen(): Promise<boolean> {
  return getSignupAvailability().then((a) => a !== "closed", () => false);
}

export async function AppShell({ children }: { children: ReactNode }) {
  // AUTH-1 2a: tri-state session. "error" (Supabase unreachable) shows a retry banner instead of a signed-out shell.
  const supabase = await createServerSupabaseClient();
  const session = await supabase.auth.getUser().then(
    ({ data, error }) => classifyAuthResult(data?.user ?? null, error),
    () => ({ state: "error" as const }),
  );
  const user = session.state === "user" ? session.user : null;
  const flags: ShellFlags = { COURSES: isFeatureEnabled("COURSES"), BATTLES: isFeatureEnabled("BATTLES"), PRACTICE: isPracticeEnabled() };
  const role = (user?.app_metadata as { role?: string } | undefined)?.role;
  const account: ShellAccount | null = user
    ? {
        name: (user.user_metadata?.full_name as string | undefined)?.trim() || user.email?.split("@")[0] || "Student",
        email: user.email ?? null,
        isStaff: role === "admin" || role === "staff",
        studyPreferences: isOnboardingEnabled(),
        profile: isProfilesEnabled(),
        coins: isCoinsEnabled(),
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
      {/* UX-FIX-1: start actions point to /auth/signup only while public sign-up is open */}
      <HeaderBar account={account} flags={flags} signup={account === null ? signupOpen() : undefined} />
      {session.state === "error" && <SessionUnavailableBanner />}
      <main id="main-content" tabIndex={-1} className="min-h-dvh flex-1 outline-none">
        <CoinsFlagProvider enabled={isCoinsEnabled()}>{children}</CoinsFlagProvider>
      </main>
      <SiteFooter flags={flags} />
      {account && <BottomNav account={account} />}
    </>
  );
}
