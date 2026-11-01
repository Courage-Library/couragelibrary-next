import Link from "next/link";
import { siteConfig } from "@/config/site";
import { cn } from "@/components/ui/cn";
import { DEFAULT_MARK, type BrandImage } from "@/lib/brand/brand-rules";

/**
 * The brand lockup in the header, the mobile menu, the footer and the auth cards: the OFFICIAL Courage Library logo
 * (public/images/logo.png → public/brand/mark-*.webp, 2x / 3x copies) + the name in the heading face — or, when the
 * owner uploaded one (Settings › Brand, 131), that logo alone. The logo is a brand asset: never recoloured or redrawn.
 * On the navy footer (tone "white") the official mark sits on a small white rounded plate (it has a white
 * background); an uploaded footer logo is shown as is. Sized boxes (width / height): no layout shift; never lazy.
 */
const SIZES = { sm: "text-body", md: "text-body-sm sm:text-body-lg", lg: "text-h3" } as const;

export function BrandWordmark({
  size = "md",
  tone = "ink",
  href,
  logo = null,
  className,
}: {
  size?: keyof typeof SIZES;
  tone?: "ink" | "white";
  href?: string;
  /** an uploaded logo (header or footer slot) — replaces the official mark + name */
  logo?: BrandImage | null;
  className?: string;
}) {
  const mark = logo ? (
    // eslint-disable-next-line @next/next/no-img-element -- pre-sized copies (1x / 2x); tiny, above the fold, not lazy
    <img src={logo.src} srcSet={logo.srcSet} width={logo.width} height={logo.height} alt={logo.alt || siteConfig.name} className={cn("h-8 w-auto max-w-[180px] object-contain", className)} data-brand-logo="uploaded" />
  ) : (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap font-heading font-bold tracking-tight", tone === "ink" ? "text-fg" : "text-hero-fg", SIZES[size], className)} data-brand-logo="official">
      <span className={cn("inline-flex shrink-0", tone === "white" && "rounded-control bg-surface p-1")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the official logo, pre-sized 1x / 2x / 3x WebP; not lazy */}
        <img src={DEFAULT_MARK.src} srcSet={DEFAULT_MARK.srcSet} width={DEFAULT_MARK.width} height={DEFAULT_MARK.height} alt="" className="h-8 w-auto" decoding="async" />
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
