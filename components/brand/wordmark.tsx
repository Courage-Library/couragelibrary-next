import Link from "next/link";
import { siteConfig } from "@/config/site";
import { cn } from "@/components/ui/cn";

/**
 * BRAND-2 text wordmark ("Courage Library", heading face 700, small amber dot) used in the nav, the footer and the
 * auth cards until the new logo artwork exists (BRAND-LOGO, owner + designer). The PNG logo stays in the repo and
 * is still used by the exam player and admin (components/brand/logo.tsx). The dot is decorative.
 */
const SIZES = { sm: "text-body", md: "text-body-lg", lg: "text-h3" } as const;

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
    <span className={cn("inline-flex items-center gap-2 font-heading font-bold tracking-tight", tone === "ink" ? "text-fg" : "text-hero-fg", SIZES[size], className)}>
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-accent-500" />
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
