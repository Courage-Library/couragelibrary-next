#!/usr/bin/env node
/**
 * CA-7 SEO-HYGIENE-1: flags the QA test lessons as test content (learning_documents.is_test_content = true) — served
 * (the QA journeys and the LESSON-PERF gate read them) but never indexed: noindex, no LearningResource JSON-LD, not in
 * the sitemap. One audit row per change (LESSON_TEST_CONTENT). Idempotent.
 *   The set: the QA fixture node lesson of scripts/content/ca6-qa-lesson.cjs (its published title starts "QA –") and any
 *   document whose slug starts "qa-" (the archived legacy QA lessons) — nothing else.
 *   --dry-run   everything inside ONE rolled-back transaction (the first run of a new writer is non-writing)
 * LIVE-LOCK-SAFETY: safeBegin (3 s / 60 s / 30 s).
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { safeBegin } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const DRY = process.argv.includes('--dry-run');
const ACTOR = 'ca7-test-content@courage-library.test';

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  const c = new Client(target.pg);
  c.on('error', () => {});
  await c.connect();
  try {
    await safeBegin(c, { readOnly: false });
    const rows = (await c.query(`
      select d.id, d.canonical_slug, d.status, d.is_test_content
        from public.learning_documents d
        left join public.document_versions v on v.id = d.current_published_version_id
       where d.canonical_slug like 'qa-%'
          or (d.document_type = 'NODE_LESSON' and v.lesson_meta ->> 'title' like 'QA –%')
       order by d.canonical_slug`)).rows;
    const todo = rows.filter((r) => !r.is_test_content);
    for (const r of todo) {
      await c.query(`update public.learning_documents set is_test_content = true where id = $1`, [r.id]);
      await c.query(`insert into public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
                     values (null, $1, 'LESSON_TEST_CONTENT', 'learning_document', $2, '{"is_test_content": false}', '{"is_test_content": true}', 'CA-7 SEO-HYGIENE-1: QA fixture, never indexed')`, [ACTOR, r.id]);
    }
    await c.query(DRY ? 'ROLLBACK' : 'COMMIT');
    console.log(`${DRY ? 'DRY-RUN (rolled back)' : 'COMMITTED'}: ${rows.length} QA document(s) — ${rows.map((r) => `${r.canonical_slug} [${r.status}]`).join(', ')}; newly flagged ${todo.length}`);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.log(`FAILED — ${red(String(e.message)).slice(0, 300)}`);
    process.exitCode = 1;
  } finally {
    await c.end().catch(() => {});
  }
})();
