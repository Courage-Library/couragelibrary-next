/**
 * DB assertions after student-journey.cjs (read-only), plus the errata revocation check inside a
 * transaction that is always rolled back.
 * - 3 mistake occurrences, ACTIVE, question_version_id NOT NULL and = attempt_answers.question_version_id
 * - vault rows carry topic_id (= questions.canonical_topic_id) and subject_id (= topics.subject_id)
 * - fn_revoke_mistakes_by_errata on one new version revokes the matching occurrence (then ROLLBACK)
 * Every run ends with a per-assertion summary (DB-1 … DB-6: PASS / FAIL / NOT RUN), also when the script
 * aborts, so a partial result always names the failing assertion (architect ruling, GAP2-4a).
 * Usage: node scripts/e2e/assert-mistake-lineage.cjs
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { EMAIL, OUT_DIR, pgConfig, stepRecorder } = require('./_e2e-env.cjs');

const IDS = ['DB-1', 'DB-2', 'DB-3', 'DB-4', 'DB-5', 'DB-6'];
const { results, step } = stepRecorder();
function summary(error) {
  console.log('\nLineage assertion summary:');
  for (const id of IDS) {
    const r = results.find((x) => x.name.startsWith(`${id} `));
    const what = r ? `  ${r.name.slice(id.length + 1)}${r.detail ? ' — ' + r.detail : ''}` : '';
    console.log(`  ${id}  ${r ? (r.ok ? 'PASS' : 'FAIL') : 'NOT RUN'}${what}`);
  }
  if (error) console.log(`  aborted: ${error}`);
}

(async () => {
  const c = new Client(pgConfig());
  c.on('error', () => {});
  await c.connect();

  await c.query('BEGIN READ ONLY');
  const user = (await c.query(`SELECT id FROM auth.users WHERE email = $1`, [EMAIL])).rows[0];
  if (!user) throw new Error('test student not found — run student-journey.cjs first');
  const uid = user.id;
  const att = (await c.query(`SELECT status FROM public.test_attempts WHERE user_id = $1`, [uid])).rows;
  step('DB-1 attempt submitted', att.length === 1 && att[0].status === 'submitted', JSON.stringify(att.map((a) => a.status)));
  const occ = (await c.query(
    `SELECT o.id, o.question_version_id, aa.question_version_id AS answered_qv, o.occurrence_status, o.selected_option_id
     FROM public.user_mistake_occurrences o
     LEFT JOIN public.attempt_answers aa ON aa.id = o.attempt_answer_id
     WHERE o.user_id = $1`, [uid])).rows;
  step('DB-2 3 occurrences recorded, ACTIVE', occ.length === 3 && occ.every((o) => o.occurrence_status === 'ACTIVE'), `${occ.length} rows`);
  step('DB-3 question_version_id NOT NULL and = attempt_answers version',
    occ.length === 3 && occ.every((o) => o.question_version_id && o.question_version_id === o.answered_qv),
    occ.map((o) => `${(o.question_version_id || 'NULL').slice(0, 8)}=${(o.answered_qv || 'NULL').slice(0, 8)}`).join(' '));
  const vault = (await c.query(
    `SELECT v.topic_id, v.subject_id, q.canonical_topic_id, t.subject_id AS topic_subject
     FROM public.user_mistake_vault v
     JOIN public.questions q ON q.id = v.question_id
     LEFT JOIN public.topics t ON t.id = q.canonical_topic_id
     WHERE v.user_id = $1`, [uid])).rows;
  step('DB-4 vault rows have topic_id (= canonical topic) and subject_id',
    vault.length === 3 && vault.every((v) => v.topic_id && v.topic_id === v.canonical_topic_id && v.subject_id === v.topic_subject), `${vault.length} rows`);
  await c.query('ROLLBACK');

  // Errata: mark the student's selected option as the corrected answer of one new version → that
  // occurrence must be revoked. Always rolled back.
  const target = occ.find((o) => o.question_version_id);
  if (target) {
    await c.query('BEGIN READ WRITE');
    try {
      const r = (await c.query(`SELECT public.fn_revoke_mistakes_by_errata($1, $2, 'E2E errata check', NULL) AS r`, [target.question_version_id, target.selected_option_id])).rows[0].r;
      const st = (await c.query(`SELECT occurrence_status FROM public.user_mistake_occurrences WHERE id = $1`, [target.id])).rows[0].occurrence_status;
      step('DB-5 errata revokes the matching occurrence (rolled back)', r.success && r.revoked_occurrences_count >= 1 && st === 'REVOKED_ERRATA', `revoked ${r.revoked_occurrences_count}, status ${st}`);
    } finally {
      await c.query('ROLLBACK');
    }
    const after = (await c.query(`SELECT occurrence_status FROM public.user_mistake_occurrences WHERE id = $1`, [target.id])).rows[0].occurrence_status;
    step('DB-6 errata check left no change (rolled back)', after === 'ACTIVE', after);
  } else {
    step('DB-5 errata revokes the matching occurrence (rolled back)', false, 'no occurrence with a question version');
  }
  await c.end();

  fs.writeFileSync(path.join(OUT_DIR, 'e2e_assert_result.json'), JSON.stringify(results, null, 1));
  const notRun = IDS.filter((id) => !results.some((r) => r.name.startsWith(`${id} `))).length;
  const failed = results.filter((r) => !r.ok).length + notRun;
  summary();
  console.log(`\nDB assertions: ${IDS.length - failed}/${IDS.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log('ERR', e.code || '', String(e.message).slice(0, 200));
  summary(`${e.code || ''} ${String(e.message).slice(0, 120)}`);
  process.exit(1);
});
