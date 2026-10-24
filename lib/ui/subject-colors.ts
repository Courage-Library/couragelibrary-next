/**
 * BRAND-2 (decision #71) categorical colours for subjects / sections / chart series. One token per hue, always in
 * this order, so "Reasoning" does not turn blue just because blue is the brand (BRAND-1 collapsed every hue into the
 * primary). Swatches are decorative: the subject name is always shown next to them (never colour alone).
 * Class names are written out in full so Tailwind generates them.
 */
export const SUBJECT_SWATCHES = [
  "bg-subject-blue",
  "bg-subject-teal",
  "bg-subject-violet",
  "bg-subject-amber",
  "bg-subject-rose",
  "bg-subject-slate",
] as const;

/** Swatch for the n-th series (wraps around). */
export function subjectSwatch(index: number): (typeof SUBJECT_SWATCHES)[number] {
  const i = ((Math.trunc(index) % SUBJECT_SWATCHES.length) + SUBJECT_SWATCHES.length) % SUBJECT_SWATCHES.length;
  return SUBJECT_SWATCHES[i];
}

/** Stable swatch for a subject name (same name → same colour on every page). */
export function subjectSwatchFor(name: string): (typeof SUBJECT_SWATCHES)[number] {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return subjectSwatch(h);
}
