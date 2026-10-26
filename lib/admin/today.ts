import "server-only";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { reportWriteFailure } from "@/lib/ops/write-failure";
import { loadPublishedExamsForTopics } from "@/lib/syllabus/published-topic-exams";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { getAdminStudioSettings } from "./studio-settings";
import { computeReviewStats, dailyCounts, groupRecent, REVIEW_ACTIONS, type ReviewStats } from "./review-stats-core";
import type { AdminRole, NavFlags } from "./nav";

/**
 * Courage Studio — TODAY v2 read model (decision #84; READ ONLY, service role, called only from /admin after
 * requireAdminPage). Role-aware: a card exists only when the role can open its target page (admin-only pages → admin
 * cards). Every number is a real query; a failed read is null → "Not available" (R12). No e-mails, no values from the
 * audit log; the greeting uses the first name from the profile (or the role). Q5: no write-failure / nightly cards.
 */
export interface TodayV2 {
  greetingName: string;
  needYou: number;
  mission: { goal: number; stats: ReviewStats | null; queueSize: number | null };
  drafts: { inReview: number | null; approved: number | null; spark: number[] | null };
  reports: { open: number | null; overdue: number | null; oldestDays: number | null } | null;
  ca: { inReview: number | null; drafts: number | null };
  tickets: { open: number | null; late: number | null } | null;
  flags: number | null;
  libraryEnding: number | null;
  health: { exams: Array<{ id: string; title: string }>; subjects: Array<{ id: string; name: string }>; cells: Record<string, number>; lowestExamId: string | null } | null;
  /** consecutive identical actions grouped (max 5 groups) */
  recent: Array<{ action: string; entity: string; at: string; count: number }> | null;
}

const DAY = 86400e3;
const REPORT_OVERDUE_MS = 2 * DAY;

function logRead(card: string, code: string | undefined) {
  reportWriteFailure({ fn: "AdminTodayV2", table: card, op: "select", code: code ?? null, ids: { card } });
}

type CountQuery = PromiseLike<{ count: number | null; error: { code?: string } | null }>;
async function count(card: string, q: CountQuery): Promise<number | null> {
  const { count: n, error } = await q;
  if (error) {
    logRead(card, error.code);
    return null;
  }
  return n ?? 0;
}

export async function getTodayV2(input: { role: AdminRole; userId: string; flags: NavFlags }): Promise<TodayV2> {
  const sb = createAdminServerSupabaseClient();
  const isAdmin = input.role === "admin";
  const head = { count: "exact" as const, head: true };
  const since14 = new Date(Date.now() - 14 * DAY).toISOString();
  const since60 = new Date(Date.now() - 60 * DAY).toISOString();

  const [settings, profile, inReview, approved, created14, caInReview, caDrafts, flags, myReviews] = await Promise.all([
    getAdminStudioSettings(),
    sb.from("user_profiles").select("full_name").eq("id", input.userId).maybeSingle(),
    count("question_versions", sb.from("question_versions").select("id", head).eq("lifecycle_status", "IN_REVIEW")),
    count("question_versions", sb.from("question_versions").select("id", head).eq("lifecycle_status", "APPROVED")),
    sb.from("question_versions").select("created_at").gte("created_at", since14).limit(5000),
    count("current_affairs_articles", sb.from("current_affairs_articles").select("id", head).eq("status", "IN_REVIEW")),
    count("current_affairs_articles", sb.from("current_affairs_articles").select("id", head).eq("status", "DRAFT")),
    count("discussion_moderation_flags", sb.from("discussion_moderation_flags").select("id", head).eq("status", "PENDING")),
    sb.from("admin_audit_logs").select("created_at").eq("actor_id", input.userId).in("action_type", [...REVIEW_ACTIONS]).gte("created_at", since60).limit(5000),
  ]);
  if (created14.error) logRead("question_versions.spark", created14.error.code);
  if (myReviews.error) logRead("admin_audit_logs.reviews", myReviews.error.code);

  const first = String(profile.data?.full_name ?? "").trim().split(/\s+/)[0] || "";
  const stats = myReviews.error ? null : computeReviewStats((myReviews.data ?? []).map((r) => r.created_at), settings.dailyReviewGoal);

  let reports: TodayV2["reports"] = null;
  if (isAdmin) {
    const { data, error } = await sb.from("question_errata_reports").select("created_at").in("status", ["OPEN", "UNDER_REVIEW"]).limit(5000);
    if (error) logRead("question_errata_reports", error.code);
    const ages = (data ?? []).map((r) => Date.now() - new Date(r.created_at).getTime());
    reports = error
      ? { open: null, overdue: null, oldestDays: null }
      : { open: ages.length, overdue: ages.filter((a) => a > REPORT_OVERDUE_MS).length, oldestDays: ages.length ? Math.floor(Math.max(...ages) / DAY) : null };
  }

  let tickets: TodayV2["tickets"] = null;
  if (input.flags.SUPPORT) {
    const dayAgo = new Date(Date.now() - DAY).toISOString();
    const [open, late] = await Promise.all([
      count("support_tickets", sb.from("support_tickets").select("id", head).in("status", ["OPEN", "IN_PROGRESS"])),
      count("support_tickets", sb.from("support_tickets").select("id", head).eq("status", "OPEN").lt("created_at", dayAgo)),
    ]);
    tickets = { open, late };
  }

  let libraryEnding: number | null = null;
  if (isAdmin) {
    const nowIso = new Date().toISOString();
    libraryEnding = await count(
      "user_entitlements",
      sb.from("user_entitlements").select("id", head).eq("source", "LIBRARY").eq("is_active", true).is("revoked_at", null).gt("expires_at", nowIso).lte("expires_at", new Date(Date.now() + 7 * DAY).toISOString()),
    );
  }

  let recent: TodayV2["recent"] = null;
  if (isAdmin) {
    const { data, error } = await sb.from("admin_audit_logs").select("action_type, target_entity, created_at").order("created_at", { ascending: false }).limit(60);
    if (error) logRead("admin_audit_logs", error.code);
    recent = error ? null : groupRecent((data ?? []).map((r) => ({ action: r.action_type, entity: r.target_entity, at: r.created_at })), 5);
  }

  const health = await contentHealth(sb);
  const needYou = [inReview, reports?.open ?? 0, caInReview, tickets?.open ?? 0, flags].reduce<number>((a, n) => a + (n ?? 0), 0);

  return {
    greetingName: first || (isAdmin ? "Admin" : "Staff"),
    needYou,
    mission: { goal: settings.dailyReviewGoal, stats, queueSize: inReview },
    drafts: { inReview, approved, spark: created14.error ? null : dailyCounts((created14.data ?? []).map((r) => r.created_at)) },
    reports,
    ca: { inReview: caInReview, drafts: caDrafts },
    tickets,
    flags,
    libraryEnding,
    health,
    recent,
  };
}

/** Published questions by exam × subject (canonical topic → root subject; topic → exams of PUBLISHED syllabi). */
async function contentHealth(sb: AppSupabaseClient): Promise<TodayV2["health"]> {
  const [qs, exams] = await Promise.all([
    sb.from("questions").select("canonical_topic_id").eq("status", "published").limit(20000),
    sb.from("exams").select("id, title").eq("is_active", true).order("title"),
  ]);
  if (qs.error || exams.error) {
    logRead("content_health", (qs.error || exams.error)?.code);
    return null;
  }
  const topicIds = [...new Set((qs.data ?? []).map((q) => q.canonical_topic_id).filter(Boolean))] as string[];
  const [nodes, topicExams] = await Promise.all([
    topicIds.length ? sb.from("canonical_taxonomy_nodes").select("id, root_subject_id").in("id", topicIds) : Promise.resolve({ data: [], error: null }),
    loadPublishedExamsForTopics(sb, topicIds),
  ]);
  if (nodes.error || !topicExams) {
    logRead("content_health.map", nodes.error?.code);
    return null;
  }
  const subjectOf = new Map((nodes.data ?? []).map((n: { id: string; root_subject_id: string | null }) => [n.id, n.root_subject_id]));
  const subjectIds = [...new Set([...subjectOf.values()].filter(Boolean))] as string[];
  const subj = subjectIds.length ? await sb.from("canonical_taxonomy_nodes").select("id, name, display_order").in("id", subjectIds).order("display_order") : { data: [], error: null };
  if (subj.error) {
    logRead("content_health.subjects", subj.error.code);
    return null;
  }
  const cells: Record<string, number> = {};
  for (const q of qs.data ?? []) {
    const s = q.canonical_topic_id ? subjectOf.get(q.canonical_topic_id) : null;
    if (!s) continue;
    for (const e of topicExams.get(q.canonical_topic_id as string) ?? []) {
      const k = `${e.examId}:${s}`;
      cells[k] = (cells[k] ?? 0) + 1;
    }
  }
  const examList = (exams.data ?? []).map((e) => ({ id: e.id, title: e.title }));
  const totals = examList.map((e) => [e.id, Object.entries(cells).filter(([k]) => k.startsWith(e.id + ":")).reduce((a, [, n]) => a + n, 0)] as const);
  const lowest = totals.length ? totals.reduce((m, t) => (t[1] < m[1] ? t : m)) : null;
  return {
    exams: examList,
    subjects: (subj.data ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })),
    cells,
    lowestExamId: lowest ? lowest[0] : null,
  };
}

/** The header's first name (own profile; null when unreadable — the header then shows the role only). Never throws. */
export async function getAdminFirstName(userId: string): Promise<string | null> {
  try {
    const { data } = await createAdminServerSupabaseClient().from("user_profiles").select("full_name").eq("id", userId).maybeSingle();
    return String(data?.full_name ?? "").trim().split(/\s+/)[0] || null;
  } catch {
    return null;
  }
}

const ACTION_WORDS: Record<string, string> = {
  SYLLABUS_DRAFT_IMPORT: "Syllabus draft imported",
  SYLLABUS_DRAFT_CREATE: "Syllabus draft created",
  SYLLABUS_PUBLISH: "Syllabus version published",
  SYLLABUS_ARCHIVE: "Syllabus version archived",
  SYLLABUS_NODE_UPSERT: "Syllabus unit saved",
  SYLLABUS_MAPPINGS_SET: "Syllabus topics mapped",
  QF_IMPORT_DRAFTS: "Questions imported as drafts",
  QF_CREATE_MANUAL_DRAFT: "Question draft written",
  QF_TRANSITION_IN_REVIEW: "Question sent to review",
  QF_TRANSITION_APPROVED: "Question approved",
  QF_TRANSITION_REJECTED: "Question rejected",
  QF_TRANSITION_CHANGES_REQUESTED: "Changes requested on a question",
  QF_PUBLISH: "Question published",
  QF_SELF_APPROVED_PUBLISH: "Question approved and published by the same admin",
  QUESTION_ARCHIVE: "Question archived",
  TAXONOMY_NODE_CREATE: "Topic created",
  TAXONOMY_NODE_RENAME: "Topic renamed",
  LEARNING_DOCUMENT_CREATE: "Lesson created",
};

/** Human wording for an audit action code (codes only — never values / e-mails). */
export function humanAction(code: string): string {
  if (ACTION_WORDS[code]) return ACTION_WORDS[code];
  const s = code.replace(/^QF_TRANSITION_/, "QUESTION_").replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The icon tile kind for an action (import ↑ cyan · publish ● green · approve ✓ blue · reject ✕ soft red · other). */
export function actionKind(code: string): "import" | "publish" | "approve" | "reject" | "other" {
  if (/IMPORT|CREATE|UPSERT/.test(code)) return "import";
  if (/PUBLISH/.test(code)) return "publish";
  if (/APPROVED|MAPPINGS_SET|IN_REVIEW/.test(code)) return "approve";
  if (/REJECT|ARCHIVE|DEACTIVATE/.test(code)) return "reject";
  return "other";
}

/** The Focus review sidebar badge: questions waiting in review (null when unreadable → no badge). Runs in the admin
 *  layout, so it never throws: a failure here must not take the whole admin shell down. */
export async function getFocusQueueCount(): Promise<number | null> {
  try {
    const sb = createAdminServerSupabaseClient();
    return await count("question_versions", sb.from("question_versions").select("id", { count: "exact", head: true }).eq("lifecycle_status", "IN_REVIEW"));
  } catch {
    logRead("question_versions.badge", undefined);
    return null;
  }
}

/** The reviewer's own review stats today (focus review "n of goal"); null when the audit log is unreadable. */
export async function getMyReviewStats(userId: string, goal: number): Promise<ReviewStats | null> {
  const sb = createAdminServerSupabaseClient();
  const since60 = new Date(Date.now() - 60 * DAY).toISOString();
  const { data, error } = await sb.from("admin_audit_logs").select("created_at").eq("actor_id", userId).in("action_type", [...REVIEW_ACTIONS]).gte("created_at", since60).limit(5000);
  if (error) {
    logRead("admin_audit_logs.reviews", error.code);
    return null;
  }
  return computeReviewStats((data ?? []).map((r) => r.created_at), goal);
}
