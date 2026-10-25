"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { ONBOARDING_COPY as C } from "@/content/onboarding";

const DISMISS_KEY = "cl_onboarding_card_dismissed";

/**
 * F0 onboarding (decision #76): ONE gentle, dismissible card on the dashboard for users who skipped (or never
 * finished) onboarding — no nagging, no urgency (R11). Dismissal is remembered on this device. Rendered only when the
 * server says the flag is on and onboarding is not completed.
 */
export function OnboardingCard() {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  if (hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode: hidden for this visit only */
    }
  };
  return (
    <section aria-labelledby="onboarding-card-title" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between" data-onboarding-card="">
      <div className="flex flex-col gap-1">
        <h2 id="onboarding-card-title" className="text-body-lg font-semibold text-fg">
          {C.dashboardCard.title}
        </h2>
        <p className="text-body-sm text-fg-secondary">{C.dashboardCard.text}</p>
      </div>
      <div className="flex items-center gap-2">
        <ButtonLink href="/onboarding" variant="secondary" size="md" className="min-h-12">
          {C.dashboardCard.cta}
        </ButtonLink>
        <button type="button" onClick={dismiss} aria-label={C.dashboardCard.dismiss} className="focus-ring inline-flex size-12 items-center justify-center rounded-control text-fg-secondary hover:bg-ink-100">
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
    </section>
  );
}
