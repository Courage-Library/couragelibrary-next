/**
 * Indian formatting (docs/ux/DESIGN_SYSTEM.md §6). These are the only number/date formatters for
 * design-system components: en-IN grouping, Asia/Kolkata time zone.
 */
const TZ = "Asia/Kolkata";

const numberFmt = new Intl.NumberFormat("en-IN");
const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const shortDateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const longDateFmt = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });

/** 100000 → "1,00,000" */
export function formatNumber(value: number): string {
  return numberFmt.format(value);
}

/** 1499 → "₹1,499" */
export function formatInr(value: number): string {
  return inrFmt.format(value);
}

/** "15 Oct 2026" */
export function formatDateShort(value: string | Date): string {
  return shortDateFmt.format(typeof value === "string" ? new Date(value) : value);
}

/** "Thursday, 15 October 2026" */
export function formatDateLong(value: string | Date): string {
  return longDateFmt.format(typeof value === "string" ? new Date(value) : value);
}

/** 5400 → "1 h 30 min"; 3600 → "1 h"; 2700 → "45 min"; 40 → "40 s" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Percentages carry at most one decimal: 72.456 → "72.5%" */
export function formatPercent(value: number): string {
  return `${Number(value.toFixed(1))}%`;
}

/** Scores: 142.5 / 200 → "142.5 / 200" (no trailing .0) */
export function formatScore(score: number, max: number): string {
  return `${Number(score.toFixed(2))} / ${Number(max.toFixed(2))}`;
}
