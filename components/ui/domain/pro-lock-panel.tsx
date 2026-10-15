import type { ReactNode } from "react";
import { BellRing, Check, Lock } from "lucide-react";
import { cn } from "../cn";

export type ProLockPanelProps = {
  /** What is locked, e.g. "Detailed solutions for every question". */
  feature: string;
  /** Why it matters / what Pro adds. */
  description?: string;
  benefits?: string[];
  /** Payments not live yet → "Opening soon". */
  availability?: "available" | "opening_soon";
  /** The student already asked to be notified. */
  interestRecorded?: boolean;
  /** CTA (ButtonLink to pricing, or a "Notify me" form/button). Rendered only when interest is not recorded. */
  action?: ReactNode;
  variant?: "inline" | "card";
  className?: string;
};

/**
 * Explains what is locked and why, with one focusable CTA. Never hides content the student already has;
 * the correct answer itself is never paywalled (owner decision).
 */
export function ProLockPanel({
  feature,
  description,
  benefits = [],
  availability = "opening_soon",
  interestRecorded = false,
  action,
  variant = "inline",
  className,
}: ProLockPanelProps) {
  return (
    <aside
      aria-label={`${feature}: included in Pro`}
      className={cn(
        "flex flex-col gap-3 rounded-card border border-primary-200 bg-primary-50 text-primary-900",
        variant === "inline" ? "p-4" : "p-6 shadow-e1",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-primary-700">
          <Lock className="size-4" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-body font-semibold">Included in Pro</p>
          <p className="text-body-sm">
            {feature}.{availability === "opening_soon" && " Opening soon."}
          </p>
          {description && <p className="text-body-sm text-primary-800">{description}</p>}
        </div>
      </div>
      {benefits.length > 0 && (
        <ul className="flex flex-col gap-1 pl-12 text-body-sm">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-700" />
              {b}
            </li>
          ))}
        </ul>
      )}
      <div className="pl-12">
        {interestRecorded ? (
          <p role="status" className="inline-flex items-center gap-2 text-body-sm font-medium text-primary-800">
            <BellRing aria-hidden="true" className="size-4" />
            We&apos;ll notify you when Pro opens.
          </p>
        ) : (
          action
        )}
      </div>
    </aside>
  );
}
