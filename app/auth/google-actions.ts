"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { UserProfileService } from "@/services/user-profile.service";
import { sanitizeRedirectPath } from "@/lib/auth/safe-redirect";
import { AUTH_ERRORS, type AuthErrorCode } from "@/lib/auth/messages";
import { isGoogleSignInEnabled } from "@/lib/auth/google-flag";
import { consumeNonce } from "@/lib/auth/google-nonce";
import { isWellFormedIdToken, mapGoogleError } from "@/lib/auth/google-signin";
import { checkCaptchaToken } from "@/lib/auth/captcha";
import type { AuthState } from "@/app/auth/actions";

/**
 * AUTH-1 2b-1 (decision #66): Sign in with Google. The Google Identity Services button (rendered on our own origin)
 * hands us an ID token; we exchange it server-side with signInWithIdToken and the single-use raw nonce. Supabase auth
 * requests go through the 5 s auth timeout (lib/supabase/auth-fetch, #61). Enforced on the server: the flag is checked
 * here, not only in the UI. Never logs the credential, the nonce, cookies or emails. Roles are untouched (#60).
 * 2b-2: with the Turnstile flag on, the widget token (third argument) is shape-checked before the nonce is spent and
 * forwarded as options.captchaToken; Supabase verifies it. Missing → captcha-required, malformed → captcha-failed.
 */
const fail = (code: AuthErrorCode): AuthState => ({ error: AUTH_ERRORS[code], code });

export async function signInWithGoogleAction(credential: unknown, next: unknown, captchaToken?: unknown): Promise<AuthState> {
  if (!isGoogleSignInEnabled()) return fail("google-disabled");
  if (!isWellFormedIdToken(credential)) return fail("google-failed");
  const captcha = checkCaptchaToken(captchaToken);
  if (!captcha.ok) return fail(captcha.code);
  const nonce = await consumeNonce();
  if (!nonce) return fail("google-nonce");

  const supabase = await createServerSupabaseClient();
  let user: Parameters<typeof UserProfileService.ensureProfile>[0] | null = null;
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

  // insert-only profile (#60): an existing name / is_active is never overwritten; no role fields are written
  await UserProfileService.ensureProfile(user);
  redirect(typeof next === "string" && next !== "" ? sanitizeRedirectPath(next, "/dashboard") : "/dashboard");
}

function logGoogleError(err: unknown) {
  // server log only: classification fields, never the token, nonce, message text or any email
  const e = (err || {}) as { code?: string; status?: number; name?: string };
  console.error("[auth] google sign-in failed", { code: e.code ?? null, status: e.status ?? null, name: e.name ?? null });
}
