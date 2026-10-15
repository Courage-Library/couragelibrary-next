import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export type SwitchProps = Omit<ComponentProps<"input">, "type" | "role"> & {
  label: ReactNode;
  description?: ReactNode;
};

/**
 * On/off setting that applies immediately. A native checkbox with role="switch", so the checked state,
 * Space key and form submission work without JavaScript. Track off = ink-500 (4.76:1, ≥3:1 non-text).
 */
export function Switch({ label, description, className, ...props }: SwitchProps) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center justify-between gap-4 py-2 text-body text-fg has-[:disabled]:cursor-not-allowed has-[:disabled]:text-ink-600",
        className,
      )}
    >
      <span className="flex flex-col">
        <span>{label}</span>
        {description && <span className="text-body-sm text-fg-secondary">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" {...props} />
        <span
          aria-hidden="true"
          className={cn(
            "h-7 w-12 rounded-full bg-ink-500 transition-colors duration-120 ease-standard",
            "peer-checked:bg-primary-600 peer-disabled:bg-ink-300",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
          )}
        />
        <span
          aria-hidden="true"
          className="absolute left-1 top-1 size-5 rounded-full bg-surface shadow-e1 transition-transform duration-120 ease-standard peer-checked:translate-x-5"
        />
      </span>
    </label>
  );
}
