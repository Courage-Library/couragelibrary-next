#!/usr/bin/env node
/**
 * EXAM-NOTE-PROMPT-1 (migration 127) — live gate. Every chunk is ONE rolled-back transaction (LIVE-LOCK-SAFETY:
 * withLiveTransaction); one connection per chunk; a dropped connection re-runs the chunk once. REAL-ROLE VERIFY: the
 * template RPCs as service_role (the server), as the authenticated QA admin and as anon (both must be refused).
 *   --pre   127 is NOT applied: each chunk first runs the migration inside its own transaction (then rolls back)
 *   A-1 catalog: template_type CHECK includes EXAM_NOTE; the checker has the EXAM_NOTE branch; save_draft accepts it;
 *       EXECUTE on save_draft / activate = service_role only; neither is SECURITY DEFINER
 *   B-1 service_role saves the code v1 EXAM_NOTE template (lib/prompts/exam-note-prompt.ts) as a DRAFT v1 (DB hash =
 *       sha256 of the code text) and activates it → ACTIVE; 2 PROMPT_TEMPLATE_* audit rows by the gate actor
 *   B-2 refused: an EXAM_NOTE body without {{EXAM_LINES}} (22023, the guard trigger), an unknown type (22023)
 *   B-3 authenticated QA admin and anon cannot execute save_draft (42501); the admin can READ the template (RLS)
 *   Z-1 nothing persisted: the EXAM_NOTE row count is unchanged, 0 audit rows by the gate actor (v1 activation is a
 *       later, separate step — DEPLOY-BEFORE-ACTIVATE)
 * Run: node scripts/live/test_exam_note_prompt1.cjs [--pre]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ts = require('typescript');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const FILE = '20261031000127_exam_note_template.sql';
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');
const ACTOR = 'exam-note-prompt1-smoke@courage-library.test';

// the code v1 text (TS, "@/" imports)
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) { return origResolve.call(this, r.startsWith('@/') ? path.join(ROOT, r.slice(2)) : r, ...rest); };
require.extensions['.ts'] = (m, fn) => m._compile(ts.transpileModule(fs.readFileSync(fn, 'utf8'), { fileName: fn, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, fn);
const { EXAM_NOTE_TEMPLATE_V1 } = require(path.join(ROOT, 'lib/prompts/exam-note-prompt.ts'));
const V1_SHA = crypto.createHash('sha256').update(EXAM_NOTE_TEMPLATE_V1, 'utf8').digest('hex');

let ok = true;
let pending = [];
const chk = (n, cond, info) => { pending.push({ cond, line: `${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + (info ?? '')}` }); };
const flush = () => { for (const r of pending) { if (!r.cond) ok = false; console.log(r.line); } pending = []; };
const isConnectionError = (e) => !!e && (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNREFUSED', 'EAI_AGAIN'].includes(e.code) || /Connection terminated|connection error|not queryable/i.test(String(e.message)));

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  let c = new Client(target.pg); c.on('error', () => {}); await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  try {
    const [led] = await q(`select count(*)::int n from public.schema_migration_ledger where filename = $1 and status = 'APPLIED'`, [FILE]);
    if (PRE && led.n > 0) throw new Error(`--pre refused: ${FILE} is already APPLIED`);
    if (!PRE && led.n === 0) throw new Error(`${FILE} is not applied (use --pre for the pre-apply smoke)`);
    const [adm] = await q(`select id from auth.users where email = 'qa-admin@courage-library.test'`);
    if (!adm) throw new Error('QA admin missing');
    const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', ${lit(cl)}, true)`);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: String(e.message).slice(0, 240) }; }
    };
    const ANON = { role: 'anon' };
    const ADMIN = { sub: adm.id, role: 'authenticated', aal: 'aal2', app_metadata: { role: 'admin' } };
    const svc = (sql, p) => as('service_role', { role: 'service_role' }, sql, p);
    const chunk = async (fn) => {
      for (let attempt = 1; ; attempt++) {
        pending = [];
        try {
          await c.end().catch(() => {});
          c = new Client(target.pg); c.on('error', () => {}); await c.connect();
          await withLiveTransaction(c, async () => { if (PRE) await c.query(MIGRATION_SQL); await fn(); });
          flush();
          return;
        } catch (e) {
          if (attempt === 1 && isConnectionError(e)) { console.log(`RETRY chunk after a dropped connection (${e.code || 'terminated'})`); continue; }
          throw e;
        }
      }
    };
    // baseline (after the real v1 activation EXAM_NOTE rows exist; the gate must stay true then)
    const [base] = await q(`select count(*)::int n, coalesce(max(version), 0)::int v from public.prompt_templates where template_type = 'EXAM_NOTE'`);
    // bound parameters (lit() JSON-encodes: it is for the JWT claims only)
    const SAVE = `select public.fn_prompt_template_save_draft($1, $2, 'EXAM-NOTE-PROMPT-1 smoke', null, $3) r`;
    const save = (role, cl, type, body) => as(role, cl, SAVE, [type, body, ACTOR]);

    await chunk(async () => {
      const [k] = await q(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'prompt_templates_template_type_check'`);
      const fns = await q(`select p.proname, p.prosecdef, p.prosrc,
          has_function_privilege('service_role', p.oid, 'EXECUTE') s, has_function_privilege('authenticated', p.oid, 'EXECUTE') a, has_function_privilege('anon', p.oid, 'EXECUTE') n
        from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.proname in ('fn_prompt_template_save_draft', 'fn_prompt_template_activate', 'fn_prompt_template_problems')`);
      const f = Object.fromEntries(fns.map((x) => [x.proname, x]));
      const [probs] = await q(`select cardinality(public.fn_prompt_template_problems('EXAM_NOTE', $1)) n`, [EXAM_NOTE_TEMPLATE_V1]);
      chk('A-1 catalog: CHECK has EXAM_NOTE; checker branch (code v1 = 0 problems); save_draft accepts EXAM_NOTE; save/activate EXECUTE service_role only; no SECDEF',
        /EXAM_NOTE/.test(k.d) && probs.n === 0 && /'EXAM_NOTE'/.test(f.fn_prompt_template_save_draft.prosrc)
          && ['fn_prompt_template_save_draft', 'fn_prompt_template_activate'].every((n) => f[n].s && !f[n].a && !f[n].n && !f[n].prosecdef) && !f.fn_prompt_template_problems.prosecdef,
        JSON.stringify({ k: k.d, probs: probs.n, fns: fns.map((x) => [x.proname, x.s, x.a, x.n, x.prosecdef]) }));
    });

    await chunk(async () => {
      const s = await save('service_role', { role: 'service_role' }, 'EXAM_NOTE', EXAM_NOTE_TEMPLATE_V1);
      const id = s.ok && s.rows[0].r.id;
      const a = id ? await svc(`select public.fn_prompt_template_activate($1, null, $2) r`, [id, ACTOR]) : { ok: false };
      const [row] = id ? await q(`select version, status, body_sha256 from public.prompt_templates where id = $1`, [id]) : [null];
      const [audit] = await q(`select count(*)::int n from public.admin_audit_logs where actor_email = $1 and action_type like 'PROMPT_TEMPLATE_%'`, [ACTOR]);
      chk('B-1 service_role: code v1 saved as the next EXAM_NOTE DRAFT (DB hash = code hash) → activated (ACTIVE); 2 audit rows', s.ok && a.ok && row && row.version === base.v + 1 && row.status === 'ACTIVE' && row.body_sha256 === V1_SHA && audit.n === 2,
        JSON.stringify({ s: s.ok ? 'ok' : s, a: a.ok ? 'ok' : a, row, audit, V1_SHA: V1_SHA.slice(0, 12) }));
      const rd = await as('authenticated', ADMIN, `select count(*)::int n from public.prompt_templates where template_type = 'EXAM_NOTE' and status = 'ACTIVE'`);
      chk('B-3b the QA admin can READ the active EXAM_NOTE template (RLS admin read)', rd.ok && rd.rows[0].n === 1, JSON.stringify(rd));
    });

    await chunk(async () => {
      const noLines = await save('service_role', { role: 'service_role' }, 'EXAM_NOTE', EXAM_NOTE_TEMPLATE_V1.split('{{EXAM_LINES}}').join(''));
      const unknown = await save('service_role', { role: 'service_role' }, 'EXAM_NOTE_X', EXAM_NOTE_TEMPLATE_V1);
      chk('B-2 refused: EXAM_NOTE without {{EXAM_LINES}} (22023), unknown type (22023)', !noLines.ok && noLines.code === '22023' && /EXAM_LINES/.test(noLines.msg) && !unknown.ok && unknown.code === '22023', JSON.stringify({ noLines, unknown }));
      const adm = await save('authenticated', ADMIN, 'EXAM_NOTE', EXAM_NOTE_TEMPLATE_V1);
      const an = await save('anon', ANON, 'EXAM_NOTE', EXAM_NOTE_TEMPLATE_V1);
      chk('B-3 authenticated QA admin and anon cannot execute save_draft (42501)', !adm.ok && adm.code === '42501' && !an.ok && an.code === '42501', JSON.stringify({ adm, an }));
    });

    pending = [];
    const [z] = await q(`select (select count(*)::int from public.prompt_templates where template_type = 'EXAM_NOTE') - $2 t, (select count(*)::int from public.admin_audit_logs where actor_email = $1) a`, [ACTOR, base.n]);
    chk('Z-1 nothing persisted: EXAM_NOTE templates unchanged, 0 audit rows by the gate actor', z.t === 0 && z.a === 0, JSON.stringify(z));
    flush();
  } catch (e) {
    ok = false;
    flush();
    console.log(`FAIL EXAM-NOTE-PROMPT-1 smoke aborted — ${red(String(e.message)).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'EXAM-NOTE-PROMPT-1 live: ALL PASS' : 'EXAM-NOTE-PROMPT-1 live: FAILURES');
  process.exit(ok ? 0 : 1);
})();
