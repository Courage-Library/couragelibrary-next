import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";

/**
 * HOME-1 pre-release (owner): the "in Hindi & English" chip and the FAQ answer must be TRUE — they follow the count of
 * PUBLISHED content that has a Hindi version, read with the cookie-free PUBLIC client (only what any visitor can read):
 *   questions        current, published Hindi question versions of published questions
 *   lessons          current, published Hindi lesson versions of published, non-test lessons
 *   current affairs  0: an article has no language (no Hindi version exists in the schema yet)
 * Cached 10 min (tag "hindi-content"), bounded by the caller; a failed read throws (not cached) → the caller hides the
 * chip and the FAQ makes no claim.
 */
export interface HindiAvailability {
  questions: number;
  lessons: number;
  currentAffairs: number;
}

export const readHindiAvailability = unstable_cache(
  async (): Promise<HindiAvailability> => {
    const sb = createPublicServerSupabaseClient();
    const [q, l] = await Promise.all([
      sb
        .from("question_versions")
        .select("id, questions!inner(status)", { count: "exact", head: true })
        .eq("language", "hi")
        .eq("lifecycle_status", "PUBLISHED")
        .eq("is_current", true)
        .eq("questions.status", "published"),
      sb
        .from("document_versions")
        // two FKs link these tables: name the version → document one (PGRST201 otherwise)
        .select("id, learning_documents!document_versions_document_id_fkey!inner(status, is_test_content)", { count: "exact", head: true })
        .eq("language", "hi")
        .eq("is_published", true)
        .eq("is_current", true)
        .eq("learning_documents.status", "PUBLISHED")
        .eq("learning_documents.is_test_content", false),
    ]);
    if (q.error || l.error || q.count === null || l.count === null) throw new Error("hindi availability read failed"); // not cached
    return { questions: q.count, lessons: l.count, currentAffairs: 0 };
  },
  ["hindi-availability", "v1"],
  { tags: ["hindi-content"], revalidate: 600 },
);

// after a failed / timed-out read, no claim at once for a minute (an outage never slows every visit)
let failedAt = 0;

/** never rejects; ≤ 800 ms; null = unknown (the chip is hidden and the FAQ makes no claim) */
export async function loadHindiAvailability(): Promise<HindiAvailability | null> {
  if (Date.now() - failedAt < 60_000) return null;
  try {
    const r = await Promise.race([readHindiAvailability().catch(() => null), new Promise<null>((ok) => setTimeout(() => ok(null), 800))]);
    if (!r) failedAt = Date.now();
    return r;
  } catch {
    failedAt = Date.now();
    return null;
  }
}
