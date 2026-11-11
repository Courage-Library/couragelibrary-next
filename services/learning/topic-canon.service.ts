/**
 * SEO-TOPIC-CANON-1 (server-only): the topic ↔ subtopic lesson map of lib/learn/topic-canon.ts, from PUBLISHED reads only
 * (fn_servable_node_lessons) and the flagged topics' metadata. Cached with the "learn" tag: every lesson publish and the
 * admin flag action revalidate it. A failed read is never cached as "no flagged topics".
 */
import { unstable_cache } from "next/cache";
import { permanentRedirect } from "next/navigation";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { segmentsToHierarchyPath } from "@/lib/learn/paths";
import { buildTopicCanon, LESSON_AT_TOPIC_KEY, topicCanonRedirect, type TopicCanon } from "@/lib/learn/topic-canon";
import { LEARN_CACHE_TAG } from "@/services/learning/master-lesson.service";

const NODE_COLUMNS = "id, parent_id, node_type, hierarchy_path, display_order, name, is_active, is_internal, metadata";

async function loadTopicCanonUncached(): Promise<TopicCanon> {
  const admin = createAdminServerSupabaseClient();
  const { data: topics, error } = await admin
    .from("canonical_taxonomy_nodes")
    .select(NODE_COLUMNS)
    .eq("node_type", "TOPIC")
    .eq("is_active", true)
    .eq(`metadata->>${LESSON_AT_TOPIC_KEY}`, "true");
  if (error) throw new Error("TOPIC_CANON_UNAVAILABLE");
  if (!topics?.length) return { subToTopic: {}, topicToSub: {} };
  const [{ data: subs, error: subError }, { data: servable, error: servableError }] = await Promise.all([
    admin.from("canonical_taxonomy_nodes").select(NODE_COLUMNS).in("parent_id", topics.map((t) => t.id)).eq("node_type", "SUBTOPIC"),
    admin.rpc("fn_servable_node_lessons"),
  ]);
  if (subError || servableError) throw new Error("TOPIC_CANON_UNAVAILABLE");
  const nodes = [...topics, ...(subs || [])].map((n) => ({
    id: n.id,
    parentId: n.parent_id,
    nodeType: n.node_type,
    hierarchyPath: n.hierarchy_path,
    displayOrder: n.display_order,
    name: n.name,
    isActive: n.is_active,
    isInternal: n.is_internal,
    metadata: n.metadata,
  }));
  return buildTopicCanon(nodes, (Array.isArray(servable) ? servable : []).map((r: { node_id: string }) => r.node_id));
}

export const loadTopicCanon = () => unstable_cache(loadTopicCanonUncached, ["topic-canon", "v1"], { tags: [LEARN_CACHE_TAG], revalidate: 1800 })();

/**
 * 308 to the topic URL when the requested path is a subtopic a flagged topic serves (/learn, /hi/learn, /exams/<exam>/…).
 * Called from generateMetadata (runs before any byte is streamed, so the status is a real 308) and from the page.
 * A failed canon read never blocks the page: the subtopic URL then renders as before.
 */
export async function redirectToTopicCanon(segments: string[], href: (hierarchyPath: string) => string, query: string = ""): Promise<void> {
  const path = segmentsToHierarchyPath(segments);
  if (!path) return;
  const canon = await loadTopicCanon().catch(() => null);
  const to = canon ? topicCanonRedirect(path, canon) : null;
  if (to) permanentRedirect(`${href(to)}${query}`);
}
