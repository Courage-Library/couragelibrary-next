/**
 * HOME-1 (migration 128): exam categories — the home tiles, /exams/<category> pages and the admin grid share this model.
 * Pure; safe in client components. An INTERNAL category is never public (RLS hides it; the loaders never list it).
 * A category with no active exam is shown honestly as "Coming soon" and is NOT a link (ruling Q5).
 */
import { logoPublicUrl, logoVariantUrl, type ExamLogo } from "@/lib/logos/exam-logo";
import { andList } from "@/lib/text/and-list";

export const CATEGORY_ICON_KEYS = ["ssc", "police", "defence", "railway", "banking", "internal", "default"] as const;
export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  short_desc: string | null;
  display_order: number;
  is_active: boolean;
  is_internal: boolean;
  icon_key: string;
  icon_path: string | null;
  icon_alt: string | null;
}

export interface CategoryExam {
  slug: string;
  title: string;
  logo: ExamLogo | null;
  bodyName: string | null;
  /** an active exam (a page exists) or a listed "coming soon" exam (content/landing.ts) */
  status: "ACTIVE" | "COMING_SOON";
}

export interface PublicCategory {
  id: string;
  slug: string;
  name: string;
  shortDesc: string | null;
  iconKey: CategoryIconKey;
  /** an uploaded icon (replaces the built-in line icon) */
  icon: ExamLogo | null;
  activeExams: number;
}

export const iconKeyOf = (k: string | null | undefined): CategoryIconKey => (CATEGORY_ICON_KEYS as readonly string[]).includes(k ?? "") ? (k as CategoryIconKey) : "default";

export function categoryIcon(row: Pick<CategoryRow, "icon_path" | "icon_alt">): ExamLogo | null {
  const src = row.icon_alt ? logoPublicUrl(row.icon_path) : null;
  return src && row.icon_alt ? { src, alt: row.icon_alt, src64: logoVariantUrl(row.icon_path, 64) ?? undefined, src128: logoVariantUrl(row.icon_path, 128) ?? undefined } : null;
}

export function toPublicCategory(row: CategoryRow, activeExams: number): PublicCategory {
  return { id: row.id, slug: row.slug, name: row.name, shortDesc: row.short_desc, iconKey: iconKeyOf(row.icon_key), icon: categoryIcon(row), activeExams };
}

/** the tile label: "1 exam" / "3 exams" / "Coming soon" */
export const categoryCountLabel = (n: number) => (n > 0 ? `${n} exam${n === 1 ? "" : "s"}` : "Coming soon");

export const CATEGORY_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * UX-IMP-1 (owner, IMPECCABLE-1 A-7): the category intro is generated from the LISTED exams only — live exams by name,
 * listed coming-soon exams by name, nothing else (never an exam the page does not list; never the admin free text,
 * which can name exams that are not here). null when there is nothing honest to say (no exams / the read failed).
 */
export function categoryIntro(categoryName: string, exams: readonly CategoryExam[]): string | null {
  const live = exams.filter((e) => e.status === "ACTIVE").map((e) => e.title);
  const soon = exams.filter((e) => e.status === "COMING_SOON").map((e) => e.title);
  if (live.length === 0 && soon.length === 0) return null;
  const parts: string[] = [];
  if (live.length) parts.push(`Free preparation for ${andList(live)}: lessons, practice and mock tests.`);
  if (soon.length) parts.push(`${live.length ? "Coming soon" : `${categoryName} exams coming soon`}: ${andList(soon)}.`);
  return parts.join(" ");
}
