import "server-only";

/**
 * F6 — topic learning: the canonical path "Learn more" (any question) → the topic's article → "Practice this topic".
 * Reads only published learning documents (LearningResolverService: the single taxonomy → learning path) and the
 * canonical taxonomy; never copies content. The practice link exists only when F2 topic practice can serve the topic.
 */
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { LearningResolverService, type ResolvedLearningDocument } from "@/services/learning/learning-resolver.service";
import { isPracticeEnabled } from "@/lib/practice/flag";
import { servableTopicCounts } from "@/lib/practice/server";

const ID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The canonical entry for a topic's learning: /learn/topics/<id> (redirects to the primary article when one exists). */
export const topicLearnHref = (topicId: string) => `/learn/topics/${topicId}`;

/** F2 topic practice for this topic, or null when practice is off or the topic has no servable question. */
export async function topicPracticeHref(supabase: AppSupabaseClient, topicId: string | null | undefined): Promise<string | null> {
  if (!topicId || !ID_RX.test(topicId) || !isPracticeEnabled()) return null;
  const counts = await servableTopicCounts(supabase, [topicId]).catch(() => new Map<string, number>());
  return (counts.get(topicId) ?? 0) > 0 ? `/practice/session?${new URLSearchParams({ topic: topicId, n: "10" })}` : null;
}

export type TopicLearning = {
  topic: { id: string; name: string; sectionName: string | null };
  /** published documents, primary first (document-type order) */
  documents: ResolvedLearningDocument[];
  practiceHref: string | null;
};

export async function loadTopicLearning(supabase: AppSupabaseClient, topicId: string): Promise<TopicLearning | null> {
  if (!ID_RX.test(topicId)) return null;
  const { data: node } = await supabase.from("canonical_taxonomy_nodes").select("id, name, node_type, is_active, parent_id").eq("id", topicId).maybeSingle();
  if (!node || node.node_type !== "TOPIC" || !node.is_active) return null;
  const [{ data: parent }, documents, practiceHref] = await Promise.all([
    node.parent_id ? supabase.from("canonical_taxonomy_nodes").select("name").eq("id", node.parent_id).maybeSingle() : Promise.resolve({ data: null as { name: string } | null }),
    LearningResolverService.resolveForTopic(topicId),
    topicPracticeHref(supabase, topicId),
  ]);
  return { topic: { id: node.id, name: node.name, sectionName: parent?.name ?? null }, documents, practiceHref };
}
