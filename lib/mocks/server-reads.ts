import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import type { AppSupabaseClient } from "@/lib/supabase/types";

/**
 * PAY-1 B2b: clients lose direct reads of mock_tests (the 145 revoke), so pages read them on the SERVER — with the
 * visibility a listing had under RLS: published and NOT dynamic (a user's own dynamic mocks are never listed). The
 * other tables (mock_templates / exams / exam_patterns) are still read through the caller's session client, so their
 * own RLS is unchanged; the results come back in the shape the old PostgREST embeds returned.
 */

/** Published, non-dynamic mocks grouped by template_id (the old `mock_templates(…, mock_tests(cols))` embed). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function publishedStaticMocksByTemplate(templateIds: string[], cols: string): Promise<Map<string, any[]>> {
  const ids = [...new Set(templateIds.filter(Boolean))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const by = new Map<string, any[]>();
  if (!ids.length) return by;
  const { data } = await createAdminServerSupabaseClient()
    .from("mock_tests")
    .select(`template_id, ${cols}`)
    .in("template_id", ids)
    .eq("is_dynamic", false)
    .eq("status", "published");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data || []) as any[]) {
    const { template_id, ...rest } = r;
    by.set(template_id, [...(by.get(template_id) ?? []), rest]);
  }
  return by;
}

/** Attach `mock_tests` (published, non-dynamic) to template rows that carry `id`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function attachPublishedStaticMocks<T extends { id: string }>(templates: T[], cols: string): Promise<Array<T & { mock_tests: any[] }>> {
  const by = await publishedStaticMocksByTemplate(templates.map((t) => t.id), cols);
  return templates.map((t) => ({ ...t, mock_tests: by.get(t.id) ?? [] }));
}

/**
 * Published, non-dynamic mocks newest first (the old top-level `mock_tests` select), with `mock_templates` read through
 * the session client (`tplCols` must include `id`) and attached as the old embed did (null when not visible).
 */
export async function publishedStaticMocksWithTemplates(
  session: AppSupabaseClient,
  cols: string,
  tplCols: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const { data: mocks, error } = await createAdminServerSupabaseClient()
    .from("mock_tests")
    .select(`template_id, ${cols}`)
    .eq("is_dynamic", false)
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[mocks/server-reads] published mocks read failed:", error.code);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (mocks || []) as any[];
  const tplIds = [...new Set(rows.map((m) => m.template_id).filter(Boolean))] as string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tpls: any[] = [];
  if (tplIds.length) {
    const { data } = await session.from("mock_templates").select(tplCols).in("id", tplIds);
    tpls = data || [];
  }
  const tplById = new Map(tpls.map((t) => [t.id, t]));
  return rows.map(({ template_id, ...m }) => ({ ...m, mock_templates: (template_id && tplById.get(template_id)) || null }));
}
