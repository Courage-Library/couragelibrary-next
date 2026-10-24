import type { ComponentProps } from "react";
import { cn } from "./cn";

/**
 * BRAND-2 (decision #72) hero band: pure CSS gradients on the dark royal-blue hero surface (`.hero-gradient`, tokens
 * only) — no image, so nothing extra to download on 4G. Text is white; accent text is hero-accent-text (accent-300),
 * which is allowed only here (on primary-900 / 800). Pulled up under the floating nav so the gradient starts at the top.
 */
export function GradientHero({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section className={cn("hero-gradient relative -mt-[76px] overflow-hidden pb-14 pt-[124px] lg:pb-20 lg:pt-[148px]", className)} {...props}>
      {children}
    </section>
  );
}
