import Link from "next/link";
import { siteConfig } from "@/config/site";
import { cn } from "@/components/ui/cn";

/**
 * Wordmark ("Courage Library", heading face 700) with the "CL" monogram tile (HOME-1 owner review: a real brand mark
 * instead of the dot; solid primary, no gradient) used in the nav, the footer and the auth cards until the new logo
 * artwork exists (BRAND-LOGO, owner + designer). The PNG logo stays in the repo and is still used by the exam player
 * and admin (components/brand/logo.tsx). The tile is decorative: the name next to it is the accessible text.
 */
// md steps down on phones so the wordmark stays on one line inside the 360 px header
const SIZES = { sm: "text-body", md: "text-body-sm sm:text-body-lg", lg: "text-h3" } as const;

export function BrandWordmark({
  size = "md",
  tone = "ink",
  href,
  className,
}: {
  size?: keyof typeof SIZES;
  tone?: "ink" | "white";
  href?: string;
  className?: string;
}) {
  const mark = (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap font-heading font-bold tracking-tight", tone === "ink" ? "text-fg" : "text-hero-fg", SIZES[size], className)}>
      <span
        aria-hidden="true"
        data-brand-monogram=""
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-control text-body-sm font-bold leading-none tracking-normal",
          tone === "ink" ? "bg-primary-700 text-fg-inverse" : "bg-surface text-primary-700",
        )}
      >
        CL
      </span>
      {siteConfig.name}
    </span>
  );
  if (!href) return mark;
  return (
    <Link href={href} className={cn("inline-flex min-h-12 items-center rounded-control", tone === "ink" ? "focus-ring" : "focus-ring-on-dark")}>
      {mark}
    </Link>
  );
}
