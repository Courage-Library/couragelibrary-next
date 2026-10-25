import "server-only";

/**
 * F2 topic practice (decision #79) — reads for the chooser and a set. Every read uses the caller's RLS session
 * (published questions / versions / options are readable; practice_answers only the caller's own rows). Answer keys
 * and explanations are NEVER read here: they live in question_answers (no client grant) and reach the client only
 * through fn_check_practice_answer, one answered question at a time. Hierarchy: exam → pattern sections (SUBJECT
 * nodes) → TOPIC nodes → servable questions (published question + current published version, key-valid by 087).
 */
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { MistakeService } from "@/services/mistake.service";
import { chooseVersion, toPracticeQuestion, type Candidate, type ContentLanguage, type PracticeQuestion, type VersionRow } from "./engine";

export type PracticeExam = { id: string; slug: string; title: string; mine: boolean };
export type PracticeTopic = { id: string; name: string; count: number };
export type PracticeSection = { id: string; name: string; topics: PracticeTopic[] };

/** Active exams; the student's active goals first (onboarding / "Add to my exams"). */
export async function practiceExams(supabase: AppSupabaseClient, userId: string | null): Promise<PracticeExam[]> {
  const [{ data: exams }, goals] = await Promise.all([
    supabase.from("exams").select("id, slug, title").eq("is_active", true).order("title", { ascending: true }),
    userId ? supabase.from("user_exam_goals").select("exam_id, priority_rank").eq("user_id", userId).eq("is_active", true) : Promise.resolve({ data: [] as Array<{ exam_id: string; priority_rank: number }> }),
  ]);
  const rank = new Map((goals.data ?? []).map((g) => [g.exam_id, g.priority_rank]));
  return (exams ?? [])
    .map((e) => ({ id: e.id, slug: e.slug, title: e.title, mine: rank.has(e.id) }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99) || a.title.localeCompare(b.title));
}

/** Sections (SUBJECT nodes of the exam's active pattern sections) with their topics; topics with 0 servable questions hidden. */
export async function examSections(supabase: AppSupabaseClient, examId: string): Promise<PracticeSection[]> {
  const { data: patterns } = await supabase
    .from("exam_patterns")
    .select("id, exam_cycles!inner(exam_id), pattern_sections(subject_id, section_name, section_order)")
    .eq("exam_cycles.exam_id", examId)
    .eq("is_active", true);
  const order = new Map<string, { name: string; order: number }>();
  for (const p of patterns ?? []) {
    for (const s of p.pattern_sections ?? []) {
      if (!s.subject_id) continue;
      const prev = order.get(s.subject_id);
      if (!prev || s.section_order < prev.order) order.set(s.subject_id, { name: s.section_name, order: s.section_order });
    }
  }
  const sectionIds = [...order.keys()];
  if (sectionIds.length === 0) return [];
  const { data: topics } = await supabase
    .from("canonical_taxonomy_nodes")
    .select("id, name, parent_id, display_order")
    .eq("node_type", "TOPIC")
    .eq("is_active", true)
    .in("parent_id", sectionIds)
    .order("display_order", { ascending: true });
  const counts = await servableCounts(supabase, (topics ?? []).map((t) => t.id));
  return sectionIds
    .sort((a, b) => order.get(a)!.order - order.get(b)!.order)
    .map((id) => ({
      id,
      name: order.get(id)!.name,
      topics: (topics ?? []).filter((t) => t.parent_id === id && (counts.get(t.id) ?? 0) > 0).map((t) => ({ id: t.id, name: t.name, count: counts.get(t.id) ?? 0 })),
    }));
}

/** topic id → servable question ids. */
async function servableByTopic(supabase: AppSupabaseClient, topicIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (topicIds.length === 0) return out;
  const { data } = await supabase
    .from("questions")
    .select("id, canonical_topic_id, question_versions!inner(id)")
    .eq("status", "published")
    .eq("question_versions.is_current", true)
    .eq("question_versions.lifecycle_status", "PUBLISHED")
    .in("canonical_topic_id", topicIds)
    .limit(5000);
  for (const q of data ?? []) {
    if (!q.canonical_topic_id) continue;
    out.set(q.canonical_topic_id, [...(out.get(q.canonical_topic_id) ?? []), q.id]);
  }
  return out;
}

/** F4: topic id → servable question count (the result page links "Practise <topic>" only when > 0). */
export async function servableTopicCounts(supabase: AppSupabaseClient, topicIds: string[]): Promise<Map<string, number>> {
  return servableCounts(supabase, topicIds);
}

async function servableCounts(supabase: AppSupabaseClient, topicIds: string[]): Promise<Map<string, number>> {
  const by = await servableByTopic(supabase, topicIds);
  return new Map([...by.entries()].map(([k, v]) => [k, v.length]));
}

/** When the student last answered each question in practice (own rows; none before migration 093 is applied). */
async function lastAnswered(supabase: AppSupabaseClient, userId: string, questionIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (questionIds.length === 0) return out;
  const { data, error } = await supabase
    .from("practice_answers")
    .select("question_id, answered_at")
    .eq("user_id", userId)
    .in("question_id", questionIds)
    .order("answered_at", { ascending: false })
    .limit(2000);
  if (error) return out;
  for (const r of data ?? []) if (!out.has(r.question_id)) out.set(r.question_id, r.answered_at);
  return out;
}

export async function topicCandidates(supabase: AppSupabaseClient, userId: string, topicIds: string[]): Promise<Map<string, Candidate[]>> {
  const by = await servableByTopic(supabase, topicIds);
  const last = await lastAnswered(supabase, userId, [...by.values()].flat());
  return new Map([...by.entries()].map(([t, ids]) => [t, ids.map((id) => ({ questionId: id, lastAnsweredAt: last.get(id) ?? null }))]));
}

/** The chosen questions as client payloads, in the given order — text and options only (no key, no explanation). */
export async function loadPracticeQuestions(supabase: AppSupabaseClient, questionIds: string[], preferred: ContentLanguage): Promise<PracticeQuestion[]> {
  if (questionIds.length === 0) return [];
  const { data } = await supabase
    .from("question_versions")
    .select("id, question_id, language, question_text, question_image_url, options_type, question_options(option_key, option_text, option_image_url, order_index), questions!inner(canonical_topic_id, status)")
    .in("question_id", questionIds)
    .eq("is_current", true)
    .eq("lifecycle_status", "PUBLISHED")
    .eq("questions.status", "published");
  const byQuestion = new Map<string, Array<VersionRow & { topicId: string | null }>>();
  for (const v of data ?? []) {
    const q = Array.isArray(v.questions) ? v.questions[0] : v.questions;
    const row = { id: v.id, question_id: v.question_id, language: v.language, question_text: v.question_text, question_image_url: v.question_image_url, options_type: v.options_type, options: v.question_options ?? [], topicId: q?.canonical_topic_id ?? null };
    byQuestion.set(v.question_id, [...(byQuestion.get(v.question_id) ?? []), row]);
  }
  return questionIds
    .map((id) => {
      const { primary, alternates } = chooseVersion(byQuestion.get(id) ?? [], preferred);
      return primary && primary.options.length === 4 ? toPracticeQuestion(primary, alternates, primary.topicId) : null;
    })
    .filter((q): q is PracticeQuestion => q !== null);
}

/** The canonical topic article ("Learn more"), only when one is published and open to the student. */
export async function topicArticles(topicIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const res = await MistakeService.getBatchLearningContentForTopics(topicIds);
    for (const [t, r] of Object.entries(res)) {
      const p = r.primaryResource;
      if (r.hasLearningContent && p && !p.isLocked && typeof p.canonicalUrl === "string" && p.canonicalUrl.startsWith("/")) out[t] = p.canonicalUrl;
    }
  } catch {
    /* no "Learn more" when the lookup fails */
  }
  return out;
}

/** Topic → name / section / next topic in the same section (for "Next topic"). */
export async function topicContext(supabase: AppSupabaseClient, topicId: string): Promise<{ id: string; name: string; sectionId: string | null } | null> {
  const { data } = await supabase.from("canonical_taxonomy_nodes").select("id, name, parent_id, node_type, is_active").eq("id", topicId).maybeSingle();
  if (!data || data.node_type !== "TOPIC" || !data.is_active) return null;
  return { id: data.id, name: data.name, sectionId: data.parent_id };
}
