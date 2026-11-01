"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { actionFailure, guardAdminAction, type ActionFailure } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { processBrandImage } from "@/lib/brand/brand-image";
import { BRAND_CACHE_TAG } from "@/lib/brand/brand-assets";
import { revalidatePublicPages } from "@/lib/cache/revalidate-public";
import { BRAND_MESSAGES, isBrandKey } from "@/lib/brand/brand-rules";

/**
 * HOME-1 brand settings (131): admin only. The image is processed (sniffed, shape-checked, re-encoded, sized copies,
 * metadata dropped) BEFORE anything is stored; the new files are stored, then the row switches (audited, in the DB),
 * and only then the old files are deleted. A failed switch removes the new files again. The cached brand read and
 * every page are revalidated, so the header / footer / icons change at once.
 */
type BrandResult = { success: true } | ActionFailure;
const BUCKET = "org-logos"; // the public, same-origin-served (/media/logos/…) image bucket
const filesOf = (path: string) =>
  path.endsWith(".png") ? [path, ...[32, 180, 192].map((s) => path.replace(/\.png$/, `-${s}.png`))] : [path, path.replace(/\.webp$/, "-64.webp")];
const done = () => {
  revalidateTag(BRAND_CACHE_TAG);
  revalidatePath("/", "layout");
  revalidatePublicPages(); // PERF-HOME-1: the cached public pages show this
};

export async function uploadBrandAssetAction(formData: FormData): Promise<BrandResult> {
  const auth = await guardAdminAction(); // admin only
  if (!auth.ok) return auth;
  const key = formData.get("key");
  const alt = String(formData.get("alt") || "").trim();
  const file = formData.get("file");
  if (!isBrandKey(key)) return actionFailure("VALIDATION", "Unknown brand slot.");
  if (alt.length < 3 || alt.length > 120) return actionFailure("VALIDATION", BRAND_MESSAGES.altRequired);
  if (!(file instanceof File)) return actionFailure("VALIDATION", BRAND_MESSAGES.notImage);
  const p = await processBrandImage(key, Buffer.from(await file.arrayBuffer())).catch(() => ({ ok: false as const, message: BRAND_MESSAGES.unavailable }));
  if (!p.ok) return actionFailure("VALIDATION", p.message);

  const db = createAdminServerSupabaseClient();
  const path = `site/${key}/${p.sha256}.${p.ext}`;
  let existed = false;
  for (const [i, f] of p.files.entries()) {
    const name = path.replace(/\.(webp|png)$/, f.suffix);
    const up = await db.storage.from(BUCKET).upload(name, f.buf, { contentType: f.type, cacheControl: "31536000", upsert: false });
    const dup = Boolean(up.error && /exist|duplicate/i.test(up.error.message));
    if (i === 0) existed = dup;
    if (up.error && !dup) {
      if (!existed) await db.storage.from(BUCKET).remove(filesOf(path));
      return actionFailure("DB_ERROR", "The image could not be stored. Try again.");
    }
  }
  const { data, error } = await db.rpc("fn_site_media_set", {
    p_key: key, p_sha256: p.sha256, p_alt: alt, p_width: p.width, p_height: p.height,
    p_actor_id: auth.userId, p_actor_email: auth.userEmail || "unknown-admin",
  });
  if (error) {
    if (!existed) await db.storage.from(BUCKET).remove(filesOf(path)); // nothing points at the new files
    return actionFailure("VALIDATION", "The image could not be saved.");
  }
  const oldPath = (data as { old_path?: string | null } | null)?.old_path ?? null;
  if (oldPath && oldPath !== path) await db.storage.from(BUCKET).remove(filesOf(oldPath));
  done();
  return { success: true };
}

export async function removeBrandAssetAction(input: { key: string }): Promise<BrandResult> {
  const auth = await guardAdminAction(); // admin only
  if (!auth.ok) return auth;
  if (!isBrandKey(input?.key)) return actionFailure("VALIDATION", "Unknown brand slot.");
  const db = createAdminServerSupabaseClient();
  const { data, error } = await db.rpc("fn_site_media_remove", { p_key: input.key, p_actor_id: auth.userId, p_actor_email: auth.userEmail || "unknown-admin" });
  if (error) return actionFailure("VALIDATION", "The image could not be removed.");
  const oldPath = (data as { old_path?: string | null } | null)?.old_path ?? null;
  if (oldPath) await db.storage.from(BUCKET).remove(filesOf(oldPath));
  done();
  return { success: true };
}
