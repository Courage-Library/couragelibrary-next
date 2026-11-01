/**
 * UX-2a: the two CTA spots of the landing page (hero + final band). Display only: nothing protected is read or shown.
 * PERF-HOME-1: no session read — both variants are in the cached HTML and CSS shows one (see LandingCta below).
 * UX-FIX-1: while public sign-up is CLOSED (lib/auth/signup-availability) no start action points to /auth/signup —
 * the primary action is "Explore exams"; when sign-up is open the one label is "Start free" (the ONE primary = start action).
 */
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { PillLink } from "@/components/ui/pill-button";
import { LANDING_FINAL_CTA, LANDING_HERO } from "@/content/landing";
import { getSignupAvailability } from "@/lib/auth/signup-availability";

type Spot = "hero" | "final";
type Mode = "signed-in" | "signup-open" | "signup-closed";

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

/** both variants; CSS shows one from <html data-auth> (lib/ui/auth-hint.ts, set before the first paint; no JS → signed out) */
function Variants({ spot, signedOut }: { spot: Spot; signedOut: Mode }) {
  return (
    <>
      <span className="auth-in contents" data-cta-variant="signed-in">
        <Cta spot={spot} mode="signed-in" />
      </span>
      <span className="auth-out contents" data-cta-variant="signed-out">
        <Cta spot={spot} mode={signedOut} />
      </span>
    </>
  );
}

async function LiveVariants({ spot }: { spot: Spot }) {
  const signedOut: Mode = (await getSignupAvailability()) === "closed" ? "signup-closed" : "signup-open";
  return <Variants spot={spot} signedOut={signedOut} />;
}

/**
 * PERF-HOME-1: the landing page is cached HTML shared by every visitor — it reads NO session. Both the signed-in action
 * ("Go to dashboard") and the signed-out one (by the GLOBAL sign-up setting) are in the HTML. The setting streams in its
 * own Suspense; the fallback is the sign-up-CLOSED view (never a link to a closed sign-up).
 */
export function LandingCta({ spot }: { spot: Spot }) {
  return (
    <Suspense fallback={<Variants spot={spot} signedOut="signup-closed" />}>
      <LiveVariants spot={spot} />
    </Suspense>
  );
}
