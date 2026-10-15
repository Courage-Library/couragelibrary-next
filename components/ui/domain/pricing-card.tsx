import { Check, Minus } from "lucide-react";
import { Badge } from "../badge";
import { ButtonLink, buttonClasses } from "../button";
import { cn } from "../cn";
import { formatInr } from "@/lib/format";

export type PricingFeature = { label: string; included: boolean };

export type PricingCardProps = {
  name: string;
  /** 0 for Free. */
  priceInr: number;
  period?: "month" | "year" | null;
  /** e.g. "Billed ₹1,499 per year". */
  billingNote?: string;
  features: PricingFeature[];
  highlighted?: boolean;
  currentPlan?: boolean;
  /** Payments not live: the CTA is disabled and reads "Opening soon". */
  availability?: "available" | "opening_soon";
  ctaHref?: string;
  ctaLabel?: string;
  gstNote?: string;
  className?: string;
};

export function PricingCard({
  name,
  priceInr,
  period = "month",
  billingNote,
  features,
  highlighted = false,
  currentPlan = false,
  availability = "available",
  ctaHref,
  ctaLabel,
  gstNote = "Prices include GST.",
  className,
}: PricingCardProps) {
  const headingId = `plan-${name.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex flex-col gap-4 rounded-card border bg-surface p-6",
        highlighted ? "border-2 border-primary-600 shadow-e2" : "border-line",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="text-h3 font-semibold text-fg">
          {name}
        </h3>
        {currentPlan ? <Badge tone="success">Current plan</Badge> : highlighted ? <Badge tone="primary">Recommended</Badge> : null}
      </div>
      <p className="flex items-baseline gap-1">
        <span className="text-h1 font-bold tabular-nums text-fg">{priceInr === 0 ? "₹0" : formatInr(priceInr)}</span>
        {priceInr > 0 && period && <span className="text-body text-fg-secondary">/ {period}</span>}
      </p>
      {billingNote && <p className="-mt-3 text-body-sm text-fg-secondary">{billingNote}</p>}
      <ul className="flex flex-col gap-2 text-body-sm">
        {features.map((f) => (
          <li key={f.label} className={cn("flex items-start gap-2", f.included ? "text-fg" : "text-fg-secondary")}>
            {f.included ? (
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success-700" />
            ) : (
              <Minus aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-muted" />
            )}
            <span>
              <span className="sr-only">{f.included ? "Included: " : "Not included: "}</span>
              {f.label}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-2">
        {currentPlan ? (
          <span className={buttonClasses({ variant: "secondary", fullWidth: true })} aria-disabled="true">
            Your current plan
          </span>
        ) : availability === "opening_soon" || !ctaHref ? (
          <span className={buttonClasses({ variant: highlighted ? "primary" : "secondary", fullWidth: true })} aria-disabled="true">
            Opening soon
          </span>
        ) : (
          <ButtonLink href={ctaHref} variant={highlighted ? "primary" : "secondary"} fullWidth>
            {ctaLabel ?? `Choose ${name}`}
          </ButtonLink>
        )}
        {priceInr > 0 && <p className="text-caption text-fg-muted">{gstNote}</p>}
      </div>
    </section>
  );
}
