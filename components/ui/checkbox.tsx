"use client";

import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "./cn";

export const choiceRowClasses = (tile: boolean) =>
  cn(
    "group flex min-h-11 cursor-pointer items-start gap-3 py-2 text-body text-fg",
    "has-[:disabled]:cursor-not-allowed has-[:disabled]:text-ink-600",
    tile &&
      "rounded-card border border-line bg-surface px-4 py-3 hover:border-ink-300 has-[:checked]:border-2 has-[:checked]:border-primary-600 has-[:checked]:bg-primary-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
  );

export const choiceInputClasses = "focus-ring mt-0.5 size-5 shrink-0 cursor-pointer accent-primary-600 disabled:cursor-not-allowed";

export type CheckboxProps = Omit<ComponentProps<"input">, "type"> & {
  label: ReactNode;
  description?: ReactNode;
  /** Mixed state (e.g. "select all" with some selected). Exposed as aria-checked="mixed" by the browser. */
  indeterminate?: boolean;
  /** Card-style option tile (onboarding). */
  tile?: boolean;
};

/** Native checkbox with a ≥44px hit area (the whole row is the label). Group with <FieldGroup>. */
export function Checkbox({ label, description, indeterminate = false, tile = false, className, ...props }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className={cn(choiceRowClasses(tile), className)}>
      <input ref={ref} type="checkbox" className={choiceInputClasses} {...props} />
      <span className="flex flex-col">
        <span>{label}</span>
        {description && <span className="text-body-sm text-fg-secondary">{description}</span>}
      </span>
    </label>
  );
}
