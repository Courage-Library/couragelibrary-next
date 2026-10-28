/**
 * SYLIMPORT1-SCOPE (architect, 2026-10-28): the "the suite did not change anything it must not" invariant, scoped to
 * the suite itself so an owner's legitimate edits (Master tree, syllabus intake) during a CI run never fail a gate —
 * WITHOUT weakening what the gate proves about the suite:
 *   (1) the touch-set (the master-tree nodes the suite's committed fixtures map) is byte-identical before / after
 *       (full row text, md5);
 *   (2) ZERO taxonomy audit rows by the suite's actors inside the run window (any node: a suite write anywhere in the
 *       tree is caught, not only in the touch-set);
 *   (3) ZERO syllabus audit rows by the suite's actors inside the window on anything but the suite's own QA exam, and
 *       no non-QA syllabus version created by a suite actor inside the window.
 * The suite's own fixtures are checked separately (cleanup to the baseline).
 * `q(sql, params) → rows` runs the queries (read-only); used by test_syl_import1.cjs and its negative controls.
 */

/**
 * the touch-set: exactly the nodes the suite's committed fixtures map (by hierarchy path). Ancestors are NOT included:
 * the importer only reads them, and an owner setting a subject type during a run must not fail the gate (the audit
 * check below still catches a suite write anywhere in the tree).
 */
async function touchSetIds(q, paths) {
  const rows = await q(`SELECT id FROM public.canonical_taxonomy_nodes WHERE hierarchy_path = ANY($1::text[]) ORDER BY id`, [paths]);
  return rows.map((r) => r.id);
}

async function touchSetFingerprint(q, ids) {
  const [r] = await q(`SELECT count(*)::int n, md5(coalesce(string_agg(t::text, '|' ORDER BY t.id), '')) h FROM public.canonical_taxonomy_nodes t WHERE t.id = ANY($1::uuid[])`, [ids]);
  return `${r.n}:${r.h}`;
}

/**
 * Problems (empty = the invariant holds) for a run that started at `since` (a DB timestamp), with the suite's actor ids
 * and e-mails, its touch-set and the fingerprint taken at the start, and its own QA exam id.
 */
async function suiteScopeProblems(q, { since, actorIds, actorEmails, touchIds, touchBefore, qaExamId }) {
  const problems = [];
  const after = await touchSetFingerprint(q, touchIds);
  if (after !== touchBefore) problems.push(`touch-set changed (${touchBefore} → ${after})`);
  const actor = `(a.actor_id = ANY($2::uuid[]) OR a.actor_email = ANY($3::text[]))`;
  const [tax] = await q(
    `SELECT count(*)::int n, string_agg(DISTINCT a.action_type, ',') types FROM public.admin_audit_logs a
      WHERE a.created_at >= $1 AND ${actor}
        AND (a.action_type LIKE 'TAXONOMY%' OR a.target_entity ILIKE '%taxonom%')`,
    [since, actorIds, actorEmails]
  );
  if (tax.n > 0) problems.push(`${tax.n} taxonomy audit row(s) by the suite's actors (${tax.types})`);
  const [syl] = await q(
    `SELECT count(*)::int n FROM public.admin_audit_logs a
      WHERE a.created_at >= $1 AND ${actor} AND a.action_type LIKE 'SYLLABUS%'
        AND NOT EXISTS (SELECT 1 FROM public.exam_syllabus_versions v WHERE v.id::text = a.target_id AND v.exam_id = $4)
        AND NOT (a.new_value ->> 'exam_id' IS NOT NULL AND a.new_value ->> 'exam_id' = $4::text)`,
    [since, actorIds, actorEmails, qaExamId]
  );
  // the suite deletes its own DRAFT at the end, so a target that no longer exists is checked by its recorded exam id
  if (syl.n > 0) problems.push(`${syl.n} syllabus audit row(s) by the suite's actors outside the QA exam`);
  const [ver] = await q(
    `SELECT count(*)::int n FROM public.exam_syllabus_versions v
      WHERE v.exam_id <> $3 AND v.created_by = ANY($2::uuid[]) AND v.created_at >= $1`,
    [since, actorIds, qaExamId]
  );
  if (ver.n > 0) problems.push(`${ver.n} non-QA syllabus version(s) created by the suite's actors`);
  return problems;
}

module.exports = { touchSetIds, touchSetFingerprint, suiteScopeProblems };
