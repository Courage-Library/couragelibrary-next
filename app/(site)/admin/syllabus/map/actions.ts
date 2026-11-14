"use server";

/**
 * SYLLABUS-MAP-1 B2 — server actions for MASTER_INTAKE / EXAM_MAP files. ADMIN ONLY (owner Q5: decisions write the master
 * tree). Every action: guardAdminAction first, then SyllabusMapService (service role after its own guard; the database
 * re-checks every rule and audits).
 */
import { revalidatePath } from "next/cache";
import { guardAdminAction, sanitizeActionResult } from "@/lib/auth/require-admin";
import { MAP_DECISIONS, SyllabusMapService, type MapDecision, type MapResult } from "@/services/syllabus/map-intake.service";

function done<T>(r: MapResult<T>, sessionId?: string): MapResult<T> {
  if (r.success) {
    revalidatePath("/admin/syllabus/map");
    if (sessionId) revalidatePath(`/admin/syllabus/map/${sessionId}`);
  }
  return r;
}

export async function createMapSessionAction(json: string) {
  const __auth = await guardAdminAction() /* SYLLABUS-MAP-1: admin only */;
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("createMapSessionAction", done(await SyllabusMapService.create(json)));
}

export async function decideMapItemAction(sessionId: string, itemId: string, decision: string, target: string | null) {
  const __auth = await guardAdminAction() /* SYLLABUS-MAP-1: admin only */;
  if (!__auth.ok) return __auth;
  if (!MAP_DECISIONS.includes(decision as MapDecision)) return { success: false as const, code: "VALIDATION", error: "Unknown decision." };
  return sanitizeActionResult("decideMapItemAction", done(await SyllabusMapService.decide(itemId, decision as MapDecision, target), sessionId));
}

export async function setMapOutlineAction(sessionId: string, itemId: string, action: string) {
  const __auth = await guardAdminAction() /* SYLLABUS-MAP-1: admin only */;
  if (!__auth.ok) return __auth;
  if (action !== "REPLACE" && action !== "KEEP") return { success: false as const, code: "VALIDATION", error: "Choose Replace or Keep." };
  return sanitizeActionResult("setMapOutlineAction", done(await SyllabusMapService.setOutlineAction(itemId, action), sessionId));
}

export async function setMapWeightageAction(sessionId: string, itemId: string, tier: string | null, avgQuestions: number | null) {
  const __auth = await guardAdminAction() /* SYLLABUS-MAP-1: admin only */;
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("setMapWeightageAction", done(await SyllabusMapService.setWeightage(itemId, tier, avgQuestions), sessionId));
}

export async function importMapSessionAction(sessionId: string, versionTag: string | null) {
  const __auth = await guardAdminAction() /* SYLLABUS-MAP-1: admin only */;
  if (!__auth.ok) return __auth;
  const r = done(await SyllabusMapService.importSession(sessionId, versionTag), sessionId);
  if (r.success) revalidatePath("/admin/syllabus");
  return sanitizeActionResult("importMapSessionAction", r);
}

export async function discardMapSessionAction(sessionId: string) {
  const __auth = await guardAdminAction() /* SYLLABUS-MAP-1: admin only */;
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("discardMapSessionAction", done(await SyllabusMapService.discard(sessionId), sessionId));
}

export async function publishMapStagesAction(sessionId: string) {
  const __auth = await guardAdminAction() /* SYLLABUS-MAP-1: admin only */;
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("publishMapStagesAction", done(await SyllabusMapService.publishStages(sessionId), sessionId));
}
