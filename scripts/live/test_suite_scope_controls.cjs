#!/usr/bin/env node
/**
 * SYLIMPORT1-SCOPE negative controls — ONE rolled-back transaction (safeBegin, LIVE-LOCK-SAFETY), savepoints per case,
 * the same module the gate uses (scripts/live/_suite-scope.cjs). Nothing persists.
 * QA-FIXTURES (b): every node the controls read or edit is created INSIDE the transaction (an INTERNAL QA subject with
 * five topics: the four-node touch-set + one outside it) — never the owner's real topics / subjects, not even rolled back.
 *   C-0 no change                                                                          → the invariant HOLDS
 *   C-1 a suite actor edits a touch-set node (+ its audit row)                             → FAILS (touch-set + audit)
 *   C-2 a suite actor edits a pre-existing node OUTSIDE the touch-set (audit row only)     → FAILS (audit)
 *   C-3 a different actor edits nodes during the run, a subject included (+ audit rows)     → HOLDS
 *   C-4 a suite actor writes a syllabus audit row on a non-QA exam                         → FAILS
 *   C-5 a different actor creates a syllabus version on a non-QA exam (an intake)          → HOLDS
 * Run: node scripts/live/test_suite_scope_controls.cjs
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { safeBegin } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));
const { touchSetIds, touchSetFingerprint, suiteScopeProblems } = require('./_suite-scope.cjs');

const TOUCH_KEYS = ['percentage', 'average', 'ratio-proportion', 'synonyms'];

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  const c = new Client(target.pg);
  c.on('error', () => {});
  await c.connect();
  let ok = true;
  const line = (cond, name, info) => {
    if (!cond) ok = false;
    console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ' — ' + info}`);
  };
  try {
    await safeBegin(c, { readOnly: false });
    const q = async (sql, p) => (await c.query(sql, p)).rows;
    const ids = Object.fromEntries((await q(`SELECT email, id FROM auth.users WHERE email IN ('qa-student@courage-library.test','qa-staff@courage-library.test','qa-admin@courage-library.test')`)).map((r) => [r.email.split('@')[0], r.id]));
    const [qa] = await q(`SELECT id FROM public.exams WHERE slug = 'qa-syllabus-test'`);
    const [other] = await q(`SELECT id FROM public.exams WHERE slug <> 'qa-syllabus-test' ORDER BY slug LIMIT 1`);
    // the controls' own nodes (rolled back with everything else)
    const [subject] = await q(`INSERT INTO public.canonical_taxonomy_nodes (parent_id, node_type, name, slug, is_internal, subject_type, metadata)
        VALUES (NULL, 'SUBJECT', 'QA Scope Controls', 'qa-scope-controls', true, 'APTITUDE', '{"source":"QA_FIXTURE"}') RETURNING id`);
    const topic = async (key) => (await q(`INSERT INTO public.canonical_taxonomy_nodes (parent_id, node_type, name, slug, is_internal, metadata)
        VALUES ($1, 'TOPIC', $2, $3, true, '{"source":"QA_FIXTURE"}') RETURNING hierarchy_path`, [subject.id, `QA Scope ${key}`, key]))[0].hierarchy_path;
    const touchPaths = [];
    for (const k of TOUCH_KEYS) touchPaths.push(await topic(k));
    const [outside] = await q(`SELECT id FROM public.canonical_taxonomy_nodes WHERE hierarchy_path = $1`, [await topic('outside')]);
    const touchIds = await touchSetIds(q, touchPaths);
    if (!ids['qa-staff'] || !qa || !other || touchIds.length !== 4 || !outside) throw new Error('QA identities / exams / touch-set missing');
    // the window starts BEFORE the transaction's own writes (now() is the transaction start; inserts default to it)
    const scope = {
      since: (await q(`SELECT now() - interval '1 second' t`))[0].t,
      actorIds: [ids['qa-student'], ids['qa-staff'], ids['qa-admin']],
      actorEmails: ['qa-student@courage-library.test', 'qa-staff@courage-library.test', 'qa-admin@courage-library.test'],
      touchIds,
      touchBefore: await touchSetFingerprint(q, touchIds),
      qaExamId: qa.id,
    };
    const audit = (actorId, email, type, entity, targetId, newValue = null) =>
      q(`INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason) VALUES ($1, $2, $3, $4, $5, NULL, $6, 'SYLIMPORT1-SCOPE control')`, [actorId, email, type, entity, targetId, newValue]);
    const caseRun = async (name, expectHold, fn) => {
      await c.query('SAVEPOINT sc');
      await fn();
      const problems = await suiteScopeProblems(q, scope);
      await c.query('ROLLBACK TO SAVEPOINT sc');
      line(expectHold ? problems.length === 0 : problems.length > 0, `${name} → ${expectHold ? 'HOLDS' : 'FAILS'}`, JSON.stringify(problems));
      return problems;
    };

    await caseRun('C-0 no change', true, async () => {});
    const p1 = await caseRun('C-1 a suite actor edits a touch-set node (+ its audit row)', false, async () => {
      await q(`UPDATE public.canonical_taxonomy_nodes SET name = name || ' (x)' WHERE id = $1`, [touchIds[0]]);
      await audit(ids['qa-staff'], 'qa-staff@courage-library.test', 'TAXONOMY_NODE_RENAME', 'canonical_taxonomy_node', touchIds[0]);
    });
    line(p1.some((x) => /touch-set changed/.test(x)) && p1.some((x) => /taxonomy audit row/.test(x)), 'C-1 is caught by BOTH checks', JSON.stringify(p1));
    await caseRun('C-2 a suite actor edits a node outside the touch-set (audit row only)', false, async () => {
      await audit(ids['qa-admin'], 'qa-admin@courage-library.test', 'TAXONOMY_NODE_DETAILS', 'canonical_taxonomy_node', outside.id);
    });
    await caseRun('C-3 a different actor edits nodes during the run (a subject included)', true, async () => {
      await q(`UPDATE public.canonical_taxonomy_nodes SET name = name || ' (owner edit)' WHERE id = $1`, [outside.id]);
      await q(`UPDATE public.canonical_taxonomy_nodes SET subject_type = CASE WHEN subject_type = 'APTITUDE' THEN 'REASONING' ELSE 'APTITUDE' END WHERE id = $1`, [subject.id]);
      await audit(null, 'owner-control@courage-library.test', 'TAXONOMY_NODE_DETAILS', 'canonical_taxonomy_node', subject.id);
      await audit(null, 'owner-control@courage-library.test', 'TAXONOMY_NODE_DETAILS', 'canonical_taxonomy_node', outside.id);
    });
    await caseRun('C-4 a suite actor writes a syllabus audit row on a non-QA exam', false, async () => {
      await audit(ids['qa-staff'], 'qa-staff@courage-library.test', 'SYLLABUS_DRAFT_IMPORT', 'exam_syllabus_version', '00000000-0000-4000-8000-000000000123', { exam_id: other.id });
    });
    await caseRun('C-5 a different actor creates a syllabus version on a non-QA exam (an intake)', true, async () => {
      await audit(null, 'owner-control@courage-library.test', 'SYLLABUS_DRAFT_IMPORT', 'exam_syllabus_version', '00000000-0000-4000-8000-000000000124', { exam_id: other.id });
    });
  } catch (e) {
    ok = false;
    console.log(`FAIL controls aborted — ${red(String(e.message)).slice(0, 300)}`);
  } finally {
    await c.query('ROLLBACK').catch(() => {});
    await c.end().catch(() => {});
  }
  console.log(ok ? 'SYLIMPORT1-SCOPE controls: ALL PASS' : 'SYLIMPORT1-SCOPE controls: FAILURES');
  process.exit(ok ? 0 : 1);
})();
