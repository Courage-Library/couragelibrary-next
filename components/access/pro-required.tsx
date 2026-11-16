import { Lock } from "lucide-react";
import { Container } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";

/**
 * PAY-1 B3: what a page shows when the central check (canAccess) refuses a Pro feature. Plain words; one next action
 * (the plans page); the page's one h1. The feature itself never renders behind it — the server returned first.
 */
export function ProRequired({ feature }: { feature: string }) {
  return (
    <Container className="py-12">
      <div data-pro-required="" className="mx-auto flex max-w-prose flex-col items-center gap-3 text-center">
        <span aria-hidden="true" className="text-fg-secondary">
          <Lock />
        </span>
        <h1 className="text-h1 font-bold text-fg">{feature} is part of Pro</h1>
        <p className="text-body text-fg-secondary">Pro unlocks this feature on every device you sign in with.</p>
        <ButtonLink href="/pricing">See Pro plans</ButtonLink>
      </div>
    </Container>
  );
}
