/**
 * QA-FIXTURE-EXCLUSION (architect 2026-10-31): the markers of what CI creates in the shared database while the owner
 * works, and the admin-side exclusions. Pure; safe everywhere.
 *   - per-run master-tree topics (scripts/live/_qa-run-fixture.cjs): INTERNAL TOPICs under a REAL subject, slug
 *     qa-fixture-run-<tag>-<key>, metadata.source QA_FIXTURE_RUN — never in the intake matcher / suggestions, the master
 *     tree, the coverage matrix, the lesson node picker, question-bank topic filters or the syllabus editor picker
 *   - per-run conducting bodies (scripts/e2e/logo-ux1.cjs): slug qa-logo-fixture-<run> — shown to QA identities only
 *   - QA identities' audit rows (…@courage-library.test) — not in Today's recent activity
 * Every admin query of canonical_taxonomy_nodes that LISTS nodes adds `.not("slug", "like", QA_RUN_SLUG_LIKE)`
 * (slug is NOT NULL, so the filter never drops a real node). Gate: scripts/test_qa_fixture_exclusion.cjs.
 */
export const QA_RUN_SLUG_PREFIX = "qa-fixture-run-";
export const QA_RUN_SLUG_LIKE = `${QA_RUN_SLUG_PREFIX}%`;
export const QA_LOGO_FIXTURE_SLUG_PREFIX = "qa-logo-fixture-";
export const QA_EMAIL_DOMAIN = "@courage-library.test";
export const QA_EMAIL_LIKE = `%${QA_EMAIL_DOMAIN}`;

export const isQaRunNodeSlug = (slug: string | null | undefined) => typeof slug === "string" && slug.startsWith(QA_RUN_SLUG_PREFIX);
export const isQaIdentity = (email: string | null | undefined) => typeof email === "string" && email.toLowerCase().endsWith(QA_EMAIL_DOMAIN);

/** conducting bodies a viewer sees: QA logo fixtures only for QA identities (the E2E needs its own card) */
export function visibleBodies<T extends { slug: string }>(orgs: T[], viewerEmail: string | null | undefined): T[] {
  return isQaIdentity(viewerEmail) ? orgs : orgs.filter((o) => !o.slug.startsWith(QA_LOGO_FIXTURE_SLUG_PREFIX));
}
