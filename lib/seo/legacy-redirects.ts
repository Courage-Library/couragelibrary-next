/**
 * DOMAIN-CUTOVER-1 (owner ruling Q4 2026-10-29, GO 2026-11-22): every legacy couragelibrary.in URL → ONE permanent
 * redirect (308; Google treats it as 301) to the closest page of the new app — exact equivalents first, otherwise the
 * closest hub. Never a 404, never a chain, never a loop:
 *   - every destination is an existing new-app route that ends in no ".html" and starts with no legacy prefix, so no
 *     rule ever matches a destination again (gated: scripts/test_legacy_redirects.cjs over all 596 URLs of
 *     docs/ops/DOMAIN_CUTOVER_1_LEGACY_URLS.txt, re-read from the legacy sitemaps on 2026-11-22)
 *   - Next.js matches redirect sources case-insensitively (path-to-regexp, sensitive: false), and a legacy path with
 *     spaces (%20) is matched by the section wildcards
 *   - order matters: exact pages → legacy sections → any other ".html" (→ /exams)
 * Pure data, no imports: next.config.ts reads it, the gate evaluates it.
 */
export interface LegacyRedirect {
  source: string;
  destination: string;
}

/** Top-level legacy pages with a direct equivalent (or the closest hub). */
const EXACT: LegacyRedirect[] = [
  { source: "/index.html", destination: "/" },
  { source: "/about.html", destination: "/about" },
  { source: "/contact.html", destination: "/contact" },
  { source: "/SSC-CGL.html", destination: "/exams/ssc-cgl" },
  { source: "/SSC-Main.html", destination: "/exams/ssc" },
  { source: "/SSC-GD-Syllabus.html", destination: "/exams/ssc" },
  { source: "/Delhi-Police.html", destination: "/exams/police" },
  { source: "/Railway-Main.html", destination: "/exams/railway" },
  { source: "/Banking-Main.html", destination: "/exams/banking" },
  { source: "/Defence-Main.html", destination: "/exams/defence" },
  // the legacy checkout pages: Pro is (or will be) bought on /pricing — legacy checkout is closed (owner, 2026-11-22)
  { source: "/enroll.html", destination: "/pricing" },
  { source: "/free-trial.html", destination: "/pricing" },
  // legacy account pages (no account migration, Q5): the new dashboard (its sign-in gate applies)
  { source: "/dashboard.html", destination: "/dashboard" },
  { source: "/settings.html", destination: "/dashboard" },
  { source: "/payment-history.html", destination: "/dashboard" },
  { source: "/notifications.html", destination: "/dashboard" },
  { source: "/chatbot.html", destination: "/" },
];

/** Legacy sections (every page under them) → the closest hub. */
const SECTIONS: LegacyRedirect[] = [
  { source: "/ssc-cgl", destination: "/exams/ssc-cgl" },
  { source: "/ssc-cgl/:path*", destination: "/exams/ssc-cgl" },
  { source: "/ssc-gd", destination: "/exams/ssc" },
  { source: "/ssc-gd/:path*", destination: "/exams/ssc" },
  { source: "/delhi-police", destination: "/exams/police" },
  { source: "/delhi-police/:path*", destination: "/exams/police" },
  { source: "/railway", destination: "/exams/railway" },
  { source: "/railway/:path*", destination: "/exams/railway" },
  { source: "/banking", destination: "/exams/banking" },
  { source: "/banking/:path*", destination: "/exams/banking" },
  { source: "/defence", destination: "/exams/defence" },
  { source: "/defence/:path*", destination: "/exams/defence" },
  // the legacy blog (exam strategy articles): the exam hub (there is no blog in the new app)
  { source: "/Blog", destination: "/exams" },
  { source: "/Blog/:path*", destination: "/exams" },
  { source: "/mock/:path*", destination: "/mock-tests" },
];

/** Any other legacy ".html" path (not in the sitemaps, old bookmarks) → the exam list. The new app has no ".html" route. */
const FALLBACK: LegacyRedirect[] = [{ source: "/:path(.*\\.html)", destination: "/exams" }];

export const LEGACY_REDIRECTS: readonly LegacyRedirect[] = [...EXACT, ...SECTIONS, ...FALLBACK];
