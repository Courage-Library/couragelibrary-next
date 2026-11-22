/**
 * SEO-1 (2026-11-22): every private or thin route answers `X-Robots-Tag: noindex` (next.config headers), so a crawler
 * that reaches it — a shared link, an old URL — never indexes it. One list, gated by scripts/test_seo1.cjs.
 *
 * Why a header and not robots.txt: a robots.txt Disallow hides the page from the crawler, which then cannot see the
 * noindex and may still index the bare URL. These pages stay crawlable and say noindex. (/api/ and /admin/ keep their
 * robots.txt Disallow as well.)
 *
 * Patterns are Next.js `source` patterns (path-to-regexp): `/x/:path*` also matches `/x` itself.
 * Public, indexable routes (the sitemap's) must never match — the gate checks every sitemap URL against this list.
 */
export const PRIVATE_NOINDEX_SOURCES: readonly string[] = [
  // sign-in, sign-up and account flows
  "/auth/:path*",
  "/confirm-age",
  "/onboarding/:path*",
  "/settings/:path*",
  // the signed-in app (personal views; they redirect or show a sign-in prompt to a visitor)
  "/dashboard/:path*",
  "/billing/:path*",
  "/wallet/:path*",
  "/notifications/:path*",
  "/performance/:path*",
  "/mistakes/:path*",
  "/achievements/:path*",
  "/certificates/:path*",
  "/store/:path*",
  "/memory-lock/:path*",
  "/practice/session/:path*",
  "/help/tickets/:path*",
  "/faculty/:path*",
  "/descriptive/:path*",
  "/flashcards/:path*",
  "/community/:path*",
  "/battles/:path*",
  "/courses/:slug/learn/:path*",
  "/institutes/:slug/batches/:path*",
  // test taking, results and leaderboards (per attempt / per user); the mock detail page is thin until it gets its
  // own metadata (backlog SEO-MOCK-PAGES-1)
  "/mock-tests/:id",
  "/mock-tests/:id/:path*",
  "/live-tests/:slug/take/:path*",
  "/live-tests/:slug/result/:path*",
  "/live-tests/:slug/submitted/:path*",
  // personal profiles and certificate checks (personal data)
  "/u/:path*",
  "/verify/:path*",
  // staff and machine routes (also Disallowed in robots.txt)
  "/admin/:path*",
  "/api/:path*",
];

export const PRIVATE_NOINDEX_VALUE = "noindex";
