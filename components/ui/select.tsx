import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";
import { controlClasses } from "./input";

export type SelectOption = { value: string; label: string; disabled?: boolean };

export type SelectProps = ComponentProps<"select"> & {
  options?: SelectOption[];
  /** Adds a first, empty option with this text (e.g. "Choose an exam"). */
  placeholder?: string;
};

/**
 * Native <select> (best on mobile, fully keyboard and screen-reader accessible).
 * A searchable listbox for long desktop lists comes later and follows the APG listbox pattern.
 */
export function Select({ options, placeholder, className, children, ...props }: SelectProps) {
  return (
    <div className="relative w-full">
      <select className={cn(controlClasses, "h-11 appearance-none pl-3 pr-10", className)} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-secondary"
      />
    </div>
  );
}
