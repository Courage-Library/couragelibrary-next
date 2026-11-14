/**
 * COURAGE LIBRARY — SYLLABUS-MAP-1 B2: MASTER_INTAKE v1 / EXAM_MAP v1 intake (design docs/syllabus/SYLLABUS_MAP_1_DESIGN.md)
 *
 * Paste → validate (lib/syllabus/master-intake-contract.ts | exam-map-contract.ts) → match to the master tree
 * (lib/syllabus/map-matcher.ts) → staging (fn_syllabus_map_create, idempotent per file) → the owner decides what is not
 * exact (fn_syllabus_map_decide: LINK / APPROVE_NEW / IGNORE; fn_syllabus_map_set_outline_action; per-exam weightage
 * fn_syllabus_map_set_weightage) → fn_syllabus_map_import: a MASTER_INTAKE updates the master (outlines, aliases, a missing
 * Hindi name); an EXAM_MAP becomes ONE DRAFT syllabus version + DRAFT selection stages, published through the existing
 * editor (PUBLISH-CONFIRM-SERVER) and fn_selection_stages_publish.
 * INVARIANTS: server-only; the canonical admin guard first (owner Q5: admin only — decisions write the master tree);
 * nothing is linked or created from a fuzzy match; drafts are never visible to candidates (published-only readers).
 * The v3 intake (services/syllabus/intake.service.ts) is separate and unchanged.
 */
import { createHash } from "crypto";
import { guardAdminAction } from "@/lib/auth/require-admin";
import { QA_RUN_SLUG_LIKE } from "@/lib/qa/fixtures";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { rpcJsonObject, sqlNullArg } from "@/lib/supabase/rpc";
import type { Database, Json } from "@/types/database";
import { extractJson } from "@/lib/prompts/paste-extract";
import { validateMasterIntake } from "@/lib/syllabus/master-intake-contract";
import { validateExamMap } from "@/lib/syllabus/exam-map-contract";
import type { ContractIssue } from "@/lib/syllabus/map-contract-common";
import { mapMatchSummary, matchExamMap, matchMasterIntake, type MapCandidate, type MapMatchStatus } from "@/lib/syllabus/map-matcher";

export type MapContract = "MASTER_INTAKE" | "EXAM_MAP";
export type MapDecision = "LINK" | "APPROVE_NEW" | "IGNORE";
export const MAP_DECISIONS: readonly MapDecision[] = ["LINK", "APPROVE_NEW", "IGNORE"];
export type MapResult<T> = { success: true; data: T } | { success: false; code: string; error: string; errors?: (ContractIssue | { path: string; message: string })[] };

export interface MapSessionView {
  id: string;
  contract: MapContract;
  status: "REVIEW" | "IMPORTED" | "DISCARDED";
  target: string;
  examId: string | null;
  examCycleId: string | null;
  tier: string | null;
  createdAt: string;
  importedVersionId: string | null;
  result: Record<string, unknown> | null;
  payload: Record<string, unknown>;
}
export interface MapItemView {
  id: string;
  key: string;
  parentItemId: string | null;
  kind: "REF" | "NAME" | "NEW";
  level: "TOPIC" | "SUBTOPIC" | null;
  refPath: string | null;
  name: string | null;
  nameHi: string | null;
  aliases: string[];
  outline: string[] | null;
  sectionKey: string | null;
  weightageTier: string | null;
  avgQuestions: number | null;
  matchStatus: MapMatchStatus;
  candidates: MapCandidate[];
  decision: MapDecision | null;
  decisionNode: { id: string; name: string; path: string } | null;
  parentNode: { id: string; name: string; path: string } | null;
  outlineConflict: boolean;
  outlineAction: "REPLACE" | "KEEP" | null;
  /** the master node's current outline (shown next to a conflicting one) */
  currentOutline: string[] | null;
}

interface Ctx {
  userId: string | null;
  userEmail: string;
  db: AdminDb;
}

type AdminDb = ReturnType<typeof createAdminServerSupabaseClient>;
type MapItemRow = Database["public"]["Tables"]["syllabus_map_items"]["Row"];
type MapSessionRow = Pick<Database["public"]["Tables"]["syllabus_map_sessions"]["Row"], "id" | "contract" | "status" | "exam_id" | "exam_cycle_id" | "tier" | "created_at" | "imported_version_id" | "result" | "payload">;
/** a jsonb value as an object (the 139 functions return objects; anything else reads as empty) */
const obj = (j: Json | null | undefined): Record<string, unknown> => rpcJsonObject<Record<string, unknown>>(j) ?? {};
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
/** the stored match suggestions (jsonb) → MapCandidate[]; a malformed entry is dropped, never shown half-filled */
function toCandidates(j: Json): MapCandidate[] {
  if (!Array.isArray(j)) return [];
  return j.flatMap((e) => {
    const o = rpcJsonObject<Record<string, unknown>>(e);
    return o && typeof o.node_id === "string" && typeof o.name === "string" && typeof o.path === "string" && typeof o.score === "number"
      ? [{ node_id: o.node_id, name: o.name, path: o.path, score: o.score }]
      : [];
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
type MapIssue = ContractIssue | { path: string; message: string };
const fail = <T>(code: string, error: string, errors?: MapIssue[]): MapResult<T> => ({ success: false, code, error, ...(errors ? { errors } : {}) });

/** Database messages → admin messages (the rule text after the prefix; never ids or SQL). */
export function mapDbError(error: { code?: string; message?: string } | null | undefined): { code: string; error: string } {
  const msg = error?.message || "";
  for (const [prefix, code] of [["SYLLABUS_MAP:", "MAP_RULE"], ["TAXONOMY_RULE:", "TAXONOMY_RULE"], ["TAXONOMY_OUTLINE:", "OUTLINE_RULE"], ["SELECTION_STAGES:", "STAGES_RULE"]] as const) {
    if (msg.includes(prefix)) return { code, error: msg.slice(msg.indexOf(prefix) + prefix.length).trim().replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "…") };
  }
  if (error?.code === "23505") return { code: "DUPLICATE", error: "That already exists (the same file is under review, or a node with this name / slug exists here)." };
  return { code: "DB_ERROR", error: "The change could not be saved." };
}

async function ctx(): Promise<Ctx | null> {
  const auth = await guardAdminAction();
  if (!auth.ok) return null;
  return { userId: auth.userId || null, userEmail: auth.userEmail || "unknown", db: createAdminServerSupabaseClient() };
}

async function loadTree(db: AdminDb) {
  const [nodes, aliases] = await Promise.all([
    db.from("canonical_taxonomy_nodes").select("id, parent_id, node_type, name, name_hi, hierarchy_path, is_active, is_internal").not("slug", "like", QA_RUN_SLUG_LIKE), // QA-FIXTURE-EXCLUSION
    db.from("taxonomy_node_aliases").select("node_id, normalized_alias"),
  ]);
  if (nodes.error || aliases.error) return null;
  return {
    nodes: (nodes.data || []).map((n) => ({ id: n.id, parentId: n.parent_id, nodeType: n.node_type, name: n.name, nameHi: n.name_hi, path: n.hierarchy_path, isActive: n.is_active, isInternal: n.is_internal === true })),
    aliases: (aliases.data || []).map((a) => ({ nodeId: a.node_id, normalized: a.normalized_alias })),
  };
}

export class SyllabusMapService {
  /** Validates, matches and stores one pasted file. The same file again returns the session already under review. */
  static async create(json: string): Promise<MapResult<{ sessionId: string; created: boolean; contract: MapContract; summary: Record<MapMatchStatus, number> }>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    const x = extractJson(json);
    if (!x.ok) return fail("VALIDATION", x.message);
    const raw = x.data as Record<string, unknown>;
    const contract = raw && typeof raw === "object" ? raw.contract : null;
    if (contract !== "MASTER_INTAKE" && contract !== "EXAM_MAP") return fail("VALIDATION", 'Paste a MASTER_INTAKE or an EXAM_MAP file ("contract" says which).');
    const tree = await loadTree(c.db);
    if (!tree) return fail("DB_ERROR", "Could not load the master tree.");
    const sha = createHash("sha256").update(JSON.stringify(raw), "utf8").digest("hex");

    let rpcArgs: { p_contract: MapContract; p_subject_node_id: string | null; p_exam_id: string | null; p_exam_cycle_id: string | null; p_tier: string | null };
    let items;
    if (contract === "MASTER_INTAKE") {
      const v = validateMasterIntake(raw);
      if (!v.ok) return fail("VALIDATION", "The file has errors.", v.errors);
      const m = matchMasterIntake(v.value, tree.nodes, tree.aliases);
      if (!m.ok) return fail("VALIDATION", "Some references do not exist in the master tree.", m.errors);
      items = m.items;
      rpcArgs = { p_contract: contract, p_subject_node_id: m.subjectNodeId, p_exam_id: null, p_exam_cycle_id: null, p_tier: null };
    } else {
      const v = validateExamMap(raw);
      if (!v.ok) return fail("VALIDATION", "The file has errors.", v.errors);
      const { data: exam } = await c.db.from("exams").select("id").eq("slug", v.value.exam).maybeSingle();
      if (!exam) return fail("NOT_FOUND", `No exam with the slug "${v.value.exam}".`);
      let cycleId: string | null = null;
      if (v.value.cycleYear !== null) {
        const { data: cycle } = await c.db.from("exam_cycles").select("id").eq("exam_id", exam.id).eq("cycle_year", v.value.cycleYear).maybeSingle();
        if (!cycle) return fail("NOT_FOUND", `The exam has no ${v.value.cycleYear} cycle yet: add it first (Syllabus → Add this year's cycle).`);
        cycleId = cycle.id;
      }
      const m = matchExamMap(v.value, tree.nodes, tree.aliases);
      if (!m.ok) return fail("VALIDATION", "Some references do not exist in the master tree.", m.errors);
      items = m.items;
      rpcArgs = { p_contract: contract, p_subject_node_id: null, p_exam_id: exam.id, p_exam_cycle_id: cycleId, p_tier: v.value.tier };
    }
    const { data, error } = await c.db.rpc("fn_syllabus_map_create", {
      p_contract: rpcArgs.p_contract,
      p_subject_node_id: sqlNullArg(rpcArgs.p_subject_node_id),
      p_exam_id: sqlNullArg(rpcArgs.p_exam_id),
      p_exam_cycle_id: sqlNullArg(rpcArgs.p_exam_cycle_id),
      p_tier: sqlNullArg(rpcArgs.p_tier),
      p_payload: raw as Json,
      p_payload_sha256: sha,
      p_items: JSON.parse(JSON.stringify(items)) as Json,
      p_actor_id: sqlNullArg(c.userId),
      p_actor_email: c.userEmail,
    });
    if (error || !data) {
      const e = mapDbError(error);
      return fail(e.code, e.error);
    }
    const r = obj(data);
    return { success: true, data: { sessionId: String(r.session_id), created: r.created === true, contract, summary: mapMatchSummary(items) } };
  }

  static async list(): Promise<MapResult<MapSessionView[]>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    const { data, error } = await c.db
      .from("syllabus_map_sessions")
      .select("id, contract, status, subject_node_id, exam_id, exam_cycle_id, tier, created_at, imported_version_id, result, payload")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return fail("DB_ERROR", "Could not load the files.");
    return { success: true, data: (data || []).map(toSession) };
  }

  static async get(sessionId: string): Promise<MapResult<{ session: MapSessionView; items: MapItemView[] }>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    if (!isUuid(sessionId)) return fail("NOT_FOUND", "File not found.");
    const [s, it] = await Promise.all([
      c.db.from("syllabus_map_sessions").select("id, contract, status, subject_node_id, exam_id, exam_cycle_id, tier, created_at, imported_version_id, result, payload").eq("id", sessionId).maybeSingle(),
      c.db.from("syllabus_map_items").select("*").eq("session_id", sessionId).order("position"),
    ]);
    if (s.error || it.error) return fail("DB_ERROR", "Could not load the file.");
    if (!s.data) return fail("NOT_FOUND", "File not found.");
    const rows: MapItemRow[] = it.data || [];
    const ids = [...new Set(rows.flatMap((r) => [r.decision_node_id, r.parent_node_id]).filter((v): v is string => typeof v === "string"))];
    const [nodes, outlines] = await Promise.all([
      ids.length ? c.db.from("canonical_taxonomy_nodes").select("id, name, hierarchy_path").in("id", ids) : Promise.resolve({ data: [], error: null }),
      ids.length ? c.db.from("taxonomy_node_outlines").select("node_id, items").in("node_id", ids) : Promise.resolve({ data: [], error: null }),
    ]);
    const byId = new Map((nodes.data || []).map((n) => [n.id, { id: n.id, name: n.name, path: n.hierarchy_path }]));
    const outlineOf = new Map((outlines.data || []).map((o) => [o.node_id, o.items as string[]]));
    const items: MapItemView[] = rows.map((r) => ({
      id: r.id,
      key: r.item_key,
      parentItemId: r.parent_item_id,
      kind: r.kind as MapItemView["kind"],
      level: r.level as MapItemView["level"],
      refPath: r.ref_path,
      name: r.raw_name,
      nameHi: r.raw_name_hi,
      aliases: r.aliases || [],
      outline: r.outline,
      sectionKey: r.section_key,
      weightageTier: r.weightage_tier,
      avgQuestions: r.avg_questions === null ? null : Number(r.avg_questions),
      matchStatus: r.match_status as MapMatchStatus,
      candidates: toCandidates(r.candidates),
      decision: r.decision as MapDecision | null,
      decisionNode: r.decision_node_id ? byId.get(r.decision_node_id) ?? null : null,
      parentNode: r.parent_node_id ? byId.get(r.parent_node_id) ?? null : null,
      outlineConflict: r.outline_conflict === true,
      outlineAction: r.outline_action as MapItemView["outlineAction"],
      currentOutline: r.decision_node_id ? outlineOf.get(r.decision_node_id) ?? null : null,
    }));
    return { success: true, data: { session: toSession(s.data), items } };
  }

  /** LINK (to a node id, or to a master path typed by the owner), APPROVE_NEW (a proposed node), IGNORE. */
  static async decide(itemId: string, decision: MapDecision, target: string | null): Promise<MapResult<{ nodeId: string | null }>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    if (!isUuid(itemId) || !MAP_DECISIONS.includes(decision)) return fail("VALIDATION", "Choose a decision again.");
    let nodeId: string | null = null;
    if (decision === "LINK") {
      const t = typeof target === "string" ? target.trim() : "";
      if (UUID_RE.test(t)) nodeId = t;
      else if (/^[a-z0-9-]+(\.[a-z0-9-]+){1,2}$/.test(t)) {
        const { data } = await c.db.from("canonical_taxonomy_nodes").select("id").eq("hierarchy_path", t).maybeSingle();
        if (!data) return fail("NOT_FOUND", `No master node at "${t}".`);
        nodeId = data.id;
      } else return fail("VALIDATION", "Pick a suggestion or type a master path (subject.topic or subject.topic.subtopic).");
    }
    const { data, error } = await c.db.rpc("fn_syllabus_map_decide", { p_item_id: itemId, p_decision: decision, p_node_id: sqlNullArg(nodeId), p_actor_id: sqlNullArg(c.userId), p_actor_email: c.userEmail });
    if (error) {
      const e = mapDbError(error);
      return fail(e.code, e.error);
    }
    return { success: true, data: { nodeId: strOrNull(obj(data).node_id) } };
  }

  static async setOutlineAction(itemId: string, action: "REPLACE" | "KEEP"): Promise<MapResult<{ action: string }>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    if (!isUuid(itemId) || (action !== "REPLACE" && action !== "KEEP")) return fail("VALIDATION", "Choose Replace or Keep.");
    const { error } = await c.db.rpc("fn_syllabus_map_set_outline_action", { p_item_id: itemId, p_action: action, p_actor_id: sqlNullArg(c.userId), p_actor_email: c.userEmail });
    if (error) {
      const e = mapDbError(error);
      return fail(e.code, e.error);
    }
    return { success: true, data: { action } };
  }

  static async setWeightage(itemId: string, tier: string | null, avgQuestions: number | null): Promise<MapResult<{ tier: string | null; avgQuestions: number | null }>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    if (!isUuid(itemId)) return fail("VALIDATION", "Item not found.");
    if (tier !== null && !["HIGH_YIELD", "CORE", "MODERATE", "LOW", "OPTIONAL"].includes(tier)) return fail("VALIDATION", "Choose a weightage tier.");
    if (avgQuestions !== null && (!Number.isFinite(avgQuestions) || avgQuestions < 0 || avgQuestions > 1000)) return fail("VALIDATION", "Average questions: a number from 0 to 1000.");
    const { error } = await c.db.rpc("fn_syllabus_map_set_weightage", { p_item_id: itemId, p_tier: sqlNullArg(tier), p_avg_questions: sqlNullArg(avgQuestions), p_actor_id: sqlNullArg(c.userId), p_actor_email: c.userEmail });
    if (error) {
      const e = mapDbError(error);
      return fail(e.code, e.error);
    }
    return { success: true, data: { tier, avgQuestions } };
  }

  /** MASTER_INTAKE: applies to the master tree. EXAM_MAP: creates ONE DRAFT syllabus version (+ DRAFT selection stages). */
  static async importSession(sessionId: string, versionTag: string | null): Promise<MapResult<Record<string, unknown>>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    if (!isUuid(sessionId)) return fail("NOT_FOUND", "File not found.");
    const { data, error } = await c.db.rpc("fn_syllabus_map_import", { p_session_id: sessionId, p_version_tag: sqlNullArg(versionTag), p_actor_id: sqlNullArg(c.userId), p_actor_email: c.userEmail });
    if (error) {
      const e = mapDbError(error);
      return fail(e.code, e.error);
    }
    return { success: true, data: obj(data) };
  }

  static async discard(sessionId: string): Promise<MapResult<{ id: string }>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    if (!isUuid(sessionId)) return fail("NOT_FOUND", "File not found.");
    const { error } = await c.db.rpc("fn_syllabus_map_discard", { p_session_id: sessionId, p_actor_id: sqlNullArg(c.userId), p_actor_email: c.userEmail });
    if (error) {
      const e = mapDbError(error);
      return fail(e.code, e.error);
    }
    return { success: true, data: { id: sessionId } };
  }

  /** The exam's DRAFT selection stages for the session's exam / cycle → PUBLISHED (the previous set is archived). */
  static async publishStages(sessionId: string): Promise<MapResult<Record<string, unknown>>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    if (!isUuid(sessionId)) return fail("NOT_FOUND", "File not found.");
    const { data: s } = await c.db.from("syllabus_map_sessions").select("contract, exam_id, exam_cycle_id, status").eq("id", sessionId).maybeSingle();
    if (!s || s.contract !== "EXAM_MAP" || s.status !== "IMPORTED" || !s.exam_id) return fail("VALIDATION", "Import the exam map first.");
    const { data, error } = await c.db.rpc("fn_selection_stages_publish", { p_exam_id: s.exam_id, p_exam_cycle_id: sqlNullArg(s.exam_cycle_id), p_actor_id: sqlNullArg(c.userId), p_actor_email: c.userEmail });
    if (error) {
      const e = mapDbError(error);
      return fail(e.code, e.error);
    }
    return { success: true, data: obj(data) };
  }
}

function toSession(r: MapSessionRow): MapSessionView {
  const p = obj(r.payload);
  return {
    id: r.id,
    contract: r.contract as MapContract,
    status: r.status as MapSessionView["status"],
    target: r.contract === "MASTER_INTAKE" ? String(p.subject ?? "") : `${String(p.exam ?? "")}${p.cycle_year ? ` ${p.cycle_year}` : ""}${p.tier ? ` · ${p.tier}` : ""}`,
    examId: r.exam_id ?? null,
    examCycleId: r.exam_cycle_id ?? null,
    tier: r.tier ?? null,
    createdAt: r.created_at,
    importedVersionId: r.imported_version_id ?? null,
    result: r.result === null ? null : obj(r.result),
    payload: p,
  };
}
