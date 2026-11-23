import type { LucideIcon } from "lucide-react";

/**
 * BRAND-ICONS-1 — THE wrapper for Lucide utility icons (help, user, sign out, close, chevrons, arrows, report flag,
 * search, language …), styled to match the brand icons: 24 grid, stroke 1.75, round caps / joins, aria-hidden by
 * default. The 9 brand meanings never use this — they use <BrandIcon> (components/icons/brand-icon.tsx).
 */
export interface IconProps {
  icon: LucideIcon;
  size?: number;
  className?: string;
}

export function Icon({ icon: Glyph, size = 20, className }: IconProps) {
  return <Glyph size={size} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className} data-icon="" />;
}
