import { createServerSupabaseClient } from "@/lib/supabase/server";
import { UserProfileService } from "@/services/user-profile.service";
import { safeRedirectUrl } from "@/lib/auth/safe-redirect";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // SEC-1D: `next` is sanitized and resolved with the URL parser on this origin (no concatenation).
  const rawNext = searchParams.get("next");
  const target = rawNext === null ? new URL("/dashboard", origin) : safeRedirectUrl(rawNext, origin);

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
      return NextResponse.redirect(target);
    }
  }

  return NextResponse.redirect(new URL("/auth/login?error=Invalid+or+expired+code", origin));
}