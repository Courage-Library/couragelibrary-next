import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { cn } from "./cn";

/**
 * Pill buttons (BRAND-3, decision #84). Touch target ≥ 48 px (min-h-12) on every size.
 *   primary       THE primary action: solid blue-700, white text, any light surface — at most ONE per screen (R4 revised,
 *                 scripts/test_brand1.cjs B-07)
 *   on-dark       the primary action on the dark / brand-gradient hero and CTA band: white fill, blue-700 text (a solid
 *                 blue pill would disappear into the blue hero) — also the ONE primary of that screen
 *   outline       blue-700 border + text on a light surface — secondary actions and the HEADER start action (a screen
 *                 never shows two solid primaries)
 *   ghost-on-dark transparent, white text + border  (secondary, only on the dark hero / CTA band)
 * Links navigate (PillLink); buttons act (PillButton).
 */
export type PillVariant = "primary" | "on-dark" | "outline" | "ghost-on-dark";

const VARIANTS: Record<PillVariant, string> = {
  primary: "focus-ring bg-brand text-fg-inverse shadow-soft hover:bg-brand-hover",
  "on-dark": "focus-ring-on-dark bg-surface text-primary-700 shadow-soft hover:bg-primary-50",
  outline: "focus-ring border border-primary-700 text-primary-700 hover:bg-primary-50",
  "ghost-on-dark": "focus-ring-on-dark border border-hero-fg-muted text-hero-fg hover:bg-hero-bg-mid",
};

export function pillClasses({ variant = "primary", fullWidth = false, className }: { variant?: PillVariant; fullWidth?: boolean; className?: string } = {}) {
  return cn(
    "inline-flex min-h-12 shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 text-body font-semibold",
    "transition-colors duration-120 ease-standard",
    VARIANTS[variant],
    fullWidth && "w-full",
    className,
  );
}

type Common = { variant?: PillVariant; fullWidth?: boolean; trailingIcon?: ReactNode };

export function PillLink({ variant, fullWidth, trailingIcon, className, children, ...props }: ComponentProps<typeof Link> & Common) {
  return (
    <Link className={pillClasses({ variant, fullWidth, className })} {...props}>
      {children}
      {trailingIcon}
    </Link>
  );
}

export function PillButton({ variant, fullWidth, trailingIcon, className, type = "button", children, ...props }: ComponentProps<"button"> & Common) {
  return (
    <button type={type} className={pillClasses({ variant, fullWidth, className })} {...props}>
      {children}
      {trailingIcon}
    </button>
  );
}
