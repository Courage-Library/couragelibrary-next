import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { sanitizeRedirectPath } from "@/lib/auth/safe-redirect";
import { AGE_CONFIRM_PATH, hasAgeConfirmation, isAgeGateEnabled } from "@/lib/auth/age-gate";
import { paywallSwitchForDisplay } from "@/lib/access/policy";
import { logoutAction } from "@/app/(site)/auth/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthHeading, PRIMARY_BUTTON_CLASS } from "@/components/auth/auth-ui";
import { ConsentCheckbox, CONSENT_ERROR } from "@/components/auth/consent-checkbox";
import { confirmAgeAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Accept the Terms", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  required: CONSENT_ERROR,
  failed: "We couldn't save your confirmation. Please try again.",
};

/**
 * AGE-18 (owner decision, flag AGE_GATE_ENABLED): signed-in users confirm once before using the site — Google
 * sign-ins before onboarding, existing users on their next visit. Not pre-ticked; it cannot be skipped (the middleware
 * sends every other page here until it is confirmed). Signing out stays possible.
 * AUTH-UX-1 (owner decision 2): the same neutral eligibility consent as Create account — no age number on any auth
 * screen (the rule lives in the Terms §1.1). The field (ageConfirmed), the action (confirmAgeAction → fn_confirm_age +
 * the server-written flag), the redirects and the enforcement are unchanged.
 */
export default async function ConfirmAgePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const rawNext = typeof sp.next === "string" ? sp.next : "";
  const next = sanitizeRedirectPath(rawNext, "/dashboard");
  const target = next.startsWith(AGE_CONFIRM_PATH) ? "/dashboard" : next;
  if (!isAgeGateEnabled()) redirect(target);

  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state === "none") redirect(`/auth/login?next=${encodeURIComponent(AGE_CONFIRM_PATH)}`);
  if (session.state === "error") redirect(`/auth/unavailable?next=${encodeURIComponent(AGE_CONFIRM_PATH)}`);
  if (hasAgeConfirmation(session.user.app_metadata)) redirect(target);

  const error = typeof sp.e === "string" ? ERRORS[sp.e] : undefined;
  const paywall = await paywallSwitchForDisplay();

  return (
    <AuthShell earlyAccess={paywall === "off"}>
      <div className="flex flex-col gap-5" data-confirm-age="">
        <AuthHeading title="One more step" sub="Please accept the Terms and Privacy Policy once to continue." />
        <form action={confirmAgeAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={target} />
          <ConsentCheckbox id="confirm-consent" required error={error === CONSENT_ERROR ? error : null} />
          {error && error !== CONSENT_ERROR && (
            <p role="alert" className="rounded-xl border border-cl-coral-text bg-cl-coral-tint px-3.5 py-3 text-body-sm font-medium text-cl-coral-text">
              {error}
            </p>
          )}
          <button type="submit" className={PRIMARY_BUTTON_CLASS}>
            Continue
          </button>
        </form>
        <form action={logoutAction} className="text-center">
          <button type="submit" className="focus-ring min-h-12 text-body-sm font-semibold text-cl-blue-text underline underline-offset-2">
            Sign out
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
