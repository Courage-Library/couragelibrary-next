import React from "react";
import { BriefcaseBusiness, FlaskConical, GraduationCap, Landmark, Shield, ShieldHalf, TrainFront } from "lucide-react";
import { logoSrcFor } from "@/lib/logos/exam-logo";
import type { CategoryIconKey, PublicCategory } from "@/lib/exams/categories";

/**
 * HOME-1: a category's icon in a FIXED square box (no layout shift): its uploaded icon (same safe pipeline as logos,
 * same-origin /media, the smallest sized copy) or else its built-in line icon (ruling Q8) — about 58 % of the box (28 px
 * in a 48 px box) inside a soft primary-tint circle (primary-700 on primary-50 ≈ 6.4:1). Decorative next to the name.
 */
const LINE: Record<CategoryIconKey, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  ssc: Landmark,
  police: Shield,
  defence: ShieldHalf,
  railway: TrainFront,
  banking: BriefcaseBusiness,
  internal: FlaskConical,
  default: GraduationCap,
};

export function CategoryIcon({ category, px = 48, priority = false }: { category: Pick<PublicCategory, "iconKey" | "icon">; px?: number; priority?: boolean }) {
  const box = "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-card";
  if (category.icon) {
    return (
      <span className={`${box} bg-white`} style={{ width: px, height: px }} data-category-icon="upload">
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP from our pipeline; no client JS */}
        <img src={logoSrcFor(category.icon, px)} alt="" width={px} height={px} loading={priority ? "eager" : "lazy"} decoding="async" className="h-full w-full object-contain" />
      </span>
    );
  }
  const Icon = LINE[category.iconKey] ?? GraduationCap;
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700" style={{ width: px, height: px }} data-category-icon="line">
      <Icon aria-hidden className="size-[58%]" />
    </span>
  );
}
