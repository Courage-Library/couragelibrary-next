#!/usr/bin/env node
/**
 * CA4-LESSONS (CA-4 + SYLLABUS-PROMPT-2, migration 119) — prompt templates, node lessons, the translation flow and the
 * intake contract v3 AS THE REAL ROLES, every write inside a rolled-back transaction (withLiveTransaction → safeBegin:
 * LIVE-LOCK-SAFETY + rollback on stop; one connection per chunk; a dropped connection re-runs the whole chunk once,
 * assertions are never retried). service_role for the RPCs (the app's path); anon / student / staff / admin sessions for
 * reads and denials. QA fixtures only (the QA topic of qa-number-system-concept-lesson, the QA exam qa-syllabus-test).
 *   --pre   119 is NOT applied: each chunk first runs the migration inside its own transaction (then everything rolls back);
 *           chunk A also proves the existing documents / versions / intake rows untouched (hash before = after).
 *   (none)  the live gate after apply: refuses unless 119 is APPLIED.
 * Chunks: A structure / grants / seeds = TS constants · B templates: checker = TS, draft → activate → frozen, audited ·
 * C parity SQL = lib/lessons/parity.ts · D node lessons + translation lifecycle · E intake v3 (+ v2 still accepted) →
 * DRAFT syllabus with origin / avg_questions / based_on · Z nothing left.
 * Run: node scripts/live/test_ca4_lessons.cjs [--pre]
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const FILE = '20261028000119_ca4_templates_node_lessons_hindi.sql';
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};
const { templateProblems } = require(path.join(ROOT, 'lib/prompts/template.ts'));
const { parityErrors } = require(path.join(ROOT, 'lib/lessons/parity.ts'));
const { lessonExample } = require(path.join(ROOT, 'lib/prompts/lesson-prompt.ts'));
const { validateIntakePayload } = require(path.join(ROOT, 'lib/syllabus/intake-contract.ts'));
const { matchIntake } = require(path.join(ROOT, 'lib/syllabus/tree-matcher.ts'));
const { seeds, sha } = require(path.join(ROOT, 'scripts/content/ca4-template-seeds.cjs'));
const LESSON_V2_SHA = sha(require(path.join(ROOT, 'lib/prompts/lesson-template-v2.ts')).LESSON_TEMPLATE_V2);
// the pinned later versions of each type that has them (LESSON-PROMPT-2; SYLLABUS-CONTRACT-3.1 v2; INTAKE-CONCEPTS-AS-OUTLINE v3)
const PINNED = {
  // LESSON-NODE-ID-1: v3 = v2 + the node-id / no-citation rules (scripts/content/lesson-prompt-3.cjs)
  LESSON: { 2: LESSON_V2_SHA, 3: sha(require(path.join(ROOT, 'lib/prompts/lesson-template-v3.ts')).LESSON_TEMPLATE_V3), 4: sha(require(path.join(ROOT, 'lib/prompts/lesson-template-v4.ts')).LESSON_TEMPLATE_V4) },
  SYLLABUS: {
    2: sha(require(path.join(ROOT, 'lib/syllabus/syllabus-template-v2.ts')).SYLLABUS_TEMPLATE_V2),
    3: sha(require(path.join(ROOT, 'lib/syllabus/syllabus-template-v3.ts')).SYLLABUS_TEMPLATE_V3),
  },
};

let ok = true;
let pending = [];
const chk = (n, cond, info) => { pending.push({ cond, line: `${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + (info ?? '')}` }); };
const flush = () => { for (const r of pending) { if (!r.cond) ok = false; console.log(r.line); } pending = []; };
const isConnectionError = (e) => !!e && (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNREFUSED'].includes(e.code)
  || /Connection terminated|connection error|not queryable/i.test(String(e.message)));
const ZERO = '00000000-0000-0000-0000-000000000000';
const ACTOR_EMAIL = 'ca4-smoke@courage-library.test';
const EXISTING_HASH = `select
    (select left(md5(coalesce(string_agg(id::text||'|'||coalesce(learning_unit_id::text,'-')||'|'||canonical_slug||'|'||document_type||'|'||status||'|'||coalesce(current_published_version_id::text,'-'), ',' order by id), '')), 16) from public.learning_documents) docs,
    (select left(md5(coalesce(string_agg(id::text||'|'||version_number||'|'||review_status||'|'||is_published::text||'|'||language||'|'||is_current::text||'|'||coalesce(blocks_hash,'-'), ',' order by id), '')), 16) from public.document_versions) versions,
    (select left(md5(coalesce(string_agg(id::text||'|'||status||'|'||contract_version||'|'||coalesce(source_url,'-')||'|'||coalesce(as_of_date::text,'-'), ',' order by id), '')), 16) from public.syllabus_intake_sessions) intakes`;

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  let c = new Client(target.pg); c.on('error', () => {}); await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  try {
    const [led] = await q(`select count(*)::int n from public.schema_migration_ledger where filename = $1 and status = 'APPLIED'`, [FILE]);
    if (PRE && led.n > 0) throw new Error(`--pre refused: ${FILE} is already APPLIED`);
    if (!PRE && led.n === 0) throw new Error(`${FILE} is not applied (use --pre for the pre-apply smoke)`);
    const ids = {};
    for (const [k, e] of [['admin', 'qa-admin@courage-library.test'], ['staff', 'qa-staff@courage-library.test'], ['student', 'qa-student@courage-library.test']]) ids[k] = (await q(`select id from auth.users where email = $1`, [e]))[0]?.id;
    const [qa] = await q(`select d.id doc_id, u.topic_id from public.learning_documents d join public.learning_units u on u.id = d.learning_unit_id where d.canonical_slug = 'qa-number-system-concept-lesson'`);
    const [qaExam] = await q(`select id, slug from public.exams where slug = 'qa-syllabus-test'`);
    if (!ids.admin || !ids.staff || !ids.student || !qa || !qaExam) throw new Error('QA users / QA lesson / QA exam missing');
    // GATE-SCOPE-SWEEP (2026-10-29): Z-1 counts node lessons on the nodes THIS smoke used (the owner writes node lessons)
    const touchedNodes = [];

    const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', ${lit(cl)}, true)`);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: String(e.message).slice(0, 240) }; }
    };
    const SVC = { role: 'service_role' };
    const ANON = { role: 'anon' };
    const STU = { sub: ids.student, role: 'authenticated', aal: 'aal1', app_metadata: {} };
    const STAFF = { sub: ids.staff, role: 'authenticated', aal: 'aal2', app_metadata: { role: 'staff' } };
    const ADMIN = { sub: ids.admin, role: 'authenticated', aal: 'aal2', app_metadata: { role: 'admin' } };
    const svc = (sql, p) => as('service_role', SVC, sql, p);
    const chunk = async (fn) => {
      for (let attempt = 1; ; attempt++) {
        pending = [];
        try {
          await c.end().catch(() => {});
          c = new Client(target.pg); c.on('error', () => {}); await c.connect();
          await withLiveTransaction(c, async () => { await fn(); });
          flush();
          return;
        } catch (e) {
          if (attempt === 1 && isConnectionError(e)) { console.log(`RETRY chunk after a dropped connection (${e.code || 'terminated'}) — partial results discarded`); continue; }
          throw e;
        }
      }
    };
    const migrate = async () => { if (PRE) await c.query(MIGRATION_SQL); };

    // ---------------- A: structure, existing rows untouched, grants, seeds
    await chunk(async () => {
      const before = PRE ? (await q(EXISTING_HASH))[0] : null;
      await migrate();
      const after = (await q(EXISTING_HASH))[0];
      if (PRE) chk('A-0 every existing learning document, document version and intake session is untouched by 119 (hash before = after)', JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }));
      const rows = await q(`select t.template_type, t.version, t.status, t.body_sha256,
          (select count(*)::int from public.admin_audit_logs a where a.target_id::text = t.id::text and a.action_type = 'PROMPT_TEMPLATE_DRAFT_SAVE') saved
          from public.prompt_templates t order by t.template_type, t.version`);
      const want = Object.fromEntries(seeds().map(([t, b]) => [t, sha(b)]));
      // GATE-SCOPE-SWEEP (2026-10-29): the owner edits prompts in /admin/prompts — the gate pins what the CODE shipped (v1
      // seeds; LESSON v2; SYLLABUS v2, v3), and checks the invariants for any later owner version instead of its text:
      // saved through the audited RPC; per type exactly ONE ACTIVE; every other version RETIRED or a DRAFT
      const v1s = rows.filter((r) => r.version === 1);
      const pinnedTop = (t) => Math.max(1, ...Object.keys(PINNED[t] || {}).map(Number));
      const shipped = rows.filter((r) => r.version > 1 && r.version <= pinnedTop(r.template_type));
      const owner = rows.filter((r) => r.version > pinnedTop(r.template_type));
      const types = [...new Set(rows.map((r) => r.template_type))];
      const seedOk = v1s.length === 3 && v1s.every((r) => want[r.template_type] === r.body_sha256)
        && shipped.every((r) => PINNED[r.template_type] && PINNED[r.template_type][r.version] === r.body_sha256)
        && owner.every((r) => r.saved >= 1)
        && types.every((t) => rows.filter((r) => r.template_type === t && r.status === 'ACTIVE').length === 1)
        && rows.every((r) => ['ACTIVE', 'RETIRED', 'DRAFT'].includes(r.status));
      chk(`A-1 seeds: SYLLABUS (the owner-approved SYLLABUS-PROMPT-2 text), LESSON, TRANSLATE_HI — v1 bodies byte-identical to the TS constants (sha256); the shipped later versions are pinned texts; ${owner.length} later owner version(s) saved through the audited RPC; per type exactly one ACTIVE, the rest RETIRED / DRAFT; no QUESTION v1`,
        seedOk, JSON.stringify({ rows: rows.map((r) => [r.template_type, r.version, r.status, r.body_sha256.slice(0, 12)]), want: Object.fromEntries(Object.entries(want).map(([k, v]) => [k, v.slice(0, 12)])) }));
      if (!PRE) {
        // SYLLABUS-CONTRACT-3.1 then INTAKE-CONCEPTS-AS-OUTLINE (2026-10-28): SYLLABUS v3 must be THE active SYLLABUS
        // template, v1 + v2 RETIRED; v2 and v3 each saved and activated once through the audited RPCs
        const syl = (await q(`select t.id, t.version, t.status, t.body_sha256,
              (select count(*)::int from public.admin_audit_logs a where a.target_id::text = t.id::text and a.action_type = 'PROMPT_TEMPLATE_DRAFT_SAVE') saved,
              (select count(*)::int from public.admin_audit_logs a where a.target_id::text = t.id::text and a.action_type = 'PROMPT_TEMPLATE_ACTIVATE') activated
            from public.prompt_templates t where t.template_type = 'SYLLABUS' order by t.version`));
        const [v1, v2, v3] = syl;
        // GATE-SCOPE-SWEEP: v3 stays ACTIVE until the owner activates a later SYLLABUS version (then v3 is RETIRED)
        const laterActive = syl.slice(3).some((r) => r.status === 'ACTIVE');
        chk('A-1b SYLLABUS v3 (the INTAKE-CONCEPTS-AS-OUTLINE text, pinned sha256) is the ACTIVE SYLLABUS template unless the owner activated a later one; v1 + v2 RETIRED; v2 and v3 saved + activated through the audited RPCs',
          syl.length >= 3 && v1.status === 'RETIRED' && v2.status === 'RETIRED' && v2.body_sha256 === PINNED.SYLLABUS[2] && v3.status === (laterActive ? 'RETIRED' : 'ACTIVE') && v3.body_sha256 === PINNED.SYLLABUS[3]
            && [v2, v3].every((r) => r.saved === 1 && r.activated === 1),
          JSON.stringify(syl.map((r) => [r.version, r.status, r.body_sha256.slice(0, 12), r.saved, r.activated])));
      }
      const adminRead = await as('authenticated', ADMIN, `select count(*)::int n from public.prompt_templates`);
      const staffRead = await as('authenticated', STAFF, `select count(*)::int n from public.prompt_templates`);
      const stuRead = await as('authenticated', STU, `select count(*)::int n from public.prompt_templates`);
      const anonRead = await as('anon', ANON, `select count(*)::int n from public.prompt_templates`);
      const adminWrite = await as('authenticated', ADMIN, `insert into public.prompt_templates (template_type, version, body, created_by_email) values ('QUESTION', 1, '{{TOPIC_NAME}} {{QUESTION_SPEC}}', 'x@example.test')`);
      chk('A-2 prompt_templates: admin reads every row (RLS), staff / student read 0, anon denied (42501); no client writes, not even admin (42501)',
        adminRead.ok && adminRead.rows[0].n === rows.length && rows.length >= 3 && staffRead.ok && staffRead.rows[0].n === 0 && stuRead.ok && stuRead.rows[0].n === 0 && anonRead.code === '42501' && adminWrite.code === '42501',
        JSON.stringify({ adminRead, staffRead, stuRead, anonRead: anonRead.code, adminWrite: adminWrite.code }));
      const calls = [
        `select public.fn_prompt_template_save_draft('LESSON', 'x', null, null, 'x@example.test')`,
        `select public.fn_prompt_template_activate('${ZERO}', null, 'x@example.test')`,
        `select public.fn_prompt_template_problems('LESSON', 'x')`,
        `select public.fn_lesson_create_node_document('${ZERO}', 'FREE', null, 'x@example.test')`,
        `select public.fn_lesson_parity_errors('[]'::jsonb, '[]'::jsonb)`,
        `select public.fn_lesson_save_draft('${ZERO}', 'hi', '{}'::jsonb, '[]'::jsonb, 'HUMAN', null, 'x@example.test')`,
        `select public.fn_syllabus_intake_create('${ZERO}', null, null, null, null, '{}'::jsonb, '[]'::jsonb, null, 'x@example.test')`,
      ];
      const denials = [];
      for (const [role, cl] of [['anon', ANON], ['authenticated', STU], ['authenticated', STAFF], ['authenticated', ADMIN]]) {
        for (const sql of calls) { const r = await as(role, cl, sql); if (r.ok || r.code !== '42501') denials.push(`${cl.app_metadata?.role || role}: ${sql.slice(14, 50)} → ${r.ok ? 'ALLOWED' : r.code}`); }
      }
      chk('A-3 anon / student / staff / admin sessions: no EXECUTE on the template, node-lesson, parity, lesson and intake RPCs (42501); service_role only', denials.length === 0, denials.join(' | '));
      const [f] = await q(`select count(*)::int n, count(*) filter (where prosecdef)::int secdef, count(*) filter (where proconfig::text like '%search_path=%')::int pinned
        from pg_proc where pronamespace = 'public'::regnamespace and proname in ('fn_prompt_template_problems','fn_prompt_template_guard','fn_prompt_template_audit',
          'fn_prompt_template_save_draft','fn_prompt_template_activate','fn_learning_document_node_guard','fn_lesson_create_node_document','fn_lesson__numbers',
          'fn_lesson__len','fn_lesson__answer_key','fn_lesson_parity_errors','fn_lesson_save_draft','fn_lesson_publish','fn_syllabus_intake_create','fn_syllabus_intake_import')`);
      chk('A-4 the 15 new / redefined functions: none SECURITY DEFINER, all pin search_path', f.n === 15 && f.secdef === 0 && f.pinned === 15, JSON.stringify(f));
      const [g] = await q(`select has_column_privilege('anon','public.document_versions','translated_from_version_id','SELECT') a,
          has_column_privilege('authenticated','public.document_versions','translated_from_version_id','SELECT') u,
          has_column_privilege('authenticated','public.document_versions','blocks','SELECT') ub,
          has_column_privilege('anon','public.learning_documents','node_id','SELECT') an`);
      chk('A-5 lesson bodies and translation provenance stay server-only (no client SELECT on blocks / translated_from_version_id); node_id is readable like the rest of a published document',
        !g.a && !g.u && !g.ub && g.an, JSON.stringify(g));
    });

    // ---------------- B: templates
    await chunk(async () => {
      await migrate();
      const vectors = [
        ['SYLLABUS', '{{EXAM_NAME}} {{EXAM_SLUG}} {{CYCLE}} {{TIER_JSON}}'],
        ['SYLLABUS', '{{EXAM_NAME}} {{EXAM_SLUG}} {{CYCLE}}'],
        ['SYLLABUS', '{{EXAM_NAME}} {{EXAM_SLUG}} {{CYCLE}} {{TIER_JSON}} {{#TIER}}only {{TIER}}{{/TIER}}'],
        ['SYLLABUS', '{{EXAM_NAME}} {{EXAM_SLUG}} {{CYCLE}} {{TIER_JSON}} {{#TIER}}open'],
        ['SYLLABUS', '{{EXAM_NAME}} {{EXAM_SLUG}} {{CYCLE}} {{TIER_JSON}} {{NODE_NAME}}'],
        ['LESSON', '{{NODE_NAME}} {{NODE_PATH}} {{EXAM_COVERAGE}} {{BLOCK_SPEC}} {{EXAMPLE_JSON}}'],
        ['TRANSLATE_HI', '{{GLOSSARY}} {{EN_JSON}}'],
        ['TRANSLATE_HI', '{{GLOSSARY}} {{EN_JSON}} {{BLOCK_RULES}} \u0007'],
        ['QUESTION', '   '],
        ...seeds().map(([t, b]) => [t, b]),
      ];
      const bad = [];
      for (const [t, b] of vectors) {
        const r = await svc(`select cardinality(public.fn_prompt_template_problems($1, $2)) n`, [t, b]);
        const tsN = templateProblems(t, b).length;
        if (!r.ok || (r.rows[0].n === 0) !== (tsN === 0)) bad.push(`${t}:${JSON.stringify(b).slice(0, 40)} sql=${r.ok ? r.rows[0].n : r.msg} ts=${tsN}`);
      }
      chk(`B-1 fn_prompt_template_problems agrees with templateProblems on ${vectors.length} bodies (required / unknown placeholders, sections, control characters, the 3 seeds)`, bad.length === 0, bad.join(' | '));

      const save = (type, body) => svc(`select public.fn_prompt_template_save_draft($1, $2, 'smoke', null, $3) r`, [type, body, ACTOR_EMAIL]);
      const invalid = await save('LESSON', 'no placeholders');
      // the current ACTIVE LESSON (v1 seed before LESSON-PROMPT-2, v2 after) is the base; the draft takes the next version
      const [v1] = await q(`select id, body, version, (select max(version) from public.prompt_templates where template_type = 'LESSON') maxv from public.prompt_templates where template_type = 'LESSON' and status = 'ACTIVE'`);
      const d1 = await save('LESSON', v1.body + '\nCA4 smoke edit.');
      const d2 = await save('LESSON', v1.body + '\nCA4 smoke edit, again.');
      const draftId = d1.ok ? d1.rows[0].r.id : ZERO;
      const act = await svc(`select public.fn_prompt_template_activate($1, null, $2) r`, [draftId, ACTOR_EMAIL]);
      const [st] = await q(`select (select status from public.prompt_templates where id = $1) v1, (select status from public.prompt_templates where id = $2) v2,
          (select version from public.prompt_templates where id = $2) v2n,
          (select count(*)::int from public.prompt_templates where template_type = 'LESSON' and status = 'ACTIVE') active,
          (select count(*)::int from public.admin_audit_logs where actor_email = $3 and action_type like 'PROMPT_TEMPLATE_%') audit`, [v1.id, draftId, ACTOR_EMAIL]);
      const frozen = await svc(`update public.prompt_templates set body = body || ' x' where id = $1`, [draftId]);
      const back = await svc(`select public.fn_prompt_template_activate($1, null, $2) r`, [v1.id, ACTOR_EMAIL]);
      const [st2] = await q(`select status from public.prompt_templates where id = $1`, [v1.id]);
      chk('B-2 lifecycle: an invalid body is refused (PROMPT_TEMPLATE); saving twice updates ONE draft (the next version); activate → the draft ACTIVE, the previous ACTIVE RETIRED, one ACTIVE per type; an ACTIVE body is frozen; the previous can be re-activated; audited (2 saves + 2 activations)',
        !invalid.ok && /PROMPT_TEMPLATE/.test(invalid.msg) && d1.ok && d2.ok && d1.rows[0].r.id === d2.rows[0].r.id && act.ok && st.v1 === 'RETIRED' && st.v2 === 'ACTIVE' && st.v2n === v1.maxv + 1
        && st.active === 1 && !frozen.ok && /cannot change/.test(frozen.msg) && back.ok && st2.status === 'ACTIVE' && st.audit === 3,
        JSON.stringify({ invalid: invalid.msg, d1: d1.ok, d2: d2.ok, act: act.ok, st, frozen: frozen.msg, back: back.ok, st2 }));
    });

    // ---------------- C: parity — the database agrees with lib/lessons/parity.ts
    await chunk(async () => {
      await migrate();
      const en = lessonExample(ZERO).blocks;
      const clone = () => JSON.parse(JSON.stringify(en));
      const mutate = (fn) => { const x = clone(); fn(x); return x; };
      const cases = [
        ['identity', clone()],
        ['words-only', mutate((x) => { x[0].text = 'अर्थ'; x[1].text = 'जब कोई मान **a%** बदलता है'; })],
        ['formula', mutate((x) => { x[2].latex = 'a + b'; })],
        ['step-math', mutate((x) => { x[3].steps[0].math = '10 + 20'; })],
        ['answers', mutate((x) => { x[6].options[0].correct = true; })],
        ['numbers', mutate((x) => { x[3].answer = '33% increase'; })],
        ['devanagari-digits', mutate((x) => { x[3].question = 'एक मूल्य १०% बढ़ता है और फिर 20%.'; })],
        ['block-count', clone().slice(1)],
        ['order', mutate((x) => { const t = x[0]; x[0] = x[1]; x[1] = t; })],
        ['callout', mutate((x) => { x[4].variant = 'INFO'; })],
        ['memory-count', mutate((x) => { x[9].points.pop(); })],
        ['practice-link', mutate((x) => { x[7].mode = 'PYQ'; })],
        ['summary-formulas', mutate((x) => { x[8].formulas = []; })],
      ];
      const bad = [];
      for (const [name, hi] of cases) {
        const r = await svc(`select public.fn_lesson_parity_errors($1::jsonb, $2::jsonb) e`, [JSON.stringify(en), JSON.stringify(hi)]);
        const want = parityErrors(en, hi).map((e) => `${e.index}:${e.code}`).sort().join(',');
        const got = r.ok ? r.rows[0].e.map((e) => `${e.index}:${e.code}`).sort().join(',') : r.msg;
        if (got !== want) bad.push(`${name}: sql=${got} ts=${want}`);
      }
      chk(`C-1 fn_lesson_parity_errors = parityErrors on ${cases.length} cases (identity, words only, formula, step math, answers, numbers, Devanagari digits, block count, order, callout, Memory Lock count, practice link, summary formulas) — same index + code`,
        bad.length === 0, bad.join(' | '));
    });

    // ---------------- D: node lessons + the translation lifecycle
    await chunk(async () => {
      await migrate();
      // the node: GATE-SCOPE-SWEEP (2026-10-29) — the smoke's OWN topic under the QA topic's subject, made in this rolled-back
      // chunk (a real topic "without a node lesson" disappears as the owner writes lessons; the QA topic itself carries
      // the CA-6 published QA lesson, scripts/content/ca6-qa-lesson.cjs)
      const [ln] = await q(`insert into public.canonical_taxonomy_nodes (parent_id, node_type, name, slug, metadata)
          select root_subject_id, 'TOPIC', 'CA4 Smoke Lesson Topic', 'ca4-smoke-lesson-topic', '{"source":"CA4_SMOKE"}'::jsonb
            from public.canonical_taxonomy_nodes where id = $1 returning id`, [qa.topic_id]);
      touchedNodes.push(ln.id);
      const lessonNode = ln.id;
      const [subject] = await q(`select root_subject_id id from public.canonical_taxonomy_nodes where id = $1`, [lessonNode]);
      const mk = (node) => svc(`select public.fn_lesson_create_node_document($1, 'FREE', null, $2) r`, [node, ACTOR_EMAIL]);
      const d1 = await mk(lessonNode);
      const d2 = await mk(lessonNode);
      const subj = await mk(subject.id);
      const docId = d1.ok ? d1.rows[0].r.document_id : ZERO;
      const [doc] = await q(`select document_type, node_id, learning_unit_id, status, canonical_slug from public.learning_documents where id = $1`, [docId]);
      const owner = await svc(`insert into public.learning_documents (learning_unit_id, node_id, canonical_slug, document_type, status) select learning_unit_id, $2, 'ca4-smoke-bad-owner', 'CONCEPT_LESSON', 'DRAFT' from public.learning_documents where id = $1`, [qa.doc_id, lessonNode]);
      chk('D-1 node lesson document: created once per node (a second call returns the same id), DRAFT, no learning unit; a SUBJECT node is refused; a legacy-type document cannot carry a node (owner check)',
        d1.ok && d1.rows[0].r.created === true && d2.ok && d2.rows[0].r.created === false && d2.rows[0].r.document_id === docId && doc.document_type === 'NODE_LESSON'
        && doc.node_id === lessonNode && doc.learning_unit_id === null && doc.status === 'DRAFT' && !subj.ok && /TOPIC, SUBTOPIC or CONCEPT/.test(subj.msg) && !owner.ok,
        JSON.stringify({ d1, d2, subj: subj.msg, owner: owner.msg, doc }));

      const ex = lessonExample(lessonNode);
      const save = (lang, meta, blocks) => svc(`select public.fn_lesson_save_draft($1, $2, $3::jsonb, $4::jsonb, 'AI_ASSISTED', null, $5) r`, [docId, lang, JSON.stringify(meta), JSON.stringify(blocks), ACTOR_EMAIL]);
      const hiEarly = await save('hi', ex.meta, ex.blocks);
      const en1 = await save('en', ex.meta, ex.blocks);
      const pub1 = en1.ok ? await svc(`select public.fn_lesson_publish($1, null, $2)`, [en1.rows[0].r.version_id, ACTOR_EMAIL]) : en1;
      const [docAfter] = await q(`select status, current_published_version_id from public.learning_documents where id = $1`, [docId]);
      const anonSees = await as('anon', ANON, `select id, node_id from public.learning_documents where id = $1`, [docId]);
      chk('D-2 English master: a translation before any published English is refused; publishing English publishes the node lesson (status PUBLISHED, pointer set); anon can read the published document row',
        !hiEarly.ok && /English lesson first/.test(hiEarly.msg) && pub1.ok && docAfter.status === 'PUBLISHED' && docAfter.current_published_version_id === en1.rows[0].r.version_id
        && anonSees.ok && anonSees.rows.length === 1 && anonSees.rows[0].node_id === lessonNode, JSON.stringify({ hiEarly: hiEarly.msg, pub1, docAfter, anonSees }));

      const hiBlocks = JSON.parse(JSON.stringify(ex.blocks));
      hiBlocks[0].text = 'इसका अर्थ';
      hiBlocks[1].text = 'जब कोई मान **a%** बदलता है और फिर **b%**, तो दूसरा बदलाव नए मान पर लगता है।';
      const broken = JSON.parse(JSON.stringify(hiBlocks));
      broken[2].latex = 'a + b';
      const hiBad = await save('hi', { title: 'क्रमिक प्रतिशत परिवर्तन' }, broken);
      const hiOk = await save('hi', { title: 'क्रमिक प्रतिशत परिवर्तन' }, hiBlocks);
      const hiId = hiOk.ok ? hiOk.rows[0].r.version_id : ZERO;
      const [prov] = await q(`select translated_from_version_id t from public.document_versions where id = $1`, [hiId]);
      const stuProv = await as('authenticated', STU, `select translated_from_version_id from public.document_versions where id = $1`, [hiId]);
      chk('D-3 translation draft: a changed formula is refused by the DB (LESSON_PARITY); a words-only translation saves with provenance = the current English version; a student cannot read the provenance column (42501)',
        !hiBad.ok && /LESSON_PARITY/.test(hiBad.msg) && hiOk.ok && prov.t === en1.rows[0].r.version_id && stuProv.code === '42501', JSON.stringify({ hiBad: hiBad.msg, hiOk, prov, stuProv: stuProv.code }));

      // the English master moves on before the translation is published → the old translation draft cannot publish
      const en2 = await save('en', { ...ex.meta, title: 'Successive Percentage Change (revised)' }, ex.blocks);
      const pub2 = en2.ok ? await svc(`select public.fn_lesson_publish($1, null, $2)`, [en2.rows[0].r.version_id, ACTOR_EMAIL]) : en2;
      const stale = await svc(`select public.fn_lesson_publish($1, null, $2)`, [hiId, ACTOR_EMAIL]);
      const resave = await save('hi', { title: 'क्रमिक प्रतिशत परिवर्तन' }, hiBlocks);
      const hiPub = resave.ok ? await svc(`select public.fn_lesson_publish($1, null, $2)`, [resave.rows[0].r.version_id, ACTOR_EMAIL]) : resave;
      const [cur] = await q(`select count(*) filter (where is_current and language = 'en')::int en, count(*) filter (where is_current and language = 'hi')::int hi,
          (select translated_from_version_id from public.document_versions where document_id = $1 and language = 'hi' and is_current) hi_from,
          (select count(*)::int from public.admin_audit_logs where actor_email = $2 and action_type = 'LESSON_NODE_DOCUMENT_CREATE') created
          from public.document_versions where document_id = $1`, [docId, ACTOR_EMAIL]);
      const mut = await svc(`update public.document_versions set translated_from_version_id = null where id = $1`, [resave.ok ? resave.rows[0].r.version_id : ZERO]);
      chk('D-4 English revised → the older translation draft cannot publish ("English lesson changed"); saved again against the current English it publishes (one current per language, provenance = English v2); provenance is frozen once published; node creation audited once',
        pub2.ok && !stale.ok && /English lesson changed/.test(stale.msg) && resave.ok && hiPub.ok && cur.en === 1 && cur.hi === 1 && cur.hi_from === en2.rows[0].r.version_id && cur.created === 1
        && !mut.ok && /Cannot mutate published/.test(mut.msg), JSON.stringify({ pub2: pub2.ok, stale: stale.msg, hiPub, cur, mut: mut.msg }));
    });

    // ---------------- E: intake contract v3 (SYLLABUS-PROMPT-2) + v2 still accepted
    await chunk(async () => {
      await migrate();
      const base = {
        contract_version: 3, exam: qaExam.slug, cycle_year: null, tier: 'ca4-smoke', based_on: 'CA4 smoke: QA notification 2026 + PYQs 2016-2025',
        papers: [{ name: 'CA4 Smoke Paper', questions: 100, marks: 200, duration_minutes: 60, negative_marking: '0.50 per wrong answer',
          subjects: [{ name: 'CA4 Smoke Subject', name_hi: 'सीए4 विषय', questions: 25, topics: [
            { name: 'CA4 Smoke Topic', origin: 'OFFICIAL', weightage_tier: 'HIGH_YIELD', avg_questions: 2,
              subtopics: [{ name: 'CA4 Smoke Subtopic', origin: 'PYQ_TREND', concepts: [{ name: 'CA4 Smoke Concept', origin: 'EXPANDED', headings: ['Deeper'] }] }] },
          ] }] }],
      };
      const v = validateIntakePayload(JSON.stringify(base), { examSlug: qaExam.slug, cycleYear: null, tier: 'ca4-smoke' });
      const matched = v.ok ? matchIntake(v.items, [], []) : [];
      const create = (payload, items, src, asOf) => svc(`select public.fn_syllabus_intake_create($1, null, 'ca4-smoke', $2, $3, $4, $5, null, $6) id`, [qaExam.id, src, asOf, payload, JSON.stringify(items), ACTOR_EMAIL]);
      const noOrigin = await create(base, matched.map((x) => (x.level === 'SUBTOPIC' ? { ...x, origin: null } : x)), null, null);
      const noBasis = await create({ ...base, based_on: undefined }, matched, null, null);
      const created = await create(base, matched, 'https://example.test/reference', null);
      const sid = created.ok ? created.rows[0].id : ZERO;
      const [sess] = await q(`select contract_version, based_on, source_url, as_of_date from public.syllabus_intake_sessions where id = $1`, [sid]);
      const its = await q(`select raw_name, level, origin, avg_questions, duration_minutes, negative_marking from public.syllabus_intake_items where session_id = $1 order by item_key`, [sid]);
      const by = Object.fromEntries(its.map((x) => [x.raw_name, x]));
      chk('E-1 v3 intake: a topic / subtopic / concept without origin and a payload without based_on are refused; the valid v3 stores based_on (no official link / date needed), every origin, avg_questions and the paper duration / negative marking',
        v.ok && !noOrigin.ok && /no origin/.test(noOrigin.msg) && !noBasis.ok && /based_on/.test(noBasis.msg) && created.ok && sess.contract_version === 3 && sess.based_on === base.based_on
        && sess.as_of_date === null && by['CA4 Smoke Topic'].origin === 'OFFICIAL' && Number(by['CA4 Smoke Topic'].avg_questions) === 2 && by['CA4 Smoke Subtopic'].origin === 'PYQ_TREND'
        && by['CA4 Smoke Concept'].origin === 'EXPANDED' && by['CA4 Smoke Paper'].duration_minutes === 60 && by['CA4 Smoke Paper'].negative_marking === '0.50 per wrong answer',
        JSON.stringify({ v: v.ok ? v.stats : v.errors, noOrigin: noOrigin.msg, noBasis: noBasis.msg, created, sess, its }));

      // decide every item (parents first, all new) → one DRAFT syllabus with the v3 metadata
      const order = ['SUBJECT', 'TOPIC', 'SUBTOPIC', 'CONCEPT'];
      const items = await q(`select id, level from public.syllabus_intake_items where session_id = $1 and level <> 'PAPER'`, [sid]);
      let decided = 0;
      for (const lvl of order) for (const it of items.filter((x) => x.level === lvl)) {
        const r = await svc(`select public.fn_syllabus_intake_decide($1, 'APPROVE_NEW', null, null, $2)`, [it.id, ACTOR_EMAIL]);
        if (r.ok) decided++;
      }
      const imp = await svc(`select public.fn_syllabus_intake_import($1, null, null, $2) r`, [sid, ACTOR_EMAIL]);
      const vid = imp.ok ? imp.rows[0].r.version_id : ZERO;
      const [ver] = await q(`select status, tier, metadata -> 'intake' m from public.exam_syllabus_versions where id = $1`, [vid]);
      const nodes = await q(`select node_kind, raw_title, metadata from public.exam_syllabus_nodes where syllabus_version_id = $1`, [vid]);
      const unit = nodes.find((n) => n.node_kind === 'UNIT');
      const paper = nodes.find((n) => n.node_kind === 'PAPER');
      chk('E-2 import: every item decided by the owner (4 approvals), one DRAFT syllabus; version metadata carries contract 3 + based_on + the reference link; the topic unit carries origin, avg_questions and the origins below it; the paper its duration + negative marking',
        decided === 4 && imp.ok && ver.status === 'DRAFT' && ver.m.contract_version === 3 && ver.m.based_on === base.based_on && ver.m.source_url === 'https://example.test/reference'
        && unit && unit.metadata.origin === 'OFFICIAL' && Number(unit.metadata.avg_questions) === 2 && unit.metadata.origins_below.PYQ_TREND === 1 && unit.metadata.origins_below.EXPANDED === 1
        && paper && paper.metadata.duration_minutes === 60 && paper.metadata.negative_marking === '0.50 per wrong answer',
        JSON.stringify({ decided, imp, ver, unit: unit?.metadata, paper: paper?.metadata }));

      // v2 (an older paste) is still accepted; it still needs the official link + date
      const v2 = { contract_version: 2, exam: qaExam.slug, cycle_year: null, tier: 'ca4-smoke-v2', source_url: 'https://example.test/notice.pdf', as_of: '2026-01-01',
        papers: [{ name: 'CA4 V2 Paper', subjects: [{ name: 'CA4 V2 Subject', topics: [{ name: 'CA4 V2 Topic' }] }] }] };
      const v2v = validateIntakePayload(JSON.stringify(v2), { examSlug: qaExam.slug, cycleYear: null, tier: 'ca4-smoke-v2' });
      const v2items = v2v.ok ? matchIntake(v2v.items, [], []) : [];
      const v2ok = await svc(`select public.fn_syllabus_intake_create($1, null, 'ca4-smoke-v2', $2, $3, $4, $5, null, $6) id`, [qaExam.id, v2.source_url, v2.as_of, v2, JSON.stringify(v2items), ACTOR_EMAIL]);
      const v2noSrc = await svc(`select public.fn_syllabus_intake_create($1, null, 'ca4-smoke-v2', null, null, $2, $3, null, $4) id`, [qaExam.id, v2, JSON.stringify(v2items), ACTOR_EMAIL]);
      const v2origin = await svc(`select public.fn_syllabus_intake_create($1, null, 'ca4-smoke-v2', $2, $3, $4, $5, null, $6) id`, [qaExam.id, v2.source_url, v2.as_of, v2, JSON.stringify(v2items.map((x) => (x.level === 'TOPIC' ? { ...x, origin: 'OFFICIAL' } : x))), ACTOR_EMAIL]);
      const [s2] = v2ok.ok ? await q(`select contract_version, based_on from public.syllabus_intake_sessions where id = $1`, [v2ok.rows[0].id]) : [{}];
      chk('E-3 v2 still accepted (contract 2, no based_on); a v2 intake without the official link / date and a v2 item carrying an origin are refused',
        v2v.ok && v2ok.ok && s2.contract_version === 2 && s2.based_on === null && !v2noSrc.ok && /official link and date/.test(v2noSrc.msg) && !v2origin.ok && /carries no origin/.test(v2origin.msg),
        JSON.stringify({ v2v: v2v.ok, v2ok, s2, v2noSrc: v2noSrc.msg, v2origin: v2origin.msg }));
    });

    // ---------------- Z: nothing left behind
    const [z] = await q(`select (select count(*)::int from public.admin_audit_logs where actor_email = $1) audit,
        (select count(*)::int from public.learning_documents where document_type = 'NODE_LESSON' and node_id = any($2::uuid[])) node_docs,
        (select count(*)::int from public.syllabus_intake_sessions where tier like 'ca4-smoke%') intakes,
        (select count(*)::int from public.canonical_taxonomy_nodes where name like 'CA4 Smoke %') nodes,
        to_regclass('public.prompt_templates') is not null t`, [ACTOR_EMAIL, touchedNodes]);
    chk(`Z-1 nothing persisted: 0 smoke audit rows / node lessons / intakes / tree nodes${PRE ? '; the migration itself rolled back (no prompt_templates)' : ''}`,
      z.audit === 0 && z.node_docs === 0 && z.intakes === 0 && z.nodes === 0 && z.t === !PRE, JSON.stringify(z));
    flush();
  } catch (e) {
    ok = false;
    flush();
    console.log(`FAIL CA4 smoke aborted — ${red(String(e.message)).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'CA4-LESSONS: ALL PASS' : 'CA4-LESSONS: FAILURES');
  process.exit(ok ? 0 : 1);
})();
