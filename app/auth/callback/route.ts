import { createServerSupabaseClient } from "@/lib/supabase/server";
import { UserProfileService } from "@/services/user-profile.service";
import { safeRedirectUrl } from "@/lib/auth/safe-redirect";
import { syncAgeConfirmationOnSignIn } from "@/lib/auth/age-confirm";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // SEC-1D: `next` is sanitized and resolved with the URL parser on this origin (no concatenation).
  const rawNext = searchParams.get("next");
  const target = rawNext === null ? new URL("/dashboard", origin) : safeRedirectUrl(rawNext, origin);

  // AUTH-1 2a: a provider-reported error (e.g. the user cancelled at Google) is answered with a fixed code.
  if (searchParams.get("error")) {
    return NextResponse.redirect(new URL("/auth/login?m=oauth-failed", origin));
  }

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (data?.user) {
        await UserProfileService.ensureProfile(data.user);
      } else {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          await UserProfileService.ensureProfile(userData.user);
        }
      }
      // AGE-18: email-confirmation links land here — copy the sign-up checkbox time to the profile (flag off → no-op)
      await syncAgeConfirmationOnSignIn(supabase);
      return NextResponse.redirect(target);
    }
  }

  // AUTH-1 2a: fixed message code (the login page renders allow-listed codes only)
  return NextResponse.redirect(new URL("/auth/login?m=link-expired", origin));
}