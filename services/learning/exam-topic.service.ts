/**
 * COURAGE LIBRARY — EXAM-TOPIC PAGES (CA-6, server-only)
 *
 * /exams/<exam>/<subject>/<topic>[/<subtopic>[/<concept>]] = UNIQUE exam-specific content for one master node (design G):
 * how this exam asks it (its PUBLISHED syllabus units that cover the node, weightage tier, expected / average questions),
 * that exam's previous-year questions on the topic (published questions only — counts by year / tier / shift), practice
 * and mock links, a SHORT summary of the master lesson and a link to it (never the lesson's full text), and the exam note
 * once CA-7 adds it. Self-canonical. A node the exam's published syllabus does not cover is a 404. Published-only reads.
 */
import { unstable_cache } from "next/cache";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { examTopicHref, learnHref, segmentsToHierarchyPath } from "@/lib/learn/paths";
import { LEARN_CACHE_TAG, lessonTeaser, loadMasterData } from "@/services/learning/master-lesson.service";

const TIER_ORDER = ["HIGH_YIELD", "CORE", "MODERATE", "LOW", "OPTIONAL"];

export interface ExamTopicData {
  exam: { id: string; slug: string; title: string };
  node: { id: string; name: string; nodeType: string; hierarchyPath: string; topicId: string | null; topicName: string | null; subjectName: string | null };
  path: string;
  /** the exam's syllabus units covering this node: their path in the exam's syllabus */
  askedAs: { syllabusPath: string; tier: string | null }[];
  weightageTier: string | null;
  expectedQuestions: { min: number | null; max: number | null; avg: number | null };
  pyq: { total: number; byYear: { year: number; count: number; stages: string[] }[] };
  lesson: { title: string; summary: string | null; outline: string[]; href: string } | null;
  breadcrumbs: { name: string; href: string | null }[];
}

async function loadExamTopicUncached(examSlug: string, hierarchyPath: string): Promise<ExamTopicData | null> {
  const admin = createAdminServerSupabaseClient();
  const [{ data: exam }, master] = await Promise.all([
    admin.from("exams").select("id, slug, title, is_active").eq("slug", examSlug).eq("is_active", true).maybeSingle(),
    loadMasterData(hierarchyPath),
  ]);
  if (!exam || !master) return null;

  // the exam's PUBLISHED syllabus units that map this node, an ancestor (covers it) or a descendant (part of it)
  const { data: nodes } = await admin.from("canonical_taxonomy_nodes").select("id, parent_id, is_active").eq("is_active", true);
  const parent = new Map((nodes || []).map((n) => [n.id, n.parent_id]));
  const ancestors: string[] = [];
  for (let p = parent.get(master.node.id) ?? null, hop = 0; p && hop < 6; p = parent.get(p) ?? null, hop++) ancestors.push(p);
  const descendants: string[] = [];
  const stack = (nodes || []).filter((n) => n.parent_id === master.node.id).map((n) => n.id);
  while (stack.length && descendants.length < 500) {
    const x = stack.pop() as string;
    descendants.push(x);
    for (const n of nodes || []) if (n.parent_id === x) stack.push(n.id);
  }
  const { data: maps } = await admin.from("exam_syllabus_canonical_mappings").select("syllabus_node_id").in("canonical_node_id", [master.node.id, ...ancestors, ...descendants]);
  const unitIds = [...new Set((maps || []).map((m) => m.syllabus_node_id))];
  if (!unitIds.length) return null;
  const { data: versions } = await admin.from("exam_syllabus_versions").select("id, tier").eq("exam_id", exam.id).eq("status", "PUBLISHED").eq("is_active", true);
  const vids = new Set((versions || []).map((v) => v.id));
  if (!vids.size) return null;
  const { data: syl } = await admin
    .from("exam_syllabus_nodes")
    .select("id, parent_node_id, raw_title, weightage_tier, expected_questions_min, expected_questions_max, metadata, syllabus_version_id")
    .in("syllabus_version_id", [...vids]);
  const byId = new Map((syl || []).map((n) => [n.id, n]));
  const units = unitIds.map((id) => byId.get(id)).filter((u): u is NonNullable<typeof u> => Boolean(u));
  if (!units.length) return null;

  const tierOf = new Map((versions || []).map((v) => [v.id, v.tier]));
  const askedAs = units.map((u) => {
    const titles: string[] = [];
    for (let cur: typeof u | undefined = u, hop = 0; cur && hop < 8; cur = cur.parent_node_id ? byId.get(cur.parent_node_id) : undefined, hop++) titles.unshift(cur.raw_title);
    return { syllabusPath: titles.join(" › "), tier: tierOf.get(u.syllabus_version_id) ?? null };
  });
  const tiers = units.map((u) => u.weightage_tier).filter((t): t is string => Boolean(t)).sort((a, b) => TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b));
  const nums = (k: "expected_questions_min" | "expected_questions_max") => units.map((u) => u[k]).filter((n): n is number => typeof n === "number");
  const avgs = units.map((u) => (u.metadata && typeof u.metadata === "object" && !Array.isArray(u.metadata) ? (u.metadata as Record<string, unknown>).avg_questions : null)).filter((n): n is number => typeof n === "number");

  // that exam's previous-year questions on the topic: PUBLISHED questions only, matched to this exam by its cycles
  let pyq: ExamTopicData["pyq"] = { total: 0, byYear: [] };
  if (master.node.topicId) {
    const [{ data: cycles }, { data: qs }] = await Promise.all([
      admin.from("exam_cycles").select("id").eq("exam_id", exam.id),
      admin.from("questions").select("id").eq("canonical_topic_id", master.node.topicId).eq("status", "published").limit(5000),
    ]);
    const qIds = (qs || []).map((q) => q.id);
    const cycleIds = (cycles || []).map((c) => c.id);
    if (qIds.length && cycleIds.length) {
      const { data: src } = await admin.from("question_sources").select("question_id, year, tier_stage, shift").eq("source_type", "PYQ").in("exam_cycle_id", cycleIds).in("question_id", qIds);
      const years = new Map<number, { count: number; stages: Set<string> }>();
      for (const s of src || []) {
        const y = years.get(s.year) || { count: 0, stages: new Set<string>() };
        y.count += 1;
        if (s.tier_stage) y.stages.add(s.tier_stage);
        years.set(s.year, y);
      }
      pyq = { total: (src || []).length, byYear: [...years.entries()].sort((a, b) => b[0] - a[0]).map(([year, y]) => ({ year, count: y.count, stages: [...y.stages].sort() })) };
    }
  }

  const v = master.lesson?.en ?? null;
  const t = v ? lessonTeaser(v) : null;
  return {
    exam: { id: exam.id, slug: exam.slug, title: exam.title },
    node: master.node,
    path: examTopicHref(exam.slug, hierarchyPath),
    askedAs,
    weightageTier: tiers[0] ?? null,
    expectedQuestions: { min: nums("expected_questions_min").length ? Math.min(...nums("expected_questions_min")) : null, max: nums("expected_questions_max").length ? Math.max(...nums("expected_questions_max")) : null, avg: avgs.length ? Math.max(...avgs) : null },
    pyq,
    lesson: t ? { title: t.title, summary: t.intro, outline: t.outline.slice(0, 8), href: learnHref(hierarchyPath) } : null,
    breadcrumbs: [{ name: exam.title, href: `/exams/${exam.slug}` }, ...master.breadcrumbs.map((b) => ({ name: b.name, href: null })).slice(0, -1), { name: master.node.name, href: null }],
  };
}

export async function getExamTopic(examSlug: string, segments: string[]): Promise<ExamTopicData | null> {
  const path = segmentsToHierarchyPath(segments);
  if (!path || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(examSlug)) return null;
  return unstable_cache(() => loadExamTopicUncached(examSlug, path), ["exam-topic", "v2" /* CA-7: internal nodes */, examSlug, path], { tags: [LEARN_CACHE_TAG], revalidate: 1800 })();
}
