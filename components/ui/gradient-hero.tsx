import type { ComponentProps } from "react";
import { cn } from "./cn";

/**
 * BRAND-2 (decision #72) hero band: pure CSS gradients on the dark royal-blue hero surface (`.hero-gradient`, tokens
 * only) — no image, so nothing extra to download on 4G. Text is white; accent text is hero-accent-text (accent-300),
 * which is allowed only here (on primary-900 / 800). HOME-1: starts below the solid header; `hero-depth` adds the faint
 * grid + soft brand shapes (CSS only, decorative, no image request).
 */
export function GradientHero({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section className={cn("hero-gradient hero-depth relative isolate overflow-hidden pb-14 pt-10 lg:pb-20 lg:pt-16", className)} {...props}>
      {children}
    </section>
  );
}
