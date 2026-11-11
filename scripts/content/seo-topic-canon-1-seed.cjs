#!/usr/bin/env node
/**
 * SEO-TOPIC-CANON-1 (owner GO 2026-11-11): flag the 9 topics of docs/content/SINGLE_SUBTOPIC_REPORT_1.md with
 * metadata.lesson_at_topic = true — the SAME write and the SAME audit row as the admin action
 * (TaxonomyService.setLessonAtTopic: other metadata keys kept, audited TAXONOMY_NODE_LESSON_AT_TOPIC, old → new value).
 * DEPLOY-BEFORE-ACTIVATE: a real run refuses unless production (/api/health version) already runs the code that reads the
 * flag (lib/learn/topic-canon.ts exists at that commit). A --dry-run before the deploy is fine.
 * Idempotent: a topic already flagged is left as is. Every path must resolve to exactly one active TOPIC, or nothing is
 * written.
 *   --dry-run   everything inside ONE rolled-back transaction
 * LIVE-LOCK-SAFETY: safeBegin (3 s / 60 s / 30 s).
 */
require('../db/safe-net.cjs'); // SAFE-NET: masks IPs / hosts / e-mails / keys in all output (scripts/db/safe-net.cjs)
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { safeBegin } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const DRY = process.argv.includes('--dry-run');
const ACTOR = 'seo-topic-canon-1@courage-library.test';
const REASON = 'SEO-TOPIC-CANON-1: the topic URL serves its subtopic lesson (owner GO 2026-11-11, SINGLE_SUBTOPIC_REPORT_1)';
const HEALTH = 'https://couragelibrary-next.vercel.app/api/health';
const TOPICS = [
  'english-comprehension.active-passive',
  'english-comprehension.antonyms',
  'english-comprehension.cloze-test',
  'english-comprehension.direct-and-indirect-speech',
  'english-comprehension.idioms-phrases',
  'english-comprehension.phrasal-verbs',
  'english-comprehension.reading-comprehension',
  'english-comprehension.spelling',
  'english-comprehension.synonyms',
];

async function productionRunsTheCode() {
  const res = await fetch(HEALTH, { signal: AbortSignal.timeout(15000) });
  const version = String((await res.json()).version || '');
  if (!/^[0-9a-f]{7,40}$/.test(version)) return { ok: false, version };
  try {
    execFileSync('git', ['cat-file', '-e', `${version}:lib/learn/topic-canon.ts`], { cwd: ROOT, stdio: 'ignore' });
    return { ok: true, version };
  } catch {
    return { ok: false, version };
  }
}

(async () => {
  if (!DRY) {
    const prod = await productionRunsTheCode().catch(() => ({ ok: false, version: 'unreachable' }));
    if (!prod.ok) {
      console.log(`REFUSED (DEPLOY-BEFORE-ACTIVATE): production ${prod.version} does not run SEO-TOPIC-CANON-1 yet — use --dry-run`);
      process.exitCode = 1;
      return;
    }
  }
  const target = dbTarget();
  const red = redactor(target);
  const c = new Client(target.pg);
  c.on('error', () => {});
  await c.connect();
  try {
    await safeBegin(c, { readOnly: false });
    const rows = (await c.query(
      `select id, hierarchy_path, metadata from public.canonical_taxonomy_nodes where node_type = 'TOPIC' and is_active and hierarchy_path = any($1::text[]) order by hierarchy_path`,
      [TOPICS],
    )).rows;
    if (rows.length !== TOPICS.length) throw new Error(`expected ${TOPICS.length} active topics, found ${rows.length} — nothing written`);
    const todo = rows.filter((r) => !(r.metadata && r.metadata.lesson_at_topic === true));
    for (const r of todo) {
      await c.query(`update public.canonical_taxonomy_nodes set metadata = coalesce(metadata, '{}'::jsonb) || '{"lesson_at_topic": true}'::jsonb where id = $1`, [r.id]);
      await c.query(
        `insert into public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
         values (null, $1, 'TAXONOMY_NODE_LESSON_AT_TOPIC', 'canonical_taxonomy_node', $2, '{"lesson_at_topic": false}', '{"lesson_at_topic": true}', $3)`,
        [ACTOR, r.id, REASON],
      );
    }
    await c.query(DRY ? 'ROLLBACK' : 'COMMIT');
    console.log(`${DRY ? 'DRY-RUN (rolled back)' : 'COMMITTED'}: ${rows.length} topic(s); newly flagged ${todo.length}; already flagged ${rows.length - todo.length}`);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.log(`FAILED — ${red(String(e.message)).slice(0, 300)}`);
    process.exitCode = 1;
  } finally {
    await c.end().catch(() => {});
  }
})();
