import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";
import { COMING_SOON_EXAMS } from "@/content/public-pages";
import { examLogo } from "@/lib/logos/exam-logo";
import { CATEGORY_SLUG_RE, toPublicCategory, type CategoryExam, type CategoryRow, type PublicCategory } from "@/lib/exams/categories";

/**
 * HOME-1: public category reads (RLS: active, non-internal categories; active exams only). PERF-HOME-1: with the
 * cookie-free PUBLIC client — the result is the same for every visitor, so the cached pages can use it. Never the
 * service role, never a write. A failed read → null (the page shows its fallback, never invented numbers).
 */
const CATEGORY_COLUMNS = "id, slug, name, short_desc, display_order, is_active, is_internal, icon_key, icon_path, icon_alt";
const TIMEOUT_MS = 8000;
const timed = <T>(p: PromiseLike<T>): Promise<T | null> =>
  Promise.race([Promise.resolve(p), new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT_MS))]).catch(() => null);

/** every public category (home tiles, /exams), with its number of active exams; null = the read failed */
export const loadPublicCategories = cache(async (): Promise<PublicCategory[] | null> => {
  const sb = createPublicServerSupabaseClient();
  const [cats, exams] = await Promise.all([
    timed(sb.from("exam_categories").select(CATEGORY_COLUMNS).order("display_order").order("name")),
    timed(sb.from("exams").select("category_id").eq("is_active", true)),
  ]);
  if (!cats || cats.error || !cats.data || !exams || exams.error) return null;
  const count = new Map<string, number>();
  for (const e of exams.data || []) count.set(e.category_id, (count.get(e.category_id) ?? 0) + 1);
  return (cats.data as CategoryRow[]).filter((c) => c.is_active && !c.is_internal).map((c) => toPublicCategory(c, count.get(c.id) ?? 0));
});

/**
 * one public category with its exams (active first, then the listed "coming soon" ones); null = not a category.
 * A FAILED / timed-out category read throws (the error page, never cached) — it must not become a "not found" 404 that
 * ISR could cache for a real category (HOME-1: a flaky read once turned /exams/ssc into a 404).
 * `examsFailed`: the exam read failed — the page says so (never "no exams" + noindex because of an outage).
 */
export const loadPublicCategory = cache(async (slug: string): Promise<{ category: PublicCategory; exams: CategoryExam[]; examsFailed: boolean } | null> => {
  if (!CATEGORY_SLUG_RE.test(slug) || slug.length > 40) return null;
  const sb = createPublicServerSupabaseClient();
  const cat = await timed(sb.from("exam_categories").select(CATEGORY_COLUMNS).eq("slug", slug).maybeSingle());
  if (!cat || cat.error) throw new Error("CATEGORY_READ_FAILED");
  const row = cat.data as CategoryRow | null;
  if (!row || !row.is_active || row.is_internal) return null;
  const ex = await timed(
    sb
      .from("exams")
      .select("slug, title, logo_override_path, logo_override_alt, conducting_org:conducting_orgs(name, logo_path, logo_alt)")
      .eq("category_id", row.id)
      .eq("is_active", true)
      .order("title"),
  );
  const examsFailed = !ex || Boolean(ex.error);
  const active: CategoryExam[] = (examsFailed ? [] : ex!.data || []).map((e) => {
    const org = Array.isArray(e.conducting_org) ? e.conducting_org[0] : e.conducting_org;
    return {
      slug: e.slug,
      title: e.title,
      bodyName: org?.name ?? null,
      logo: examLogo({ override: { path: e.logo_override_path, alt: e.logo_override_alt }, org: org ? { path: org.logo_path, alt: org.logo_alt } : null }),
      status: "ACTIVE" as const,
    };
  });
  const soon: CategoryExam[] = COMING_SOON_EXAMS.filter((c) => c.category === slug && !active.some((a) => a.slug === c.slug)).map((c) => ({
    slug: c.slug,
    title: c.title,
    bodyName: c.body,
    logo: null,
    status: "COMING_SOON" as const,
  }));
  return { category: toPublicCategory(row, active.length), exams: examsFailed ? [] : [...active, ...soon], examsFailed };
});

/**
 * HOME-1 expert UX pass: the names of the public categories that have active exams, in display order — for the hero H1
 * ("Free preparation for SSC exams"). Cookie-free PUBLIC client (public rows only) + cache (5 min, tag "categories"),
 * so the hero stays in the first HTML flush; bounded at 800 ms and never rejects: a slow / failed read → [] (the hero
 * then says "government exams" — never a category that is not live).
 */
const readLiveCategoryNames = unstable_cache(
  async (): Promise<string[]> => {
    const sb = createPublicServerSupabaseClient();
    const [cats, exams] = await Promise.all([
      sb.from("exam_categories").select("id, name, display_order, is_active, is_internal").order("display_order").order("name"),
      sb.from("exams").select("category_id").eq("is_active", true),
    ]);
    if (cats.error || exams.error || !cats.data || !exams.data) throw new Error("categories read failed"); // not cached
    const live = new Set(exams.data.map((e) => e.category_id));
    return cats.data.filter((c) => c.is_active && !c.is_internal && live.has(c.id)).map((c) => c.name);
  },
  ["live-category-names", "v1"],
  { tags: ["categories"], revalidate: 300 },
);

// after a failed / timed-out read, use the generic H1 at once for a minute (an outage never slows every visit)
let namesFailedAt = 0;

export async function loadLiveCategoryNames(): Promise<string[]> {
  if (Date.now() - namesFailedAt < 60_000) return [];
  try {
    const r = await Promise.race([readLiveCategoryNames().catch(() => null), new Promise<null>((ok) => setTimeout(() => ok(null), 800))]);
    if (!r) namesFailedAt = Date.now();
    return r ?? [];
  } catch {
    namesFailedAt = Date.now();
    return [];
  }
}

/**
 * PERF-HOME-1: the categories for the cached public shell's footer — cached (5 min, tag "categories"), never rejects
 * (a failed read → null: the footer shows "All exams" only).
 */
const readPublicCategoriesCached = unstable_cache(
  async (): Promise<PublicCategory[]> => {
    const r = await loadPublicCategories();
    if (!r) throw new Error("categories read failed"); // not cached
    return r;
  },
  ["public-categories", "v1"],
  { tags: ["categories"], revalidate: 300 },
);

export function loadPublicCategoriesCached(): Promise<PublicCategory[] | null> {
  return readPublicCategoriesCached().catch(() => null);
}
