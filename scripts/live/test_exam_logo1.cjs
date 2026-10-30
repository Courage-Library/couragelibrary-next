#!/usr/bin/env node
/**
 * EXAM-LOGO-1 (migration 126) — AS THE REAL ROLES, every write inside a rolled-back transaction (withLiveTransaction →
 * safeBegin; one connection per chunk; a dropped connection re-runs the chunk once). Fixtures: the gate's OWN conducting
 * body + exam (never the real SSC body), built inside each chunk.
 *   --pre   126 is NOT applied: each chunk first runs the migration inside its own transaction (then rolls back)
 *   (none)  after apply: refuses unless 126 is APPLIED
 *   A catalog: logo columns (path GENERATED from the content hash), CHECKs, bucket org-logos public / 1 MB / webp only,
 *     NO storage policy on it, fn_logo_set / fn_logo_remove INVOKER + service_role only, launch function INVOKER +
 *     service_role only, SECURITY DEFINER count unchanged (116)
 *   B set / replace: the path is orgs/<id>/<sha256>.webp; audit ORG_LOGO_UPLOAD then ORG_LOGO_REPLACE with the old path;
 *     a bad hash / blank alt refused; anon and an ADMIN-claims client cannot call it (42501) nor write the columns
 *   C DB CHECKs: an override hash without alt text (23514); a body hash without alt (23514); a non-hash (23514)
 *   D launch: no logo → refused (LOGO); the body's logo → LIVE; an exam override alone → LIVE
 *   E remove: refused while a LIVE course relies on the logo; otherwise removed + ORG_LOGO_REMOVE; nothing to remove → refused
 *   F existing data: every existing exam keeps its org, title, slug, state (hash) and has no override; the test org
 *     verification-authority-… is inactive with its audit row (after apply)
 *   Z nothing persisted: 0 fixture bodies / exams, 0 audit rows by the gate actor
 * Run: node scripts/live/test_exam_logo1.cjs [--pre]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));
const { publishQaSyllabus } = require(path.join(ROOT, 'scripts/live/_qa-course.cjs'));

const PRE = process.argv.includes('--pre');
const FILE = '20261030000126_exam_logo_1.sql';
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');
const ACTOR = 'exam-logo1-smoke@courage-library.test';
const SHA1 = crypto.createHash('sha256').update('logo-1').digest('hex');
const SHA2 = crypto.createHash('sha256').update('logo-2').digest('hex');
const EXISTING_HASH = `select md5(coalesce(string_agg(id::text || '|' || org_id::text || '|' || title || '|' || slug || '|' || is_active::text, ',' order by id), '')) h, count(*)::int n from public.exams where slug not like 'logo1-%'`;

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
    // the gate's own body + exam (rolled back with the chunk)
    const fixture = async () => {
      const [o] = await q(`insert into public.conducting_orgs (name, slug, is_active) values ('Logo1 Fixture Board', 'logo1-fixture-board', true) returning id`);
      const [e] = await q(`insert into public.exams (org_id, title, slug, category, is_active) values ($1, 'Logo1 Fixture Exam', 'logo1-fixture-exam', 'QA', false) returning id`, [o.id]);
      return { org: o.id, exam: e.id };
    };
    const set = (kind, id, sha, alt) => svc(`select public.fn_logo_set($1, $2, $3, $4, null, $5) r`, [kind, id, sha, alt, ACTOR]);
    const remove = (kind, id) => svc(`select public.fn_logo_remove($1, $2, null, $3) r`, [kind, id, ACTOR]);
    const launch = (exam, status = 'LIVE') => svc(`select public.fn_exam_course_launch_set($1, null, $2, 'FREE_ALL', '{"total":1,"en":1}', null, $3) r`, [exam, status, ACTOR]);

    // ---------------- A catalog
    await chunk(async () => {
      const cols = await q(`select table_name t, column_name c, is_generated g from information_schema.columns where table_schema = 'public' and
          ((table_name = 'conducting_orgs' and column_name like 'logo%') or (table_name = 'exams' and column_name like 'logo%')) order by 1, 2`);
      const gen = cols.filter((x) => x.g === 'ALWAYS').map((x) => `${x.t}.${x.c}`).sort().join();
      const [b] = await q(`select public, file_size_limit, allowed_mime_types::text m from storage.buckets where id = 'org-logos'`);
      const [pol] = await q(`select count(*)::int n from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') || coalesce(with_check, '')) like '%org-logos%'`);
      const fns = await q(`select p.oid::regprocedure::text s, p.prosecdef d, has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') u, has_function_privilege('service_role', p.oid, 'EXECUTE') v
          from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('fn_logo_set', 'fn_logo_remove', 'fn_exam_course_launch_set')`);
      const [sd] = await q(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace and prosecdef`);
      const [src] = await q(`select prosrc from pg_proc where oid = 'public.fn_exam_course_launch_set(uuid, uuid, text, text, jsonb, uuid, text)'::regprocedure`);
      chk('A-1 catalog: logo columns (both paths GENERATED from the content hash); bucket org-logos public / 1 MB / webp only, NO storage policy; logo + launch functions INVOKER, service_role only; the launch requires a logo; SECURITY DEFINER count unchanged (116)',
        cols.length === 7 && gen === 'conducting_orgs.logo_path,exams.logo_override_path' && b && b.public === true && Number(b.file_size_limit) === 1048576 && b.m === '{image/webp}' && pol.n === 0
        && fns.length === 3 && fns.every((f) => !f.d && !f.a && !f.u && f.v) && /logo_override_sha256 IS NOT NULL OR o\.logo_sha256 IS NOT NULL/.test(src.prosrc) && sd.n === 116,
        JSON.stringify({ cols: cols.length, gen, b, pol, fns, sd: sd.n }));
    });

    // ---------------- B set / replace
    await chunk(async () => {
      const f = await fixture();
      const a = await set('ORG', f.org, SHA1, 'Logo1 Fixture Board logo');
      const [row] = await q(`select logo_path p from public.conducting_orgs where id = $1`, [f.org]);
      const b = await set('ORG', f.org, SHA2, 'Logo1 Fixture Board logo');
      const audit = (await q(`select action_type a, old_value ->> 'path' o, new_value ->> 'path' n from public.admin_audit_logs where actor_email = $1 order by created_at, id`, [ACTOR])).map((r) => `${r.a}:${r.o ? 'old' : '-'}`);
      const badSha = await set('ORG', f.org, 'not-a-hash', 'Alt text here');
      const blank = await set('ORG', f.org, SHA1, '  ');
      const anon = await as('anon', ANON, `select public.fn_logo_set('ORG', $1, $2, 'x logo', null, 'x@example.test')`, [f.org, SHA1]);
      const admin = await as('authenticated', ADMIN, `select public.fn_logo_set('ORG', $1, $2, 'x logo', null, 'x@example.test')`, [f.org, SHA1]);
      const direct = await as('authenticated', ADMIN, `update public.conducting_orgs set logo_sha256 = $2, logo_alt = 'x logo', logo_updated_at = now() where id = $1`, [f.org, SHA1]);
      const [after] = await q(`select logo_sha256 s from public.conducting_orgs where id = $1`, [f.org]);
      chk('B-1 set → orgs/<id>/<sha256>.webp, audited ORG_LOGO_UPLOAD; replace → ORG_LOGO_REPLACE with the old path returned; a non-hash / blank alt refused; anon and an ADMIN-claims client cannot call it (42501) nor write the logo columns',
        a.ok && row.p === `orgs/${f.org}/${SHA1}.webp` && a.rows[0].r.action === 'ORG_LOGO_UPLOAD' && b.ok && b.rows[0].r.old_path === `orgs/${f.org}/${SHA1}.webp` && b.rows[0].r.action === 'ORG_LOGO_REPLACE'
        && [...audit].sort().join() === 'ORG_LOGO_REPLACE:old,ORG_LOGO_UPLOAD:-' /* one transaction = one now(): compared as a set */ && !badSha.ok && !blank.ok && anon.code === '42501' && admin.code === '42501' && (!direct.ok || after.s === SHA2) && after.s === SHA2,
        JSON.stringify({ a: a.ok || a.msg, row, b: b.ok ? b.rows[0].r : b.msg, audit, badSha: badSha.code, blank: blank.code, anon: anon.code, admin: admin.code, direct: direct.ok || direct.code, after }));
    });

    // ---------------- C CHECKs
    await chunk(async () => {
      const f = await fixture();
      const noAlt = await svc(`update public.exams set logo_override_sha256 = $2 where id = $1`, [f.exam, SHA1]);
      const orgNoAlt = await svc(`update public.conducting_orgs set logo_sha256 = $2, logo_updated_at = now() where id = $1`, [f.org, SHA1]);
      const notHash = await svc(`update public.exams set logo_override_sha256 = 'abc', logo_override_alt = 'Alt text' where id = $1`, [f.exam]);
      const setPath = await svc(`update public.exams set logo_override_path = 'elsewhere.png' where id = $1`, [f.exam]);
      chk('C-1 the DB refuses: an override hash without alt text (23514), a body hash without alt (23514), a non-hash (23514), writing the generated path (428C9)',
        noAlt.code === '23514' && orgNoAlt.code === '23514' && notHash.code === '23514' && setPath.code === '428C9', JSON.stringify({ noAlt: noAlt.code, orgNoAlt: orgNoAlt.code, notHash: notHash.code, setPath: setPath.code }));
    });

    // ---------------- D launch
    await chunk(async () => {
      const f = await fixture();
      const [topic] = await q(`select id from public.canonical_taxonomy_nodes where node_type = 'TOPIC' and is_active order by id limit 1`);
      await publishQaSyllabus(q, f.exam, [topic.id], 'logo1-smoke');
      const none = await launch(f.exam);
      await set('ORG', f.org, SHA1, 'Logo1 Fixture Board logo');
      const withOrg = await launch(f.exam);
      chk('D-1 launch: no logo → refused (the logo message); the body\'s logo → LIVE', !none.ok && /needs its conducting body's logo/.test(none.msg) && withOrg.ok && withOrg.rows[0].r.status === 'LIVE', JSON.stringify({ none: none.msg, withOrg: withOrg.ok || withOrg.msg }));
    });
    await chunk(async () => {
      const f = await fixture();
      const [topic] = await q(`select id from public.canonical_taxonomy_nodes where node_type = 'TOPIC' and is_active order by id limit 1`);
      await publishQaSyllabus(q, f.exam, [topic.id], 'logo1-smoke');
      await set('EXAM', f.exam, SHA2, 'Logo1 Fixture Exam logo');
      const [e] = await q(`select logo_override_path p from public.exams where id = $1`, [f.exam]);
      const live = await launch(f.exam);
      chk('D-2 an exam override alone → LIVE; its path is exams/<id>/<sha256>.webp', live.ok && e.p === `exams/${f.exam}/${SHA2}.webp`, JSON.stringify({ live: live.ok || live.msg, e }));
    });

    // ---------------- E remove
    await chunk(async () => {
      const f = await fixture();
      const [topic] = await q(`select id from public.canonical_taxonomy_nodes where node_type = 'TOPIC' and is_active order by id limit 1`);
      await publishQaSyllabus(q, f.exam, [topic.id], 'logo1-smoke');
      await set('ORG', f.org, SHA1, 'Logo1 Fixture Board logo');
      await launch(f.exam);
      const blocked = await remove('ORG', f.org);
      await launch(f.exam, 'PAUSED');
      const removed = await remove('ORG', f.org);
      const again = await remove('ORG', f.org);
      const [row] = await q(`select logo_path p, logo_alt a from public.conducting_orgs where id = $1`, [f.org]);
      const [aud] = await q(`select count(*)::int n from public.admin_audit_logs where actor_email = $1 and action_type = 'ORG_LOGO_REMOVE'`, [ACTOR]);
      chk('E-1 remove: refused while a LIVE course relies on the logo; after a pause removed (path + alt cleared, ORG_LOGO_REMOVE with the old path returned); nothing left to remove → refused',
        !blocked.ok && /live course shows this logo/.test(blocked.msg) && removed.ok && removed.rows[0].r.old_path === `orgs/${f.org}/${SHA1}.webp` && row.p === null && row.a === null && aud.n === 1 && !again.ok && /no logo to remove/.test(again.msg),
        JSON.stringify({ blocked: blocked.msg, removed: removed.ok || removed.msg, again: again.msg, row, aud }));
    });

    // ---------------- F existing data
    await chunk(async () => {
      if (PRE) {
        // the chunk already ran the migration; compare against a fresh read of the same transaction's pre-image is not
        // possible here, so --pre proves it with the before / after hash inside one chunk instead
        return;
      }
      const [over] = await q(`select count(*)::int n from public.exams where logo_override_sha256 is not null and slug not like 'logo1-%'`);
      const [junk] = await q(`select o.is_active a, (select count(*)::int from public.admin_audit_logs l where l.target_id = o.id::text and l.action_type = 'CONDUCTING_ORG_DEACTIVATE') n
          from public.conducting_orgs o where o.slug = 'verification-authority-1790245768945'`);
      const [ssc] = await q(`select is_active a from public.conducting_orgs where slug = 'ssc'`);
      chk('F-1 existing exams carry no override (logos are uploaded by the owner after deploy); the test org is INACTIVE with its audit row; SSC untouched (active)', over.n === 0 && junk && junk.a === false && junk.n === 1 && ssc.a === true, JSON.stringify({ over, junk, ssc }));
    });
    if (PRE) {
      // F-0 (--pre): one transaction: the existing exams' hash before the migration = after it
      pending = [];
      await c.end().catch(() => {});
      c = new Client(target.pg); c.on('error', () => {}); await c.connect();
      await withLiveTransaction(c, async () => {
        const [before] = await q(EXISTING_HASH);
        await c.query(MIGRATION_SQL);
        const [after] = await q(EXISTING_HASH);
        chk(`F-0 every existing exam (${before.n}) keeps its org, title, slug and state through the migration (hash before = after)`, before.h === after.h && before.n === after.n, JSON.stringify({ before, after }));
      });
      flush();
    }

    pending = [];
    const [z] = await q(`select (select count(*)::int from public.conducting_orgs where slug = 'logo1-fixture-board') o, (select count(*)::int from public.exams where slug = 'logo1-fixture-exam') e,
        (select count(*)::int from public.admin_audit_logs where actor_email = $1) a`, [ACTOR]);
    chk('Z-1 nothing persisted: 0 fixture bodies / exams, 0 audit rows by the gate actor', z.o === 0 && z.e === 0 && z.a === 0, JSON.stringify(z));
    flush();
  } catch (e) {
    ok = false;
    flush();
    console.log(`FAIL EXAM-LOGO-1 smoke aborted — ${red(String(e.message)).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'EXAM-LOGO-1 live: ALL PASS' : 'EXAM-LOGO-1 live: FAILURES');
  process.exit(ok ? 0 : 1);
})();
