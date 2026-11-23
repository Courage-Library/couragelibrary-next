import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/app/(site)/auth/login/login-form";
import { SignupForm } from "@/app/(site)/auth/signup/signup-form";
import { ForgotPasswordForm } from "@/app/(site)/auth/forgot-password/forgot-password-form";
import { UpdatePasswordForm } from "@/app/(site)/auth/update-password/update-password-form";
import { AUTH_ERRORS } from "@/lib/auth/messages";

/**
 * AUTH-UX-1 test fixture: the REAL auth forms in THE auth layout, in fixed states, for the local page checks and
 * screenshots (scripts/live/test_auth_ux1_pages.cjs) — WITHOUT any sign-in or sign-up. Safety (no production data, ever):
 *   - a route only in a build made with EXAM_UX_FIXTURE=1 (next.config pageExtensions) — never in a deployed build;
 *     and a 404 on a production deployment anyway (defence in depth)
 *   - nothing is submitted: the states come from the forms' fixture-only `preview` prop; the Turnstile key is Cloudflare's
 *     PUBLIC always-pass TEST key and the Google client id is a fake value (the page test blocks both providers' requests)
 * ?view= login-error | login-security | signup | signup-consent | forgot | reset
 */
export const dynamic = "force-dynamic";

const TEST_CAPTCHA = { siteKey: "1x00000000000000000000AA" }; // Cloudflare's public always-pass TEST site key
const FAKE_GOOGLE = { clientId: "fixture-client-id.apps.googleusercontent.com", nonceHash: "0".repeat(64) };

export default async function AuthFixturePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.VERCEL_ENV === "production" || process.env.EXAM_UX_FIXTURE !== "1") notFound();
  const view = (await searchParams).view;
  let body: React.ReactNode;
  switch (view) {
    case "login-error":
      body = <LoginForm google={FAKE_GOOGLE} captcha={TEST_CAPTCHA} signupOpen preview={{ state: { error: AUTH_ERRORS["invalid-credentials"], code: "invalid-credentials" } }} />;
      break;
    case "login-security":
      body = <LoginForm google={FAKE_GOOGLE} captcha={TEST_CAPTCHA} signupOpen preview={{ security: "failed" }} />;
      break;
    case "signup":
      body = <SignupForm google={FAKE_GOOGLE} captcha={TEST_CAPTCHA} />;
      break;
    case "signup-consent":
      body = <SignupForm google={FAKE_GOOGLE} captcha={TEST_CAPTCHA} preview={{ consentError: true }} />;
      break;
    case "forgot":
      body = <ForgotPasswordForm captcha={TEST_CAPTCHA} />;
      break;
    case "reset":
      body = <UpdatePasswordForm />;
      break;
    default:
      body = <LoginForm google={FAKE_GOOGLE} captcha={TEST_CAPTCHA} signupOpen />;
  }
  return (
    <AuthShell earlyAccess>
      <Suspense fallback={null}>{body}</Suspense>
    </AuthShell>
  );
}
