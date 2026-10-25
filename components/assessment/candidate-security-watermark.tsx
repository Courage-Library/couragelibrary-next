"use client";

import React from "react";
import { BRAND_PALETTE } from "@/config/brand";

interface CandidateSecurityWatermarkProps {
  examTitle?: string;
  maskedCandidateId?: string;
  attemptIdShort?: string;
  timestamp?: string;
  className?: string;
  isLighter?: boolean;
}

/**
 * F3-polish: anti-leak watermark, deliberately light and sparse. ONE mark per tile, tile ≥ 400 × 300 px, so it is
 * never denser than ~1 mark per 400 × 300 px; the opacity keeps question text (fg / fg-secondary on the surface)
 * at ≥ 4.5:1 against the watermarked background. Both limits are measured by scripts/test_f3_player.cjs (P2-WM).
 */
export const WATERMARK_TILE = { width: 440, height: 320 } as const;
export const WATERMARK_MARKS_PER_TILE = 1;
export const WATERMARK_INK = BRAND_PALETTE["ink-900"];
export const WATERMARK_OPACITY = 0.035;
export const WATERMARK_OPACITY_LIGHTER = 0.03;

export function CandidateSecurityWatermark({
  examTitle = "COURAGE LIBRARY",
  maskedCandidateId = "CL••••73",
  attemptIdShort = "A8F31C",
  timestamp = "",
  className = "",
  isLighter = false,
}: CandidateSecurityWatermarkProps) {
  const line1 = `COURAGE LIBRARY • ${examTitle.toUpperCase().slice(0, 26)}`;
  const line2 = `CANDIDATE #${maskedCandidateId} • ATTEMPT #${attemptIdShort}${timestamp ? ` • ${timestamp.toUpperCase()}` : ""}`;
  const { width: W, height: H } = WATERMARK_TILE;

  const svgContent = `
    <svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>
      <g transform='rotate(-20 ${W / 2} ${H / 2})' fill='${WATERMARK_INK}' font-family='monospace, -apple-system, sans-serif' font-size='13' font-weight='600' letter-spacing='1'>
        <text x='40' y='${H / 2 - 8}'>${line1}</text>
        <text x='40' y='${H / 2 + 12}'>${line2}</text>
      </g>
    </svg>
  `.trim().replace(/\n/g, "").replace(/\s+/g, " ");

  return (
    <div
      aria-hidden="true"
      data-watermark=""
      className={`pointer-events-none absolute inset-0 z-0 select-none overflow-hidden ${className}`}
      style={{
        opacity: isLighter ? WATERMARK_OPACITY_LIGHTER : WATERMARK_OPACITY,
        backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svgContent)}")`,
        backgroundRepeat: "repeat",
      }}
    />
  );
}
