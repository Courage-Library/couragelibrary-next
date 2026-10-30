"use server";

import { revalidatePath } from "next/cache";
import { actionFailure, guardAdminAction, type ActionFailure, type AdminContext } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { processLogo } from "@/lib/logos/logo-image";
import { LOGO_BUCKET } from "@/lib/logos/exam-logo";
import { ExamOnboardingService } from "@/services/exam-onboarding/exam-onboarding.service";

/**
 * EXAM-LOGO-1: logo upload / replace / remove for a conducting body (ORG) or one exam's override (EXAM). ADMIN only
 * (staff cannot). The file is content-sniffed and re-encoded by lib/logos/logo-image.ts (PNG / JPG / WebP in, 512 × 512
 * WebP out, metadata stripped, never SVG); stored under its content hash; the row + the audit row change in ONE call
 * (fn_logo_set / fn_logo_remove, service role only). Replacing: the new file is stored first, the row switches, and only
 * then is the old file deleted — a failed replace leaves the old logo working.
 */
type LogoActionResult = { success: true; path: string | null } | ActionFailure;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOGO_DB_MESSAGES: [RegExp, string][] = [
  [/LOGO: alt text is required/, "Alt text is required (3 to 160 characters), e.g. \"Staff Selection Commission logo\"."],
  [/LOGO: a live course shows this logo/, "A live course shows this logo: replace it instead of removing it."],
  [/LOGO: there is no logo to remove/, "There is no logo to remove."],
  [/LOGO: (conducting body|exam) not found/, "Not found."],
];
const dbMessage = (m: string | undefined) => LOGO_DB_MESSAGES.find(([re]) => re.test(m || ""))?.[1] ?? null;

function revalidateLogoPages() {
  revalidatePath("/admin/exams");
  revalidatePath("/admin");
  revalidatePath("/exams", "layout");
}

async function setLogo(auth: AdminContext, kind: "ORG" | "EXAM", formData: FormData): Promise<LogoActionResult> {
  const id = String(formData.get("id") || "");
  const alt = String(formData.get("alt") || "").trim();
  const file = formData.get("file");
  if (!UUID_RE.test(id)) return actionFailure("VALIDATION", "Choose what the logo belongs to.");
  if (alt.length < 3 || alt.length > 160) return actionFailure("VALIDATION", "Alt text is required (3 to 160 characters), e.g. \"Staff Selection Commission logo\".");
  if (!(file instanceof File)) return actionFailure("VALIDATION", "Choose an image file.");
  if (file.size > 1024 * 1024) return actionFailure("VALIDATION", "The logo must be at most 1 MB.");

  const processed = await processLogo(Buffer.from(await file.arrayBuffer()));
  if (!processed.ok) return actionFailure("VALIDATION", processed.message);

  const db = createAdminServerSupabaseClient();
  const path = `${kind === "ORG" ? "orgs" : "exams"}/${id.toLowerCase()}/${processed.sha256}.webp`;
  const up = await db.storage.from(LOGO_BUCKET).upload(path, processed.webp, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  // the same content hash already stored (re-upload of the same image) is fine; anything else is a failure
  const existed = Boolean(up.error && /exist|duplicate/i.test(up.error.message));
  if (up.error && !existed) return actionFailure("DB_ERROR", "The logo could not be stored. Try again.");

  const { data, error } = await db.rpc("fn_logo_set", { p_kind: kind, p_id: id, p_sha256: processed.sha256, p_alt: alt, p_actor_id: auth.userId, p_actor_email: auth.userEmail || "unknown-admin" });
  if (error) {
    if (!existed) await db.storage.from(LOGO_BUCKET).remove([path]); // nothing points at the new file
    return actionFailure("VALIDATION", dbMessage(error.message) ?? "The logo could not be saved.");
  }
  const oldPath = (data as { old_path?: string | null } | null)?.old_path ?? null;
  if (oldPath && oldPath !== path) await db.storage.from(LOGO_BUCKET).remove([oldPath]); // the row no longer points at it
  revalidateLogoPages();
  return { success: true, path };
}

async function removeLogo(auth: AdminContext, kind: "ORG" | "EXAM", id: string): Promise<LogoActionResult> {
  if (!UUID_RE.test(id)) return actionFailure("VALIDATION", "Choose what the logo belongs to.");
  const db = createAdminServerSupabaseClient();
  const { data, error } = await db.rpc("fn_logo_remove", { p_kind: kind, p_id: id, p_actor_id: auth.userId, p_actor_email: auth.userEmail || "unknown-admin" });
  if (error) return actionFailure("VALIDATION", dbMessage(error.message) ?? "The logo could not be removed.");
  const oldPath = (data as { old_path?: string | null } | null)?.old_path ?? null;
  if (oldPath) await db.storage.from(LOGO_BUCKET).remove([oldPath]);
  revalidateLogoPages();
  return { success: true, path: null };
}

export async function uploadOrgLogoAction(formData: FormData): Promise<LogoActionResult> {
  const auth = await guardAdminAction(); // admin only
  if (!auth.ok) return auth;
  return setLogo(auth, "ORG", formData);
}
export async function removeOrgLogoAction(orgId: string): Promise<LogoActionResult> {
  const auth = await guardAdminAction();
  if (!auth.ok) return auth;
  return removeLogo(auth, "ORG", orgId);
}
export async function uploadExamLogoOverrideAction(formData: FormData): Promise<LogoActionResult> {
  const auth = await guardAdminAction();
  if (!auth.ok) return auth;
  return setLogo(auth, "EXAM", formData);
}
export async function removeExamLogoOverrideAction(examId: string): Promise<LogoActionResult> {
  const auth = await guardAdminAction();
  if (!auth.ok) return auth;
  return removeLogo(auth, "EXAM", examId);
}

/** A new conducting body (admin only); its logo is uploaded next, before any exam can use it. */
export async function createConductingOrgAction(name: string, website: string): Promise<{ success: true; id: string } | ActionFailure> {
  const auth = await guardAdminAction();
  if (!auth.ok) return auth;
  const clean = name.trim();
  if (clean.length < 3 || clean.length > 160 || /[,()]/.test(clean)) return actionFailure("VALIDATION", "Use the body's official name (3 to 160 characters, no commas or brackets).");
  if (website.trim() && !/^https:\/\/[^\s]+$/.test(website.trim())) return actionFailure("VALIDATION", "The website must start with https://.");
  try {
    const org = await ExamOnboardingService.createConductingOrg(clean, undefined, website.trim() || undefined);
    const db = createAdminServerSupabaseClient();
    const { error: auditErr } = await db.from("admin_audit_logs").insert({ actor_id: auth.userId, actor_email: auth.userEmail || "unknown-admin", action_type: "CONDUCTING_ORG_CREATE", target_entity: "conducting_org", target_id: org.id, new_value: { name: org.name, slug: org.slug } });
    if (auditErr) return actionFailure("DB_ERROR", "The body was created, but its audit row could not be written. Tell the engineer.");
    revalidatePath("/admin/exams");
    return { success: true, id: org.id };
  } catch {
    return actionFailure("DB_ERROR", "The conducting body could not be created.");
  }
}
