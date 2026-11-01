import "server-only";
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { galleryPhotoFrom, type GalleryPhoto } from "@/lib/media/photo-rules";

/**
 * HOME-1 (130): the library gallery, read with the VISITOR's client (public read; never the service role), in order.
 * Bounded by a timeout; no photos / a failed read → [] (the trust section stays text-only — never a broken image).
 */
export const loadGallery = cache(async (): Promise<GalleryPhoto[]> => {
  try {
    const sb = await createServerSupabaseClient();
    const read = sb.from("site_gallery").select("id, position, path, alt, width, height, people_basis").order("position");
    const r = await Promise.race([read, new Promise<null>((ok) => setTimeout(() => ok(null), 6000))]);
    if (!r || r.error || !r.data) return [];
    return r.data.map(galleryPhotoFrom).filter((p): p is GalleryPhoto => p !== null);
  } catch {
    return [];
  }
});
