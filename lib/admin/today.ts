import "server-only";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { reportWriteFailure } from "@/lib/ops/write-failure";
import { loadPublishedExamsForTopics } from "@/lib/syllabus/published-topic-exams";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { getAdminStudioSettings } from "./studio-settings";
import { buildContentHealth, type HealthGrid, type HealthQuestion } from "./content-health-core";
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
  /** EXAM-LOGO-1: exams (not the internal QA exam) that show neither their own nor their body's logo */
  examsWithoutLogo: number | null;
  health: HealthGrid | null;
  /** consecutive identical actions grouped (max 5 groups); more = the count is a lower bound */
  recent: Array<{ action: string; entity: string; at: string; count: number; more: boolean }> | null;
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

  // EXAM-LOGO-1: "Logo missing" — an exam needs its conducting body's logo (or its own override)
  let examsWithoutLogo: number | null = null;
  {
    const { data, error } = await sb.from("exams").select("id, slug, logo_override_path, conducting_org:conducting_orgs(logo_path)").neq("slug", "qa-syllabus-test");
    if (error) logRead("exams", error.code);
    else
      examsWithoutLogo = (data ?? []).filter((e) => {
        const org = Array.isArray(e.conducting_org) ? e.conducting_org[0] : e.conducting_org;
        return !e.logo_override_path && !org?.logo_path;
      }).length;
  }

  let recent: TodayV2["recent"] = null;
  if (isAdmin) {
    const { data, error } = await sb.from("admin_audit_logs").select("action_type, target_entity, created_at").order("created_at", { ascending: false }).limit(60);
    if (error) logRead("admin_audit_logs", error.code);
    recent = error ? null : groupRecent((data ?? []).map((r) => ({ action: r.action_type, entity: r.target_entity, at: r.created_at })), 5, 60);
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
    examsWithoutLogo,
    health,
    recent,
  };
}

/** Content health (architect 2026-10-27): every exam with ≥ 1 question in any state × subject; published + in review. */
async function contentHealth(sb: AppSupabaseClient): Promise<TodayV2["health"]> {
  const [vs, exams, maps, sources, mocks] = await Promise.all([
    sb.from("question_versions").select("question_id, lifecycle_status, questions!inner(canonical_topic_id, status)").not("lifecycle_status", "in", "(REJECTED,SUPERSEDED)").limit(20000),
    sb.from("exams").select("id, title, is_active").order("title"),
    sb.from("exam_question_mappings").select("question_id, exam_id").limit(20000),
    sb.from("question_sources").select("question_id, exam_name").not("exam_name", "is", null).limit(20000),
    // mock membership: mock_questions → mock_tests → mock_templates.exam_id (an explicit link to the exam)
    sb.from("mock_questions").select("question_versions!inner(question_id), mock_tests!inner(mock_templates!inner(exam_id))").limit(20000),
  ]);
  const err = vs.error || exams.error || maps.error || sources.error || mocks.error;
  if (err) {
    logRead("content_health", err.code);
    return null;
  }
  const byQ = new Map<string, HealthQuestion>();
  for (const v of vs.data ?? []) {
    const q = (Array.isArray(v.questions) ? v.questions[0] : v.questions) as { canonical_topic_id: string | null; status: string } | null;
    const cur = byQ.get(v.question_id) ?? { id: v.question_id, topicId: q?.canonical_topic_id ?? null, published: q?.status === "published", inReview: false };
    if (v.lifecycle_status === "IN_REVIEW") cur.inReview = true;
    byQ.set(v.question_id, cur);
  }
  const questions = [...byQ.values()];
  const topicIds = [...new Set(questions.map((q) => q.topicId).filter(Boolean))] as string[];
  const [nodes, topicExamsRaw] = await Promise.all([
    topicIds.length ? sb.from("canonical_taxonomy_nodes").select("id, root_subject_id").in("id", topicIds) : Promise.resolve({ data: [], error: null }),
    loadPublishedExamsForTopics(sb, topicIds),
  ]);
  if (nodes.error || !topicExamsRaw) {
    logRead("content_health.map", nodes.error?.code);
    return null;
  }
  const subjectOfTopic = new Map((nodes.data ?? []).map((n: { id: string; root_subject_id: string | null }) => [n.id, n.root_subject_id]));
  const subjectIds = [...new Set([...subjectOfTopic.values()].filter(Boolean))] as string[];
  const subj = subjectIds.length ? await sb.from("canonical_taxonomy_nodes").select("id, name, display_order").in("id", subjectIds).order("display_order") : { data: [], error: null };
  if (subj.error) {
    logRead("content_health.subjects", subj.error.code);
    return null;
  }
  const examByTitle = new Map((exams.data ?? []).map((e) => [e.title.trim().toLowerCase(), e.id]));
  const explicitExams = new Map<string, string[]>();
  const add = (q: string, e: string | undefined) => {
    if (e) explicitExams.set(q, [...(explicitExams.get(q) ?? []), e]);
  };
  for (const m of maps.data ?? []) add(m.question_id, m.exam_id);
  for (const s of sources.data ?? []) add(s.question_id, examByTitle.get(String(s.exam_name).trim().toLowerCase()));
  const one = <T,>(x: T | T[] | null | undefined): T | undefined => (Array.isArray(x) ? x[0] : x ?? undefined);
  for (const m of mocks.data ?? []) {
    const q = one(m.question_versions)?.question_id;
    const e = one(one(m.mock_tests)?.mock_templates)?.exam_id;
    if (q && e && !(explicitExams.get(q) ?? []).includes(e)) add(q, e);
  }
  return buildContentHealth({
    questions,
    subjectOfTopic,
    topicExams: new Map([...topicExamsRaw.entries()].map(([t, list]) => [t, list.map((e) => e.examId)])),
    explicitExams,
    exams: (exams.data ?? []).map((e) => ({ id: e.id, title: e.title, isActive: e.is_active })),
    subjects: (subj.data ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })),
  });
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
