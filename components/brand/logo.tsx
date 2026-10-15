import React from "react";
import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { cn } from "@/components/ui/cn";

interface BrandLogoProps {
  variant?: "full" | "icon" | "mark";
  size?: "sm" | "md" | "lg";
  href?: string;
  className?: string;
  showText?: boolean;
}

const DIMENSIONS = {
  sm: { px: 28, text: "text-body" },
  md: { px: 36, text: "text-body-lg" },
  lg: { px: 48, text: "text-h3" },
};

/** Logo mark + wordmark (ink on light surfaces). With `href` the whole logo is one link named by the site name. */
export function BrandLogo({ variant = "full", size = "md", href, className, showText = true }: BrandLogoProps) {
  const d = DIMENSIONS[size];
  const withText = variant !== "icon" && showText;
  const content = (
    <span className={cn("inline-flex items-center gap-2.5 font-bold text-fg", className)}>
      <Image
        src="/images/logo.png"
        alt={withText ? "" : siteConfig.name}
        width={d.px}
        height={d.px}
        className="shrink-0 rounded-control object-contain"
        priority
      />
      {withText && <span className={cn("tracking-tight", d.text)}>{siteConfig.name}</span>}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="focus-ring inline-flex rounded-control">
        {content}
      </Link>
    );
  }
  return content;
}
