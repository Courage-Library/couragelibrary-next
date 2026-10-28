/**
 * COURAGE LIBRARY — LESSON AUTHORING SERVICE (CA-4)
 *
 * Node lessons (one per master-tree TOPIC / SUBTOPIC / CONCEPT) and the paste flows on top of the CA-3 lesson RPCs:
 *   generator: pick a node → its context (path, subject, every PUBLISHED exam syllabus that maps the node, an ancestor
 *     or a descendant, with weightage) → the ACTIVE LESSON template → paste → parse + validate + completeness checklist
 *     → the node's lesson document (fn_lesson_create_node_document) → an EN DRAFT (fn_lesson_save_draft, AI_ASSISTED).
 *   translation: the CURRENT published EN version → the ACTIVE TRANSLATE_HI template → paste → validate + structure
 *     parity → a HI DRAFT (the DB checks parity again) → side-by-side EN | HI review → publish (fn_lesson_publish).
 *
 * INVARIANTS:
 * - Server-only; the service-role client after the canonical admin guard (ADMIN ONLY, like CA-3 /admin/lessons).
 * - The pure checks run first; the database re-validates blocks, parity and provenance, and audits, in one transaction.
 * - No provider calls: the machine-translation seam (lib/prompts/translation-provider.ts) is off.
 */
import { guardAdminAction } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { validateLesson, type BlockError, type LessonBlock } from "@/lib/lessons/blocks";
import { lessonChecklist, checklistPasses, type ChecklistItem } from "@/lib/lessons/completeness";
import { renderTemplate } from "@/lib/prompts/template";
import { lessonPromptValues, lessonSize, mergeLessonParts, parseLessonPart, type LessonExamCoverage, type LessonPromptContext } from "@/lib/prompts/lesson-prompt";
import { parseTranslationPaste, translatePromptValues } from "@/lib/prompts/translate-prompt";
import { mapLessonDbError } from "@/services/lessons/lesson-admin.service";
import { PromptTemplateService } from "@/services/prompts/prompt-template.service";
import type { LessonNodeOption, LessonGeneratorData, LessonTranslationData } from "@/lib/lessons/admin-types";

export type AuthoringResult<T> =
  | { success: true; data: T }
  | { success: false; code: string; error: string; errors?: BlockError[]; checklist?: ChecklistItem[]; subjectId?: string | null; subjectName?: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LESSON_LEVELS = ["TOPIC", "SUBTOPIC", "CONCEPT"];
const fail = <T>(code: string, error: string, extra: { errors?: BlockError[]; checklist?: ChecklistItem[]; subjectId?: string | null; subjectName?: string | null } = {}): AuthoringResult<T> => ({ success: false, code, error, ...extra });

async function ctx() {
  const auth = await guardAdminAction();
  if (!auth.ok) return null;
  return { userId: auth.userId || null, userEmail: auth.userEmail || "unknown", supabase: createAdminServerSupabaseClient() };
}
type Ctx = NonNullable<Awaited<ReturnType<typeof ctx>>>;

interface TreeNode {
  id: string;
  parent_id: string | null;
  node_type: string;
  name: string;
  subject_type: string | null;
  root_subject_id: string | null;
  display_order: number;
}

async function loadTree(c: Ctx): Promise<Map<string, TreeNode> | null> {
  const { data, error } = await c.supabase
    .from("canonical_taxonomy_nodes")
    .select("id, parent_id, node_type, name, subject_type, root_subject_id, display_order, is_internal")
    .eq("is_active", true);
  if (error) return null;
  // CA-7: an INTERNAL node (legacy catch-all) and everything under it is never a lesson node — not listed, not found
  const all = new Map((data || []).map((n) => [n.id, n]));
  const internal = (id: string | null): boolean => {
    for (let cur = id ? all.get(id) : undefined, hop = 0; cur && hop < 8; cur = cur.parent_id ? all.get(cur.parent_id) : undefined, hop++) if (cur.is_internal) return true;
    return false;
  };
  return new Map([...all.values()].filter((n) => !internal(n.id)).map((n) => [n.id, n as TreeNode]));
}

function pathOf(tree: Map<string, TreeNode>, id: string): string {
  const names: string[] = [];
  let cur = tree.get(id);
  for (let hop = 0; cur && hop < 8; hop++) {
    names.unshift(cur.name);
    cur = cur.parent_id ? tree.get(cur.parent_id) : undefined;
  }
  return names.join(" › ");
}

function ancestorsOf(tree: Map<string, TreeNode>, id: string): string[] {
  const out: string[] = [];
  let cur = tree.get(id)?.parent_id ? tree.get(tree.get(id)!.parent_id as string) : undefined;
  for (let hop = 0; cur && hop < 8; hop++) {
    out.push(cur.id);
    cur = cur.parent_id ? tree.get(cur.parent_id) : undefined;
  }
  return out;
}

function descendantsOf(tree: Map<string, TreeNode>, id: string): string[] {
  const kids = new Map<string, string[]>();
  for (const n of tree.values()) if (n.parent_id) kids.set(n.parent_id, [...(kids.get(n.parent_id) || []), n.id]);
  const out: string[] = [];
  const stack = [...(kids.get(id) || [])];
  while (stack.length && out.length < 500) {
    const x = stack.pop() as string;
    out.push(x);
    stack.push(...(kids.get(x) || []));
  }
  return out;
}

/** Every PUBLISHED exam syllabus that maps this node, an ancestor or a descendant (one line per exam unit). */
async function examCoverage(c: Ctx, tree: Map<string, TreeNode>, nodeId: string): Promise<LessonExamCoverage[]> {
  const ids = [nodeId, ...ancestorsOf(tree, nodeId), ...descendantsOf(tree, nodeId)];
  const { data: maps } = await c.supabase.from("exam_syllabus_canonical_mappings").select("syllabus_node_id").in("canonical_node_id", ids);
  const unitIds = [...new Set((maps || []).map((m) => m.syllabus_node_id))];
  if (!unitIds.length) return [];
  const { data: units } = await c.supabase.from("exam_syllabus_nodes").select("id, syllabus_version_id").in("id", unitIds);
  const versionIds = [...new Set((units || []).map((u) => u.syllabus_version_id))];
  if (!versionIds.length) return [];
  const { data: versions } = await c.supabase
    .from("exam_syllabus_versions")
    .select("id, exam_id, exam_cycle_id, tier, status, exam:exams(title), cycle:exam_cycles(cycle_year)")
    .in("id", versionIds)
    .eq("status", "PUBLISHED");
  const published = new Map((versions || []).map((v) => [v.id, v]));
  if (!published.size) return [];
  const { data: syl } = await c.supabase
    .from("exam_syllabus_nodes")
    .select("id, parent_node_id, raw_title, weightage_tier, expected_questions_min, expected_questions_max, metadata, syllabus_version_id")
    .in("syllabus_version_id", [...published.keys()]);
  const byId = new Map((syl || []).map((n) => [n.id, n]));
  const out: LessonExamCoverage[] = [];
  for (const uid of unitIds) {
    const u = byId.get(uid);
    const v = u ? published.get(u.syllabus_version_id) : undefined;
    if (!u || !v) continue;
    const titles: string[] = [];
    let cur: typeof u | undefined = u;
    for (let hop = 0; cur && hop < 8; hop++) {
      titles.unshift(cur.raw_title);
      cur = cur.parent_node_id ? byId.get(cur.parent_node_id) : undefined;
    }
    const exam = Array.isArray(v.exam) ? v.exam[0] : v.exam;
    const cycle = Array.isArray(v.cycle) ? v.cycle[0] : v.cycle;
    out.push({
      exam: exam?.title || "Exam",
      cycleYear: cycle?.cycle_year ?? null,
      tier: v.tier,
      syllabusPath: titles.join(" › "),
      weightageTier: u.weightage_tier,
      questionsMin: u.expected_questions_min,
      questionsMax: u.expected_questions_max,
      // SYLLABUS-PROMPT-2 intake: the unit's average questions per paper
      avgQuestions: u.metadata && typeof u.metadata === "object" && !Array.isArray(u.metadata) && typeof (u.metadata as Record<string, unknown>).avg_questions === "number" ? ((u.metadata as Record<string, unknown>).avg_questions as number) : null,
    });
  }
  return out.sort((a, b) => a.exam.localeCompare(b.exam) || a.syllabusPath.localeCompare(b.syllabusPath));
}

function subjectTypeOf(tree: Map<string, TreeNode>, nodeId: string): { id: string | null; name: string | null; type: string | null } {
  const n = tree.get(nodeId);
  const s = n?.root_subject_id ? tree.get(n.root_subject_id) : undefined;
  return { id: s?.id ?? null, name: s?.name ?? null, type: s?.subject_type ?? n?.subject_type ?? null };
}

/** LESSON-PROMPT-2 item 1: a lesson needs its subject's type (the template sections, the examples, the checklist). */
const SUBJECT_TYPE_MISSING = "Set the subject type in the Master tree first.";

export class LessonAuthoringService {
  /** The nodes a lesson can belong to (active TOPIC / SUBTOPIC / CONCEPT) + whether each already has one. */
  static async listNodes(): Promise<AuthoringResult<LessonNodeOption[]>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    const [tree, docs] = await Promise.all([loadTree(c), c.supabase.from("learning_documents").select("id, node_id, status").eq("document_type", "NODE_LESSON")]);
    if (!tree || docs.error) return fail("DB_ERROR", "Could not load the master tree.");
    const lessonOf = new Map((docs.data || []).map((d) => [d.node_id as string, d]));
    return {
      success: true,
      data: [...tree.values()]
        .filter((n) => LESSON_LEVELS.includes(n.node_type))
        .map((n) => ({ id: n.id, name: n.name, nodeType: n.node_type, path: pathOf(tree, n.id), documentId: lessonOf.get(n.id)?.id ?? null, documentStatus: lessonOf.get(n.id)?.status ?? null }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    };
  }

  /** The generator for one node: its context and the rendered ACTIVE LESSON prompt. */
  static async generator(nodeId: string): Promise<AuthoringResult<LessonGeneratorData>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    if (!UUID_RE.test(nodeId)) return fail("NOT_FOUND", "Node not found.");
    const tree = await loadTree(c);
    const node = tree?.get(nodeId);
    if (!tree || !node || !LESSON_LEVELS.includes(node.node_type)) return fail("NOT_FOUND", "Choose an active topic, subtopic or concept.");
    const kids = [...tree.values()].filter((n) => n.parent_id === nodeId).sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
    const related = new Set([nodeId, ...ancestorsOf(tree, nodeId), ...descendantsOf(tree, nodeId)]);
    const [aliases, docs, coverage, template] = await Promise.all([
      c.supabase.from("taxonomy_node_aliases").select("alias, language").eq("node_id", nodeId),
      c.supabase.from("learning_documents").select("id, node_id, status").eq("document_type", "NODE_LESSON").eq("status", "PUBLISHED"),
      examCoverage(c, tree, nodeId),
      PromptTemplateService.getActiveBody("LESSON"),
    ]);
    // getActiveBody falls back to the code v1 for LESSON, so null means its own admin check failed (session / network)
    if (!template) return fail("DB_ERROR", "The LESSON template could not be loaded (the session check failed). Reload the page.");
    const subject = subjectTypeOf(tree, nodeId);
    if (!subject.type) return fail("SUBJECT_TYPE_MISSING", SUBJECT_TYPE_MISSING, { subjectId: subject.id, subjectName: subject.name });
    const context: LessonPromptContext = {
      nodeId,
      nodeName: node.name,
      nodePath: pathOf(tree, nodeId),
      nodeLevel: node.node_type,
      subjectName: subject.name,
      subjectType: subject.type,
      coverage,
      childNodes: kids.map((k) => k.name),
      aliases: (aliases.data || []).filter((a) => a.language === "en").map((a) => a.alias),
      existingLessons: (docs.data || []).filter((d) => d.node_id && d.node_id !== nodeId && related.has(d.node_id)).map((d) => pathOf(tree, d.node_id as string)),
    };
    const { data: own } = await c.supabase.from("learning_documents").select("id").eq("document_type", "NODE_LESSON").eq("node_id", nodeId).maybeSingle();
    return {
      success: true,
      data: {
        context,
        prompt: renderTemplate("LESSON", template.body, lessonPromptValues(context)),
        templateVersion: template.version,
        templateSource: template.source,
        documentId: own?.id ?? null,
        size: lessonSize(coverage),
      },
    };
  }

  /**
   * Paste → the node's lesson document (created on first use) → its EN DRAFT. The checklist is returned (it does not
   * block a draft; it blocks publishing). Flagged uncertain facts must be confirmed as checked first.
   */
  static async saveGeneratedDraft(nodeId: string, parts: string[], factsChecked: boolean): Promise<AuthoringResult<{ documentId: string; versionId: string; checklist: ChecklistItem[] }>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    if (!UUID_RE.test(nodeId)) return fail("VALIDATION", "Choose a node.");
    if (!Array.isArray(parts) || !parts.length || parts.length > 10 || parts.some((p) => typeof p !== "string")) return fail("VALIDATION", "Paste the answer (1 to 10 parts).");
    // LESSON-PROMPT-2 item 6: the parts of one answer, merged in order; validated only when every part is in
    const merged = mergeLessonParts(parts.map(parseLessonPart));
    if (merged.state === "ERROR") return fail("VALIDATION", "The pasted lesson has problems.", { errors: merged.errors });
    if (merged.state === "INCOMPLETE") return fail("PARTS_MISSING", `Part ${merged.missing.join(", ")} of ${merged.totalParts} is missing.`);
    const parsed = merged.result;
    if (!parsed.ok) return fail("VALIDATION", "The pasted lesson has problems.", { errors: parsed.errors });
    if (parsed.uncertainFacts.length && !factsChecked) return fail("UNCERTAIN_FACTS", "The answer flags uncertain facts: check them and confirm before saving.");
    const tree = await loadTree(c);
    if (!tree?.get(nodeId)) return fail("NOT_FOUND", "Node not found.");
    const subject = subjectTypeOf(tree, nodeId);
    if (!subject.type) return fail("SUBJECT_TYPE_MISSING", SUBJECT_TYPE_MISSING, { subjectId: subject.id, subjectName: subject.name });
    const checklist = lessonChecklist(parsed.blocks, subject.type, lessonSize(await examCoverage(c, tree, nodeId)));
    const doc = await c.supabase.rpc("fn_lesson_create_node_document", { p_node_id: nodeId, p_access_level: "FREE", p_actor_id: c.userId as string, p_actor_email: c.userEmail });
    if (doc.error || !doc.data) {
      const m = mapLessonDbError(doc.error);
      return fail(m.code, m.error);
    }
    const documentId = String((doc.data as { document_id?: string }).document_id);
    const saved = await c.supabase.rpc("fn_lesson_save_draft", {
      p_document_id: documentId,
      p_language: "en",
      p_meta: JSON.parse(JSON.stringify(parsed.meta)) as Json, // plain JSON (validated)
      p_blocks: JSON.parse(JSON.stringify(parsed.blocks)) as Json,
      p_author_type: "AI_ASSISTED",
      p_actor_id: c.userId as string,
      p_actor_email: c.userEmail,
    });
    if (saved.error || !saved.data) {
      const m = mapLessonDbError(saved.error);
      return fail(m.code, m.error);
    }
    return { success: true, data: { documentId, versionId: String((saved.data as { version_id?: string }).version_id), checklist } };
  }

  /** The translation screen: the current EN version, the HI draft / current version, the rendered TRANSLATE_HI prompt. */
  static async translation(documentId: string): Promise<AuthoringResult<LessonTranslationData>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    if (!UUID_RE.test(documentId)) return fail("NOT_FOUND", "Lesson not found.");
    const [doc, versions, template] = await Promise.all([
      c.supabase.from("learning_documents").select("id, canonical_slug, document_type, status").eq("id", documentId).maybeSingle(),
      c.supabase
        .from("document_versions")
        .select("id, version_number, language, review_status, is_published, is_current, lesson_meta, blocks, translated_from_version_id")
        .eq("document_id", documentId)
        .eq("content_format", "BLOCKS")
        .order("version_number", { ascending: false }),
      PromptTemplateService.getActiveBody("TRANSLATE_HI"),
    ]);
    if (doc.error || versions.error) return fail("DB_ERROR", "Could not load the lesson.");
    if (!doc.data) return fail("NOT_FOUND", "Lesson not found.");
    const vs = versions.data || [];
    const enRow = vs.find((v) => v.language === "en" && v.is_current) || null;
    const hiDraft = vs.find((v) => v.language === "hi" && !v.is_published && v.review_status === "DRAFT") || null;
    const hiCurrent = vs.find((v) => v.language === "hi" && v.is_current) || null;
    const en = enRow ? validateLesson(enRow.lesson_meta, enRow.blocks) : null;
    const hiRow = hiDraft || hiCurrent;
    const hi = hiRow ? validateLesson(hiRow.lesson_meta, hiRow.blocks) : null;
    return {
      success: true,
      data: {
        documentId,
        slug: doc.data.canonical_slug,
        en: enRow && en?.ok ? { versionId: enRow.id, versionNumber: enRow.version_number, meta: en.meta, blocks: en.blocks } : null,
        hi:
          hiRow && hi?.ok
            ? {
                versionId: hiRow.id,
                versionNumber: hiRow.version_number,
                source: hiDraft ? "DRAFT" : "PUBLISHED",
                meta: hi.meta,
                blocks: hi.blocks,
                outdated: Boolean(enRow) && hiRow.translated_from_version_id !== enRow?.id,
              }
            : null,
        prompt: en?.ok && template ? renderTemplate("TRANSLATE_HI", template.body, translatePromptValues(en.meta, en.blocks)) : null,
        templateVersion: template?.version ?? null,
      },
    };
  }

  /** Paste → validate + parity against the CURRENT EN version → the HI DRAFT (the DB checks parity again). */
  static async saveTranslationDraft(documentId: string, paste: string): Promise<AuthoringResult<{ versionId: string }>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    if (!UUID_RE.test(documentId)) return fail("VALIDATION", "Invalid lesson.");
    const { data: enRow, error } = await c.supabase
      .from("document_versions")
      .select("id, lesson_meta, blocks")
      .eq("document_id", documentId)
      .eq("language", "en")
      .eq("is_current", true)
      .maybeSingle();
    if (error) return fail("DB_ERROR", "Could not load the English lesson.");
    const en = enRow ? validateLesson(enRow.lesson_meta, enRow.blocks) : null;
    if (!en || !en.ok) return fail("LESSON_RULE", "Publish the English lesson first; the translation starts from it.");
    const parsed = parseTranslationPaste(paste, en.blocks as LessonBlock[]);
    if (!parsed.ok) return fail("VALIDATION", "The pasted translation has problems.", { errors: parsed.errors });
    const saved = await c.supabase.rpc("fn_lesson_save_draft", {
      p_document_id: documentId,
      p_language: "hi",
      p_meta: JSON.parse(JSON.stringify(parsed.meta)) as Json,
      p_blocks: JSON.parse(JSON.stringify(parsed.blocks)) as Json,
      p_author_type: "AI_ASSISTED",
      p_actor_id: c.userId as string,
      p_actor_email: c.userEmail,
    });
    if (saved.error || !saved.data) {
      const m = mapLessonDbError(saved.error);
      return fail(m.code, m.error);
    }
    return { success: true, data: { versionId: String((saved.data as { version_id?: string }).version_id) } };
  }

  /** The checklist gate for publishing an EN node lesson (null = not a node lesson / not EN: no gate). */
  static async publishChecklist(versionId: string): Promise<ChecklistItem[] | null> {
    const c = await ctx();
    if (!c || !UUID_RE.test(versionId)) return null;
    const { data: v } = await c.supabase.from("document_versions").select("document_id, language, lesson_meta, blocks").eq("id", versionId).maybeSingle();
    if (!v || v.language !== "en") return null;
    const { data: d } = await c.supabase.from("learning_documents").select("document_type, node_id").eq("id", v.document_id).maybeSingle();
    if (!d || d.document_type !== "NODE_LESSON" || !d.node_id) return null;
    const parsed = validateLesson(v.lesson_meta, v.blocks);
    if (!parsed.ok) return null; // the DB refuses invalid blocks at publish anyway
    const tree = await loadTree(c);
    if (!tree) return null;
    return lessonChecklist(parsed.blocks, subjectTypeOf(tree, d.node_id).type, lessonSize(await examCoverage(c, tree, d.node_id)));
  }
}

export { checklistPasses };
