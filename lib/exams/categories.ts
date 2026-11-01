/**
 * HOME-1 (migration 128): exam categories — the home tiles, /exams/<category> pages and the admin grid share this model.
 * Pure; safe in client components. An INTERNAL category is never public (RLS hides it; the loaders never list it).
 * A category with no active exam is shown honestly as "Coming soon" and is NOT a link (ruling Q5).
 */
import { logoPublicUrl, logoVariantUrl, type ExamLogo } from "@/lib/logos/exam-logo";

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
