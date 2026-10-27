/**
 * COURAGE LIBRARY — SYLLABUS INTAKE SERVICE (CA-2, CONTENT-ARCH-1 §B)
 *
 * Paste (contract v3 — SYLLABUS-PROMPT-2 — or v2) → validate (lib/syllabus/intake-contract.ts) → match to the master tree (lib/syllabus/tree-matcher.ts) →
 * staging (fn_syllabus_intake_create) → the owner decides every item (fn_syllabus_intake_decide: LINK / ALIAS /
 * APPROVE_NEW / IGNORE) → one DRAFT syllabus version (fn_syllabus_intake_import) → the existing editor + publish.
 *
 * INVARIANTS:
 * - Server-only; the service-role client after the canonical admin guard. ADMIN ONLY: decisions write the master tree
 *   (aliases, new nodes), which is admin-only (SEC-1B Q1).
 * - Nothing is created silently: the database refuses EXACT / ALIAS claims that are not under the matched parent and
 *   writes every decision's audit row in the same transaction.
 */
import { guardAdminAction } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { Json } from "@/types/database";
import { SOURCE_URL_RE, validateIntakePayload, type IntakeError, type IntakeLevel, type IntakeOrigin, type IntakeStats } from "@/lib/syllabus/intake-contract";
import { matchIntake, matchSummary, type MatchCandidate, type MatchStatus } from "@/lib/syllabus/tree-matcher";
import { INTAKE_DECISIONS, type IntakeDecision, type IntakeItemView, type IntakeNodeOption, type IntakeSessionView } from "@/lib/syllabus/intake-types";

export { INTAKE_DECISIONS, type IntakeDecision, type IntakeItemView, type IntakeNodeOption, type IntakeSessionView };

export type IntakeResult<T> = { success: true; data: T } | { success: false; code: string; error: string; errors?: IntakeError[] };

export interface CreateIntakeInput {
  examId: string;
  cycleId: string | null;
  tier: string | null;
  /** SYLLABUS-PROMPT-2: optional (v3); a v2 paste carries its own official link and date */
  referenceUrl: string | null;
  json: string;
}

interface Ctx {
  userId: string | null;
  userEmail: string;
  supabase: AppSupabaseClient;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const fail = <T>(code: string, error: string, errors?: IntakeError[]): IntakeResult<T> => ({ success: false, code, error, ...(errors ? { errors } : {}) });

/** Database messages → admin messages (the rule text after the prefix; never ids or SQL). */
export function mapIntakeDbError(error: { code?: string; message?: string } | null | undefined): { code: string; error: string } {
  const msg = error?.message || "";
  for (const prefix of ["SYLLABUS_INTAKE:", "TAXONOMY_RULE:"]) {
    if (msg.includes(prefix)) return { code: prefix === "SYLLABUS_INTAKE:" ? "INTAKE_RULE" : "TAXONOMY_RULE", error: msg.slice(msg.indexOf(prefix) + prefix.length).trim().replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "…") };
  }
  if (error?.code === "23505") return { code: "DUPLICATE", error: "A node with this name or slug already exists here." };
  return { code: "DB_ERROR", error: "The intake change could not be saved." };
}

async function ctx(): Promise<Ctx | null> {
  const auth = await guardAdminAction();
  if (!auth.ok) return null;
  return { userId: auth.userId || null, userEmail: auth.userEmail || "unknown", supabase: createAdminServerSupabaseClient() };
}

export class SyllabusIntakeService {
  /** Validates, matches and stores one pasted intake; nothing touches the master tree or a syllabus yet. */
  static async create(input: CreateIntakeInput): Promise<IntakeResult<{ sessionId: string; stats: IntakeStats; summary: Record<MatchStatus, number> }>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    if (!isUuid(input.examId) || (input.cycleId !== null && !isUuid(input.cycleId))) return fail("VALIDATION", "Choose the exam and cycle again.");
    const [examRes, cycleRes] = await Promise.all([
      c.supabase.from("exams").select("id, slug").eq("id", input.examId).maybeSingle(),
      input.cycleId ? c.supabase.from("exam_cycles").select("id, cycle_year, exam_id").eq("id", input.cycleId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (examRes.error || !examRes.data) return fail("NOT_FOUND", "Exam not found.");
    if (input.cycleId && (!cycleRes.data || cycleRes.data.exam_id !== input.examId)) return fail("VALIDATION", "The cycle does not belong to the exam.");
    const v = validateIntakePayload(input.json, { examSlug: examRes.data.slug, cycleYear: cycleRes.data?.cycle_year ?? null, tier: input.tier || null });
    if (!v.ok) return fail("VALIDATION", "The pasted syllabus has errors.", v.errors);
    const reference = input.referenceUrl?.trim() || null;
    if (reference && !SOURCE_URL_RE.test(reference)) return fail("VALIDATION", "The reference link must be an https:// link.");

    const [nodesRes, aliasRes] = await Promise.all([
      c.supabase.from("canonical_taxonomy_nodes").select("id, parent_id, node_type, name, name_hi, is_active").in("node_type", ["SUBJECT", "TOPIC", "SUBTOPIC", "CONCEPT"]),
      c.supabase.from("taxonomy_node_aliases").select("node_id, normalized_alias"),
    ]);
    if (nodesRes.error || aliasRes.error) return fail("DB_ERROR", "Could not load the master tree.");
    const matched = matchIntake(
      v.items,
      (nodesRes.data || []).map((n) => ({ id: n.id, parentId: n.parent_id, nodeType: n.node_type, name: n.name, nameHi: n.name_hi, isActive: n.is_active })),
      (aliasRes.data || []).map((a) => ({ nodeId: a.node_id, normalized: a.normalized_alias }))
    );
    const { data, error } = await c.supabase.rpc("fn_syllabus_intake_create", {
      p_exam_id: input.examId,
      p_exam_cycle_id: input.cycleId as string,
      p_tier: (input.tier || null) as string,
      p_source_url: (v.header.source_url ?? reference) as string,
      p_as_of: v.header.as_of as string,
      p_payload: v.payload as Json,
      // plain JSON (strings / numbers / booleans / null / arrays): a round trip gives the Json value the RPC takes
      p_items: JSON.parse(JSON.stringify(matched)) as Json,
      p_actor_id: c.userId as string,
      p_actor_email: c.userEmail,
    });
    if (error || !data) {
      const m = mapIntakeDbError(error);
      return fail(m.code, m.error);
    }
    return { success: true, data: { sessionId: data, stats: v.stats, summary: matchSummary(matched) } };
  }

  static async list(): Promise<IntakeResult<IntakeSessionView[]>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    const { data, error } = await c.supabase
      .from("syllabus_intake_sessions")
      .select("id, exam_id, tier, source_url, as_of_date, based_on, contract_version, status, imported_version_id, created_at, exam:exams(title), cycle:exam_cycles(cycle_year)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return fail("DB_ERROR", "Could not load the intakes.");
    return { success: true, data: (data || []).map(toSession) };
  }

  static async get(sessionId: string): Promise<IntakeResult<{ session: IntakeSessionView; items: IntakeItemView[]; nodes: IntakeNodeOption[] }>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    if (!isUuid(sessionId)) return fail("NOT_FOUND", "Intake not found.");
    const [s, items, nodes] = await Promise.all([
      c.supabase
        .from("syllabus_intake_sessions")
        .select("id, exam_id, tier, source_url, as_of_date, based_on, contract_version, status, imported_version_id, created_at, exam:exams(title), cycle:exam_cycles(cycle_year)")
        .eq("id", sessionId)
        .maybeSingle(),
      c.supabase
        .from("syllabus_intake_items")
        .select("id, parent_item_id, item_key, level, position, raw_name, raw_name_hi, aliases, marks, questions, weightage_tier, origin, avg_questions, duration_minutes, negative_marking, uncertain, uncertain_reason, extra_headings, match_status, matched_node_id, candidates, decision, decision_node_id")
        .eq("session_id", sessionId),
      c.supabase.from("canonical_taxonomy_nodes").select("id, parent_id, node_type, name, hierarchy_path").eq("is_active", true).in("node_type", ["SUBJECT", "TOPIC", "SUBTOPIC", "CONCEPT"]),
    ]);
    if (s.error || items.error || nodes.error) return fail("DB_ERROR", "Could not load the intake.");
    if (!s.data) return fail("NOT_FOUND", "Intake not found.");
    const order = (k: string) => k.split(".").map((p) => p.slice(0, 1) + p.slice(1).padStart(4, "0")).join(".");
    return {
      success: true,
      data: {
        session: toSession(s.data),
        items: (items.data || [])
          .map((r) => ({
            id: r.id,
            parentId: r.parent_item_id,
            key: r.item_key,
            level: r.level as IntakeLevel,
            position: r.position,
            name: r.raw_name,
            nameHi: r.raw_name_hi,
            aliases: r.aliases || [],
            marks: r.marks,
            questions: r.questions,
            weightageTier: r.weightage_tier,
            origin: (r.origin as IntakeOrigin | null) ?? null,
            avgQuestions: r.avg_questions,
            durationMinutes: r.duration_minutes,
            negativeMarking: r.negative_marking,
            uncertain: r.uncertain,
            uncertainReason: r.uncertain_reason,
            headings: r.extra_headings || [],
            matchStatus: r.match_status as MatchStatus,
            matchedNodeId: r.matched_node_id,
            candidates: Array.isArray(r.candidates) ? r.candidates.map(toCandidate).filter((x): x is MatchCandidate => x !== null) : [],
            decision: (r.decision as IntakeDecision | null) ?? null,
            decisionNodeId: r.decision_node_id,
          }))
          .sort((a, b) => order(a.key).localeCompare(order(b.key))),
        nodes: (nodes.data || []).map((n) => ({ id: n.id, parentId: n.parent_id, nodeType: n.node_type, name: n.name, path: n.hierarchy_path })),
      },
    };
  }

  static async decide(itemId: string, decision: IntakeDecision, nodeId: string | null): Promise<IntakeResult<{ nodeId: string | null }>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    if (!isUuid(itemId) || !INTAKE_DECISIONS.includes(decision)) return fail("VALIDATION", "Invalid decision.");
    if ((decision === "LINK" || decision === "ALIAS") && !isUuid(nodeId)) return fail("VALIDATION", "Choose the node to link.");
    const { data, error } = await c.supabase.rpc("fn_syllabus_intake_decide", {
      p_item_id: itemId,
      p_decision: decision,
      p_node_id: (decision === "LINK" || decision === "ALIAS" ? nodeId : null) as string,
      p_actor_id: c.userId as string,
      p_actor_email: c.userEmail,
    });
    if (error || !data) {
      const m = mapIntakeDbError(error);
      return fail(m.code, m.error);
    }
    const r = data as { node_id?: string | null };
    return { success: true, data: { nodeId: r.node_id ?? null } };
  }

  static async importDraft(sessionId: string, versionTag: string | null): Promise<IntakeResult<{ versionId: string }>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    if (!isUuid(sessionId)) return fail("NOT_FOUND", "Intake not found.");
    if (versionTag && !/^[a-z0-9]+(?:[-.][a-z0-9]+)*$/.test(versionTag)) return fail("VALIDATION", 'The version tag must be lower-case letters, digits, "-" or ".".');
    const { data, error } = await c.supabase.rpc("fn_syllabus_intake_import", {
      p_session_id: sessionId,
      p_version_tag: (versionTag || null) as string,
      p_actor_id: c.userId as string,
      p_actor_email: c.userEmail,
    });
    if (error || !data) {
      const m = mapIntakeDbError(error);
      return fail(m.code, m.error);
    }
    return { success: true, data: { versionId: String((data as { version_id?: string }).version_id || "") } };
  }

  static async discard(sessionId: string): Promise<IntakeResult<{ id: string }>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    if (!isUuid(sessionId)) return fail("NOT_FOUND", "Intake not found.");
    const { error } = await c.supabase.rpc("fn_syllabus_intake_discard", { p_session_id: sessionId, p_actor_id: c.userId as string, p_actor_email: c.userEmail });
    if (error) {
      const m = mapIntakeDbError(error);
      return fail(m.code, m.error);
    }
    return { success: true, data: { id: sessionId } };
  }
}

/** One stored candidate ({ node_id, name, score, reason }); anything malformed is dropped. */
function toCandidate(j: Json): MatchCandidate | null {
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const { node_id, name, score, reason } = j as { [k: string]: Json | undefined };
  if (typeof node_id !== "string" || typeof name !== "string" || typeof score !== "number") return null;
  return { node_id, name, score, reason: reason === "WORDS" ? "WORDS" : "SIMILAR" };
}

interface SessionRow {
  id: string;
  exam_id: string;
  tier: string | null;
  source_url: string | null;
  as_of_date: string | null;
  based_on: string | null;
  contract_version: number;
  status: string;
  imported_version_id: string | null;
  created_at: string;
  exam: { title: string } | null;
  cycle: { cycle_year: number } | null;
}

function toSession(r: SessionRow): IntakeSessionView {
  return {
    id: r.id,
    examId: r.exam_id,
    examTitle: r.exam?.title ?? "Exam",
    cycleYear: r.cycle?.cycle_year ?? null,
    tier: r.tier,
    sourceUrl: r.source_url,
    asOf: r.as_of_date,
    basedOn: r.based_on,
    contractVersion: r.contract_version,
    status: r.status as IntakeSessionView["status"],
    importedVersionId: r.imported_version_id,
    createdAt: r.created_at,
  };
}
