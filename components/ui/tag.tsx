"use client";

import { X } from "lucide-react";
import { cn } from "./cn";
import { badgeClasses, type BadgeTone } from "./badge";

export type TagProps = {
  label: string;
  tone?: BadgeTone;
  onRemove?: () => void;
  className?: string;
};

/** Removable tag (filters, selected topics). The remove button has its own name: "Remove <label>". */
export function Tag({ label, tone = "neutral", onRemove, className }: TagProps) {
  return (
    <span className={cn(badgeClasses(tone), "py-0 pr-0.5", className)}>
      <span className="py-0.5">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="focus-ring inline-flex size-6 items-center justify-center rounded-badge hover:bg-ink-200/60"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      )}
    </span>
  );
}
