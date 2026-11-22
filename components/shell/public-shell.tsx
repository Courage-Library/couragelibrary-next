import type { ReactNode } from "react";
import { getSignupAvailability } from "@/lib/auth/signup-availability";
import { loadNavLive } from "@/lib/nav/live-categories";
import { VisitorHeader } from "@/components/nav/visitor-header";
import { NAV_EN } from "@/content/nav/labels";
import { navCategories, startAction } from "@/lib/nav/visitor-nav";
import { PublicFooter } from "@/components/footer/public-footer";
import { FOOTER_EN } from "@/content/footer";
import { isPaymentsEnabled } from "@/config/payments";

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
  // NAV-1: the live categories for the Exams menu — the landing's cached public read, bounded (never rejects, ≤ 800 ms);
  // FOOTER-1: the footer's Exams column reuses the SAME read (no extra query)
  const [signup, live] = await Promise.all([signupOpen(), loadNavLive()]);
  const categories = navCategories(NAV_EN, live);
  return (
    <>
      <a
        href="#main-content"
        className="sr-only z-90 rounded-control bg-surface px-4 py-3 text-body-sm font-semibold text-primary-700 shadow-e2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:inline-flex focus:min-h-12 focus:items-center focus-ring"
      >
        Skip to content
      </a>
      {/* NAV-1 Stage A: THE visitor header (both link sets; the pre-paint data-auth hint shows one) */}
      <VisitorHeader t={NAV_EN} homeHref="/" langSwitch={false} categories={categories} start={startAction(NAV_EN, signup)} auth="hint" />
      <main id="main-content" tabIndex={-1} className="min-h-dvh flex-1 outline-none">
        {children}
      </main>
      {/* FOOTER-1: THE public footer; the band hides for a signed-in visitor by the pre-paint data-auth hint (cached page) */}
      <PublicFooter t={FOOTER_EN} categories={categories} band={{ open: signup, authHint: true }} langSwitch={null} paymentsEnabled={isPaymentsEnabled()} />
      {/* NAV-1 Stage B (owner: navigation by session): the cached pages are visitor pages — a signed-in visitor sees
          "Go to dashboard" in THE visitor header (pre-paint hint); no student bar is built here */}
    </>
  );
}
