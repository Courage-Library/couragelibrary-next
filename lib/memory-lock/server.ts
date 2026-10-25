import "server-only";

/**
 * F5 Memory Lock reads — the caller's own RLS session only (vault: owner SELECT; onboarding: own row). The schedule
 * lives on the canonical item store public.user_mistake_vault (migration 095); nothing here writes.
 */
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { buildQueue, istDay, lockMeter, queueCap, upcoming7, type MlState, type QueueGroup } from "./scheduler";

export type MemoryLockOverview = {
  today: string;
  cap: number;
  groups: QueueGroup[];
  total: number;
  dueTotal: number;
  meter: { locked: number; total: number; pct: number };
  upcoming: Array<{ day: string; count: number }>;
};

export async function loadMemoryLock(supabase: AppSupabaseClient, userId: string, now: Date = new Date()): Promise<MemoryLockOverview> {
  const today = istDay(now);
  const [{ data: rows }, { data: onboarding }] = await Promise.all([
    supabase.from("user_mistake_vault").select("question_id, topic_id, ml_state, ml_due_at, ml_lapses").eq("user_id", userId).limit(5000),
    supabase.from("user_onboarding").select("daily_minutes").eq("user_id", userId).maybeSingle(),
  ]);
  const items = rows ?? [];
  const topicIds = [...new Set(items.map((r) => r.topic_id).filter((t): t is string => Boolean(t)))];
  const { data: topics } = topicIds.length ? await supabase.from("canonical_taxonomy_nodes").select("id, name").in("id", topicIds) : { data: [] as Array<{ id: string; name: string }> };
  const names = new Map((topics ?? []).map((t) => [t.id, t.name]));
  const cap = queueCap(onboarding?.daily_minutes ?? null);
  const queue = buildQueue(
    items.map((r) => ({ questionId: r.question_id, topicId: r.topic_id, topicName: r.topic_id ? names.get(r.topic_id) ?? null : null, dueOn: istDay(r.ml_due_at), lapses: r.ml_lapses })),
    today,
    cap,
  );
  return {
    today,
    cap,
    ...queue,
    meter: lockMeter(items.map((r) => r.ml_state as MlState)),
    upcoming: upcoming7(items.map((r) => istDay(r.ml_due_at)), today),
  };
}
