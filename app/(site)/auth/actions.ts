"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { UserProfileService } from "@/services/user-profile.service";
import { getAppEnv } from "@/config/env";
import { redirect } from "next/navigation";
import { sanitizeRedirectPath } from "@/lib/auth/safe-redirect";
import {
  AUTH_ERRORS,
  AUTH_NOTICES,
  isAccountExistenceError,
  isAcceptablePassword,
  isPlausibleEmail,
  mapAuthError,
  type AuthErrorCode,
} from "@/lib/auth/messages";
import { getSignupAvailability } from "@/lib/auth/signup-availability";
import { AGE_CHECKBOX_FIELD, AGE_SIGNUP_STAMP_KEY, isAgeConfirmedInput, isAgeGateEnabled } from "@/lib/auth/age-gate";
import { isTransientAuthError } from "@/lib/auth/session-state";
import { postLoginTarget } from "@/lib/onboarding/server";
import { CAPTCHA_FIELD, checkCaptchaToken } from "@/lib/auth/captcha";

/**
 * AUTH-1 Stage 2a: auth server actions. Every response text comes from lib/auth/messages (fixed codes); Supabase
 * error text is never returned. Sign-up and password reset answer identically whether or not the account exists.
 * Field names (email, password, next, fullName, confirmPassword) are unchanged: QA sign-in, smokes and E2E use them.
 * AUTH-1 2b-2: with the Turnstile flag on, sign-in, sign-up and password reset read the widget token (field
 * "captchaToken"), shape-check it BEFORE calling Supabase (missing → captcha-required, malformed → captcha-failed) and
 * pass it as options.captchaToken; Supabase verifies it. Flag off → no token is required or sent.
 */

export interface AuthState {
  error?: string;
  success?: string;
  /** Machine-readable code (tests and analytics); the text above is always the fixed text for this code. */
  code?: AuthErrorCode | "check-email";
}

const fail = (code: AuthErrorCode): AuthState => ({ error: AUTH_ERRORS[code], code });
const logAuthError = (where: string, err: unknown) => {
  // server log only: no email, no ids; the raw text never reaches the client
  const e = (err || {}) as { code?: string; status?: number; name?: string };
  console.error(`[auth] ${where} failed`, { code: e.code ?? null, status: e.status ?? null, name: e.name ?? null });
};

/** Absolute URL of the cross-device confirmation route (decision #60: /auth/confirm, token_hash links). */
function confirmUrl(next: string): string {
  const { siteUrl } = getAppEnv();
  const u = new URL("/auth/confirm", siteUrl);
  u.searchParams.set("next", next);
  return u.toString();
}

export async function loginAction(prevState: AuthState | null, formData: FormData): Promise<AuthState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return fail("missing-fields");
  }
  const captcha = checkCaptchaToken(formData.get(CAPTCHA_FIELD));
  if (!captcha.ok) return fail(captcha.code);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    ...(captcha.token ? { options: { captchaToken: captcha.token } } : {}),
  });

  if (error) {
    const code = mapAuthError(error);
    if (code === "generic") logAuthError("sign-in", error);
    // Supabase unreachable (network / timeout / 5xx): say so instead of "incorrect password". This does not
    // depend on the account, so it reveals nothing.
    if (isTransientAuthError(error)) return fail("generic");
    // Never confirm or deny that an account exists: everything that is not rate limiting / unconfirmed is
    // "incorrect email or password".
    return fail(code === "rate-limited" || code === "email-not-confirmed" || code === "captcha-failed" ? code : "invalid-credentials");
  }

  if (data?.user) {
    await UserProfileService.ensureProfile(data.user);
  }

  // SEC-1D: honour `next` (sanitized server-side; hostile values fall back to "/"). Admin targets still
  // pass through requireAdminPage, so this grants nothing.
  const next = formData.get("next");
  const target = typeof next === "string" && next !== "" ? sanitizeRedirectPath(next) : "/dashboard";
  // F0 (#76): once, while onboarding is neither completed nor skipped (flag ONBOARDING_ENABLED, default off)
  redirect(await postLoginTarget(supabase, target));
}

export async function signupAction(prevState: AuthState | null, formData: FormData): Promise<AuthState> {
  const fullName = formData.get("fullName");
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return fail("missing-fields");
  }
  if (!isPlausibleEmail(email)) return fail("invalid-email");
  if (!isAcceptablePassword(password)) return fail("weak-password");
  // AGE-18: the 18+ checkbox is required (server-side; the browser's `required` is only a convenience)
  const ageGate = isAgeGateEnabled();
  if (ageGate && !isAgeConfirmedInput(formData.get(AGE_CHECKBOX_FIELD))) return fail("age-required");
  if ((await getSignupAvailability()) === "closed") return fail("signup-closed");
  const captcha = checkCaptchaToken(formData.get(CAPTCHA_FIELD));
  if (!captcha.ok) return fail(captcha.code);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // AGE-18: no session exists until the email is confirmed, so the checkbox time travels in the sign-up metadata as
      // an INPUT only; the first sign-in records it with fn_confirm_age and the server mirrors app_metadata (age-confirm.ts)
      data: { full_name: typeof fullName === "string" ? fullName.trim().slice(0, 120) : "", ...(ageGate ? { [AGE_SIGNUP_STAMP_KEY]: new Date().toISOString() } : {}) },
      emailRedirectTo: confirmUrl("/dashboard"),
      ...(captcha.token ? { captchaToken: captcha.token } : {}),
    },
  });

  if (error) {
    // "already registered" must look exactly like a new sign-up (no enumeration).
    if (!isAccountExistenceError(error)) {
      const code = mapAuthError(error);
      if (code === "rate-limited" || code === "weak-password" || code === "invalid-email" || code === "signup-closed" || code === "captcha-failed") return fail(code);
      logAuthError("sign-up", error);
      return fail("generic");
    }
  } else if (data?.session && data.user) {
    // Only when email confirmation is off (not our configuration): a session exists, so continue signed in.
    await UserProfileService.ensureProfile(data.user);
    redirect("/dashboard");
  }

  // Email confirmation on (our configuration): same answer for a new and for an existing address.
  return { success: AUTH_NOTICES["check-email"].text, code: "check-email" };
}

export async function logoutAction() {
  const supabase = await createServerSupabaseClient();
  // AUTH-1: explicit global scope = signs out every session of this user (auth-js default, now documented).
  await supabase.auth.signOut({ scope: "global" });
  redirect("/auth/login?m=signed-out");
}

export async function forgotPasswordAction(prevState: AuthState | null, formData: FormData): Promise<AuthState> {
  const email = formData.get("email");

  if (!isPlausibleEmail(email)) return fail("invalid-email");
  const captcha = checkCaptchaToken(formData.get(CAPTCHA_FIELD));
  if (!captcha.ok) return fail(captcha.code);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email as string, {
    redirectTo: confirmUrl("/auth/update-password"),
    ...(captcha.token ? { captchaToken: captcha.token } : {}),
  });

  if (error && !isAccountExistenceError(error)) {
    const code = mapAuthError(error);
    // captcha-failed is decided before Supabase looks at the address, so it reveals nothing
    if (code === "rate-limited" || code === "captcha-failed") return fail(code);
    logAuthError("password-reset", error);
    // Infrastructure trouble: still answer success-shaped so the response does not depend on the address.
  }

  // Identical for existing and unknown addresses.
  return { success: AUTH_NOTICES["check-email"].text, code: "check-email" };
}

export async function updatePasswordAction(prevState: AuthState | null, formData: FormData): Promise<AuthState> {
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (typeof password !== "string" || typeof confirmPassword !== "string" || !password || !confirmPassword) {
    return fail("missing-fields");
  }
  if (!isAcceptablePassword(password)) return fail("weak-password");
  if (password !== confirmPassword) return fail("password-mismatch");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    const code = mapAuthError(error);
    if (code === "weak-password" || code === "session-missing" || code === "rate-limited") return fail(code);
    logAuthError("update-password", error);
    return fail("generic");
  }

  // Sign out every session (including this recovery session) so the new password is required everywhere.
  await supabase.auth.signOut({ scope: "global" });
  redirect("/auth/login?m=password-updated");
}
