/**
 * UX-2a: the two session-dependent CTA spots of the landing page (hero + final band). Display only: a session
 * cookie switches "Start free" to "Go to dashboard"; nothing protected is read or shown. Each spot is its own
 * Suspense boundary (fallback: the signed-out CTA), so the rest of the page never waits for the session read.
 */
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { PillLink } from "@/components/ui/pill-button";
import { LANDING_FINAL_CTA, LANDING_HERO } from "@/content/landing";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Spot = "hero" | "final";

async function hasSessionCookie(): Promise<boolean> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getSession();
    return data.session !== null;
  } catch {
    return false;
  }
}

function Cta({ spot, signedIn }: { spot: Spot; signedIn: boolean }) {
  const copy = spot === "hero" ? LANDING_HERO : LANDING_FINAL_CTA;
  const target = signedIn ? copy.signedInCta : spot === "hero" ? LANDING_HERO.primaryCta : LANDING_FINAL_CTA.cta;
  return (
    // BRAND-2: the hero CTA is the page's ONE accent CTA; the final band (same dark gradient) uses ghost-on-dark
    <PillLink href={target.href} variant={spot === "hero" ? "accent" : "ghost-on-dark"} trailingIcon={<ArrowRight aria-hidden="true" className="size-5" />}>
      {target.label}
    </PillLink>
  );
}

async function SessionCta({ spot }: { spot: Spot }) {
  return <Cta spot={spot} signedIn={await hasSessionCookie()} />;
}

export function LandingCta({ spot }: { spot: Spot }) {
  return (
    <Suspense fallback={<Cta spot={spot} signedIn={false} />}>
      <SessionCta spot={spot} />
    </Suspense>
  );
}
