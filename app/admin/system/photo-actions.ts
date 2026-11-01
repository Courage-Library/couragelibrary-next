"use server";

import { revalidatePath } from "next/cache";
import { actionFailure, guardAdminAction, type ActionFailure } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { processHomePhoto } from "@/lib/media/photo-image";
import { PHOTO_MESSAGES } from "@/lib/media/photo-rules";

/**
 * HOME-1 (129): the home page photo — admin only. The image is processed (sniffed, re-encoded, 1280 / 768 / 390 px
 * copies, metadata dropped) BEFORE anything is stored; the new files are stored, then the row switches (audited, in
 * the DB), and only then the old files are deleted. A failed switch removes the new files again. The admin must
 * confirm that no person can be recognised (owner rule: space only).
 */
type PhotoResult = { success: true; path: string | null } | ActionFailure;
const BUCKET = "org-logos"; // the public, same-origin-served (/media/logos/…) image bucket
const withCopies = (path: string) => [path, path.replace(/\.webp$/, "-768.webp"), path.replace(/\.webp$/, "-390.webp")];

export async function uploadHomePhotoAction(formData: FormData): Promise<PhotoResult> {
  const auth = await guardAdminAction(); // admin only
  if (!auth.ok) return auth;
  const alt = String(formData.get("alt") || "").trim();
  const file = formData.get("file");
  if (alt.length < 3 || alt.length > 200) return actionFailure("VALIDATION", PHOTO_MESSAGES.altRequired);
  if (formData.get("noFaces") !== "yes") return actionFailure("VALIDATION", PHOTO_MESSAGES.facesRequired);
  if (!(file instanceof File)) return actionFailure("VALIDATION", PHOTO_MESSAGES.notImage);
  const p = await processHomePhoto(Buffer.from(await file.arrayBuffer())).catch(() => ({ ok: false as const, message: PHOTO_MESSAGES.unavailable }));
  if (!p.ok) return actionFailure("VALIDATION", p.message);

  const db = createAdminServerSupabaseClient();
  const path = `site/home_photo/${p.sha256}.webp`;
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
  const { data, error } = await db.rpc("fn_site_media_set", {
    p_key: "home_photo", p_sha256: p.sha256, p_alt: alt, p_width: p.width, p_height: p.height,
    p_actor_id: auth.userId, p_actor_email: auth.userEmail || "unknown-admin",
  });
  if (error) {
    if (!existed) await db.storage.from(BUCKET).remove(withCopies(path)); // nothing points at the new files
    return actionFailure("VALIDATION", "The photo could not be saved.");
  }
  const oldPath = (data as { old_path?: string | null } | null)?.old_path ?? null;
  if (oldPath && oldPath !== path) await db.storage.from(BUCKET).remove(withCopies(oldPath));
  revalidatePath("/");
  revalidatePath("/admin/system");
  return { success: true, path };
}

export async function removeHomePhotoAction(): Promise<PhotoResult> {
  const auth = await guardAdminAction(); // admin only
  if (!auth.ok) return auth;
  const db = createAdminServerSupabaseClient();
  const { data, error } = await db.rpc("fn_site_media_remove", { p_key: "home_photo", p_actor_id: auth.userId, p_actor_email: auth.userEmail || "unknown-admin" });
  if (error) return actionFailure("VALIDATION", "The photo could not be removed.");
  const oldPath = (data as { old_path?: string | null } | null)?.old_path ?? null;
  if (oldPath) await db.storage.from(BUCKET).remove(withCopies(oldPath));
  revalidatePath("/");
  revalidatePath("/admin/system");
  return { success: true, path: null };
}
