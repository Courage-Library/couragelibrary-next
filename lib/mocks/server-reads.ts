import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import type { AppSupabaseClient } from "@/lib/supabase/types";

/**
 * PAY-1 B2b: clients lose direct reads of mock_tests (the revoke), so signed-in / staff pages read them on the SERVER —
 * with the visibility a listing had under RLS: published and NOT dynamic (a user's own dynamic mocks are never listed).
 * The other tables (mock_templates / exams / exam_patterns) are still read through the caller's session client, so
 * their own RLS is unchanged; the results come back in the shape the old PostgREST embeds returned. Public loaders
 * (landing, exam page, CA) do NOT use this: they call the narrow public functions of migration 145.
 * One fixed, light column set (listing figures only — no content columns).
 */
const MOCK_COLS = "id, template_id, title, slug, duration_minutes, total_questions, total_marks, is_free, status, published_at, created_at" as const;

async function publishedStaticMocks(templateIds?: string[]) {
  let q = createAdminServerSupabaseClient().from("mock_tests").select(MOCK_COLS).eq("is_dynamic", false).eq("status", "published");
  if (templateIds) q = q.in("template_id", templateIds);
  return q.order("created_at", { ascending: false });
}
export type ListedMock = Omit<NonNullable<Awaited<ReturnType<typeof publishedStaticMocks>>["data"]>[number], "template_id">;

/** Published, non-dynamic mocks grouped by template_id (the old `mock_templates(…, mock_tests(…))` embed). */
export async function publishedStaticMocksByTemplate(templateIds: string[]): Promise<Map<string, ListedMock[]>> {
  const ids = [...new Set(templateIds.filter(Boolean))];
  const by = new Map<string, ListedMock[]>();
  if (!ids.length) return by;
  const { data } = await publishedStaticMocks(ids);
  for (const { template_id, ...rest } of data || []) by.set(template_id, [...(by.get(template_id) ?? []), rest]);
  return by;
}

/** Attach `mock_tests` (published, non-dynamic) to template rows that carry `id`. */
export async function attachPublishedStaticMocks<T extends { id: string }>(templates: T[]): Promise<Array<T & { mock_tests: ListedMock[] }>> {
  const by = await publishedStaticMocksByTemplate(templates.map((t) => t.id));
  return templates.map((t) => ({ ...t, mock_tests: by.get(t.id) ?? [] }));
}

/**
 * Published, non-dynamic mocks newest first (the old top-level `mock_tests` select), with `mock_templates` read through
 * the session client and attached as the old embed did (null when not visible).
 */
export async function publishedStaticMocksWithTemplates<Tpl extends { id: string }>(
  session: AppSupabaseClient,
  readTemplates: (session: AppSupabaseClient, ids: string[]) => PromiseLike<{ data: Tpl[] | null }>
): Promise<Array<ListedMock & { mock_templates: Tpl | null }>> {
  const { data: mocks, error } = await publishedStaticMocks();
  if (error) {
    console.error("[mocks/server-reads] published mocks read failed:", error.code);
    return [];
  }
  const rows = mocks || [];
  const tplIds = [...new Set(rows.map((m) => m.template_id).filter(Boolean))];
  const tpls = tplIds.length ? (await readTemplates(session, tplIds)).data || [] : [];
  const tplById = new Map(tpls.map((t) => [t.id, t]));
  return rows.map(({ template_id, ...m }) => ({ ...m, mock_templates: tplById.get(template_id) ?? null }));
}
