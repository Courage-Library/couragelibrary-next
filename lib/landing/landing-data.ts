/**
 * UX-2a: live, honest data for the landing page ("/"). Read with the caller's session client, so only rows the
 * visitor may see (public RLS for anonymous visitors): active exams, published non-dynamic mock tests, published
 * exam guides, the PUBLISHED syllabus read model and published current-affairs articles. Never DRAFT data, never the
 * service role, never a write.
 *
 * Every read is bounded by a timeout. Any failure → `{ ok: false }`, and the page shows its no-number fallback
 * texts (content/landing.ts). Numbers are never invented or cached as constants.
 */
import type { AppSupabaseClient } from "@/lib/supabase/types";

export interface LandingExam {
  slug: string;
  title: string;
  category: string | null;
  publishedMocks: number;
  publishedGuides: number;
  syllabusAvailable: boolean;
}

export type LandingData =
  | { ok: true; exams: LandingExam[]; totalPublishedMocks: number; totalPublishedGuides: number; currentAffairsPublished: number }
  | { ok: false };

export const LANDING_DATA_TIMEOUT_MS = 8000;

/** Raw rows as returned by the reads (shape-checked, not trusted). */
export interface LandingRows {
  exams: unknown;
  mocks: unknown;
  guides: unknown;
  syllabusStates: Record<string, unknown>;
  currentAffairsCount: unknown;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** Pure: builds the landing data from raw rows. Malformed input → { ok: false } (never a guessed number). */
export function buildLandingData(rows: LandingRows): LandingData {
  if (!Array.isArray(rows.exams) || !Array.isArray(rows.mocks) || !Array.isArray(rows.guides)) return { ok: false };
  if (typeof rows.currentAffairsCount !== "number" || !Number.isInteger(rows.currentAffairsCount) || rows.currentAffairsCount < 0) return { ok: false };
  const mocksByExam = new Map<string, number>();
  for (const m of rows.mocks) {
    const tpl = isObj(m) ? m.mock_templates : null;
    const examId = isObj(tpl) ? str(tpl.exam_id) : null;
    if (!examId) return { ok: false };
    mocksByExam.set(examId, (mocksByExam.get(examId) ?? 0) + 1);
  }
  const guidesByExam = new Map<string, number>();
  for (const g of rows.guides) {
    const examId = isObj(g) ? str(g.exam_id) : null;
    if (!examId) return { ok: false };
    guidesByExam.set(examId, (guidesByExam.get(examId) ?? 0) + 1);
  }
  const exams: LandingExam[] = [];
  for (const e of rows.exams) {
    if (!isObj(e)) return { ok: false };
    const id = str(e.id);
    const slug = str(e.slug);
    const title = str(e.title);
    if (!id || !slug || !title) return { ok: false };
    const state = rows.syllabusStates[id];
    exams.push({
      slug,
      title,
      category: str(e.category),
      publishedMocks: mocksByExam.get(id) ?? 0,
      publishedGuides: guidesByExam.get(id) ?? 0,
      syllabusAvailable: isObj(state) && state.state === "AVAILABLE",
    });
  }
  return {
    ok: true,
    exams,
    totalPublishedMocks: exams.reduce((a, e) => a + e.publishedMocks, 0),
    totalPublishedGuides: exams.reduce((a, e) => a + e.publishedGuides, 0),
    currentAffairsPublished: rows.currentAffairsCount,
  };
}

async function readRows(supabase: AppSupabaseClient): Promise<LandingRows | null> {
  const examsRes = await supabase.from("exams").select("id, slug, title, category").eq("is_active", true).order("title");
  if (examsRes.error || !examsRes.data) return null;
  const ids = examsRes.data.map((e) => e.id);
  if (ids.length === 0) return { exams: [], mocks: [], guides: [], syllabusStates: {}, currentAffairsCount: 0 };
  const [mocksRes, guidesRes, caRes, ...syllabus] = await Promise.all([
    supabase
      .from("mock_tests")
      .select("id, mock_templates!inner(exam_id)")
      .eq("status", "published")
      .eq("is_dynamic", false)
      .in("mock_templates.exam_id", ids),
    supabase
      .from("exam_knowledge_documents")
      .select("id, exam_id")
      .eq("status", "PUBLISHED")
      .not("current_published_version_id", "is", null)
      .in("exam_id", ids),
    supabase.from("current_affairs_articles").select("id", { count: "exact", head: true }).eq("status", "PUBLISHED"),
    ...ids.map((id) => supabase.rpc("fn_exam_syllabus_read_model", { p_exam_id: id })),
  ]);
  if (mocksRes.error || guidesRes.error || caRes.error || syllabus.some((s) => s.error)) return null;
  const syllabusStates: Record<string, unknown> = {};
  ids.forEach((id, i) => {
    syllabusStates[id] = syllabus[i].data;
  });
  return { exams: examsRes.data, mocks: mocksRes.data ?? [], guides: guidesRes.data ?? [], syllabusStates, currentAffairsCount: caRes.count };
}

/** Reads the landing data; a timeout, an error or malformed rows all give { ok: false }. */
export async function loadLandingData(supabase: AppSupabaseClient, timeoutMs: number = LANDING_DATA_TIMEOUT_MS): Promise<LandingData> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const rows = await Promise.race([readRows(supabase), timeout]);
    return rows ? buildLandingData(rows) : { ok: false };
  } catch {
    return { ok: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
