import type { ReactNode } from "react";
import { headers } from "next/headers";
import { PATHNAME_HEADER } from "@/lib/http/pathname-header";
import { VisitorHeader } from "@/components/nav/visitor-header";
import { navLabels } from "@/content/nav/labels";
import { activeVisitorKey, navCategories, navLangFor, startAction } from "@/lib/nav/visitor-nav";
import { loadNavLive } from "@/lib/nav/live-categories";
import { isFeatureEnabled } from "@/config/features";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { classifyAuthResult } from "@/lib/auth/session-state";
import { SessionUnavailableBanner } from "@/components/auth/session-unavailable";
import { StudentShell } from "@/components/nav/student-shell";
import { isExamFocus } from "@/lib/nav/student-nav";
import { isPaymentsEnabled } from "@/config/payments";
import { paywallOnForNav } from "@/lib/access/policy";
import { ONBOARDING_COPY } from "@/content/onboarding";
import type { ShellFlags } from "./nav-config";
import type { ShellAccount } from "./shell-types";
import { PublicFooter } from "@/components/footer/public-footer";
import { StudentFooter } from "@/components/footer/student-footer";
import { FOOTER_EN } from "@/content/footer";
import { bandAllowed } from "@/lib/site/footer-links";
import { isOnboardingEnabled } from "@/lib/onboarding/flag";
import { isProfilesEnabled } from "@/lib/profile/flag";
import { getSignupAvailability } from "@/lib/auth/signup-availability";
import { isPracticeEnabled } from "@/lib/practice/flag";
import { isCoinsEnabled, isLessonCoinsEarnEnabled } from "@/lib/coins/flag";
import { CoinsFlagProvider } from "@/lib/coins/flag-context";

/**
 * UX-1b app shell around every route: skip link, <main id="main-content">, footer. NAV-1: signed out → THE visitor
 * header (Stage A); signed in → THE student shell (Stage B: sidebar / top bar / bottom bar); a live exam attempt → exam
 * focus (only <main>: the exam console). Admin routes render only <main> (admin has its own layout).
 * Reads the session once (FOOTER-1: the brand-assets read only fed the old footer logo — the footers use the brand lockup). <main> is at least one viewport tall so the footer starts
 * below the fold and never jumps while page content streams in (CLS).
 */
/** Never rejects; streamed to the header so no page waits on the Supabase setting (UX-FIX-1, AUTH1-RESILIENCE-HANG). */
function signupOpen(): Promise<boolean> {
  return getSignupAvailability().then((a) => a !== "closed", () => false);
}

/**
 * NAV-1 Stage A: the visitor header on a per-request page that has no session (the signed-out link set only). It never
 * waits: the start action and the Exams tiles are promises (bounded, never rejecting) that stream inside the header.
 */
function SignedOutHeader({ pathname }: { pathname: string }) {
  const t = navLabels(navLangFor(pathname));
  return (
    <VisitorHeader
      t={t}
      homeHref="/"
      langSwitch={false}
      categories={loadNavLive().then((live) => navCategories(t, live))}
      start={signupOpen().then((open) => startAction(t, open))}
      auth="out"
      active={activeVisitorKey(pathname)}
      pathname={pathname}
    />
  );
}

export async function AppShell({ children }: { children: ReactNode }) {
  // AUTH-1 2a: tri-state session. "error" (Supabase unreachable) shows a retry banner instead of a signed-out shell.
  const supabase = await createServerSupabaseClient();
  const [session, pathname] = await Promise.all([
    supabase.auth.getUser().then(
      ({ data, error }) => classifyAuthResult(data?.user ?? null, error),
      () => ({ state: "error" as const }),
    ),
    // NAV-1: the path (forwarded by the middleware, SEC-1C) picks the header language and the active link
    headers().then((h) => h.get(PATHNAME_HEADER) ?? "/", () => "/"),
  ]);
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
        lessonCoins: isLessonCoinsEarnEnabled(),
      }
    : null;

  const skip = (
    <a
      href="#main-content"
      className="sr-only z-90 rounded-control bg-surface px-4 py-3 text-body-sm font-semibold text-primary-700 shadow-e2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:inline-flex focus:min-h-12 focus:items-center focus-ring"
    >
      Skip to content
    </a>
  );
  const content = <CoinsFlagProvider enabled={isCoinsEnabled()}>{children}</CoinsFlagProvider>;

  // NAV-1 §3 EXAM FOCUS: a live attempt shows only the exam console — no visitor header, no sidebar, no bottom bar, no footer
  if (isExamFocus(pathname)) {
    return (
      <main id="main-content" tabIndex={-1} className="min-h-dvh flex-1 outline-none" data-exam-focus="">
        {content}
      </main>
    );
  }

  // FOOTER-1: a signed-in student gets THE student slim line; a visitor gets THE public footer (only its Exams column
  // streams, bounded ≤ 800 ms — the shell never waits; the band never reads anything); admin has no footer (its own layout)
  const footer = <StudentFooter />;
  const visitorFooter = pathname.startsWith("/admin") ? null : (
    <PublicFooter
      t={FOOTER_EN}
      categories={loadNavLive().then((live) => navCategories(navLabels("en"), live))}
      // FOOTER-1 (owner, R-6 follow-up): the band never waits on a read — on a per-request page the sign-up state is not
      // known without one, so the band shows the safe default "Explore exams" (the header still streams its own start)
      band={bandAllowed(pathname) ? { open: false, authHint: false } : null}
      langSwitch={null}
      paymentsEnabled={isPaymentsEnabled()}
    />
  );

  // NAV-1 Stage B (owner: navigation BY SESSION): a signed-in user gets THE student shell on every per-request page;
  // admin keeps its own layout (unchanged)
  if (account && !pathname.startsWith("/admin")) {
    return (
      <>
        {skip}
        <StudentShell
          t={navLabels("en")}
          account={{ name: account.name, isStaff: account.isStaff, profile: account.profile, studyPreferences: account.studyPreferences }}
          flags={{ practice: flags.PRACTICE, payments: isPaymentsEnabled() }}
          paywall={paywallOnForNav()}
          pathname={pathname}
          lessonCoins={Boolean(account.lessonCoins)}
          studyPreferencesLabel={ONBOARDING_COPY.menuLink}
          footer={footer}
        >
          {content}
        </StudentShell>
      </>
    );
  }

  return (
    <>
      {skip}
      {/* UX-FIX-1: start actions point to /auth/signup only while public sign-up is open (streamed: never awaited here).
          NAV-1 Stage A: no session → THE visitor header (admin: none — admin has its own layout). */}
      {!account && !pathname.startsWith("/admin") && <SignedOutHeader pathname={pathname} />}
      {session.state === "error" && <SessionUnavailableBanner />}
      <main id="main-content" tabIndex={-1} className="min-h-dvh flex-1 outline-none">
        {content}
      </main>
      {visitorFooter}
    </>
  );
}
