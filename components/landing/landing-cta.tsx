/**
 * UX-2a: the two session-dependent CTA spots of the landing page (hero + final band). Display only: a session
 * cookie switches the start action to "Go to dashboard"; nothing protected is read or shown. Each spot is its own
 * Suspense boundary, so the rest of the page never waits for the session / sign-up reads.
 * UX-FIX-1: while public sign-up is CLOSED (lib/auth/signup-availability) no start action points to /auth/signup —
 * the primary action is "Explore SSC CGL"; when sign-up is open the one label is "Start free" (the ONE primary = start action).
 * The Suspense fallback is the closed-state view (never a link to a closed sign-up).
 */
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { PillLink } from "@/components/ui/pill-button";
import { LANDING_FINAL_CTA, LANDING_HERO } from "@/content/landing";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSignupAvailability } from "@/lib/auth/signup-availability";

type Spot = "hero" | "final";
type Mode = "signed-in" | "signup-open" | "signup-closed";

async function resolveMode(): Promise<Mode> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getSession();
    if (data.session !== null) return "signed-in";
  } catch {
    /* treated as signed out */
  }
  return (await getSignupAvailability()) === "closed" ? "signup-closed" : "signup-open";
}

const arrow = <ArrowRight aria-hidden="true" className="size-5" />;

function Cta({ spot, mode }: { spot: Spot; mode: Mode }) {
  const explore = LANDING_HERO.secondaryCta;
  if (mode === "signed-in") {
    const t = spot === "hero" ? LANDING_HERO.signedInCta : LANDING_FINAL_CTA.signedInCta;
    return (
      <>
        <PillLink href={t.href} variant={spot === "hero" ? "on-dark" : "ghost-on-dark"} trailingIcon={arrow}>
          {t.label}
        </PillLink>
        {spot === "hero" && (
          <PillLink href={explore.href} variant="ghost-on-dark">
            {explore.label}
          </PillLink>
        )}
      </>
    );
  }
  if (mode === "signup-closed") {
    // the ONE primary action while registrations are closed
    return (
      <PillLink href={explore.href} variant="on-dark" trailingIcon={arrow}>
        {explore.label}
      </PillLink>
    );
  }
  const start = spot === "hero" ? LANDING_HERO.primaryCta : LANDING_FINAL_CTA.cta;
  return (
    <>
      <PillLink href={start.href} variant="on-dark" trailingIcon={arrow}>
        {start.label}
      </PillLink>
      {spot === "hero" && (
        <PillLink href={explore.href} variant="ghost-on-dark">
          {explore.label}
        </PillLink>
      )}
    </>
  );
}

async function SessionCta({ spot }: { spot: Spot }) {
  return <Cta spot={spot} mode={await resolveMode()} />;
}

export function LandingCta({ spot }: { spot: Spot }) {
  return (
    <Suspense fallback={<Cta spot={spot} mode="signup-closed" />}>
      <SessionCta spot={spot} />
    </Suspense>
  );
}
