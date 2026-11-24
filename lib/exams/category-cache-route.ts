/**
 * LIVE-GREEN-1 3a (owner, 2026-11-24): the ONE definition of the internal cached category route.
 *
 * PERF-HOME-1 serves /exams/<category> from a cached (ISR) page through a middleware rewrite. Its internal path used to
 * be /category/<slug> — the same path SEO-1 308s to /exams/<slug> for visitors. Under self-hosted `next start` (the CI
 * live server) the rewritten request is routed AGAIN, so that 308 hit the internal target and /exams/<category> answered
 * 308 to itself (CI dispatches since 45093554555). The internal route now lives at /category-cache/<slug>, which no
 * redirect may ever match (gate CATEGORY-CACHE-1).
 *
 * Every user of the route takes it from here: the middleware rewrite (categoryCachePath), the cache refresh
 * (lib/cache/revalidate-public.ts → CATEGORY_CACHE_ROUTE), the direct-request noindex (categoryCacheSlugOf). Edge-safe:
 * no imports.
 *
 * The rewrite carries CATEGORY_REWRITE_MARKER as a request header, so the second routing pass of `next start` can be
 * told apart from a visitor who requests /category-cache/<slug> directly (only the latter gets X-Robots-Tag noindex).
 * A next.config header rule for /category-cache/* would leak onto /exams/<slug> under `next start` — never use one.
 */
export const CATEGORY_CACHE_PREFIX = "/category-cache";
/** the app route (app/(public)/category-cache/[slug]/page.tsx) — what revalidatePath refreshes */
export const CATEGORY_CACHE_ROUTE = `${CATEGORY_CACHE_PREFIX}/[slug]`;
/** request header the middleware sets on its own rewrite (internal; never a security boundary) */
export const CATEGORY_REWRITE_MARKER = "x-cl-category-rewrite";

/** the internal path the middleware rewrites /exams/<slug> to */
export function categoryCachePath(slug: string): string {
  return `${CATEGORY_CACHE_PREFIX}/${slug}`;
}

/** the slug of a /category-cache/<slug> path (one segment), else null */
export function categoryCacheSlugOf(pathname: string): string | null {
  const m = /^\/category-cache\/([^/]+)$/.exec(pathname);
  return m ? m[1] : null;
}
