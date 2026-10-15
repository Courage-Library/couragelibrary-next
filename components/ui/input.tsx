import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export const controlClasses = cn(
  "focus-ring w-full rounded-control border border-line-control bg-surface text-body text-fg",
  "placeholder:text-fg-muted",
  "disabled:cursor-not-allowed disabled:border-ink-300 disabled:bg-surface-sunken disabled:text-ink-600",
  "read-only:bg-ink-50",
  "aria-invalid:border-danger-600 aria-invalid:border-2",
);

export type InputProps = Omit<ComponentProps<"input">, "prefix"> & {
  /** Decorative or textual adornment before the value (e.g. "₹" or a search icon). */
  prefix?: ReactNode;
  suffix?: ReactNode;
  /** Success state after validation (green border); never the only signal. */
  valid?: boolean;
};

/** 44px text input. Wrap in <Field> for the label, help and error wiring. */
export function Input({ prefix, suffix, valid, className, type = "text", ...props }: InputProps) {
  const input = (
    <input
      type={type}
      className={cn(
        controlClasses,
        "h-11 px-3",
        prefix ? "pl-10" : undefined,
        suffix ? "pr-10" : undefined,
        valid && "border-success-600",
        className,
      )}
      {...props}
    />
  );
  if (!prefix && !suffix) return input;
  return (
    <div className="relative w-full">
      {prefix && (
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-fg-secondary">
          {prefix}
        </span>
      )}
      {input}
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-center text-fg-secondary">
          {suffix}
        </span>
      )}
    </div>
  );
}

export type TextareaProps = ComponentProps<"textarea">;

export function Textarea({ className, rows = 4, ...props }: TextareaProps) {
  return <textarea rows={rows} className={cn(controlClasses, "min-h-24 px-3 py-2", className)} {...props} />;
}
