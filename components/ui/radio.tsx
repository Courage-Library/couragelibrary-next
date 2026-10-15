import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

// Shared with Checkbox; duplicated here so this file stays a server component.
const rowClasses = (tile: boolean) =>
  cn(
    "group flex min-h-11 cursor-pointer items-start gap-3 py-2 text-body text-fg",
    "has-[:disabled]:cursor-not-allowed has-[:disabled]:text-ink-600",
    tile &&
      "rounded-card border border-line bg-surface px-4 py-3 hover:border-ink-300 has-[:checked]:border-2 has-[:checked]:border-primary-600 has-[:checked]:bg-primary-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
  );

export type RadioProps = Omit<ComponentProps<"input">, "type"> & {
  label: ReactNode;
  description?: ReactNode;
  tile?: boolean;
};

/**
 * Native radio. Put radios sharing a `name` inside <FieldGroup> (fieldset + legend); the browser provides
 * arrow-key movement within the group.
 */
export function Radio({ label, description, tile = false, className, ...props }: RadioProps) {
  return (
    <label className={cn(rowClasses(tile), className)}>
      <input
        type="radio"
        className="focus-ring mt-0.5 size-5 shrink-0 cursor-pointer accent-primary-600 disabled:cursor-not-allowed"
        {...props}
      />
      <span className="flex flex-col">
        <span>{label}</span>
        {description && <span className="text-body-sm text-fg-secondary">{description}</span>}
      </span>
    </label>
  );
}
