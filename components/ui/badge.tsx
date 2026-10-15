import type { ComponentProps, ReactNode } from "react";
import { Lock } from "lucide-react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "pro" | "free";

export const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "border-ink-200 bg-ink-100 text-ink-700",
  primary: "border-primary-200 bg-primary-50 text-primary-700",
  success: "border-success-200 bg-success-50 text-success-800",
  warning: "border-warning-200 bg-warning-50 text-warning-800",
  danger: "border-danger-200 bg-danger-50 text-danger-800",
  info: "border-info-200 bg-info-50 text-info-800",
  pro: "border-primary-200 bg-primary-50 text-primary-800",
  free: "border-accent-200 bg-accent-100 text-accent-900",
};

export const badgeClasses = (tone: BadgeTone) =>
  cn("inline-flex items-center gap-1 rounded-badge border px-2 py-0.5 text-caption font-medium", BADGE_TONES[tone]);

export type BadgeProps = ComponentProps<"span"> & { tone?: BadgeTone; icon?: ReactNode };

/** Status label (≥12px). Never the only carrier of meaning: the text says it. */
export function Badge({ tone = "neutral", icon, className, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeClasses(tone), className)} {...props}>
      {tone === "pro" && !icon ? <Lock aria-hidden="true" className="size-3" /> : icon}
      {children ?? (tone === "pro" ? "Pro" : tone === "free" ? "Free" : null)}
    </span>
  );
}
