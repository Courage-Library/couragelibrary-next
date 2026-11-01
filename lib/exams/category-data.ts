import "server-only";
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { COMING_SOON_EXAMS } from "@/content/public-pages";
import { examLogo } from "@/lib/logos/exam-logo";
import { CATEGORY_SLUG_RE, toPublicCategory, type CategoryExam, type CategoryRow, type PublicCategory } from "@/lib/exams/categories";

/**
 * HOME-1: public category reads with the VISITOR's client (RLS: active, non-internal categories; active exams only).
 * Never the service role, never a write. A failed read → null (the page shows its fallback, never invented numbers).
 */
const CATEGORY_COLUMNS = "id, slug, name, short_desc, display_order, is_active, is_internal, icon_key, icon_path, icon_alt";
const TIMEOUT_MS = 8000;
const timed = <T>(p: PromiseLike<T>): Promise<T | null> =>
  Promise.race([Promise.resolve(p), new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT_MS))]).catch(() => null);

/** every public category (home tiles, /exams), with its number of active exams; null = the read failed */
export const loadPublicCategories = cache(async (): Promise<PublicCategory[] | null> => {
  const sb = await createServerSupabaseClient();
  const [cats, exams] = await Promise.all([
    timed(sb.from("exam_categories").select(CATEGORY_COLUMNS).order("display_order").order("name")),
    timed(sb.from("exams").select("category_id").eq("is_active", true)),
  ]);
  if (!cats || cats.error || !cats.data || !exams || exams.error) return null;
  const count = new Map<string, number>();
  for (const e of exams.data || []) count.set(e.category_id, (count.get(e.category_id) ?? 0) + 1);
  return (cats.data as CategoryRow[]).filter((c) => c.is_active && !c.is_internal).map((c) => toPublicCategory(c, count.get(c.id) ?? 0));
});

/** one public category with its exams (active first, then the listed "coming soon" ones); null = not a category */
export const loadPublicCategory = cache(async (slug: string): Promise<{ category: PublicCategory; exams: CategoryExam[] } | null> => {
  if (!CATEGORY_SLUG_RE.test(slug) || slug.length > 40) return null;
  const sb = await createServerSupabaseClient();
  const cat = await timed(sb.from("exam_categories").select(CATEGORY_COLUMNS).eq("slug", slug).maybeSingle());
  const row = cat && !cat.error ? (cat.data as CategoryRow | null) : null;
  if (!row || !row.is_active || row.is_internal) return null;
  const ex = await timed(
    sb
      .from("exams")
      .select("slug, title, logo_override_path, logo_override_alt, conducting_org:conducting_orgs(name, logo_path, logo_alt)")
      .eq("category_id", row.id)
      .eq("is_active", true)
      .order("title"),
  );
  const active: CategoryExam[] = (ex && !ex.error ? ex.data || [] : []).map((e) => {
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
  return { category: toPublicCategory(row, active.length), exams: [...active, ...soon] };
});
