import "server-only";
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { homePhotoFrom, type HomePhoto } from "@/lib/media/photo-rules";

/**
 * HOME-1 (129): the home page photo, read with the VISITOR's client (public read; never the service role). Bounded by a
 * timeout; no photo / a failed read → null (the trust section stays text-only — never a broken image).
 */
export const loadHomePhoto = cache(async (): Promise<HomePhoto | null> => {
  try {
    const sb = await createServerSupabaseClient();
    const read = sb.from("site_media").select("path, alt, width, height").eq("key", "home_photo").maybeSingle();
    const r = await Promise.race([read, new Promise<null>((ok) => setTimeout(() => ok(null), 6000))]);
    return r && !r.error ? homePhotoFrom(r.data) : null;
  } catch {
    return null;
  }
});
