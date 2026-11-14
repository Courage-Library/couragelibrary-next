"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { UserProfileService } from "@/services/user-profile.service";
import { sanitizeRedirectPath } from "@/lib/auth/safe-redirect";
import { AUTH_ERRORS, type AuthErrorCode } from "@/lib/auth/messages";
import { isGoogleSignInEnabled } from "@/lib/auth/google-flag";
import { consumeNonce } from "@/lib/auth/google-nonce";
import { isWellFormedIdToken, mapGoogleError, newGoogleAccountRefusal } from "@/lib/auth/google-signin";
import { checkCaptchaToken } from "@/lib/auth/captcha";
import type { AuthState } from "@/app/(site)/auth/actions";
import { postLoginTarget } from "@/lib/onboarding/server";
import type { User } from "@supabase/supabase-js";
import { getSignupAvailability } from "@/lib/auth/signup-availability";
import { isAgeGateEnabled } from "@/lib/auth/age-gate";
import { recordAgeConfirmation } from "@/lib/auth/age-confirm";
import { isNewAccount, removeRefusedGoogleAccount } from "@/lib/auth/google-new-user";

/**
 * AUTH-1 2b-1 (decision #66): Sign in with Google. The Google Identity Services button (rendered on our own origin)
 * hands us an ID token; we exchange it server-side with signInWithIdToken and the single-use raw nonce. Supabase auth
 * requests go through the 5 s auth timeout (lib/supabase/auth-fetch, #61). Enforced on the server: the flag is checked
 * here, not only in the UI. Never logs the credential, the nonce, cookies or emails. Roles are untouched (#60).
 * 2b-2: with the Turnstile flag on, the widget token (third argument) is shape-checked before the nonce is spent and
 * forwarded as options.captchaToken; Supabase verifies it. Missing → captcha-required, malformed → captcha-failed.
 * AUTH-HARDEN-1: Supabase creates a NEW account inside signInWithIdToken, before we can look. So a sign-in that turns
 * out to be a new account (no profile row yet) is checked against the email sign-up's rules, server-side:
 * registrations closed → "signup-closed"; the 18+ gate on without the 18+ box (fourth argument, exactly `true`) →
 * "age-required". A refused new account is signed out and the just-created account is removed again (only behind
 * isRemovableRefusedGoogleAccount). Existing accounts are unaffected. A lookup error fails CLOSED ("generic").
 */
const fail = (code: AuthErrorCode): AuthState => ({ error: AUTH_ERRORS[code], code });

export async function signInWithGoogleAction(credential: unknown, next: unknown, captchaToken?: unknown, ageConfirmed?: unknown): Promise<AuthState> {
  if (!isGoogleSignInEnabled()) return fail("google-disabled");
  if (!isWellFormedIdToken(credential)) return fail("google-failed");
  const captcha = checkCaptchaToken(captchaToken);
  if (!captcha.ok) return fail(captcha.code);
  const nonce = await consumeNonce();
  if (!nonce) return fail("google-nonce");

  const supabase = await createServerSupabaseClient();
  let user: User | null = null;
  try {
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: credential,
      nonce,
      ...(captcha.token ? { options: { captchaToken: captcha.token } } : {}),
    });
    if (error || !data?.user) {
      const code = mapGoogleError(error);
      logGoogleError(error);
      return fail(code);
    }
    user = data.user;
  } catch (err) {
    logGoogleError(err);
    return fail(mapGoogleError(err));
  }

  // AUTH-HARDEN-1: a NEW account must pass the sign-up rules (existing accounts skip this entirely)
  let isNew: boolean;
  try {
    isNew = await isNewAccount(user.id);
  } catch {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    console.error("[auth] google sign-in: new-account check failed");
    return fail("generic");
  }
  const ageGate = isAgeGateEnabled();
  const ageOk = ageConfirmed === true;
  if (isNew) {
    const refusal = newGoogleAccountRefusal({ signup: await getSignupAvailability(), ageGate, ageConfirmed: ageOk });
    if (refusal) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      const removal = await removeRefusedGoogleAccount(user);
      // server log only: the fixed reason + what happened to the just-created account; never ids or e-mails
      console.error("[auth] google sign-in: new account refused", { reason: refusal, account: removal });
      return fail(refusal);
    }
  }

  // insert-only profile (#60): an existing name / is_active is never overwritten; no role fields are written
  await UserProfileService.ensureProfile(user);
  // AGE-18: the new account ticked the 18+ box → recorded now (fn_confirm_age + the server-written flag). Best effort:
  // if it fails, the middleware gate still sends the user to /confirm-age first.
  if (isNew && ageGate && ageOk) await recordAgeConfirmation(supabase);
  const target = typeof next === "string" && next !== "" ? sanitizeRedirectPath(next, "/dashboard") : "/dashboard";
  // F0 (#76): once, while onboarding is neither completed nor skipped (flag ONBOARDING_ENABLED, default off)
  redirect(await postLoginTarget(supabase, target));
}

function logGoogleError(err: unknown) {
  // server log only: classification fields, never the token, nonce, message text or any email
  const e = (err || {}) as { code?: string; status?: number; name?: string };
  console.error("[auth] google sign-in failed", { code: e.code ?? null, status: e.status ?? null, name: e.name ?? null });
}
