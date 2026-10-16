"use server";

/**
 * GAP2-4b — admin syllabus editor server actions.
 *
 * Every action: guardAdminAction first (staff allowed for drafting; ADMIN ONLY for publish / archive), input
 * checks, then the role-checked SECURITY DEFINER RPC (migration 079) through the caller's own session client, so
 * the database re-checks the JWT role and writes the audit row in the same transaction. No direct table writes,
 * no service-role client. Errors map to uniform failures without database text (lib/syllabus/syllabus-errors).
 * Editing actions return the fresh editor state (read with the same session) so the UI never depends on a page refresh.
 */
import { revalidatePath } from "next/cache";
import { actionFailure, guardAdminAction } from "@/lib/auth/require-admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rpcJsonObject, sqlNullArg } from "@/lib/supabase/rpc";
import { loadSyllabusEditorState } from "@/lib/syllabus/editor-state";
import { mapSyllabusError } from "@/lib/syllabus/syllabus-errors";
import {
  importPayloadToJson,
  parseImportRpcError,
  resolveImportTopics,
  validateImportText,
  type ImportError,
  type ImportStats,
  type SyllabusImportPayload,
} from "@/lib/syllabus/import-contract";
import { loadImportCatalog } from "@/lib/syllabus/import-catalog";
import { suggestTopics } from "@/lib/syllabus/topic-suggest";
import type { Json } from "@/types/database";
import type { SyllabusNodeInput, SyllabusValidationReport } from "@/types/syllabus";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const invalid = (what: string) => actionFailure("VALIDATION", `Invalid ${what}.`);
const KINDS = new Set(["PAPER", "SECTION", "UNIT"]);
const TIERS = new Set(["HIGH_YIELD", "CORE", "MODERATE", "LOW", "OPTIONAL"]);

function refresh(versionId?: string) {
  revalidatePath("/admin/syllabus");
  if (versionId) revalidatePath(`/admin/syllabus/${versionId}`);
}

/** Keeps only known node fields; empty expected-question inputs mean "unknown" (NULL), never 0. */
function cleanNode(node: SyllabusNodeInput): Record<string, Json> | null {
  const out: Record<string, Json> = {};
  if (node.id !== undefined) {
    if (!isUuid(node.id)) return null;
    out.id = node.id;
  }
  if (node.parent_id !== undefined) {
    if (node.parent_id !== null && !isUuid(node.parent_id)) return null;
    out.parent_id = node.parent_id;
  }
  if (node.kind !== undefined) {
    if (!KINDS.has(node.kind)) return null;
    out.kind = node.kind;
  }
  if (node.title !== undefined) out.title = String(node.title).slice(0, 300);
  if (node.description !== undefined) out.description = node.description === null ? null : String(node.description).slice(0, 2000);
  if (node.weightage_tier !== undefined) {
    if (node.weightage_tier !== null && !TIERS.has(node.weightage_tier)) return null;
    out.weightage_tier = node.weightage_tier;
  }
  for (const k of ["expected_questions_min", "expected_questions_max", "display_order"] as const) {
    const v = node[k];
    if (v === undefined) continue;
    if (v === null) {
      out[k] = null;
      continue;
    }
    if (!Number.isInteger(v) || v < 0 || v > 10000) return null;
    out[k] = v;
  }
  if (node.is_mandatory !== undefined) out.is_mandatory = Boolean(node.is_mandatory);
  return out;
}

export async function createSyllabusDraftAction(examId: string, examCycleId: string | null, fromVersionId: string | null) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  if (!isUuid(examId) || (examCycleId !== null && !isUuid(examCycleId)) || (fromVersionId !== null && !isUuid(fromVersionId))) return invalid("draft request");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("fn_syllabus_create_draft", {
    p_exam_id: examId,
    p_exam_cycle_id: examCycleId ?? undefined,
    p_from_version_id: fromVersionId ?? undefined,
  });
  if (error) return mapSyllabusError("createSyllabusDraftAction", error);
  const r = rpcJsonObject<{ version_id: string; version_number: number }>(data);
  if (!r) return mapSyllabusError("createSyllabusDraftAction", null);
  refresh();
  return { ok: true as const, versionId: r.version_id, versionNumber: r.version_number };
}

export async function upsertSyllabusNodeAction(versionId: string, node: SyllabusNodeInput) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  const clean = node && typeof node === "object" ? cleanNode(node) : null;
  if (!isUuid(versionId) || !clean) return invalid("node");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("fn_syllabus_upsert_node", { p_version_id: versionId, p_node: clean });
  if (error) return mapSyllabusError("upsertSyllabusNodeAction", error);
  const r = rpcJsonObject<{ node_id: string; created: boolean }>(data);
  if (!r) return mapSyllabusError("upsertSyllabusNodeAction", null);
  refresh(versionId);
  return { ok: true as const, nodeId: r.node_id, created: r.created, state: await loadSyllabusEditorState(supabase, versionId) };
}

export async function moveSyllabusNodeAction(versionId: string, nodeId: string, newParentId: string | null, displayOrder: number | null) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  if (!isUuid(versionId) || !isUuid(nodeId) || (newParentId !== null && !isUuid(newParentId))) return invalid("move");
  if (displayOrder !== null && (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 100000)) return invalid("position");
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("fn_syllabus_move_node", {
    p_node_id: nodeId,
    p_new_parent_id: sqlNullArg(newParentId),
    p_display_order: displayOrder ?? undefined,
  });
  if (error) return mapSyllabusError("moveSyllabusNodeAction", error);
  refresh(versionId);
  return { ok: true as const, state: await loadSyllabusEditorState(supabase, versionId) };
}

export async function deleteSyllabusNodeAction(versionId: string, nodeId: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  if (!isUuid(versionId) || !isUuid(nodeId)) return invalid("node");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("fn_syllabus_delete_node", { p_node_id: nodeId });
  if (error) return mapSyllabusError("deleteSyllabusNodeAction", error);
  const r = rpcJsonObject<{ deleted_nodes: number }>(data);
  refresh(versionId);
  return { ok: true as const, deletedNodes: r?.deleted_nodes ?? 0, state: await loadSyllabusEditorState(supabase, versionId) };
}

export async function setUnitMappingsAction(versionId: string, nodeId: string, topicIds: string[], weights: number[] | null) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  if (!isUuid(versionId) || !isUuid(nodeId) || !Array.isArray(topicIds) || topicIds.length > 200 || !topicIds.every(isUuid)) return invalid("topics");
  if (weights !== null && (!Array.isArray(weights) || weights.length !== topicIds.length || !weights.every((w) => typeof w === "number" && Number.isFinite(w)))) return invalid("weights");
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("fn_syllabus_set_unit_mappings", {
    p_node_id: nodeId,
    p_topic_ids: topicIds,
    p_weights: weights ?? undefined,
  });
  if (error) return mapSyllabusError("setUnitMappingsAction", error);
  refresh(versionId);
  return { ok: true as const, mappings: topicIds.length, state: await loadSyllabusEditorState(supabase, versionId) };
}

export async function validateSyllabusVersionAction(versionId: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  if (!isUuid(versionId)) return invalid("version");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("fn_syllabus_validate", { p_version_id: versionId });
  if (error) return mapSyllabusError("validateSyllabusVersionAction", error);
  const report = rpcJsonObject<SyllabusValidationReport>(data);
  if (!report) return mapSyllabusError("validateSyllabusVersionAction", null);
  return { ok: true as const, report };
}

/** ADMIN ONLY. Validates first; on errors nothing is written and the report is returned. */
export async function publishSyllabusVersionAction(versionId: string) {
  const __auth = await guardAdminAction();
  if (!__auth.ok) return __auth;
  if (!isUuid(versionId)) return invalid("version");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("fn_syllabus_publish", { p_version_id: versionId });
  if (error) return mapSyllabusError("publishSyllabusVersionAction", error);
  const r = rpcJsonObject<{ success: boolean; code?: string; report?: SyllabusValidationReport; archived_previous_version_id?: string | null }>(data);
  if (!r) return mapSyllabusError("publishSyllabusVersionAction", null);
  if (!r.success) {
    return { ...actionFailure("VALIDATION", "Fix the errors in the validation panel before publishing."), report: r.report ?? null };
  }
  refresh(versionId);
  return { ok: true as const, archivedPreviousVersionId: r.archived_previous_version_id ?? null };
}

/** ADMIN ONLY. DRAFT or PUBLISHED → ARCHIVED. */
export async function archiveSyllabusVersionAction(versionId: string) {
  const __auth = await guardAdminAction();
  if (!__auth.ok) return __auth;
  if (!isUuid(versionId)) return invalid("version");
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("fn_syllabus_archive_version", { p_version_id: versionId });
  if (error) return mapSyllabusError("archiveSyllabusVersionAction", error);
  refresh(versionId);
  return { ok: true as const };
}

// ---------------------------------------------------------------- SYL-IMPORT-1: import a DRAFT from JSON

/** What the import dialog shows before anything is written. */
export interface SyllabusImportPreview {
  valid: boolean;
  errors: ImportError[];
  stats: ImportStats | null;
  payload: SyllabusImportPayload | null;
  /** topic path → topic name, for every resolved topic */
  resolvedTopics: Record<string, string>;
  missingTopics: Array<{ path: string; hints: string[] }>;
}

const MAX_IMPORT_CHARS = 300_000;
const isImportContext = (v: unknown): v is { examSlug: string; cycleYears: number[] } => {
  if (!v || typeof v !== "object") return false;
  const slug: unknown = Reflect.get(v, "examSlug");
  const years: unknown = Reflect.get(v, "cycleYears");
  return typeof slug === "string" && slug.length <= 120 && Array.isArray(years) && years.length <= 50 && years.every((y) => Number.isInteger(y));
};

/**
 * Validates pasted / uploaded JSON (lib/syllabus/import-contract — the one validator) and resolves its topics against
 * the taxonomy. Read-only. `context` (exam slug + cycle years) comes from the server-rendered page and only drives the
 * EXAM_MISMATCH / CYCLE_NOT_FOUND hints; fn_syllabus_import_draft re-checks both.
 */
export async function previewSyllabusImportAction(examId: string, rawText: string, context: { examSlug: string; cycleYears: number[] }) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  if (!isUuid(examId) || typeof rawText !== "string" || rawText.length > MAX_IMPORT_CHARS || !isImportContext(context)) return invalid("import request");
  const checked = validateImportText(rawText);
  if (!checked.ok) {
    const preview: SyllabusImportPreview = { valid: false, errors: checked.errors, stats: null, payload: null, resolvedTopics: {}, missingTopics: [] };
    return { ok: true as const, preview };
  }
  const supabase = await createServerSupabaseClient();
  const catalog = await loadImportCatalog(supabase);
  if (!catalog) return actionFailure("DB_ERROR", "The taxonomy could not be loaded. Please try again.");
  const resolution = resolveImportTopics(checked.payload, catalog, context.examSlug);
  const errors = [...resolution.errors];
  if (checked.payload.cycle_year !== null && !context.cycleYears.includes(checked.payload.cycle_year)) {
    errors.push({ code: "CYCLE_NOT_FOUND", path: "$.cycle_year", message: `The exam has no ${checked.payload.cycle_year} cycle.` });
  }
  const active = catalog.filter((t) => t.is_active);
  const names = new Map(catalog.map((t) => [t.path, t.name]));
  const resolvedTopics: Record<string, string> = {};
  for (const path of Object.keys(resolution.resolved)) resolvedTopics[path] = names.get(path) ?? path;
  // hints only: similar existing topic names for each missing path — never applied, never mapped
  const missingTopics = resolution.missing.map((path) => ({
    path,
    hints: suggestTopics((path.split(".").pop() ?? path).replace(/-/g, " "), active, { limit: 3 }).map((s) => `${s.topic.name} (${s.topic.path})`),
  }));
  const preview: SyllabusImportPreview = {
    valid: errors.length === 0,
    errors,
    stats: checked.stats,
    payload: checked.payload,
    resolvedTopics,
    missingTopics,
  };
  return { ok: true as const, preview };
}

/**
 * Creates ONE DRAFT version from the JSON through fn_syllabus_import_draft (migration 086: role check, full
 * re-validation, version + nodes + mappings + audit row in one transaction). Never publishes; never creates topics.
 */
export async function importSyllabusDraftAction(examId: string, rawText: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  if (!isUuid(examId) || typeof rawText !== "string" || rawText.length > MAX_IMPORT_CHARS) return invalid("import request");
  const checked = validateImportText(rawText);
  if (!checked.ok) return { ...actionFailure("VALIDATION", "The file has errors. Validate it again and fix them first."), errors: checked.errors };
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("fn_syllabus_import_draft", { p_exam_id: examId, p_payload: importPayloadToJson(checked.payload) });
  if (error) {
    const importError = parseImportRpcError(error.message);
    if (importError) return { ...actionFailure("VALIDATION", importError.message), errors: [importError] };
    return mapSyllabusError("importSyllabusDraftAction", error);
  }
  const r = rpcJsonObject<{ version_id: string; version_number: number; nodes: number; mappings: number }>(data);
  if (!r) return mapSyllabusError("importSyllabusDraftAction", null);
  refresh();
  return { ok: true as const, versionId: r.version_id, versionNumber: r.version_number, nodes: r.nodes, mappings: r.mappings };
}
