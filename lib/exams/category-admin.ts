import "server-only";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { categoryIcon, iconKeyOf, type CategoryIconKey, type CategoryRow } from "@/lib/exams/categories";
import type { ExamLogo } from "@/lib/logos/exam-logo";

/**
 * HOME-1: the admin list of exam categories (ALL of them, internal included) with exam counts. Service role — call only
 * after the page's requireAdminPage guard (app/admin/exams/categories/page.tsx).
 */
export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  shortDesc: string;
  displayOrder: number;
  isActive: boolean;
  isInternal: boolean;
  iconKey: CategoryIconKey;
  icon: ExamLogo | null;
  activeExams: number;
  totalExams: number;
}

export async function listAdminCategories(): Promise<{ ok: true; data: AdminCategory[] } | { ok: false }> {
  const db = createAdminServerSupabaseClient();
  const [cats, exams] = await Promise.all([
    db.from("exam_categories").select("id, slug, name, short_desc, display_order, is_active, is_internal, icon_key, icon_path, icon_alt").order("display_order").order("name"),
    db.from("exams").select("category_id, is_active"),
  ]);
  if (cats.error || exams.error) return { ok: false };
  const tally = new Map<string, { a: number; t: number }>();
  for (const e of exams.data || []) {
    const t = tally.get(e.category_id) ?? { a: 0, t: 0 };
    t.t += 1;
    if (e.is_active) t.a += 1;
    tally.set(e.category_id, t);
  }
  return {
    ok: true,
    data: (cats.data as CategoryRow[]).map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      shortDesc: c.short_desc ?? "",
      displayOrder: c.display_order,
      isActive: c.is_active,
      isInternal: c.is_internal,
      iconKey: iconKeyOf(c.icon_key),
      icon: categoryIcon(c),
      activeExams: tally.get(c.id)?.a ?? 0,
      totalExams: tally.get(c.id)?.t ?? 0,
    })),
  };
}

/** HOME-1: the categories an exam may be put in (active, never internal), for the exam forms. */
export async function listCategoryOptions(): Promise<{ id: string; name: string }[]> {
  const db = createAdminServerSupabaseClient();
  const { data } = await db.from("exam_categories").select("id, name").eq("is_active", true).eq("is_internal", false).order("display_order");
  return (data || []).map((c) => ({ id: c.id, name: c.name }));
}
