import { revalidatePath, revalidateTag } from "next/cache";
import { CATEGORY_CACHE_ROUTE } from "@/lib/exams/category-cache-route";

/**
 * PERF-HOME-1: the cached public pages ("/", "/exams", the category pages served from /category-cache/[slug]) are ISR —
 * regenerated every minute at most anyway, and AT ONCE through this helper from every admin write that changes what
 * they show: categories (save, icon), exams (create, edit, publish, archive, delete), conducting bodies and logos,
 * brand assets, the library gallery, mock tests (create, edit, publish), guides, current affairs, the syllabus,
 * questions and lessons (the Hindi chip / FAQ). The call sites are gated (scripts/test_perf_home1_wiring.cjs).
 * It also drops the cached reads those pages use. Outside a request (scripts) it is a no-op: the time-based
 * revalidation still applies.
 */
export const PUBLIC_PAGE_TAGS = ["categories", "brand-assets", "hindi-content"] as const;
// LANDING-1 (owner L1): "/hi" (the Hindi landing page) follows the same cache rule as "/"
export const PUBLIC_PAGE_PATHS = ["/", "/hi", "/exams"] as const;
// LIVE-GREEN-1 3a: the SAME route the middleware rewrites /exams/<category> to (one definition; gate CATEGORY-CACHE-1)
export const PUBLIC_CATEGORY_ROUTE = CATEGORY_CACHE_ROUTE;

export function revalidatePublicPages(): void {
  try {
    for (const t of PUBLIC_PAGE_TAGS) revalidateTag(t);
    for (const p of PUBLIC_PAGE_PATHS) revalidatePath(p);
    revalidatePath(PUBLIC_CATEGORY_ROUTE, "page");
  } catch {
    /* not inside a request (a script): the pages still regenerate within their revalidate window */
  }
}
