import type React from "react";
import type { ComponentProps } from "react";
import { cn } from "./cn";

/**
 * BRAND-2 (decision #72) glass surfaces. The look comes from `.glass-light` / `.glass-dark` in app/globals.css, which
 * are SOLID by default and blur only when backdrop-filter is supported, reduced transparency is not requested and the
 * device is not `html.lite`. Allowed ONLY on: the public nav, the home hero chips / card, the auth card and the
 * dashboard header chips — never in the exam engine, question review or admin (scripts/test_brand2.cjs).
 * At most 3 glass layers per viewport.
 */

type Tone = "light" | "dark";

/** Card on a gradient: `light` over a light gradient (ink text), `dark` over the hero (white text). */
export function GlassCard({ tone = "light", className, ...props }: ComponentProps<"div"> & { tone?: Tone }) {
  return <div className={cn(tone === "light" ? "glass-light text-fg" : "glass-dark shadow-glass", "rounded-panel p-5", className)} {...props} />;
}

/** Small pill label on a gradient (status / feature chips). Not interactive. */
export function GlassChip({ tone = "dark", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        tone === "light" ? "glass-light text-fg" : "glass-dark",
        "inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 text-body-sm font-medium",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The PUBLIC site header as a floating, sticky glass pill (the signed-in header stays solid). Renders the <header>
 * landmark itself (a sticky element cannot leave its parent); the transparent gutter passes clicks through.
 * `after` renders outside the pill (e.g. the mobile menu dialog).
 */
export function GlassNav({ className, children, after, ...props }: ComponentProps<"header"> & { after?: React.ReactNode }) {
  return (
    <header className={cn("pointer-events-none sticky top-0 z-30 px-3 pt-3", className)} {...props}>
      <div className="glass-light pointer-events-auto mx-auto flex h-16 w-full max-w-[1200px] items-center gap-3 rounded-full pl-5 pr-2">{children}</div>
      {after}
    </header>
  );
}
