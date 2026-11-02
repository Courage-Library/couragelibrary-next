import { getAppEnv } from "@/config/env";

/**
 * PERF-HOME-1: the public category slugs, for middleware.ts (edge) — which /exams/<slug> requests are category pages
 * (served cached from /category/<slug>) and which are exam hubs (dynamic). Anon REST read of public rows only.
 *   - NEVER awaited by a request: the current list (empty on a cold instance) is used at once and refreshed in the
 *     background when older than 5 minutes — a cold instance serves its first /exams requests from the dynamic page
 *     (correct, just uncached) until the list has arrived
 *   - a failed read is not retried for 60 s (an outage never slows every /exams request)
 * No list → nothing is rewritten and the dynamic /exams/[slug] page (which also renders categories) serves the
 * request — never a wrong page, only an uncached one.
 */
const TTL_MS = 5 * 60 * 1000;
const BACKOFF_MS = 60 * 1000;
let cached: { at: number; slugs: Set<string> } | null = null;
let failedAt = 0;
let inflight: Promise<void> | null = null;

async function read(): Promise<Set<string> | null> {
  const { supabaseUrl, supabaseAnonKey } = getAppEnv();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  try {
    const r = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/exam_categories?select=slug&is_active=eq.true&is_internal=eq.false`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const rows = (await r.json()) as Array<{ slug?: unknown }>;
    return new Set(rows.map((x) => x.slug).filter((s): s is string => typeof s === "string"));
  } catch {
    return null;
  }
}

function refresh(): Promise<void> {
  inflight ??= read()
    .then((fresh) => {
      if (fresh) cached = { at: Date.now(), slugs: fresh };
      else failedAt = Date.now();
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * PERF-HOME-1b: `keepAlive` receives the background refresh — the middleware passes NextFetchEvent.waitUntil, because an
 * edge runtime (Vercel) drops un-awaited work once the response is sent (the list then never arrived in production).
 */
export function categorySlugs(keepAlive?: (work: Promise<unknown>) => void, now: number = Date.now()): Set<string> {
  if (!(cached && now - cached.at < TTL_MS) && now - failedAt >= BACKOFF_MS) {
    const work = refresh(); // background: the request is never held for it
    if (keepAlive) keepAlive(work);
  }
  return cached?.slugs ?? new Set();
}

/** /exams/<slug> (exactly one segment, a valid slug) → the slug; anything else → null */
export function examSlugOf(pathname: string): string | null {
  const m = /^\/exams\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(pathname);
  return m ? m[1] : null;
}
