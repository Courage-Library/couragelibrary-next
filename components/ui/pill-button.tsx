import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { cn } from "./cn";

/**
 * BRAND-2 (decision #72) pill buttons. Touch target ≥ 48 px (min-h-12) on every size.
 *   primary       brand blue, white text            (any light surface)
 *   accent        amber fill, ink text              (at most ONE per screen — scripts/test_brand1.cjs B-07)
 *   ghost-on-dark transparent, white text + border  (only on the dark hero / CTA band)
 * Links navigate (PillLink); buttons act (PillButton).
 */
export type PillVariant = "primary" | "accent" | "ghost-on-dark";

const VARIANTS: Record<PillVariant, string> = {
  primary: "focus-ring bg-brand text-fg-inverse shadow-soft hover:bg-brand-hover",
  accent: "focus-ring-on-dark bg-accent-500 text-on-accent hover:bg-accent-400",
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
