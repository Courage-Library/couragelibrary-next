import React from "react";
import { LOGO_DISPLAY_SIZES, logoInitials, type ExamLogo } from "@/lib/logos/exam-logo";

/**
 * EXAM-LOGO-1: an exam's (or body's) logo in a FIXED square box — width / height always set, so no layout shift; lazy
 * unless `priority`. A plain server-rendered <img>, NOT next/image: the stored file is already a 512 × 512 WebP made by
 * the server, and next/image's client JS pushed "/" over its First Load JS budget (BRAND2 P-07, 107 → 112 kB).
 * No logo (legacy exams only) → an initials tile with the same box.
 */
export function ExamLogoBadge({ logo, name, size = "md", priority = false }: { logo: ExamLogo | null; name: string; size?: keyof typeof LOGO_DISPLAY_SIZES; priority?: boolean }) {
  const px = LOGO_DISPLAY_SIZES[size];
  const box = "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-card border border-line bg-white";
  if (logo) {
    return (
      <span className={box} style={{ width: px, height: px }} data-exam-logo="">
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-optimised 512×512 WebP; no client JS (P-07 budget) */}
        <img src={logo.src} alt={logo.alt} width={px} height={px} loading={priority ? "eager" : "lazy"} decoding="async" className="h-full w-full object-contain" />
      </span>
    );
  }
  return (
    <span role="img" aria-label={`${name} (logo not added yet)`} className={`${box} bg-ink-50 font-semibold text-fg-secondary`} style={{ width: px, height: px, fontSize: Math.max(11, Math.round(px / 3.2)) }} data-exam-logo-fallback="">
      <span aria-hidden="true">{logoInitials(name)}</span>
    </span>
  );
}

/** EXAM-LOGO-1 item 6: one line on every exam page. */
export function NotAffiliatedLine({ body }: { body: string }) {
  return (
    <p className="text-[13px] text-fg-secondary" data-not-affiliated="">
      Courage Library is an independent platform and is not affiliated with {body}.
    </p>
  );
}
