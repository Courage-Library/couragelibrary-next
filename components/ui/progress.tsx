import { Check } from "lucide-react";
import { cn } from "./cn";

export type ProgressBarProps = {
  /** Visible label; also the accessible name. */
  label: string;
  value?: number;
  max?: number;
  /** Spoken value, e.g. "7 of 12 topics". Defaults to a percentage. */
  valueText?: string;
  /** Unknown progress: no aria-valuenow. */
  indeterminate?: boolean;
  showValue?: boolean;
  hideLabel?: boolean;
  tone?: "primary" | "success";
  className?: string;
};

const pct = (value: number, max: number) => Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));

/** Linear progress (role="progressbar"). Track ink-200, fill primary-600. */
export function ProgressBar({
  label,
  value = 0,
  max = 100,
  valueText,
  indeterminate = false,
  showValue = true,
  hideLabel = false,
  tone = "primary",
  className,
}: ProgressBarProps) {
  const p = pct(value, max);
  const text = valueText ?? `${Math.round(p)}%`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {(!hideLabel || showValue) && (
        <div className="flex items-baseline justify-between gap-2 text-body-sm">
          <span className={cn("font-medium text-fg", hideLabel && "sr-only")}>{label}</span>
          {showValue && !indeterminate && (
            <span aria-hidden="true" className="tabular-nums text-fg-secondary">
              {text}
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={indeterminate ? undefined : 0}
        aria-valuemax={indeterminate ? undefined : max}
        aria-valuenow={indeterminate ? undefined : value}
        aria-valuetext={indeterminate ? "Loading" : text}
        className="h-2 w-full overflow-hidden rounded-full bg-ink-200"
      >
        <div
          className={cn(
            "h-full rounded-full",
            tone === "success" ? "bg-success-600" : "bg-primary-700",
            indeterminate && "w-1/3 motion-safe:animate-pulse",
          )}
          style={indeterminate ? undefined : { width: `${p}%` }}
        />
      </div>
    </div>
  );
}

export type ProgressRingProps = {
  label: string;
  value: number;
  max?: number;
  valueText?: string;
  size?: number;
  className?: string;
};

/** Circular progress (topic mastery, course %). Centre text is the percentage. */
export function ProgressRing({ label, value, max = 100, valueText, size = 64, className }: ProgressRingProps) {
  const p = pct(value, max);
  const r = 15.9155; // circumference 100
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText ?? `${Math.round(p)}%`}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 36 36" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" className="stroke-ink-200" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${p} ${100 - p}`}
          className="stroke-primary-600"
        />
      </svg>
      <span aria-hidden="true" className="absolute text-caption font-semibold tabular-nums text-fg">
        {Math.round(p)}%
      </span>
    </div>
  );
}

export type ProgressStepsProps = {
  label: string;
  steps: string[];
  /** 0-based index of the current step. */
  current: number;
  className?: string;
};

/** Onboarding steps: completed (check), current (aria-current="step"), upcoming. */
export function ProgressSteps({ label, steps, current, className }: ProgressStepsProps) {
  return (
    <nav aria-label={label} className={className}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {steps.map((s, i) => {
          const done = i < current;
          const isCurrent = i === current;
          return (
            <li key={s} className="flex items-center gap-2" aria-current={isCurrent ? "step" : undefined}>
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border text-caption font-semibold",
                  done && "border-primary-600 bg-primary-700 text-fg-inverse",
                  isCurrent && "border-2 border-primary-600 bg-primary-50 text-primary-800",
                  !done && !isCurrent && "border-line-control bg-surface text-fg-secondary",
                )}
              >
                {done ? <Check className="size-4" /> : i + 1}
              </span>
              <span className={cn("text-body-sm", isCurrent ? "font-semibold text-fg" : "text-fg-secondary")}>
                {s}
                {done && <span className="sr-only"> (completed)</span>}
              </span>
              {i < steps.length - 1 && <span aria-hidden="true" className="mx-1 h-px w-6 bg-ink-300" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
