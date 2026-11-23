"use client";

import { useId, type CSSProperties } from "react";
import { BRAND_DEPTH, BRAND_GRADIENTS, BRAND_ICONS, type BrandIconName } from "@/lib/icons/brand-icon-data";

/**
 * BRAND-ICONS-1 — THE brand icon (owner spec docs/design/BRAND_ICONS_V1_SPEC.md). Inline SVG built from the generated
 * data module (lib/icons/brand-icon-data.ts ← the 27 masters in docs/design/brand-icons-v1/). 24 grid, stroke 1.75,
 * round caps / joins, currentColor strokes; aria-hidden by default (decorative next to text — icon-only buttons keep
 * their own aria-label + tooltip).
 *   idle (default)   outline triangle, currentColor; NO <defs>, no ids
 *   active           the triangle filled with the fixed logo gradient (todays-mock: cyan front + violet depth)
 *   active="current" nav items: idle, and the active style under [aria-current="page"] (app/globals.css) — the student
 *                    shell keeps aria-current right after client-side navigation, so exactly the current item is active
 *   onBlue           solid currentColor triangle (white on the blue button); onBlue beats active
 * Gradient ids are unique per rendered instance (useId), so icons on one page never break each other's fill.
 * Sizes: at < 18 px a gradient never renders (idle instead); the six with a small signature never render below 18 px
 * in this phase (owner, BRAND-ICONS-1; backlog: simplified 16 px drawings).
 */
export const BRAND_ICON_MIN_18: readonly BrandIconName[] = ["practice", "mocks", "memory-lock", "mistake-vault", "results", "current-affairs"];

export interface BrandIconProps {
  name: BrandIconName;
  /** px; 16 inline · 20 nav / buttons · 22 phone bar · 24 headings · 26–32 cards */
  size?: number;
  active?: boolean | "current";
  onBlue?: boolean;
  className?: string;
}

export function brandIconSize(name: BrandIconName, size: number): number {
  return BRAND_ICON_MIN_18.includes(name) ? Math.max(18, size) : size;
}

export function BrandIcon({ name, size = 20, active = false, onBlue = false, className }: BrandIconProps) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const shape = BRAND_ICONS[name];
  const px = brandIconSize(name, size);
  const mode: "idle" | "active" | "current" | "onBlue" = onBlue ? "onBlue" : px < 18 || !active ? "idle" : active === "current" ? "current" : "active";
  const gid = `cl-bi-${name}-${uid}`;
  const stops = BRAND_GRADIENTS[shape.gradient];
  const withDefs = mode === "active" || mode === "current";
  const tri =
    mode === "active"
      ? { fill: `url(#${gid})`, stroke: "none" }
      : mode === "onBlue"
        ? { fill: "currentColor", stroke: "none" }
        : { fill: "none", stroke: "currentColor" };
  const depth = shape.depth
    ? mode === "active"
      ? { fill: BRAND_DEPTH.activeFill, stroke: "none" }
      : mode === "onBlue"
        ? { fill: "currentColor", fillOpacity: BRAND_DEPTH.onBlueOpacity, stroke: "none" }
        : { fill: "none", stroke: BRAND_DEPTH.idleStroke }
    : null;
  return (
    <svg
      className={className ? `cl-bi ${className}` : "cl-bi"}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-brand-icon={name}
      data-variant={mode}
      style={mode === "current" ? ({ "--cl-bi-fill": `url(#${gid})` } as CSSProperties) : undefined}
    >
      {withDefs && (
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            {stops.map((s) => (
              <stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>
      )}
      {shape.outlines.map((d) => (
        <path key={d} d={d} />
      ))}
      {shape.depth && depth && <path className={mode === "current" ? "cl-bi__depth" : undefined} d={shape.depth.d} transform={shape.depth.transform} {...depth} />}
      <path className={mode === "current" ? "cl-bi__tri" : undefined} d={shape.triangle.d} transform={shape.triangle.transform} {...tri} />
    </svg>
  );
}
