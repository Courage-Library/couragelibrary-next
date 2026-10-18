/**
 * COURAGE LIBRARY — QF-1 DATABASE VERIFICATION SUITE (development DB: couragelibrary-next)
 *
 * Safety rules enforced by this script:
 * - Reads POSTGRES_URL_NON_POOLING / NEXT_PUBLIC_SUPABASE_URL / PROD_CA_PATH /
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from .env.local at runtime; never prints values.
 * - REFUSES to run unless the DB project ref equals the NEXT_PUBLIC_SUPABASE_URL ref.
 * - TLS verification always ON (CA from PROD_CA_PATH). No TLS bypass of any kind.
 * - Does NOT apply migrations. Every scenario runs inside a transaction that is ROLLED BACK.
 *   The only exception is IMP-3 (parallel duplicate), which must commit one import to
 *   prove the race guard; it deletes exactly the rows it created (DRAFTs) afterwards.
 * - Verifies baseline counts are identical before and after the run.
 *
 * Usage: node scripts/test_qf1_db.cjs
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');
const envLines = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/);
const env = (k) => {
  const v = envLines.filter((l) => l.startsWith(k + '=')).map((l) => l.slice(k.length + 1).trim().replace(/^["']|["']$/g, ''));
  return v[v.length - 1];
};

function blocked(reason) {
  console.log(`QF-1 DB suite: BLOCKED — ${reason}`);
  process.exit(2);
}

const dbUrl = new URL(env('POSTGRES_URL_NON_POOLING') || blocked('POSTGRES_URL_NON_POOLING missing'));
const dbRef = decodeURIComponent(dbUrl.username).split('.')[1] || '';
const apiUrl = env('NEXT_PUBLIC_SUPABASE_URL') || blocked('NEXT_PUBLIC_SUPABASE_URL missing');
const apiRef = new URL(apiUrl).hostname.split('.')[0];
if (!dbRef || dbRef !== apiRef) blocked('target project ref does not match NEXT_PUBLIC_SUPABASE_URL — refusing to connect.');
const caPath = env('PROD_CA_PATH');
if (!caPath || !fs.existsSync(caPath)) blocked('PROD_CA_PATH missing or file not found.');

const pgConfig = {
  host: dbUrl.hostname,
  port: Number(dbUrl.port),
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.slice(1) || 'postgres',
  ssl: { rejectUnauthorized: true, ca: fs.readFileSync(caPath, 'utf8'), servername: dbUrl.hostname },
};
const redact = (s) =>
  String(s)
    .replace(/postgres(ql)?:\/\/\S+/g, '[redacted]')
    .split(pgConfig.host).join('[host]')
    .split(pgConfig.user).join('[user]');

const BASELINE_TABLES = [
  'questions', 'question_versions', 'question_options', 'question_answers', 'question_sources',
  'exam_question_mappings', 'mock_tests', 'mock_questions', 'test_attempts', 'attempt_answers',
  'test_results', 'user_mistake_vault', 'topics', 'subjects', 'exams',
  'question_version_authoring', 'question_import_batches', 'custom_practice_sessions',
];
const CHECKLIST = JSON.stringify({
  correct_key_verified: true, explanation_correct: true, no_ambiguity: true,
  topic_correct: true, difficulty_sensible: true, provenance_verified: true,
});

let passed = 0;
let failed = 0;
const lines = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    lines.push(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    lines.push(`  FAIL  ${name}\n        ${redact(e && e.message ? e.message : e)}`);
  }
}
function assert(c, m) {
  if (!c) throw new Error(m || 'assertion failed');
}

async function counts(c) {
  const out = {};
  for (const t of BASELINE_TABLES) {
    const r = await c.query(`SELECT CASE WHEN to_regclass('public.${t}') IS NULL THEN NULL ELSE (SELECT count(*) FROM public.${t}) END::bigint AS n`).catch(async () => {
      return c.query(`SELECT NULL::bigint AS n`);
    });
    out[t] = r.rows[0].n === null ? null : Number(r.rows[0].n);
  }
  return out;
}

(async () => {
  const c = new Client(pgConfig);
  try {
    await c.connect();
  } catch (e) {
    blocked(`verified TLS connection failed (${e.code || 'error'}).`);
  }

  // Wrap: run fn in a transaction that is always rolled back.
  const rolledBack = async (fn) => {
    await c.query('BEGIN');
    try {
      return await fn();
    } finally {
      await c.query('ROLLBACK');
    }
  };
  const expectError = async (sql, params, code) => {
    await c.query('SAVEPOINT x');
    try {
      await c.query(sql, params);
      await c.query('RELEASE SAVEPOINT x');
      throw new Error(`expected ${code} but statement succeeded`);
    } catch (e) {
      if (/expected .* but statement succeeded/.test(e.message)) throw e;
      await c.query('ROLLBACK TO SAVEPOINT x');
      assert(e.message.includes(code) || e.code === code, `expected ${code}, got: ${e.code || ''} ${e.message}`);
    }
  };
  const asRole = async (role, sql, params = []) => {
    await c.query('SAVEPOINT r');
    try {
      await c.query(`SET LOCAL ROLE ${role}`);
      return await c.query(sql, params);
    } finally {
      await c.query('ROLLBACK TO SAVEPOINT r');
    }
  };

  // True when the role gets zero rows OR is denied table privilege (42501) — both mean unreadable.
  const unreadable = async (role, sql, params = []) => {
    try {
      return (await asRole(role, sql, params)).rows[0].n === 0;
    } catch (e) {
      return e.code === '42501';
    }
  };

  const fixture = async () => {
    const t = await c.query(`SELECT id FROM public.topics WHERE is_active ORDER BY id LIMIT 1`);
    const u = await c.query(`SELECT id FROM auth.users ORDER BY created_at LIMIT 1`);
    const e = await c.query(`SELECT id FROM public.exams WHERE is_active ORDER BY id LIMIT 1`);
    assert(t.rows[0] && u.rows[0], 'need at least one active topic and one auth user');
    return { topicId: t.rows[0].id, actor: u.rows[0].id, examId: e.rows[0] ? e.rows[0].id : null };
  };
  const tag = `QF1DBTEST-${Date.now()}`;
  const mkItem = (n, stem) => ({
    client_ref: `t${n}`,
    stem: stem || `${tag} probe ${n} unique stem text for verification`,
    difficulty: 'medium',
    language: 'en',
    options: [{ key: 'A', text: 'alpha' }, { key: 'B', text: 'beta' }, { key: 'C', text: 'gamma' }, { key: 'D', text: 'delta' }],
    correct_key: 'B',
    explanation_md: 'Option B is correct because of the probe rule; option A is the common trap.',
    source_type: 'ORIGINAL',
    authoring_metadata: { clientRef: `t${n}`, sourceType: 'ORIGINAL', distractorRationale: { A: 'trap' } },
  });
  const importBatch = async (client, f, items, extra = {}) =>
    (await client.query(`SELECT public.fn_import_question_drafts($1::jsonb, $2::uuid) AS r`, [
      JSON.stringify({ origin: 'AI_EXTERNAL', contract_version: 'CL-QUESTION-AUTHOR-v1.0', context_hash: 'f'.repeat(64), target_topic_id: f.topicId, items, ...extra }),
      f.actor,
    ])).rows[0].r;
  const reviewAndPublish = async (f, versionId) => {
    await c.query(`SELECT public.fn_transition_question_version($1, 'IN_REVIEW', $2, NULL, NULL)`, [versionId, f.actor]);
    await c.query(`SELECT public.fn_transition_question_version($1, 'APPROVED', $2, NULL, $3::jsonb)`, [versionId, f.actor, CHECKLIST]);
    return (await c.query(`SELECT public.fn_publish_question_version($1, $2) AS r`, [versionId, f.actor])).rows[0].r;
  };

  const before = await counts(c);

  // ---------------- Backfill ----------------
  await test('BF-1 no NULL checksum; one authoring row per version', async () => {
    const r = (await c.query(`SELECT (SELECT count(*) FROM public.question_versions WHERE content_checksum IS NULL)::int nullck,
      (SELECT count(*) FROM public.question_versions qv WHERE NOT EXISTS (SELECT 1 FROM public.question_version_authoring a WHERE a.version_id = qv.id))::int missing,
      (SELECT count(*) FROM public.question_versions)::int qv, (SELECT count(*) FROM public.question_version_authoring)::int auth`)).rows[0];
    assert(r.nullck === 0 && r.missing === 0 && r.qv === r.auth, JSON.stringify(r));
  });
  await test('BF-2 legacy lifecycle rule (published_at OR question published ⇔ PUBLISHED)', async () => {
    const r = await c.query(`SELECT count(*)::int n FROM public.question_versions qv JOIN public.questions q ON q.id = qv.question_id
      JOIN public.question_version_authoring a ON a.version_id = qv.id
      WHERE a.origin = 'LEGACY_UNKNOWN' AND ((qv.published_at IS NOT NULL OR q.status = 'published') <> (qv.lifecycle_status = 'PUBLISHED'))`);
    assert(r.rows[0].n === 0, `${r.rows[0].n} mismatched`);
  });
  await test('BF-3 mock_questions reference only PUBLISHED/SUPERSEDED versions', async () => {
    const r = await c.query(`SELECT count(*)::int n FROM public.mock_questions mq JOIN public.question_versions qv ON qv.id = mq.question_version_id
      WHERE qv.lifecycle_status NOT IN ('PUBLISHED','SUPERSEDED')`);
    assert(r.rows[0].n === 0, `${r.rows[0].n} rows`);
  });

  // ---------------- Import ----------------
  await test('IMP-1 import 3 → 3 DRAFT, is_current=false, questions.status=draft, authoring rows', () =>
    rolledBack(async () => {
      const f = await fixture();
      const r = await importBatch(c, f, [mkItem(1), mkItem(2), mkItem(3)]);
      assert(r.success && r.items.length === 3);
      const ids = r.items.map((i) => i.version_id);
      const v = (await c.query(`SELECT qv.lifecycle_status, qv.is_current, q.status, a.origin, a.import_batch_id, a.created_by
        FROM public.question_versions qv JOIN public.questions q ON q.id = qv.question_id
        JOIN public.question_version_authoring a ON a.version_id = qv.id WHERE qv.id = ANY($1::uuid[])`, [ids])).rows;
      assert(v.length === 3 && v.every((x) => x.lifecycle_status === 'DRAFT' && x.is_current === false && x.status === 'draft' && x.origin === 'AI_EXTERNAL' && x.import_batch_id === r.batch_id && x.created_by === f.actor), JSON.stringify(v));
    }));
  await test('IMP-2 re-run same batch → QF_DUPLICATE, 0 new rows', () =>
    rolledBack(async () => {
      const f = await fixture();
      const items = [mkItem(1), mkItem(2)];
      await importBatch(c, f, items);
      const n1 = (await c.query(`SELECT count(*)::int n FROM public.question_versions`)).rows[0].n;
      await expectError(`SELECT public.fn_import_question_drafts($1::jsonb, $2::uuid)`, [JSON.stringify({ origin: 'AI_EXTERNAL', target_topic_id: f.topicId, items }), f.actor], 'QF_DUPLICATE');
      const n2 = (await c.query(`SELECT count(*)::int n FROM public.question_versions`)).rows[0].n;
      assert(n1 === n2, `${n1} → ${n2}`);
    }));
  await test('IMP-3 parallel imports of the same stem (2 connections) → exactly one succeeds', async () => {
    const f = await fixture();
    const c2 = new Client(pgConfig);
    await c2.connect();
    const stem = `${tag} concurrency probe identical stem`;
    const payload = JSON.stringify({ origin: 'AI_EXTERNAL', target_topic_id: f.topicId, items: [mkItem(90, stem)] });
    let created = null;
    try {
      await c.query('BEGIN');
      const first = (await c.query(`SELECT public.fn_import_question_drafts($1::jsonb, $2::uuid) AS r`, [payload, f.actor])).rows[0].r;
      await c2.query('BEGIN');
      // c2 blocks on the advisory lock held by c's open transaction.
      const second = c2
        .query(`SELECT public.fn_import_question_drafts($1::jsonb, $2::uuid) AS r`, [payload, f.actor])
        .then(() => 'ok', (e) => (/QF_DUPLICATE/.test(e.message) ? 'dup' : `err:${e.message}`));
      await new Promise((r) => setTimeout(r, 1500));
      await c.query('COMMIT'); // unavoidable: the race guard is only observable against a committed row
      created = first;
      const outcome = await second;
      await c2.query('ROLLBACK').catch(() => undefined);
      assert(first.success && outcome === 'dup', `first=${first.success} second=${outcome}`);
    } finally {
      await c2.end().catch(() => undefined);
      if (created) {
        // Clean up exactly the committed DRAFT rows (allowed: DRAFT versions are not frozen).
        const vid = created.items[0].version_id;
        const qid = created.items[0].question_id;
        await c.query('BEGIN');
        await c.query(`DELETE FROM public.question_version_authoring WHERE version_id = $1`, [vid]);
        await c.query(`DELETE FROM public.question_options WHERE question_version_id = $1`, [vid]);
        await c.query(`DELETE FROM public.question_answers WHERE question_version_id = $1`, [vid]);
        await c.query(`DELETE FROM public.question_versions WHERE id = $1`, [vid]);
        await c.query(`DELETE FROM public.questions WHERE id = $1`, [qid]);
        await c.query(`DELETE FROM public.question_import_batches WHERE id = $1`, [created.batch_id]);
        await c.query('COMMIT');
        lines.push(`  INFO  IMP-3 committed then removed probe question ${qid.slice(0, 8)} / version ${vid.slice(0, 8)} / batch ${created.batch_id.slice(0, 8)}`);
      }
    }
  });

  // ---------------- Publish ----------------
  await test('PUB-1 publish v1 → revision v2 → publish: v1 SUPERSEDED, v2 PUBLISHED+current, question published', () =>
    rolledBack(async () => {
      const f = await fixture();
      const r = await importBatch(c, f, [mkItem(1)]);
      const v1 = r.items[0].version_id;
      const q = r.items[0].question_id;
      await reviewAndPublish(f, v1);
      const rev = (await c.query(`SELECT public.fn_create_question_revision($1, $2, $3::jsonb) AS r`, [q, f.actor, JSON.stringify(mkItem(2))])).rows[0].r;
      const pub2 = await reviewAndPublish(f, rev.version_id);
      const rows = (await c.query(`SELECT id, lifecycle_status, is_current FROM public.question_versions WHERE question_id = $1`, [q])).rows;
      const s1 = rows.find((x) => x.id === v1);
      const s2 = rows.find((x) => x.id === rev.version_id);
      assert(s1.lifecycle_status === 'SUPERSEDED' && !s1.is_current && s2.lifecycle_status === 'PUBLISHED' && s2.is_current, JSON.stringify(rows));
      assert(pub2.superseded_version_id === v1);
      assert((await c.query(`SELECT status FROM public.questions WHERE id = $1`, [q])).rows[0].status === 'published');
      const a = (await c.query(`SELECT reviewed_by, reviewed_at, authoring_metadata->'review_checklist' AS cl FROM public.question_version_authoring WHERE version_id = $1`, [rev.version_id])).rows[0];
      assert(a.reviewed_by === f.actor && a.reviewed_at && a.cl && a.cl.correct_key_verified === true, 'review record');
    }));
  await test('PUB-2 publish from DRAFT / approve without checklist / illegal transitions → error', () =>
    rolledBack(async () => {
      const f = await fixture();
      const v = (await importBatch(c, f, [mkItem(1)])).items[0].version_id;
      await expectError(`SELECT public.fn_publish_question_version($1, $2)`, [v, f.actor], 'QF_ILLEGAL_TRANSITION');
      await expectError(`SELECT public.fn_transition_question_version($1, 'APPROVED', $2, NULL, NULL)`, [v, f.actor], 'QF_ILLEGAL_TRANSITION');
      await c.query(`SELECT public.fn_transition_question_version($1, 'IN_REVIEW', $2, NULL, NULL)`, [v, f.actor]);
      await expectError(`SELECT public.fn_transition_question_version($1, 'APPROVED', $2, NULL, '{}'::jsonb)`, [v, f.actor], 'QF_CHECKLIST_REQUIRED');
      await expectError(`SELECT public.fn_transition_question_version($1, 'REJECTED', $2, NULL, NULL)`, [v, f.actor], 'QF_NOTES_REQUIRED');
    }));

  // ---------------- Immutability ----------------
  await test('IMM-1 published text/option/answer/authoring frozen; direct publish & lifecycle forgery blocked', () =>
    rolledBack(async () => {
      const f = await fixture();
      const r = await importBatch(c, f, [mkItem(1)]);
      const v = r.items[0].version_id;
      await reviewAndPublish(f, v);
      await expectError(`UPDATE public.question_versions SET question_text = 'tampered' WHERE id = $1`, [v], 'QF_IMMUTABLE_VERSION');
      await expectError(`UPDATE public.question_options SET option_text = 'tampered' WHERE question_version_id = $1`, [v], 'QF_IMMUTABLE_VERSION');
      await expectError(`UPDATE public.question_answers SET correct_option_key = 'A' WHERE question_version_id = $1`, [v], 'QF_IMMUTABLE_VERSION');
      await expectError(`DELETE FROM public.question_options WHERE question_version_id = $1`, [v], 'QF_IMMUTABLE_VERSION');
      await expectError(`UPDATE public.question_version_authoring SET review_notes = 'tampered' WHERE version_id = $1`, [v], 'QF_IMMUTABLE_VERSION');
      await expectError(`UPDATE public.question_version_authoring SET authoring_metadata = '{}'::jsonb WHERE version_id = $1`, [v], 'QF_IMMUTABLE_VERSION');
      await expectError(`DELETE FROM public.question_version_authoring WHERE version_id = $1`, [v], 'QF_IMMUTABLE_VERSION');
      await expectError(`UPDATE public.question_versions SET is_current = false WHERE id = $1`, [v], 'QF_IMMUTABLE_VERSION');
      const draft = await importBatch(c, f, [mkItem(7)]);
      await expectError(`UPDATE public.questions SET status = 'published' WHERE id = $1`, [draft.items[0].question_id], 'QF_PUBLICATION_VIOLATION');
      await expectError(`UPDATE public.question_versions SET lifecycle_status = 'PUBLISHED' WHERE id = $1`, [draft.items[0].version_id], 'QF_LIFECYCLE_VIOLATION');
      // FK cascade-style nulling of created_by on a frozen authoring row is allowed (auth user deletion).
      await c.query(`UPDATE public.question_version_authoring SET created_by = NULL WHERE version_id = $1`, [v]);
    }));

  // ---------------- Selection ----------------
  await test('SEL-1 drafts never selectable: mock_questions guard + practice-session generator', () =>
    rolledBack(async () => {
      const f = await fixture();
      const d = await importBatch(c, f, [mkItem(1)]);
      const draftV = d.items[0].version_id;
      const mq = (await c.query(`SELECT mock_test_id, mock_section_id FROM public.mock_questions LIMIT 1`)).rows[0];
      assert(mq, 'need an existing mock_questions row to test the guard');
      await expectError(`INSERT INTO public.mock_questions (mock_test_id, mock_section_id, question_version_id, question_order) VALUES ($1, $2, $3, 99999)`, [mq.mock_test_id, mq.mock_section_id, draftV], 'QF_UNPUBLISHED_VERSION_IN_TEST');
      // Practice generator as the authenticated user (auth.uid() via JWT claims).
      await c.query('SAVEPOINT p');
      await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: f.actor, role: 'authenticated' })]);
      await c.query('SET LOCAL ROLE authenticated');
      const res = (await c.query(`SELECT public.fn_generate_custom_practice_session('qf1-probe', 'MIXED', ARRAY[$1::uuid], 100, NULL) AS r`, [f.topicId])).rows[0].r;
      await c.query('ROLLBACK TO SAVEPOINT p');
      const ids = (res && res.question_version_ids) || [];
      assert(!ids.includes(draftV), 'draft selected into practice session');
      if (ids.length > 0) {
        const nonPub = (await c.query(`SELECT count(*)::int n FROM public.question_versions WHERE id = ANY($1::uuid[]) AND NOT (lifecycle_status = 'PUBLISHED' AND is_current)`, [ids])).rows[0].n;
        assert(nonPub === 0, `${nonPub} non-published selected`);
      }
      // GATE-HYGIENE-1: the topic probe can legitimately select nothing; a manual selection of the draft's question plus
      // published questions must select ≥ 1 version and never the draft (non-vacuous proof)
      const pubQs = (await c.query(`SELECT q.id FROM public.questions q JOIN public.question_versions v ON v.question_id = q.id AND v.is_current AND v.lifecycle_status = 'PUBLISHED' WHERE q.status = 'published' LIMIT 3`)).rows.map((r) => r.id);
      assert(pubQs.length >= 1, 'no published question to probe with');
      await c.query('SAVEPOINT p2');
      await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: f.actor, role: 'authenticated' })]);
      await c.query('SET LOCAL ROLE authenticated');
      const man = (await c.query(`SELECT public.fn_generate_custom_practice_session('qf1-probe', 'MANUAL_SELECTION', '{}'::uuid[], 100, $1::uuid[]) AS r`, [[d.items[0].question_id, ...pubQs]])).rows[0].r;
      await c.query('ROLLBACK TO SAVEPOINT p2');
      const manIds = (man && man.question_version_ids) || [];
      assert(manIds.length >= 1 && !manIds.includes(draftV), `manual selection: ${manIds.length} selected, draft ${manIds.includes(draftV) ? 'SELECTED' : 'excluded'}`);
      if (!ids.length) lines.push('  WARN  VACUOUS (0 items): SEL-1 topic probe selected nothing (the manual probe above is the non-vacuous proof)');
    }));

  // ---------------- RLS (SQL role simulation with real draft rows) ----------------
  await test('RLS-SQL anon: no DRAFT versions/options, no answers, no authoring, no draft mappings; published readable', () =>
    rolledBack(async () => {
      const f = await fixture();
      assert(f.examId, 'need an active exam for mapping test');
      const d = await importBatch(c, f, [mkItem(1)], { target_exam_id: f.examId });
      const v = d.items[0].version_id;
      const q = d.items[0].question_id;
      for (const role of ['anon', 'authenticated']) {
        assert((await asRole(role, `SELECT count(*)::int n FROM public.question_versions WHERE id = $1`, [v])).rows[0].n === 0, `${role} sees DRAFT version`);
        assert((await asRole(role, `SELECT count(*)::int n FROM public.question_options WHERE question_version_id = $1`, [v])).rows[0].n === 0, `${role} sees DRAFT options`);
        assert((await asRole(role, `SELECT count(*)::int n FROM public.exam_question_mappings WHERE question_id = $1`, [q])).rows[0].n === 0, `${role} sees draft mapping`);
        assert(await unreadable(role, `SELECT count(*)::int n FROM public.question_answers`), `${role} reads answers`);
        await c.query('SAVEPOINT a');
        let denied = false;
        try {
          await c.query(`SET LOCAL ROLE ${role}`);
          await c.query(`SELECT count(*) FROM public.question_version_authoring`);
        } catch (e) {
          denied = e.code === '42501';
        }
        await c.query('ROLLBACK TO SAVEPOINT a');
        assert(denied, `${role} can read question_version_authoring`);
      }
      // Publish it: version/options/mapping become readable, answers & authoring still not.
      await reviewAndPublish(f, v);
      assert((await asRole('anon', `SELECT count(*)::int n FROM public.question_versions WHERE id = $1`, [v])).rows[0].n === 1, 'anon cannot read PUBLISHED version');
      assert((await asRole('anon', `SELECT count(*)::int n FROM public.question_options WHERE question_version_id = $1`, [v])).rows[0].n === 4, 'anon cannot read PUBLISHED options');
      assert((await asRole('anon', `SELECT count(*)::int n FROM public.exam_question_mappings WHERE question_id = $1`, [q])).rows[0].n === 1, 'anon cannot read published mapping');
      assert(await unreadable('anon', `SELECT count(*)::int n FROM public.question_answers WHERE question_version_id = $1`, [v]), 'anon reads answer of published');
    }));
  await test('A1-DB question_versions exposes no authoring/review columns', async () => {
    const cols = (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='question_versions'`)).rows.map((r) => r.column_name);
    const forbidden = ['origin', 'contract_version', 'context_hash', 'authoring_metadata', 'import_batch_id', 'created_by', 'reviewed_by', 'reviewed_at', 'review_notes'];
    assert(forbidden.every((f) => !cols.includes(f)), `found: ${forbidden.filter((f) => cols.includes(f))}`);
    assert(cols.includes('lifecycle_status') && cols.includes('content_checksum'));
  });
  // Amended by QB-KEY-1 to decision #54 (least privilege; architect ruling 2026-10-17). Previously every function had to be
  // SECURITY DEFINER with search_path exactly 'public, pg_temp'. Now:
  //   - search_path pinned to '' or 'public, pg_temp' (unpinned or anything else → FAIL);
  //   - SECURITY DEFINER required iff a client role (anon / authenticated / PUBLIC) has EXECUTE; INVOKER only without one;
  //   - not executable by anon / authenticated (unchanged) and not by PUBLIC (new).
  await test('SEC-DB all QF functions (#54): search_path pinned (\'\' or public, pg_temp); DEFINER required iff a client role has EXECUTE; not executable by anon/authenticated/PUBLIC', async () => {
    const rows = (await c.query(`SELECT p.proname, p.prosecdef, p.proconfig,
        has_function_privilege('anon', p.oid, 'EXECUTE') anon_x, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_x,
        has_function_privilege('public', p.oid, 'EXECUTE') public_x
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND (p.proname LIKE 'fn_qf_%' OR p.proname IN ('fn_question_stem_checksum','fn_import_question_drafts','fn_update_question_draft','fn_create_question_revision','fn_transition_question_version','fn_publish_question_version'))`)).rows;
    assert(rows.length >= 12, `found ${rows.length}`);
    rows.forEach((r) => {
      assert((r.proconfig || []).some((x) => x === 'search_path=public, pg_temp' || x === 'search_path=""'), `${r.proname} search_path not pinned to '' or public, pg_temp`);
      if (r.anon_x || r.auth_x || r.public_x) assert(r.prosecdef, `${r.proname} client-executable but not SECURITY DEFINER`);
      assert(!r.anon_x && !r.auth_x, `${r.proname} executable by anon/authenticated`);
      assert(!r.public_x, `${r.proname} executable by PUBLIC`);
    });
  });

  // ---------------- RLS via the public API (anon / publishable key) ----------------
  const anonKey = env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (anonKey) {
    await test('RLS-API anon client: no DRAFT/IN_REVIEW versions, no answers, no authoring; published readable; select(*) has no review fields', async () => {
      // supabase-js realtime needs a WebSocket global on Node < 22 (same stub as the other suites; realtime unused).
      if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = class DummyWebSocket {};
      const { createClient } = require('@supabase/supabase-js');
      const anon = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      // GATE-HYGIENE-1: each "not readable" probe is only meaningful if such rows exist — count them as the owner first
      const exist = (await c.query(`SELECT (SELECT count(*)::int FROM public.question_versions WHERE lifecycle_status NOT IN ('PUBLISHED', 'SUPERSEDED')) drafts,
          (SELECT count(*)::int FROM public.question_answers) answers, (SELECT count(*)::int FROM public.question_version_authoring) authoring,
          (SELECT count(*)::int FROM public.question_import_batches) batches`)).rows[0];
      for (const [k, n] of Object.entries(exist)) if (n === 0) lines.push(`  WARN  VACUOUS (0 items): RLS-API ${k} — no such rows exist, so "not readable by anon" proves nothing for it`);
      assert(exist.answers >= 1, 'no question_answers rows: the answers-hidden probe would be vacuous');
      const drafts = await anon.from('question_versions').select('id').neq('lifecycle_status', 'PUBLISHED').neq('lifecycle_status', 'SUPERSEDED').limit(5);
      assert(!drafts.error && drafts.data.length === 0, `non-published readable: ${drafts.error ? drafts.error.message : drafts.data.length}`);
      const pub = await anon.from('question_versions').select('*').eq('lifecycle_status', 'PUBLISHED').limit(1);
      assert(!pub.error && pub.data.length === 1, `published not readable: ${pub.error ? pub.error.message : 0}`);
      const keys = Object.keys(pub.data[0]);
      assert(!keys.some((k) => ['origin', 'authoring_metadata', 'review_notes', 'reviewed_by', 'created_by', 'import_batch_id', 'context_hash'].includes(k)), `review fields exposed: ${keys}`);
      const opts = await anon.from('question_options').select('id').eq('question_version_id', pub.data[0].id);
      assert(!opts.error && opts.data.length > 0, 'published options not readable');
      const ans = await anon.from('question_answers').select('question_version_id').limit(1);
      assert(ans.error || ans.data.length === 0, 'answers readable');
      const auth = await anon.from('question_version_authoring').select('version_id').limit(1);
      assert(auth.error || auth.data.length === 0, 'authoring readable');
      const batches = await anon.from('question_import_batches').select('id').limit(1);
      assert(batches.error || batches.data.length === 0, 'batches readable');
    });
  } else {
    // GATE-HYGIENE-1: a missing key must not turn the anon RLS proof into a silent skip
    await test('RLS-API anon client (requires the publishable / anon key)', async () => { throw new Error('no publishable/anon key in .env.local — the anon RLS proof cannot run'); });
  }

  const after = await counts(c);
  await test('BASE-1 baseline counts identical before/after the suite', async () => {
    const diff = BASELINE_TABLES.filter((t) => before[t] !== after[t]);
    assert(diff.length === 0, `changed: ${diff.map((t) => `${t} ${before[t]}→${after[t]}`).join(', ')}`);
  });

  await c.end();
  console.log(lines.join('\n'));
  console.log('Baseline (before → after):');
  BASELINE_TABLES.forEach((t) => console.log(`  ${t}: ${before[t]} → ${after[t]}`));
  console.log(`\nQF-1 DB suite: ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('Suite crashed:', redact(e && e.message ? e.message : e));
  process.exit(1);
});
