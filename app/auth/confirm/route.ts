import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { UserProfileService } from "@/services/user-profile.service";
import { safeRedirectUrl } from "@/lib/auth/safe-redirect";
import { postLoginTarget } from "@/lib/onboarding/server";

/**
 * AUTH-1 Stage 2a: email-link landing (sign-up confirmation, password recovery, email change).
 *
 * Preferred: `?token_hash=…&type=…` → verifyOtp. Works on ANY device (no PKCE verifier cookie needed), so a reset
 * link opened in a phone mail app works even when the reset was requested on a laptop. Email templates must link
 * here with {{ .TokenHash }} (owner pastes the templates; see the AUTH-1 Stage 2a report).
 * Legacy: `?code=…` (PKCE) is still exchanged, so links already sent with the default template keep working on the
 * device that requested them.
 * The target is `next` through the SEC-1D sanitizer (#20); recovery always lands on /auth/update-password.
 * Failures go to /auth/login?m=link-expired (a fixed code, never provider text).
 */

const TYPES = new Set<EmailOtpType>(["signup", "email", "recovery", "email_change", "invite"]);
const DEFAULT_NEXT: Record<string, string> = { recovery: "/auth/update-password" };

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");

  const fail = () => NextResponse.redirect(new URL("/auth/login?m=link-expired", origin));
  const type = rawType && TYPES.has(rawType as EmailOtpType) ? (rawType as EmailOtpType) : null;
  const isRecovery = type === "recovery" || (!type && rawNext === "/auth/update-password");
  const fallback = DEFAULT_NEXT[type ?? ""] ?? "/dashboard";
  // Recovery must end on the password form; any other `next` is sanitized (same-origin path only).
  const target = isRecovery ? new URL("/auth/update-password", origin) : safeRedirectUrl(rawNext ?? fallback, origin, fallback);

  try {
    const supabase = await createServerSupabaseClient();
    if (tokenHash) {
      if (!type || tokenHash.length > 512) return fail();
      const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (error || !data?.user) return fail();
      if (type !== "recovery") await UserProfileService.ensureProfile(data.user);
      // F0 (#76): sign-up confirmation / magic-link sign-in may go to /onboarding once (recovery, invite and e-mail
      // change keep their own targets). Flag ONBOARDING_ENABLED, default off.
      if (type === "signup" || type === "email") {
        const path = await postLoginTarget(supabase, `${target.pathname}${target.search}`);
        return NextResponse.redirect(new URL(path, origin));
      }
      return NextResponse.redirect(target);
    }
    if (code) {
      if (code.length > 512) return fail();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data?.user) return fail();
      if (!isRecovery) await UserProfileService.ensureProfile(data.user);
      return NextResponse.redirect(target);
    }
  } catch {
    return fail();
  }
  return fail();
}
