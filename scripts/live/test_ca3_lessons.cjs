#!/usr/bin/env node
/**
 * CA3-LESSONS (CA-3, migration 117) — lesson blocks in the DB AS THE REAL ROLES, every write inside a rolled-back
 * transaction (withLiveTransaction → safeBegin: LIVE-LOCK-SAFETY + rollback on stop; one connection per chunk; a dropped
 * connection re-runs the whole chunk once, assertions are never retried). service_role for the lesson RPCs (the app's
 * path); anon / the QA student / staff / admin sessions for reads and denials. QA documents only.
 *   --pre   117 is NOT applied: each chunk first runs the migration inside its own transaction (then everything rolls back);
 *           chunk A also proves the legacy rows untouched (hash of every legacy column before / after, same transaction).
 *   (none)  the live gate after apply: refuses unless 117 is APPLIED.
 * Chunks: A structure / grants / bodies never client-readable · B the SQL validator = lib/lessons/blocks.ts (vectors +
 * a converted v1 lesson) · C lifecycle: draft → publish → current per language, frozen when published · D the MDX path
 * retired (118; with --pre118 the migration runs inside the chunk) · Z nothing left.
 * Run: node scripts/live/test_ca3_lessons.cjs [--pre]
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
// --pre118: 117 applied, 118 not yet: chunk D runs migration 118 inside its own transaction (then rolls back)
const PRE118 = process.argv.includes('--pre118');
const FILE118 = '20261027000118_ca3_retire_mdx.sql';
const MIGRATION_118 = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE118), 'utf8');
const FILE = '20261027000117_ca3_lesson_blocks.sql';
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
const { validateLesson, VALIDATION_VECTORS } = require(path.join(ROOT, 'lib/lessons/blocks.ts'));
const { convertV1 } = require(path.join(ROOT, 'lib/lessons/convert-v1.ts'));

// a synthetic v1 spec in the legacy shape (the two real QA specs are converted by scripts/content/ca3-convert-legacy-lessons.cjs)
const SPEC = {
  schemaVersion: '1.0.0', metadata: { title: 'CA3 smoke: Percentage basics', estimatedReadingMinutes: 6 },
  learningObjectives: ['Convert a fraction to a percentage'],
  sections: [{ id: 'sec-1', title: 'Fractions to percentages', contentMarkdown: 'Multiply by **100**.\n\n- 1/2 = 50%\n- 1/4 = 25%', calloutNotes: [{ variant: 'TIP', title: 'Shortcut', body: 'Learn 1/8 = 12.5%.' }] }],
  formulaBlocks: [{ id: 'f1', name: 'Percentage', latexFormula: '\\frac{part}{whole} \\times 100', variableDefinitions: [{ symbol: 'part', meaning: 'the share' }], applicableConditions: ['whole is not zero'] }],
  workedExamples: [{ id: 'w1', difficulty: 'EASY', problemText: 'What is 3/5 as a percentage?', stepByStepSolution: [{ stepNumber: 1, explanation: 'Multiply by 100.', mathSnippet: '3/5 \\times 100 = 60' }] }],
  cognitiveTraps: [{ trapType: 'CALCULATION_SLIP', misconception: 'Dividing by 100', correctApproach: 'Multiply by 100' }],
  quickChecks: [{ id: 'q1', prompt: '1/2 as a percentage?', options: [{ id: 'a', text: '50%', isCorrect: true, feedbackExplanation: 'Right.' }, { id: 'b', text: '2%', isCorrect: false }] }],
  revisionSummary: { keyTakeaways: ['Multiply by 100'], coreFormulas: [], speedRules: ['1/8 = 12.5%'] },
};

let ok = true;
let pending = [];
const chk = (n, cond, info) => { pending.push({ cond, line: `${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + (info ?? '')}` }); };
const flush = () => { for (const r of pending) { if (!r.cond) ok = false; console.log(r.line); } pending = []; };
const isConnectionError = (e) => !!e && (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNREFUSED'].includes(e.code)
  || /Connection terminated|connection error|not queryable/i.test(String(e.message)));
const ZERO = '00000000-0000-0000-0000-000000000000';
const ACTOR_EMAIL = 'ca3-smoke@courage-library.test';
const LEGACY_HASH = `select count(*)::int n, left(md5(coalesce(string_agg(id::text||'|'||version_number||'|'||review_status||'|'||is_published::text||'|'||coalesce(source_spec_hash,'-')||'|'||coalesce(compiled_artifact_hash,'-')||'|'||coalesce(source_spec_storage_key,'-')||'|'||coalesce(compiled_artifact_storage_key,'-'), ',' order by id), '')), 16) h from public.document_versions where source_spec_storage_key is not null`;

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
    const [doc] = await q(`select id, learning_unit_id from public.learning_documents where canonical_slug = 'qa-number-system-concept-lesson'`);
    if (!ids.admin || !ids.staff || !ids.student || !doc) throw new Error('QA users / QA lesson missing');

    const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', ${lit(cl)}, true)`);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: String(e.message).slice(0, 200) }; }
    };
    const SVC = { role: 'service_role' };
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
    const lesson = convertV1(SPEC);

    // ---------------- A: structure, legacy rows untouched, grants, bodies never client-readable
    await chunk(async () => {
      const before = PRE ? (await q(LEGACY_HASH))[0] : null;
      const clientBefore = PRE ? (await q(`select has_table_privilege('anon','public.document_versions','SELECT') a, has_table_privilege('authenticated','public.document_versions','SELECT') u`))[0] : null;
      await migrate();
      const after = (await q(LEGACY_HASH))[0];
      if (PRE) chk(`A-0 the ${after.n} legacy versions are untouched by 117 (every legacy column, hash before = after)`, JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }));
      const [s] = await q(`select
          (select count(*)::int from information_schema.columns where table_schema='public' and table_name='document_versions' and column_name in ('content_format','language','lesson_meta','blocks','blocks_hash','blocks_schema_version','is_current')) cols,
          (select count(*)::int from public.document_versions where content_format = 'LEGACY_MDX' and language = 'en' and source_spec_storage_key is not null) legacy,
          (select count(*)::int from public.learning_documents d join public.document_versions v on v.id = d.current_published_version_id and v.is_current) pointers,
          (select count(*)::int from public.learning_documents where current_published_version_id is not null) docs_with_pointer,
          (select count(*)::int from pg_indexes where indexname = 'uq_document_versions_one_current_per_language') idx,
          (select public from storage.buckets where id = 'lesson-images') bucket_public`);
      chk(`A-1 structure: 7 new columns; legacy rows = LEGACY_MDX + en; every current pointer is the is_current version (${s.pointers}/${s.docs_with_pointer}); one current per language; lesson-images bucket private`,
        s.cols === 7 && s.legacy === after.n && s.pointers === s.docs_with_pointer && s.idx === 1 && s.bucket_public === false, JSON.stringify(s));
      const [g] = await q(`select has_column_privilege('anon','public.document_versions','blocks','SELECT') ab, has_column_privilege('authenticated','public.document_versions','blocks','SELECT') ub,
          has_column_privilege('anon','public.document_versions','lesson_meta','SELECT') am, has_column_privilege('authenticated','public.document_versions','lesson_meta','SELECT') um,
          has_column_privilege('anon','public.document_versions','review_status','SELECT') ar, has_column_privilege('authenticated','public.document_versions','review_status','SELECT') ur`);
      const stuRead = await as('authenticated', STU, `select blocks from public.document_versions limit 1`);
      const anonRead = await as('anon', { role: 'anon' }, `select lesson_meta from public.document_versions limit 1`);
      chk('A-2 bodies are never client-readable: anon / authenticated have no SELECT on blocks / lesson_meta (direct select → 42501); the other columns keep the access they had',
        !g.ab && !g.ub && !g.am && !g.um && stuRead.code === '42501' && anonRead.code === '42501' && (!PRE || (g.ar === clientBefore.a && g.ur === clientBefore.u)),
        JSON.stringify({ g, clientBefore, stuRead: stuRead.code, anonRead: anonRead.code }));
      const calls = [
        `select public.fn_lesson_save_draft('${ZERO}', 'en', '{}'::jsonb, '[]'::jsonb, 'HUMAN', null, 'x@example.test')`,
        `select public.fn_lesson_publish('${ZERO}', null, 'x@example.test')`,
        `select public.fn_lesson_blocks_errors('{}'::jsonb, '[]'::jsonb)`,
      ];
      const denials = [];
      for (const [role, cl] of [['anon', { role: 'anon' }], ['authenticated', STU], ['authenticated', STAFF], ['authenticated', ADMIN]]) {
        for (const sql of calls) { const r = await as(role, cl, sql); if (r.ok || r.code !== '42501') denials.push(`${cl.app_metadata?.role || role}: ${sql.slice(14, 40)} → ${r.ok ? 'ALLOWED' : r.code}`); }
      }
      chk('A-3 anon / student / staff / admin sessions: no EXECUTE on the lesson RPCs or the validator (42501); service_role only', denials.length === 0, denials.join(' | '));
      const [f] = await q(`select count(*)::int n, count(*) filter (where prosecdef)::int secdef, count(*) filter (where proconfig::text like '%search_path=%')::int pinned
        from pg_proc where pronamespace = 'public'::regnamespace and proname in ('fn_lesson__text_problem','fn_lesson__latex_problem','fn_lesson__str','fn_lesson__strlist','fn_lesson__keys',
          'fn_lesson__oneof','fn_lesson_blocks_errors','fn_lesson_version_blocks_guard','fn_lesson_audit','fn_lesson_save_draft','fn_lesson_publish')`);
      chk('A-4 the 11 new functions: none SECURITY DEFINER, all pin search_path', f.n === 11 && f.secdef === 0 && f.pinned === 11, JSON.stringify(f));
    });

    // ---------------- B: the database validator gives the same verdict as lib/lessons/blocks.ts
    await chunk(async () => {
      await migrate();
      const cases = [...VALIDATION_VECTORS, { name: 'converted-v1', meta: lesson.meta, blocks: lesson.blocks, ok: true }];
      const bad = [];
      for (const v of cases) {
        const r = await svc(`select jsonb_array_length(public.fn_lesson_blocks_errors($1::jsonb, $2::jsonb)) n`, [JSON.stringify(v.meta), JSON.stringify(v.blocks)]);
        const ts = validateLesson(v.meta, v.blocks).ok;
        if (!r.ok || (r.rows[0].n === 0) !== v.ok || ts !== v.ok) bad.push(`${v.name}: sql=${r.ok ? r.rows[0].n : r.msg} ts=${ts} want=${v.ok}`);
      }
      chk(`B-1 fn_lesson_blocks_errors = validateLesson on ${cases.length} cases (HTML, URLs, markup links, unknown types / keys, duplicate ids, LaTeX allow-list, alt text, quick-check, counts, a converted v1 lesson)`, bad.length === 0, bad.join(' | '));
    });

    // ---------------- C: lifecycle on a QA document
    await chunk(async () => {
      await migrate();
      const save = (lang, meta, blocks) => svc(`select public.fn_lesson_save_draft($1, $2, $3::jsonb, $4::jsonb, 'LEGACY_CONVERSION', null, $5) r`, [doc.id, lang, JSON.stringify(meta), JSON.stringify(blocks), ACTOR_EMAIL]);
      const unsafe = await save('en', lesson.meta, [{ id: 'x', type: 'paragraph', text: '<img src=x onerror=alert(1)>' }]);
      const d1 = await save('en', lesson.meta, lesson.blocks);
      const d2 = await save('en', { ...lesson.meta, title: 'CA3 smoke: Percentage basics (edited)' }, lesson.blocks);
      const v1 = d1.ok ? d1.rows[0].r : {};
      const v2 = d2.ok ? d2.rows[0].r : {};
      const [row] = await q(`select content_format, language, review_status, is_published, is_current, blocks_schema_version, blocks_hash,
          blocks_hash = encode(sha256(convert_to(lesson_meta::text || E'\\n' || blocks::text, 'UTF8')), 'hex') hash_ok, source_spec_storage_key is null no_storage from public.document_versions where id = $1`, [v1.version_id]);
      chk('C-1 save draft: unsafe blocks refused by the DB (LESSON_BLOCKS_INVALID); the draft is BLOCKS / en / DRAFT with the DB-computed hash, no Storage keys; saving again updates the same draft',
        !unsafe.ok && /LESSON_BLOCKS_INVALID/.test(unsafe.msg) && d1.ok && d2.ok && v1.version_id === v2.version_id && row.content_format === 'BLOCKS' && row.language === 'en'
        && row.review_status === 'DRAFT' && !row.is_published && row.hash_ok && row.no_storage && v2.blocks_hash !== v1.blocks_hash,
        JSON.stringify({ unsafe, d1, d2, row }));

      const [legacyBefore] = await q(`select id from public.document_versions where document_id = $1 and is_current and language = 'en'`, [doc.id]);
      const pub = await svc(`select public.fn_lesson_publish($1, null, $2) r`, [v1.version_id, ACTOR_EMAIL]);
      const [st] = await q(`select (select current_published_version_id from public.learning_documents where id = $1) ptr,
          (select is_current from public.document_versions where id = $2) new_cur, (select is_current from public.document_versions where id = $3) old_cur,
          (select count(*)::int from public.admin_audit_logs where actor_email = $4 and action_type in ('LESSON_DRAFT_SAVE','LESSON_PUBLISH')) audit`, [doc.id, v1.version_id, legacyBefore?.id ?? ZERO, ACTOR_EMAIL]);
      chk('C-2 publish: the BLOCKS version becomes current en + the document pointer; the legacy version is demoted (kept, still published); audited (2 saves + 1 publish)',
        pub.ok && st.ptr === v1.version_id && st.new_cur === true && st.old_cur === false && st.audit === 3, JSON.stringify({ pub, st }));

      const mutate = await svc(`update public.document_versions set blocks = '[{"id":"z","type":"paragraph","text":"changed"}]'::jsonb where id = $1`, [v1.version_id]);
      const del = await svc(`delete from public.document_versions where id = $1`, [v1.version_id]);
      const again = await svc(`select public.fn_lesson_publish($1, null, $2)`, [v1.version_id, ACTOR_EMAIL]);
      chk('C-3 a published BLOCKS version is frozen: changing its blocks, deleting it, publishing it again → refused',
        !mutate.ok && /Cannot mutate published/.test(mutate.msg) && !del.ok && /Cannot delete published/.test(del.msg) && !again.ok && /already published/.test(again.msg),
        JSON.stringify({ mutate, del, again }));

      const hi = await save('hi', { title: 'CA3 smoke hi' }, [{ id: 'a', type: 'paragraph', text: 'Hindi draft text (QA).' }]);
      const hiPub = hi.ok ? await svc(`select public.fn_lesson_publish($1, null, $2) r`, [hi.rows[0].r.version_id, ACTOR_EMAIL]) : hi;
      const [cur] = await q(`select count(*) filter (where is_current)::int cur, count(*) filter (where is_current and language = 'hi')::int hi from public.document_versions where document_id = $1`, [doc.id]);
      const [lone] = await q(`insert into public.learning_documents (learning_unit_id, canonical_slug, document_type, status, access_level) values ($1, 'ca3-smoke-lone-doc', 'CONCEPT_LESSON', 'DRAFT', 'FREE') returning id`, [doc.learning_unit_id]);
      const loneHi = await svc(`select public.fn_lesson_save_draft($1, 'hi', '{"title":"T"}'::jsonb, '[{"id":"a","type":"paragraph","text":"x"}]'::jsonb, 'HUMAN', null, $2) r`, [lone.id, ACTOR_EMAIL]);
      const loneHiPub = loneHi.ok ? await svc(`select public.fn_lesson_publish($1, null, $2)`, [loneHi.rows[0].r.version_id, ACTOR_EMAIL]) : loneHi;
      const [ptr] = await q(`select current_published_version_id from public.learning_documents where id = $1`, [doc.id]);
      chk('C-4 languages: a Hindi version publishes beside English (one current per language; the en pointer stays); Hindi without a current English master is refused',
        hiPub.ok && cur.cur === 2 && cur.hi === 1 && ptr.current_published_version_id === v1.version_id && !loneHiPub.ok && /English version first/.test(loneHiPub.msg),
        JSON.stringify({ hiPub, cur, loneHiPub }));
    });

    // ---------------- D: the MDX path is retired (118)
    const [l118] = await q(`select count(*)::int n from public.schema_migration_ledger where filename = $1 and status = 'APPLIED'`, [FILE118]);
    if (l118.n > 0 || PRE118) {
      await chunk(async () => {
        await migrate();
        if (PRE118) await c.query(MIGRATION_118);
        const [legacy] = await q(`select v.id, v.document_id from public.document_versions v where v.content_format = 'LEGACY_MDX' order by v.id limit 1`);
        const hex = 'b'.repeat(64);
        const ins = await svc(`insert into public.document_versions (document_id, version_number, schema_version, compiler_version, component_contract_version,
            source_spec_storage_key, source_spec_hash, compiled_artifact_storage_key, compiled_artifact_hash, author_type, review_status, is_published)
            values ($1, 99, '1', '1', '1', 'x/spec', $2, 'x/mdx', $2, 'HUMAN', 'DRAFT', false)`, [doc.id, hex]);
        const edit = legacy ? await svc(`update public.document_versions set review_status = 'APPROVED' where id = $1`, [legacy.id]) : { ok: false, msg: 'no legacy row' };
        const promote = legacy ? await svc(`update public.document_versions set is_current = true where id = $1`, [legacy.id]) : { ok: false, msg: 'no legacy row' };
        const ptr = legacy ? await svc(`update public.learning_documents set current_published_version_id = $1 where id = $2`, [legacy.id, legacy.document_id]) : { ok: false, msg: 'no legacy row' };
        const d = await svc(`select public.fn_lesson_save_draft($1, 'en', $2::jsonb, $3::jsonb, 'HUMAN', null, $4) r`, [doc.id, JSON.stringify(lesson.meta), JSON.stringify(lesson.blocks), ACTOR_EMAIL]);
        const pub = d.ok ? await svc(`select public.fn_lesson_publish($1, null, $2)`, [d.rows[0].r.version_id, ACTOR_EMAIL]) : d;
        const [cnt] = await q(`select count(*) filter (where is_current and content_format = 'LEGACY_MDX')::int legacy_current,
            (select count(*)::int from public.learning_documents ld join public.document_versions v on v.id = ld.current_published_version_id where v.content_format <> 'BLOCKS') legacy_pointers
            from public.document_versions`);
        chk('D-1 MDX retired (118): a new legacy version, editing / re-promoting a legacy version and pointing a document back at it are all refused (MDX_PATH_RETIRED); block lessons still save + publish; no legacy version is current',
          !ins.ok && /MDX_PATH_RETIRED/.test(ins.msg) && !edit.ok && /MDX_PATH_RETIRED|Cannot mutate published/.test(edit.msg) && !promote.ok && /MDX_PATH_RETIRED/.test(promote.msg)
          && !ptr.ok && /MDX_PATH_RETIRED/.test(ptr.msg) && d.ok && pub.ok && cnt.legacy_current === 0 && cnt.legacy_pointers === 0,
          JSON.stringify({ ins, edit, promote, ptr, d: d.ok, pub: pub.ok, cnt }));
      });
    }

    // ---------------- Z: nothing left behind
    const [z] = await q(`select (select count(*)::int from public.admin_audit_logs where actor_email = $1) audit,
        (select count(*)::int from public.learning_documents where canonical_slug like 'ca3-smoke-%') docs,
        to_regclass('public.document_versions') is not null t,
        (select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'document_versions' and column_name = 'blocks') blocks_col`, [ACTOR_EMAIL]);
    chk(`Z-1 nothing persisted: 0 smoke audit rows / documents${PRE ? '; the migration itself rolled back (no blocks column)' : ''}`,
      z.audit === 0 && z.docs === 0 && z.blocks_col === (PRE ? 0 : 1), JSON.stringify(z));
    flush();
  } catch (e) {
    ok = false;
    flush();
    console.log(`FAIL CA3 smoke aborted — ${red(String(e.message)).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'CA3-LESSONS: ALL PASS' : 'CA3-LESSONS: FAILURES');
  process.exit(ok ? 0 : 1);
})();
