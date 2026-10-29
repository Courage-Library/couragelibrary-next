/**
 * SYLLABUS-PUBLISH-IMPACT: what publishing a DRAFT changes for students, computed BEFORE the owner confirms.
 *   - current: the version the exam page shows now (the read model's choice: the cycle's own version, else exam-wide;
 *     the all-tiers version (tier NULL) before a tier version; then the newest)
 *   - otherPublished: PUBLISHED versions of the same exam + cycle with ANOTHER tier — fn_syllabus_publish archives only
 *     the same (exam, cycle, tier), so these stay published; shownToStudents = the read model would still pick it
 *   - topics added / removed vs the current version (rolled up to master TOPICs), and per removed topic its published
 *     lessons (node lessons on the topic or below), published questions and student lesson progress
 * Server only; the caller has already passed the admin guard (service-role reads, nothing is written).
 */
import "server-only";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { PublishImpact, PublishImpactTopic } from "@/lib/syllabus/editor-assist";

interface VersionRow {
  id: string;
  exam_id: string;
  exam_cycle_id: string | null;
  tier: string | null;
  version_number: number;
  status: string;
  is_active: boolean;
  published_at: string | null;
}

/** fn_exam_syllabus_read_model's ORDER BY, for a given cycle */
function readModelPick(versions: VersionRow[], cycleId: string | null): VersionRow | null {
  const key = (v: VersionRow): [number, number, number, string, number] => [
    (v.exam_cycle_id ?? null) === cycleId ? 0 : 1,
    v.exam_cycle_id === null ? 0 : 1,
    v.tier === null ? 0 : 1,
    v.tier ?? "",
    -Date.parse(v.published_at ?? "1970-01-01"),
  ];
  return (
    [...versions].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
      return 0;
    })[0] ?? null
  );
}

/**
 * `db` defaults to the service-role client: the editor PAGE computes this after its guard (student progress is not
 * readable by an admin session; syllabus actions stay RPC-only). The live gate passes its own read client.
 */
export async function computePublishImpact(versionId: string, db: AppSupabaseClient = createAdminServerSupabaseClient()): Promise<PublishImpact | null> {
  const { data: v } = await db.from("exam_syllabus_versions").select("id, exam_id, exam_cycle_id, tier, version_number, status, is_active, published_at").eq("id", versionId).maybeSingle();
  if (!v) return null;
  const [pubRes, treeRes] = await Promise.all([
    db.from("exam_syllabus_versions").select("id, exam_id, exam_cycle_id, tier, version_number, status, is_active, published_at").eq("exam_id", v.exam_id).eq("status", "PUBLISHED").eq("is_active", true),
    db.from("canonical_taxonomy_nodes").select("id, parent_id, node_type, name"),
  ]);
  if (pubRes.error || treeRes.error) return null;
  const published = (pubRes.data ?? []).filter((p) => p.id !== v.id) as VersionRow[];
  const current = readModelPick(published, v.exam_cycle_id);
  const sameCycle = published.filter((p) => (p.exam_cycle_id ?? null) === (v.exam_cycle_id ?? null));
  const others = sameCycle.filter((p) => (p.tier ?? null) !== (v.tier ?? null));
  // after publishing: the same-tier peer is archived; the new version + the other tiers stay
  const after = [...others, { ...(v as VersionRow), status: "PUBLISHED", is_active: true, published_at: new Date().toISOString() }];
  const pickAfter = readModelPick(after, v.exam_cycle_id);

  const tree = new Map((treeRes.data ?? []).map((n) => [n.id, n]));
  const topicOf = (id: string): string => {
    let cur = tree.get(id);
    for (let hop = 0; cur && cur.node_type !== "TOPIC" && hop < 6; hop++) cur = cur.parent_id ? tree.get(cur.parent_id) : undefined;
    return cur && cur.node_type === "TOPIC" ? cur.id : id;
  };
  const subtree = (topicId: string): string[] => {
    const out = [topicId];
    for (let i = 0; i < out.length; i++) for (const n of tree.values()) if (n.parent_id === out[i]) out.push(n.id);
    return out;
  };
  const unitsOf = async (vid: string) => {
    const { data } = await db.from("exam_syllabus_nodes").select("id, raw_title, exam_syllabus_canonical_mappings(canonical_node_id)").eq("syllabus_version_id", vid).eq("node_kind", "UNIT");
    return (data ?? []).map((u) => ({ title: u.raw_title, topics: (u.exam_syllabus_canonical_mappings ?? []).map((m) => m.canonical_node_id).filter(Boolean).map((id) => topicOf(id as string)) }));
  };
  const nextUnits = await unitsOf(v.id);
  const prevUnits = current ? await unitsOf(current.id) : [];
  const nextTopics = new Set(nextUnits.flatMap((u) => u.topics));
  const prevTopics = new Set(prevUnits.flatMap((u) => u.topics));
  const removedIds = [...prevTopics].filter((t) => !nextTopics.has(t));
  const addedIds = [...nextTopics].filter((t) => !prevTopics.has(t));
  const name = (id: string) => tree.get(id)?.name ?? "Unknown topic";

  // content per topic: published node lessons on the topic or below, published questions, lesson progress
  const allTopics = [...new Set([...nextTopics, ...removedIds])];
  const nodeToTopic = new Map<string, string>();
  for (const t of allTopics) for (const id of subtree(t)) nodeToTopic.set(id, t);
  const nodeIds = [...nodeToTopic.keys()];
  const [docs, qs, prog] = await Promise.all([
    db.from("learning_documents").select("node_id").eq("status", "PUBLISHED").in("node_id", nodeIds),
    db.from("questions").select("canonical_topic_id").eq("status", "published").in("canonical_topic_id", allTopics).limit(100000),
    removedIds.length ? db.from("user_lesson_progress").select("node_id").in("node_id", removedIds.flatMap(subtree)).limit(100000) : Promise.resolve({ data: [], error: null }),
  ]);
  const count = (rows: Array<Record<string, unknown>> | null, col: string, map: (id: string) => string | undefined) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) {
      const t = map(String(r[col]));
      if (t) m.set(t, (m.get(t) || 0) + 1);
    }
    return m;
  };
  const lessonsBy = count(docs.data as Array<Record<string, unknown>> | null, "node_id", (id) => nodeToTopic.get(id));
  const questionsBy = count(qs.data as Array<Record<string, unknown>> | null, "canonical_topic_id", (id) => id);
  const progressBy = count(prog.data as Array<Record<string, unknown>> | null, "node_id", (id) => nodeToTopic.get(id));

  const removed: PublishImpactTopic[] = removedIds
    .map((id) => ({ id, name: name(id), publishedLessons: lessonsBy.get(id) || 0, publishedQuestions: questionsBy.get(id) || 0, progressRows: progressBy.get(id) || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const prevTitles = new Set(prevUnits.map((u) => u.title));
  const nextTitles = new Set(nextUnits.map((u) => u.title));
  return {
    current: current ? { id: current.id, versionNumber: current.version_number, tier: current.tier } : null,
    otherPublished: others.map((o) => ({ id: o.id, versionNumber: o.version_number, tier: o.tier, shownToStudents: pickAfter?.id === o.id })),
    topicsAdded: addedIds.map((id) => ({ id, name: name(id) })).sort((a, b) => a.name.localeCompare(b.name)),
    topicsRemoved: removed,
    unitsAdded: nextUnits.filter((u) => !prevTitles.has(u.title)).length,
    unitsRemoved: prevUnits.filter((u) => !nextTitles.has(u.title)).length,
    withLessons: [...nextTopics].filter((t) => (lessonsBy.get(t) || 0) > 0).length,
    withQuestions: [...nextTopics].filter((t) => (questionsBy.get(t) || 0) > 0).length,
    topics: nextTopics.size,
  };
}
