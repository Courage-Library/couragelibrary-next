"use server";

/**
 * CA-2 syllabus intake — server actions. ADMIN ONLY (decisions write the master tree). Every action: guardAdminAction
 * first, then SyllabusIntakeService (service role after its own guard; the database re-checks every rule and audits).
 */
import { revalidatePath } from "next/cache";
import { guardAdminAction, sanitizeActionResult } from "@/lib/auth/require-admin";
import type { IntakeStats } from "@/lib/syllabus/intake-contract";
import { SyllabusIntakeService, type IntakeResult } from "@/services/syllabus/intake.service";
import { INTAKE_DECISIONS, type IntakeDecision } from "@/lib/syllabus/intake-types";
import type { MatchStatus } from "@/lib/syllabus/tree-matcher";

function done<T>(r: IntakeResult<T>, sessionId?: string): IntakeResult<T> {
  if (r.success) {
    revalidatePath("/admin/syllabus/intake");
    if (sessionId) revalidatePath(`/admin/syllabus/intake/${sessionId}`);
  }
  return r;
}

export async function createIntakeAction(input: { examId: string; cycleId: string | null; tier: string | null; sourceUrl: string; asOf: string; json: string }): Promise<
  IntakeResult<{ sessionId: string; stats: IntakeStats; summary: Record<MatchStatus, number> }>
> {
  const __auth = await guardAdminAction() /* CA-2: admin only */;
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("createIntakeAction", done(await SyllabusIntakeService.create(input)));
}

export async function decideIntakeItemAction(sessionId: string, itemId: string, decision: string, nodeId: string | null): Promise<IntakeResult<{ nodeId: string | null }>> {
  const __auth = await guardAdminAction() /* CA-2: admin only */;
  if (!__auth.ok) return __auth;
  if (!INTAKE_DECISIONS.includes(decision as IntakeDecision)) return { success: false, code: "VALIDATION", error: "Unknown decision." };
  return sanitizeActionResult("decideIntakeItemAction", done(await SyllabusIntakeService.decide(itemId, decision as IntakeDecision, nodeId), sessionId));
}

export async function importIntakeAction(sessionId: string, versionTag: string | null): Promise<IntakeResult<{ versionId: string }>> {
  const __auth = await guardAdminAction() /* CA-2: admin only */;
  if (!__auth.ok) return __auth;
  const r = done(await SyllabusIntakeService.importDraft(sessionId, versionTag), sessionId);
  if (r.success) revalidatePath("/admin/syllabus");
  return sanitizeActionResult("importIntakeAction", r);
}

export async function discardIntakeAction(sessionId: string): Promise<IntakeResult<{ id: string }>> {
  const __auth = await guardAdminAction() /* CA-2: admin only */;
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("discardIntakeAction", done(await SyllabusIntakeService.discard(sessionId), sessionId));
}
