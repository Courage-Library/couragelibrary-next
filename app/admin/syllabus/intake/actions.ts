"use server";

/**
 * CA-2 syllabus intake — server actions. ADMIN ONLY (decisions write the master tree). Every action: guardAdminAction
 * first, then SyllabusIntakeService (service role after its own guard; the database re-checks every rule and audits).
 */
import { revalidatePath } from "next/cache";
import { guardAdminAction, sanitizeActionResult } from "@/lib/auth/require-admin";
import type { IntakeStats } from "@/lib/syllabus/intake-contract";
import { SyllabusIntakeService, type IntakeResult } from "@/services/syllabus/intake.service";
import { INTAKE_BULK_ACTIONS, INTAKE_DECISIONS, INTAKE_SOURCE_CHECKS, type IntakeBulkAction, type IntakeDecision, type IntakeSourceCheck } from "@/lib/syllabus/intake-types";
import type { MatchStatus } from "@/lib/syllabus/tree-matcher";

function done<T>(r: IntakeResult<T>, sessionId?: string): IntakeResult<T> {
  if (r.success) {
    revalidatePath("/admin/syllabus/intake");
    if (sessionId) revalidatePath(`/admin/syllabus/intake/${sessionId}`);
  }
  return r;
}

export async function createIntakeAction(input: { examId: string; cycleId: string | null; tier: string | null; referenceUrl: string | null; json: string }): Promise<
  IntakeResult<{ sessionId: string; stats: IntakeStats; summary: Record<MatchStatus, number> }>
> {
  const __auth = await guardAdminAction() /* CA-2: admin only */;
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("createIntakeAction", done(await SyllabusIntakeService.create(input)));
}

/** CA-4 ruling 1: add this year's cycle to an exam that has none (admin only, audited). */
export async function addIntakeCycleAction(examId: string): Promise<IntakeResult<{ cycleId: string; year: number }>> {
  const __auth = await guardAdminAction() /* CA-2: admin only */;
  if (!__auth.ok) return __auth;
  const r = await SyllabusIntakeService.addCurrentCycle(examId);
  if (r.success) revalidatePath("/admin/syllabus/intake");
  return sanitizeActionResult("addIntakeCycleAction", r);
}

export async function decideIntakeItemAction(sessionId: string, itemId: string, decision: string, nodeId: string | null): Promise<IntakeResult<{ nodeId: string | null }>> {
  const __auth = await guardAdminAction() /* CA-2: admin only */;
  if (!__auth.ok) return __auth;
  if (!INTAKE_DECISIONS.includes(decision as IntakeDecision)) return { success: false, code: "VALIDATION", error: "Unknown decision." };
  return sanitizeActionResult("decideIntakeItemAction", done(await SyllabusIntakeService.decide(itemId, decision as IntakeDecision, nodeId), sessionId));
}

/** INTAKE-ASSIST-1: one guided bulk step (the actor is the signed-in admin, never an argument). */
export async function bulkIntakeAction(sessionId: string, action: string, itemIds: string[]): Promise<IntakeResult<{ batchId: string; count: number; created: number }>> {
  const __auth = await guardAdminAction() /* CA-2: admin only */;
  if (!__auth.ok) return __auth;
  if (!INTAKE_BULK_ACTIONS.includes(action as IntakeBulkAction)) return { success: false, code: "VALIDATION", error: "Unknown bulk action." };
  return sanitizeActionResult("bulkIntakeAction", done(await SyllabusIntakeService.bulk(sessionId, action as IntakeBulkAction, itemIds), sessionId));
}

export async function undoIntakeBulkAction(sessionId: string): Promise<IntakeResult<{ count: number; deleted: number }>> {
  const __auth = await guardAdminAction() /* CA-2: admin only */;
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("undoIntakeBulkAction", done(await SyllabusIntakeService.undoBulk(sessionId), sessionId));
}

export async function importIntakeAction(sessionId: string, versionTag: string | null, sourceCheck: string): Promise<IntakeResult<{ versionId: string }>> {
  const __auth = await guardAdminAction() /* CA-2: admin only */;
  if (!__auth.ok) return __auth;
  if (!INTAKE_SOURCE_CHECKS.includes(sourceCheck as IntakeSourceCheck)) return { success: false, code: "VALIDATION", error: "Confirm whether you verified the notification first." };
  const r = done(await SyllabusIntakeService.importDraft(sessionId, versionTag, sourceCheck as IntakeSourceCheck), sessionId);
  if (r.success) revalidatePath("/admin/syllabus");
  return sanitizeActionResult("importIntakeAction", r);
}

export async function discardIntakeAction(sessionId: string): Promise<IntakeResult<{ id: string }>> {
  const __auth = await guardAdminAction() /* CA-2: admin only */;
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("discardIntakeAction", done(await SyllabusIntakeService.discard(sessionId), sessionId));
}
