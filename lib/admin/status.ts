/**
 * ADMIN-UX-1: ONE status vocabulary for every admin page (owner ruling, phase A §5.6). Six chips, text + colour (never
 * colour alone). Phase B uses it in search results; phase C rolls it out to every list. Pure (offline-testable).
 *   Draft grey · In review amber · Approved blue · Published green · Rejected red · Archived muted
 */
export type ChipKind = "draft" | "review" | "approved" | "published" | "rejected" | "archived";

const KIND: Record<string, ChipKind> = {
  DRAFT: "draft", INACTIVE: "archived",
  IN_REVIEW: "review", CHANGES_REQUESTED: "review", UNDER_REVIEW: "review", OPEN: "review", PENDING: "review", AI_RESPONSE_PENDING: "review",
  APPROVED: "approved", COMPILED: "approved", VERIFIED: "approved", IN_PROGRESS: "approved", VALIDATED: "approved",
  PUBLISHED: "published", ACTIVE: "published", RESOLVED: "published", LIVE: "approved",
  REJECTED: "rejected", FAILED: "rejected", VALIDATION_FAILED: "rejected",
  ARCHIVED: "archived", SUPERSEDED: "archived", CLOSED: "archived", REFUNDED: "archived", RESOLVED_DISMISSED: "archived", RESOLVED_REMOVED: "published",
};

/** Human labels where the raw code would mislead; otherwise the code in sentence case. */
const LABEL: Record<string, string> = {
  CHANGES_REQUESTED: "Changes requested", COMPILED: "Ready to publish", OPEN: "Open", UNDER_REVIEW: "Under review",
  IN_PROGRESS: "In progress", RESOLVED_REMOVED: "Content removed", RESOLVED_DISMISSED: "Dismissed", INACTIVE: "Inactive",
};

export function chipKind(status: string | null | undefined): ChipKind {
  return KIND[String(status ?? "").toUpperCase()] ?? "draft";
}

export function chipLabel(status: string | null | undefined): string {
  const s = String(status ?? "").toUpperCase();
  if (LABEL[s]) return LABEL[s];
  const t = s.replace(/_/g, " ").toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Unknown";
}

/** Token classes per kind (student-site tokens; amber only for "In review", R4 keeps amber buttons for the primary). */
export const CHIP_CLASSES: Record<ChipKind, string> = {
  draft: "border-ink-300 bg-ink-100 text-ink-700",
  review: "border-accent-200 bg-accent-50 text-accent-800",
  approved: "border-primary-200 bg-primary-50 text-primary-700",
  published: "border-success-200 bg-success-50 text-success-800",
  rejected: "border-danger-200 bg-danger-50 text-danger-800",
  archived: "border-line bg-surface text-fg-secondary",
};
