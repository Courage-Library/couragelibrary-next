"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { actionFailure, guardAdminAction, type ActionFailure, type AdminContext } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { LOGO_UNAVAILABLE, LOGO_VARIANTS, processLogo } from "@/lib/logos/logo-image";
import { LOGO_BUCKET } from "@/lib/logos/exam-logo";
import { bodySlug } from "@/lib/logos/logo-upload-guard";
import { ExamOnboardingService } from "@/services/exam-onboarding/exam-onboarding.service";
import { revalidatePublicPages } from "@/lib/cache/revalidate-public";

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

/** HOME-1: a stored logo and its sized copies (<sha>.webp, <sha>-64.webp, <sha>-128.webp) */
const withVariant = (path: string, px: string | number) => path.replace(/\.webp$/, `-${px}.webp`);
const withVariants = (path: string) => [path, ...LOGO_VARIANTS.map((px) => withVariant(path, px))];

function revalidateLogoPages() {
  revalidatePath("/admin/exams");
  revalidatePublicPages(); // PERF-HOME-1: the cached public pages show this
  revalidatePath("/admin");
  revalidatePath("/exams", "layout");
  revalidateTag("categories"); // HOME-1: the cached live-category names (hero H1)
  revalidatePath("/");
}

type LogoKind = "ORG" | "EXAM" | "CATEGORY"; // HOME-1: a category icon uses the same pipeline
const FOLDER: Record<LogoKind, string> = { ORG: "orgs", EXAM: "exams", CATEGORY: "categories" };
/** the audited row switch: fn_logo_set / fn_logo_remove (org, exam) or fn_category_icon_set / _remove (128) */
async function rpcSet(db: ReturnType<typeof createAdminServerSupabaseClient>, kind: LogoKind, id: string, sha: string, alt: string, auth: AdminContext) {
  const actor = { p_actor_id: auth.userId, p_actor_email: auth.userEmail || "unknown-admin" };
  return kind === "CATEGORY" ? db.rpc("fn_category_icon_set", { p_id: id, p_sha256: sha, p_alt: alt, ...actor }) : db.rpc("fn_logo_set", { p_kind: kind, p_id: id, p_sha256: sha, p_alt: alt, ...actor });
}
async function rpcRemove(db: ReturnType<typeof createAdminServerSupabaseClient>, kind: LogoKind, id: string, auth: AdminContext) {
  const actor = { p_actor_id: auth.userId, p_actor_email: auth.userEmail || "unknown-admin" };
  return kind === "CATEGORY" ? db.rpc("fn_category_icon_remove", { p_id: id, ...actor }) : db.rpc("fn_logo_remove", { p_kind: kind, p_id: id, ...actor });
}

async function setLogo(auth: AdminContext, kind: LogoKind, formData: FormData): Promise<LogoActionResult> {
  const id = String(formData.get("id") || "");
  const alt = String(formData.get("alt") || "").trim();
  const file = formData.get("file");
  if (!UUID_RE.test(id)) return actionFailure("VALIDATION", "Choose what the logo belongs to.");
  if (alt.length < 3 || alt.length > 160) return actionFailure("VALIDATION", "Alt text is required (3 to 160 characters), e.g. \"Staff Selection Commission logo\".");
  if (!(file instanceof File)) return actionFailure("VALIDATION", "Choose an image file.");
  if (file.size > 1024 * 1024) return actionFailure("VALIDATION", "The logo must be at most 1 MB.");

  // LOGO-P0: processing never throws out of the action (a broken image library = an inline error, nothing saved)
  const processed = await processLogo(Buffer.from(await file.arrayBuffer())).catch(() => ({ ok: false as const, message: LOGO_UNAVAILABLE }));
  if (!processed.ok) return actionFailure("VALIDATION", processed.message);

  const db = createAdminServerSupabaseClient();
  const path = `${FOLDER[kind]}/${id.toLowerCase()}/${processed.sha256}.webp`;
  const up = await db.storage.from(LOGO_BUCKET).upload(path, processed.webp, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  // the same content hash already stored (re-upload of the same image) is fine; anything else is a failure
  const existed = Boolean(up.error && /exist|duplicate/i.test(up.error.message));
  if (up.error && !existed) return actionFailure("DB_ERROR", "The logo could not be stored. Try again.");
  // HOME-1: the sized copies next to it (a "-64" / "-128" twin per content hash)
  for (const [px, buf] of Object.entries(processed.variants)) {
    const v = await db.storage.from(LOGO_BUCKET).upload(withVariant(path, px), buf, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
    if (v.error && !/exist|duplicate/i.test(v.error.message)) {
      if (!existed) await db.storage.from(LOGO_BUCKET).remove(withVariants(path));
      return actionFailure("DB_ERROR", "The logo could not be stored. Try again.");
    }
  }

  const { data, error } = await rpcSet(db, kind, id, processed.sha256, alt, auth);
  if (error) {
    if (!existed) await db.storage.from(LOGO_BUCKET).remove(withVariants(path)); // nothing points at the new files
    return actionFailure("VALIDATION", dbMessage(error.message) ?? "The logo could not be saved.");
  }
  const oldPath = (data as { old_path?: string | null } | null)?.old_path ?? null;
  if (oldPath && oldPath !== path) await db.storage.from(LOGO_BUCKET).remove(withVariants(oldPath)); // the row no longer points at them
  revalidateLogoPages();
  return { success: true, path };
}

async function removeLogo(auth: AdminContext, kind: LogoKind, id: string): Promise<LogoActionResult> {
  if (!UUID_RE.test(id)) return actionFailure("VALIDATION", "Choose what the logo belongs to.");
  const db = createAdminServerSupabaseClient();
  const { data, error } = await rpcRemove(db, kind, id, auth);
  if (error) return actionFailure("VALIDATION", dbMessage(error.message) ?? "The logo could not be removed.");
  const oldPath = (data as { old_path?: string | null } | null)?.old_path ?? null;
  if (oldPath) await db.storage.from(LOGO_BUCKET).remove(withVariants(oldPath));
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
/** HOME-1 (128): a category's uploaded icon (replaces its built-in line icon) — admin only, same pipeline + audit. */
export async function uploadCategoryIconAction(formData: FormData): Promise<LogoActionResult> {
  const auth = await guardAdminAction();
  if (!auth.ok) return auth;
  const r = await setLogo(auth, "CATEGORY", formData);
  if (r.success) revalidateCategoryPages();
  return r;
}
export async function removeCategoryIconAction(categoryId: string): Promise<LogoActionResult> {
  const auth = await guardAdminAction();
  if (!auth.ok) return auth;
  const r = await removeLogo(auth, "CATEGORY", categoryId);
  if (r.success) revalidateCategoryPages();
  return r;
}
/** HOME-1 (128): create / edit a category (name, address, line, order, active) — admin only; audited in the DB. */
export async function saveCategoryAction(input: { id: string | null; slug: string; name: string; shortDesc: string; displayOrder: number; isActive: boolean }): Promise<{ success: true; id: string } | ActionFailure> {
  const auth = await guardAdminAction();
  if (!auth.ok) return auth;
  const slug = String(input?.slug || "").trim().toLowerCase();
  const name = String(input?.name || "").trim();
  if (input?.id !== null && !UUID_RE.test(String(input?.id))) return actionFailure("VALIDATION", "Choose a category.");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 40) return actionFailure("VALIDATION", "The address must be 2 to 40 lower-case letters, digits or dashes.");
  if (name.length < 2 || name.length > 60) return actionFailure("VALIDATION", "The name must be 2 to 60 characters.");
  if (String(input?.shortDesc || "").length > 140) return actionFailure("VALIDATION", "The line must be at most 140 characters.");
  const order = Number.isInteger(input?.displayOrder) ? input.displayOrder : 0;
  const db = createAdminServerSupabaseClient();
  const { data, error } = await db.rpc("fn_category_save", {
    p_id: input.id as string, p_slug: slug, p_name: name, p_short_desc: String(input.shortDesc || ""), p_display_order: order, p_is_active: Boolean(input.isActive),
    p_actor_id: auth.userId, p_actor_email: auth.userEmail || "unknown-admin",
  });
  if (error) {
    const m = error.message || "";
    if (/already used by an exam/.test(m) || /exam_categories_slug_key|duplicate key/.test(m)) return actionFailure("VALIDATION", `The address /exams/${slug} is already used. Choose another one.`);
    if (/still has active exams/.test(m)) return actionFailure("VALIDATION", "This category still has active exams. Move or deactivate them first.");
    if (/internal category/.test(m)) return actionFailure("VALIDATION", "The internal category cannot be edited.");
    return actionFailure("DB_ERROR", "The category could not be saved.");
  }
  revalidateCategoryPages();
  return { success: true, id: (data as { id: string }).id };
}

function revalidateCategoryPages() {
  revalidatePath("/admin/exams/categories");
  revalidatePublicPages(); // PERF-HOME-1: the cached public pages show this
  revalidatePath("/");
  revalidatePath("/exams", "layout");
  revalidateTag("categories"); // HOME-1: the cached live-category names (hero H1)
}

/**
 * LOGO-UX-1: a new conducting body WITH its logo, in one step (admin only). Refused when a body with that name / slug
 * already exists (open its card instead). The body is created, then its logo set exactly like an upload; if the logo
 * fails, the just-created body is deleted again (no exam can reference it yet) — a body never exists without a logo
 * through this path. The CONDUCTING_ORG_CREATE audit row is written only once both succeeded.
 */
export async function createConductingOrgWithLogoAction(formData: FormData): Promise<{ success: true; id: string; path: string | null } | ActionFailure> {
  const auth = await guardAdminAction();
  if (!auth.ok) return auth;
  const name = String(formData.get("name") || "").trim();
  const website = String(formData.get("website") || "").trim();
  if (name.length < 3 || name.length > 160 || /[,()]/.test(name)) return actionFailure("VALIDATION", "Use the body's official name (3 to 160 characters, no commas or brackets).");
  if (website && !/^https:\/\/[^\s]+$/.test(website)) return actionFailure("VALIDATION", "The website must start with https://.");
  const slug = bodySlug(name);
  if (!slug) return actionFailure("VALIDATION", "Use the body's official name.");
  const db = createAdminServerSupabaseClient();
  const { data: clash } = await db.from("conducting_orgs").select("id").or(`slug.eq.${slug},name.ilike.${name}`).limit(1);
  if (clash && clash.length) return actionFailure("VALIDATION", "A body with this name already exists. Open its card to add or replace the logo.");
  const { data: org, error } = await db.from("conducting_orgs").insert({ name, slug, official_website: website || null, is_active: true }).select("id, name, slug").single();
  if (error || !org) return actionFailure("DB_ERROR", "The conducting body could not be created.");
  formData.set("id", org.id);
  const logo = await setLogo(auth, "ORG", formData).catch(() => actionFailure("VALIDATION", LOGO_UNAVAILABLE));
  if (!logo.success) {
    await db.from("conducting_orgs").delete().eq("id", org.id); // nothing references it yet
    return logo;
  }
  const { error: auditErr } = await db.from("admin_audit_logs").insert({ actor_id: auth.userId, actor_email: auth.userEmail || "unknown-admin", action_type: "CONDUCTING_ORG_CREATE", target_entity: "conducting_org", target_id: org.id, new_value: { name: org.name, slug: org.slug, with_logo: true } });
  if (auditErr) return actionFailure("DB_ERROR", "The body and its logo were saved, but the audit row could not be written. Tell the engineer.");
  revalidatePath("/admin/exams");
  return { success: true, id: org.id, path: logo.path };
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
