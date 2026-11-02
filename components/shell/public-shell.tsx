import type { ReactNode } from "react";
import { isFeatureEnabled } from "@/config/features";
import { isOnboardingEnabled } from "@/lib/onboarding/flag";
import { isProfilesEnabled } from "@/lib/profile/flag";
import { isPracticeEnabled } from "@/lib/practice/flag";
import { isCoinsEnabled } from "@/lib/coins/flag";
import { getSignupAvailability } from "@/lib/auth/signup-availability";
import { loadBrandAssets } from "@/lib/brand/brand-assets";
import { loadPublicCategoriesCached } from "@/lib/exams/category-data";
import { HeaderBar } from "./header-bar";
import type { ShellFlags } from "./nav-config";
import { PublicStudentNav } from "./public-student-nav";
import { SiteFooter } from "./site-footer";

/**
 * PERF-HOME-1: the shell of the CACHED public pages. It reads no cookie and no request header (the page stays static /
 * ISR) and holds nothing user-specific: the header carries both link sets (signed out: Sign in + the start action;
 * signed in: Go to dashboard), shown by CSS from <html data-auth> (lib/ui/auth-hint.ts, set before the first paint).
 * A signed-in student's bottom nav is built in the browser (components/shell/public-student-nav.tsx) into space the
 * page already reserves for it. Global data only (sign-up setting, brand, categories) — all cached and public.
 */
function signupOpen(): Promise<boolean> {
  return getSignupAvailability().then((a) => a !== "closed", () => false);
}
// PERF-HOME-1b: the cached pages are rendered in the background (ISR), so the shell reads its global data BEFORE
// rendering and passes values, not promises: the cached HTML is final (no streamed placeholder swap). Both reads are
// bounded and never reject (closed sign-up view / no category links on failure).

export async function PublicShell({ children }: { children: ReactNode }) {
  const flags: ShellFlags = { COURSES: isFeatureEnabled("COURSES"), BATTLES: isFeatureEnabled("BATTLES"), PRACTICE: isPracticeEnabled() };
  const [brand, signup, categories] = await Promise.all([loadBrandAssets(), signupOpen(), loadPublicCategoriesCached()]);
  return (
    <>
      <a
        href="#main-content"
        className="sr-only z-90 rounded-control bg-surface px-4 py-3 text-body-sm font-semibold text-primary-700 shadow-e2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:inline-flex focus:min-h-12 focus:items-center focus-ring"
      >
        Skip to content
      </a>
      <HeaderBar account={null} flags={flags} signup={signup} logo={brand.headerLogo} publicStatic />
      <main id="main-content" tabIndex={-1} className="min-h-dvh flex-1 outline-none">
        {children}
      </main>
      <SiteFooter flags={flags} categories={categories} logo={brand.footerLogo} />
      {/* reserved before the first paint for a signed-in visitor (CSS .auth-in) — the bottom nav fills it later: no shift */}
      <div aria-hidden="true" className="auth-in h-[calc(4rem+1px+env(safe-area-inset-bottom))] lg:hidden" data-student-nav-space="" />
      <PublicStudentNav studyPreferences={isOnboardingEnabled()} profile={isProfilesEnabled()} coins={isCoinsEnabled()} />
    </>
  );
}
