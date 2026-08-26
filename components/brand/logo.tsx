import React from "react";
import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/config/site";

interface BrandLogoProps {
  variant?: "full" | "icon" | "mark";
  size?: "sm" | "md" | "lg";
  href?: string;
  className?: string;
  showText?: boolean;
}

export function BrandLogo({
  variant = "full",
  size = "md",
  href,
  className = "",
  showText = true,
}: BrandLogoProps) {
  const dimensions = {
    sm: { width: 28, height: 28, textSize: "text-base" },
    md: { width: 36, height: 36, textSize: "text-xl" },
    lg: { width: 48, height: 48, textSize: "text-2xl" },
  }[size];

  const content = (
    <div className={`inline-flex items-center gap-2.5 font-bold text-slate-900 group ${className}`}>
      <div className="relative shrink-0 overflow-hidden rounded-xl">
        <Image
          src="/images/logo.png"
          alt="Courage Library"
          width={dimensions.width}
          height={dimensions.height}
          className="object-contain transition-transform group-hover:scale-105"
          priority
        />
      </div>
      {variant !== "icon" && showText && (
        <span className={`font-extrabold tracking-tight bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 bg-clip-text text-transparent ${dimensions.textSize}`}>
          {siteConfig.name}
        </span>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
