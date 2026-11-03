/**
 * COURAGE LIBRARY — MASTER LESSON PAGES (CA-6, server-only)
 *
 * /learn/<subject>/<topic>[/<subtopic>[/<concept>]] (and /hi/learn/…) = ONE canonical page per master-tree node with a
 * published node lesson (design G). Two layers:
 *   - loadMasterData (cached, tag "learn", revalidated on every lesson publish): PUBLISHED-ONLY public data — the node,
 *     its breadcrumbs, the current published EN / HI versions (validated blocks), the master-chapter position, child
 *     lessons, and the exams whose PUBLISHED syllabus covers the node. Never a draft: every read filters published.
 *   - getMasterLessonPage (per request): the viewer — Pro access from the master-chapter position + settings (a locked
 *     body is stripped to title + intro + outline before it reaches the page), and the signed-in student's progress.
 */
import { unstable_cache } from "next/cache";
import { createAdminServerSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { validateLesson, type LessonBlock, type LessonLinkMap, type LessonMeta } from "@/lib/lessons/blocks";
import { isLessonLocked, lessonAccessLevel } from "@/lib/learning/chapter-access";
import { getLessonAccessSettings } from "@/lib/learning/lesson-access-settings";
import { examTopicHref, learnHref, segmentsToHierarchyPath } from "@/lib/learn/paths";
import { readingMinutes, requiredReadingSeconds } from "@/lib/lessons/reading-time";
import { LearningResolverService, resolveLessonLinks } from "@/services/learning/learning-resolver.service";

export const LEARN_CACHE_TAG = "learn";
const LESSON_LEVELS = ["TOPIC", "SUBTOPIC", "CONCEPT"];

export interface MasterLessonVersion {
  meta: LessonMeta;
  blocks: LessonBlock[];
  links: LessonLinkMap;
}

export interface MasterData {
  node: { id: string; name: string; nodeType: string; hierarchyPath: string; topicId: string | null; topicName: string | null; subjectName: string | null };
  breadcrumbs: { name: string; href: string | null }[];
  /** isTestContent: a QA fixture (CA-7 SEO-HYGIENE-1) — served, never indexed */
  lesson: { documentId: string; position: number; publishedAt: string | null; en: MasterLessonVersion; hi: MasterLessonVersion | null; isTestContent: boolean } | null;
  children: { name: string; href: string; nodeType: string }[];
  exams: { slug: string; title: string; href: string }[];
  /** COURSE-POLISH-1: the exams with a PUBLISHED exam note for this node (or its topic) — "<Exam> exam note" */
  notes: { examTitle: string; href: string }[];
}

async function loadMasterDataUncached(hierarchyPath: string): Promise<MasterData | null> {
  const admin = createAdminServerSupabaseClient();
  const { data: node } = await admin
    .from("canonical_taxonomy_nodes")
    .select("id, name, node_type, hierarchy_path, parent_id, root_subject_id, is_active, is_internal")
    .eq("hierarchy_path", hierarchyPath)
    .eq("is_active", true)
    .maybeSingle();
  // CA-7: an INTERNAL node (legacy catch-all) has no public page
  if (!node || !LESSON_LEVELS.includes(node.node_type) || node.is_internal) return null;

  // ancestors (subject → … → parent) and children
  const parts = hierarchyPath.split(".");
  const prefixes = parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("."));
  const [anc, kids, servable] = await Promise.all([
    prefixes.length ? admin.from("canonical_taxonomy_nodes").select("id, name, node_type, hierarchy_path, is_internal").in("hierarchy_path", prefixes).eq("is_active", true) : Promise.resolve({ data: [] as { id: string; name: string; node_type: string; hierarchy_path: string; is_internal: boolean }[] }),
    admin.from("canonical_taxonomy_nodes").select("id, name, node_type, hierarchy_path, display_order").eq("parent_id", node.id).eq("is_active", true).eq("is_internal", false).order("display_order"),
    admin.rpc("fn_servable_node_lessons"),
  ]);
  const ancestors = (anc.data || []).sort((a, b) => a.hierarchy_path.length - b.hierarchy_path.length);
  if (ancestors.some((a) => a.is_internal)) return null; // under an INTERNAL node
  const lessons = new Map((Array.isArray(servable.data) ? servable.data : []).map((r) => [r.node_id, r]));
  const own = lessons.get(node.id) || null;

  let lesson: MasterData["lesson"] = null;
  if (own) {
    // the current PUBLISHED versions only (EN master + HI when published)
    const { data: versions } = await admin
      .from("document_versions")
      .select("id, language, lesson_meta, blocks, published_at")
      .eq("document_id", own.document_id)
      .eq("is_current", true)
      .eq("is_published", true)
      .eq("review_status", "PUBLISHED")
      .eq("content_format", "BLOCKS");
    const pick = async (lang: "en" | "hi"): Promise<MasterLessonVersion | null> => {
      const v = (versions || []).find((x) => x.language === lang);
      const ok = v ? validateLesson(v.lesson_meta, v.blocks) : null;
      return ok && ok.ok ? { meta: ok.meta, blocks: ok.blocks, links: await resolveLessonLinks(admin, ok.blocks) } : null;
    };
    const [[en, hi], { data: doc }] = await Promise.all([Promise.all([pick("en"), pick("hi")]), admin.from("learning_documents").select("is_test_content").eq("id", own.document_id).maybeSingle()]);
    if (en) lesson = { documentId: own.document_id, position: own.chapter_position, publishedAt: own.published_at, en, hi, isTestContent: doc?.is_test_content !== false };
  }

  // exams whose PUBLISHED syllabus covers this node (mapped here, at an ancestor or at a descendant)
  const related = [node.id, ...ancestors.map((a) => a.id), ...(kids.data || []).map((k) => k.id)];
  const { data: maps } = await admin.from("exam_syllabus_canonical_mappings").select("syllabus_node_id").in("canonical_node_id", related);
  const unitIds = [...new Set((maps || []).map((m) => m.syllabus_node_id))];
  let exams: MasterData["exams"] = [];
  if (unitIds.length) {
    const { data: units } = await admin.from("exam_syllabus_nodes").select("syllabus_version_id").in("id", unitIds);
    const vids = [...new Set((units || []).map((u) => u.syllabus_version_id))];
    const { data: vs } = vids.length
      ? await admin.from("exam_syllabus_versions").select("exam:exams(slug, title, is_active)").in("id", vids).eq("status", "PUBLISHED").eq("is_active", true)
      : { data: [] as { exam: { slug: string; title: string; is_active: boolean } | null }[] };
    const seen = new Map<string, { slug: string; title: string; href: string }>();
    for (const v of vs || []) {
      const e = Array.isArray(v.exam) ? v.exam[0] : v.exam;
      if (e && e.is_active && !seen.has(e.slug)) seen.set(e.slug, { slug: e.slug, title: e.title, href: examTopicHref(e.slug, hierarchyPath) });
    }
    exams = [...seen.values()].sort((a, b) => a.title.localeCompare(b.title));
  }

  const topic = node.node_type === "TOPIC" ? node : ancestors.find((a) => a.node_type === "TOPIC") || null;
  // COURSE-POLISH-1: published exam notes for this node or its topic (the exam-topic page renders them)
  const noteNodes = [node, ...(topic && topic.id !== node.id ? [topic] : [])];
  const { data: noteRows } = await admin
    .from("exam_node_notes")
    .select("node_id, exam:exams(slug, title, is_active)")
    .in("node_id", noteNodes.map((n) => n.id))
    .eq("status", "PUBLISHED");
  const notesSeen = new Map<string, { examTitle: string; href: string }>();
  for (const r of noteRows || []) {
    const e = Array.isArray(r.exam) ? r.exam[0] : r.exam;
    const at = noteNodes.find((n) => n.id === r.node_id);
    if (e && e.is_active && at && !notesSeen.has(e.slug)) notesSeen.set(e.slug, { examTitle: e.title, href: examTopicHref(e.slug, at.hierarchy_path) });
  }
  const subject = ancestors.find((a) => a.node_type === "SUBJECT") || null;
  return {
    node: { id: node.id, name: node.name, nodeType: node.node_type, hierarchyPath, topicId: topic?.id ?? null, topicName: topic?.name ?? null, subjectName: subject?.name ?? null },
    breadcrumbs: [
      ...ancestors.map((a) => ({ name: a.name, href: a.node_type !== "SUBJECT" && lessons.has(a.id) ? learnHref(a.hierarchy_path) : null })),
      { name: node.name, href: learnHref(hierarchyPath) },
    ],
    lesson,
    children: (kids.data || []).filter((k) => lessons.has(k.id)).map((k) => ({ name: k.name, href: learnHref(k.hierarchy_path), nodeType: k.node_type })),
    exams,
    notes: [...notesSeen.values()].sort((a, b) => a.examTitle.localeCompare(b.examTitle)),
  };
}

/** Cached per node path; every lesson publish revalidates the "learn" tag (app/admin/lessons/actions.ts). */
export const loadMasterData = (hierarchyPath: string) =>
  unstable_cache(() => loadMasterDataUncached(hierarchyPath), ["learn-master", "v3" /* COURSE-POLISH-1: exam notes */, hierarchyPath], { tags: [LEARN_CACHE_TAG], revalidate: 1800 })();

export interface MasterLessonPage {
  data: MasterData;
  language: "en" | "hi";
  /** the version shown (Hindi only when published; else English) */
  shown: "en" | "hi" | null;
  access: "FREE" | "PRO";
  locked: boolean;
  /** what the page renders: the full lesson, or — when locked — the teaser (no body) */
  body: { meta: LessonMeta; blocks: LessonBlock[]; links: LessonLinkMap } | null;
  teaser: { title: string; intro: string | null; outline: string[] } | null;
  progress: "NOT_STARTED" | "READING" | "COMPLETED" | null;
  /** COURSE-UX-1: the block to resume at (server-saved), the student's recorded quick-check answers, reading minutes */
  lastBlockId: string | null;
  answered: Record<string, { optionId: string; correct: boolean }>;
  minutes: number | null;
  /** COURSE-POLISH-1: the completion checklist from server state (the server still decides on "Mark complete") */
  evidence: { endReached: boolean; answeredIds: string[]; checksTotal: number; secondsLeft: number } | null;
}

/** Title + intro + outline only (the Pro teaser: indexable, never the gated body). */
export function lessonTeaser(v: MasterLessonVersion): { title: string; intro: string | null; outline: string[] } {
  const firstParagraph = v.blocks.find((b): b is Extract<LessonBlock, { type: "paragraph" }> => b.type === "paragraph");
  return {
    title: v.meta.title,
    intro: v.meta.summary || (firstParagraph ? firstParagraph.text.slice(0, 300) : null),
    outline: v.blocks.filter((b): b is Extract<LessonBlock, { type: "heading" }> => b.type === "heading").map((b) => b.text),
  };
}

export async function getMasterLessonPage(segments: string[], language: "en" | "hi"): Promise<MasterLessonPage | null> {
  const path = segmentsToHierarchyPath(segments);
  if (!path) return null;
  const data = await loadMasterData(path);
  if (!data) return null;
  if (!data.lesson) return { data, language, shown: null, access: "FREE", locked: false, body: null, teaser: null, progress: null, lastBlockId: null, answered: {}, minutes: null, evidence: null };

  const [settings, viewer, supabase] = await Promise.all([getLessonAccessSettings(), LearningResolverService.getViewerAccess(), createServerSupabaseClient()]);
  const shown: "en" | "hi" = language === "hi" && data.lesson.hi ? "hi" : "en";
  const version = shown === "hi" && data.lesson.hi ? data.lesson.hi : data.lesson.en;
  const access = lessonAccessLevel(data.lesson.position, settings, data.lesson.documentId);
  const locked = isLessonLocked(data.lesson.position, settings, data.lesson.documentId, viewer.hasPro);

  let progress: MasterLessonPage["progress"] = null;
  let lastBlockId: string | null = null;
  let sessionInfo: { started_at: string; end_reached_at: string | null } | null = null;
  const answered: MasterLessonPage["answered"] = {};
  if (!locked) {
    const session = await getSessionState(supabase);
    if (session.state === "user") {
      // COURSE-UX-1 (135): one progress record per lesson, any language (before 135: COMPLETED in any language wins)
      const [{ data: rows }, { data: attempts }, { data: sessionRow }] = await Promise.all([
        supabase.from("user_lesson_progress").select("status, last_block_id, updated_at").eq("document_id", data.lesson.documentId).order("updated_at", { ascending: false }),
        supabase.from("lesson_quick_check_attempts").select("block_id, option_id, is_correct").eq("document_id", data.lesson.documentId).eq("language", shown),
        supabase.from("lesson_reading_sessions").select("started_at, end_reached_at").eq("document_id", data.lesson.documentId).maybeSingle(),
      ]);
      sessionInfo = sessionRow ?? null;
      const list = rows || [];
      progress = list.some((r) => r.status === "COMPLETED") ? "COMPLETED" : list.some((r) => r.status === "READING") ? "READING" : "NOT_STARTED";
      lastBlockId = list.find((r) => r.last_block_id)?.last_block_id ?? null;
      for (const a of attempts || []) answered[a.block_id] = { optionId: a.option_id, correct: a.is_correct };
    }
  }
  const minutes = readingMinutes(version.blocks);
  const checkIds = version.blocks.filter((b) => b.type === "quick_check").map((b) => b.id);
  // display only — the server's own clock decides (fn_lesson_complete); no session yet = the full time from now
  const elapsed = sessionInfo ? Math.max(0, Math.floor((Date.now() - Date.parse(sessionInfo.started_at)) / 1000)) : 0;
  const evidence =
    progress && progress !== "COMPLETED"
      ? { endReached: Boolean(sessionInfo?.end_reached_at), answeredIds: checkIds.filter((id) => answered[id]), checksTotal: checkIds.length, secondsLeft: Math.max(0, requiredReadingSeconds(minutes) - elapsed) }
      : null;
  return { data, language, shown, access, locked, body: locked ? null : version, teaser: locked ? lessonTeaser(version) : null, progress, lastBlockId, answered, minutes, evidence };
}
