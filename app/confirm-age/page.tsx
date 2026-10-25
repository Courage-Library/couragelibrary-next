import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { sanitizeRedirectPath } from "@/lib/auth/safe-redirect";
import { AGE_CHECKBOX_FIELD, AGE_CONFIRM_LABEL, AGE_CONFIRM_PATH, hasAgeConfirmation, isAgeGateEnabled } from "@/lib/auth/age-gate";
import { Card, CardBody, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/logo";
import { logoutAction } from "@/app/auth/actions";
import { confirmAgeAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm your age", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  required: "Please tick the box to confirm that you are 18 or older.",
  failed: "We couldn't save your confirmation. Please try again.",
};

/**
 * AGE-18 (owner decision, flag AGE_GATE_ENABLED): signed-in users confirm 18+ once before using the site — Google
 * sign-ins before onboarding, existing users on their next visit. Not pre-ticked; it cannot be skipped (the middleware
 * sends every other page here until it is confirmed). Signing out stays possible.
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
  if (hasAgeConfirmation(session.user.user_metadata)) redirect(target);

  const error = typeof sp.e === "string" ? ERRORS[sp.e] : undefined;

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md" data-confirm-age="">
        <CardHeader className="items-center text-center">
          <BrandLogo variant="icon" size="lg" />
          <h1 className="text-h2 font-bold text-fg">Confirm your age</h1>
          <CardDescription className="text-body">Courage Library is for adults only. Please confirm once to continue.</CardDescription>
        </CardHeader>
        <CardBody className="gap-4">
          {error && (
            <p role="alert" className="rounded-control border border-danger-200 bg-danger-50 px-3 py-2 text-body-sm text-danger-700">
              {error}
            </p>
          )}
          <form action={confirmAgeAction} className="flex flex-col gap-4">
            <input type="hidden" name="next" value={target} />
            <label className="flex min-h-12 items-start gap-3 text-body text-fg">
              <input type="checkbox" name={AGE_CHECKBOX_FIELD} required className="mt-1 size-5 shrink-0 accent-primary-600" />
              <span>{AGE_CONFIRM_LABEL}</span>
            </label>
            <Button type="submit" size="lg" className="min-h-12 w-full">
              Continue
            </Button>
          </form>
          <form action={logoutAction} className="text-center">
            <button type="submit" className="min-h-12 text-body-sm font-medium text-link underline underline-offset-2">
              Sign out
            </button>
          </form>
          <p className="text-center text-body-sm text-fg-secondary">
            Read our <Link href="/terms" className="text-link underline underline-offset-2">terms</Link> and{" "}
            <Link href="/privacy" className="text-link underline underline-offset-2">privacy policy</Link>.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
