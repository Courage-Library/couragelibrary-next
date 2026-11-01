import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";
import { brandLogoFrom, type BrandImage } from "@/lib/brand/brand-rules";

/**
 * HOME-1 brand settings (131): the uploaded brand assets, read with the cookie-free PUBLIC client (public rows, never
 * the service role) and cached (tag BRAND_CACHE_TAG, 1 h; Settings › Brand revalidates the tag). Bounded: a slow or
 * failed read → the defaults (the official logo), never a broken image and never a slow page.
 */
export const BRAND_CACHE_TAG = "brand-assets";

export interface BrandAssets {
  headerLogo: BrandImage | null;
  footerLogo: BrandImage | null;
  squareMarkPath: string | null;
}
export const NO_BRAND_ASSETS: BrandAssets = { headerLogo: null, footerLogo: null, squareMarkPath: null };

const readBrandAssets = unstable_cache(
  async (): Promise<BrandAssets> => {
    const { data, error } = await createPublicServerSupabaseClient().from("site_media").select("key, path, alt, width, height");
    if (error || !data) throw new Error("brand assets read failed"); // not cached: the next request tries again
    const row = (k: string) => data.find((r) => r.key === k) ?? null;
    return {
      headerLogo: brandLogoFrom("brand_header_logo", row("brand_header_logo")),
      footerLogo: brandLogoFrom("brand_footer_logo", row("brand_footer_logo")),
      squareMarkPath: row("brand_square_mark")?.path ?? null,
    };
  },
  ["brand-assets", "v1"],
  { tags: [BRAND_CACHE_TAG], revalidate: 3600 },
);

// after a failed / timed-out read, use the defaults at once for a minute (an outage never adds 800 ms to every page)
let failedAt = 0;
const BREAK_MS = 60_000;

/** never rejects; ≤ 800 ms, then the defaults */
export async function loadBrandAssets(): Promise<BrandAssets> {
  if (Date.now() - failedAt < BREAK_MS) return NO_BRAND_ASSETS;
  try {
    const r = await Promise.race([readBrandAssets().catch(() => null), new Promise<null>((ok) => setTimeout(() => ok(null), 800))]);
    if (!r) failedAt = Date.now();
    return r ?? NO_BRAND_ASSETS;
  } catch {
    failedAt = Date.now();
    return NO_BRAND_ASSETS;
  }
}
