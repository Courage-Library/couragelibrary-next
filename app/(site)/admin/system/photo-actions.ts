"use server";

import { revalidatePath } from "next/cache";
import { actionFailure, guardAdminAction, type ActionFailure } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { processHomePhoto } from "@/lib/media/photo-image";
import { GALLERY_MAX, PHOTO_MESSAGES, isPeopleBasis } from "@/lib/media/photo-rules";
import { revalidatePublicPages } from "@/lib/cache/revalidate-public";

/**
 * HOME-1 (130): the library gallery (≤ 6 real photos, ordered) — admin only. The image is processed (sniffed,
 * re-encoded, 1280 / 768 / 390 px copies, metadata dropped) BEFORE anything is stored; the new files are stored, then
 * the row is added (audited, in the DB); a failed add removes the new files again. Remove deletes the row first and
 * the files only after it is gone. Every photo needs alt text and the people basis (no recognisable person, or
 * written consent obtained — "honest images" policy).
 */
type GalleryResult = { success: true } | ActionFailure;
const BUCKET = "org-logos"; // the public, same-origin-served (/media/logos/…) image bucket
const withCopies = (path: string) => [path, path.replace(/\.webp$/, "-768.webp"), path.replace(/\.webp$/, "-390.webp")];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const done = () => {
  revalidatePath("/");
  revalidatePath("/admin/system");
  revalidatePublicPages(); // PERF-HOME-1: the cached public pages show this
};

export async function addGalleryPhotoAction(formData: FormData): Promise<GalleryResult> {
  const auth = await guardAdminAction(); // admin only
  if (!auth.ok) return auth;
  const alt = String(formData.get("alt") || "").trim();
  const basis = formData.get("peopleBasis");
  const file = formData.get("file");
  if (alt.length < 3 || alt.length > 200) return actionFailure("VALIDATION", PHOTO_MESSAGES.altRequired);
  if (!isPeopleBasis(basis)) return actionFailure("VALIDATION", PHOTO_MESSAGES.facesRequired);
  if (!(file instanceof File)) return actionFailure("VALIDATION", PHOTO_MESSAGES.notImage);
  const p = await processHomePhoto(Buffer.from(await file.arrayBuffer())).catch(() => ({ ok: false as const, message: PHOTO_MESSAGES.unavailable }));
  if (!p.ok) return actionFailure("VALIDATION", p.message);

  const db = createAdminServerSupabaseClient();
  const { count } = await db.from("site_gallery").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= GALLERY_MAX) return actionFailure("VALIDATION", PHOTO_MESSAGES.galleryFull);
  const path = `site/gallery/${p.sha256}.webp`;
  const files: [string, Buffer][] = [[path, p.main], [path.replace(/\.webp$/, "-768.webp"), p.variants[768]], [path.replace(/\.webp$/, "-390.webp"), p.variants[390]]];
  let existed = false;
  for (const [i, [name, buf]] of files.entries()) {
    const up = await db.storage.from(BUCKET).upload(name, buf, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
    const dup = Boolean(up.error && /exist|duplicate/i.test(up.error.message));
    if (i === 0) existed = dup;
    if (up.error && !dup) {
      if (!existed) await db.storage.from(BUCKET).remove(withCopies(path));
      return actionFailure("DB_ERROR", "The photo could not be stored. Try again.");
    }
  }
  const { error } = await db.rpc("fn_site_gallery_add", {
    p_sha256: p.sha256, p_alt: alt, p_width: p.width, p_height: p.height, p_people_basis: basis,
    p_actor_id: auth.userId, p_actor_email: auth.userEmail || "unknown-admin",
  });
  if (error) {
    if (!existed) await db.storage.from(BUCKET).remove(withCopies(path)); // nothing points at the new files
    if (error.code === "23505") return actionFailure("VALIDATION", PHOTO_MESSAGES.duplicate);
    if (/SITE_GALLERY_FULL/.test(error.message)) return actionFailure("VALIDATION", PHOTO_MESSAGES.galleryFull);
    return actionFailure("VALIDATION", "The photo could not be saved.");
  }
  done();
  return { success: true };
}

export async function updateGalleryPhotoAction(input: { id: string; alt: string; peopleBasis: string }): Promise<GalleryResult> {
  const auth = await guardAdminAction(); // admin only
  if (!auth.ok) return auth;
  const alt = String(input?.alt || "").trim();
  if (!UUID_RE.test(String(input?.id))) return actionFailure("VALIDATION", "The photo was not found.");
  if (alt.length < 3 || alt.length > 200) return actionFailure("VALIDATION", PHOTO_MESSAGES.altRequired);
  if (!isPeopleBasis(input?.peopleBasis)) return actionFailure("VALIDATION", PHOTO_MESSAGES.facesRequired);
  const db = createAdminServerSupabaseClient();
  const { error } = await db.rpc("fn_site_gallery_update", { p_id: input.id, p_alt: alt, p_people_basis: input.peopleBasis, p_actor_id: auth.userId, p_actor_email: auth.userEmail || "unknown-admin" });
  if (error) return actionFailure("VALIDATION", "The photo could not be updated.");
  done();
  return { success: true };
}

export async function moveGalleryPhotoAction(input: { id: string; position: number }): Promise<GalleryResult> {
  const auth = await guardAdminAction(); // admin only
  if (!auth.ok) return auth;
  const position = Number(input?.position);
  if (!UUID_RE.test(String(input?.id)) || !Number.isInteger(position) || position < 1 || position > GALLERY_MAX) return actionFailure("VALIDATION", "The photo could not be moved.");
  const db = createAdminServerSupabaseClient();
  const { error } = await db.rpc("fn_site_gallery_move", { p_id: input.id, p_position: position, p_actor_id: auth.userId, p_actor_email: auth.userEmail || "unknown-admin" });
  if (error) return actionFailure("VALIDATION", "The photo could not be moved.");
  done();
  return { success: true };
}

export async function removeGalleryPhotoAction(input: { id: string }): Promise<GalleryResult> {
  const auth = await guardAdminAction(); // admin only
  if (!auth.ok) return auth;
  if (!UUID_RE.test(String(input?.id))) return actionFailure("VALIDATION", "The photo was not found.");
  const db = createAdminServerSupabaseClient();
  const { data, error } = await db.rpc("fn_site_gallery_remove", { p_id: input.id, p_actor_id: auth.userId, p_actor_email: auth.userEmail || "unknown-admin" });
  if (error) return actionFailure("VALIDATION", "The photo could not be removed.");
  const oldPath = (data as { old_path?: string | null } | null)?.old_path ?? null;
  if (oldPath) await db.storage.from(BUCKET).remove(withCopies(oldPath));
  done();
  return { success: true };
}
