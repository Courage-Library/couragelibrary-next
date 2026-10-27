import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { validAnswerKey } from "@/lib/questions/answer-key";
import type { VersionSnapshot } from "@/lib/questions/correction-core";

/**
 * MISTAKE-VERSION-1: version snapshots read server-side (service role — students cannot read question_answers). Server
 * code only (no "server-only" import so offline gates can load the services; never imported by a client component). Callers
 * prove ownership first (the student's own vault row / attempt / drill). A failed read returns an empty map: the page
 * then shows the answered version only, never a guessed "current" one.
 */
const SELECT = "id, question_id, question_text, is_current, question_options(id, option_key, option_text, order_index), question_answers(correct_option_key, explanation_md)";

type Row = {
  id: string;
  question_id: string;
  question_text: string;
  is_current: boolean;
  question_options: Array<{ id: string; option_key: string; option_text: string; order_index: number | null }> | null;
  question_answers: { correct_option_key: string | null; explanation_md: string | null } | Array<{ correct_option_key: string | null; explanation_md: string | null }> | null;
};

function toSnapshot(r: Row): VersionSnapshot {
  const ans = Array.isArray(r.question_answers) ? r.question_answers[0] : r.question_answers;
  return {
    id: r.id,
    questionText: r.question_text,
    options: [...(r.question_options ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)).map((o) => ({ id: o.id, key: o.option_key, text: o.option_text })),
    correctOptionKey: validAnswerKey(r.question_answers, r.question_options),
    explanation: ans?.explanation_md ?? null,
  };
}

/** questionId → its CURRENT (published) version snapshot. */
export async function loadCurrentVersions(questionIds: string[]): Promise<Map<string, VersionSnapshot>> {
  const ids = [...new Set(questionIds.filter(Boolean))];
  const out = new Map<string, VersionSnapshot>();
  if (!ids.length) return out;
  try {
    const { data, error } = await createAdminServerSupabaseClient().from("question_versions").select(SELECT).in("question_id", ids).eq("is_current", true);
    if (error) return out;
    for (const r of (data ?? []) as Row[]) out.set(r.question_id, toSnapshot(r));
  } catch {
    /* empty map: no correction is claimed */
  }
  return out;
}

/** versionId → snapshot (any lifecycle; e.g. the superseded version a student answered). */
export async function loadVersionSnapshots(versionIds: string[]): Promise<Map<string, VersionSnapshot>> {
  const ids = [...new Set(versionIds.filter(Boolean))];
  const out = new Map<string, VersionSnapshot>();
  if (!ids.length) return out;
  try {
    const { data, error } = await createAdminServerSupabaseClient().from("question_versions").select(SELECT).in("id", ids);
    if (error) return out;
    for (const r of (data ?? []) as Row[]) out.set(r.id, toSnapshot(r));
  } catch {
    /* empty map */
  }
  return out;
}
