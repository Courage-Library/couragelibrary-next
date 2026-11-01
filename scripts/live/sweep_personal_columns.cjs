#!/usr/bin/env node
/**
 * SEC-SITE-MEDIA-1 — personal-column exposure sweep (READ ONLY: one read-only transaction, rolled back; prints no
 * values, only counts). For every table / view in public with a personal-looking column (e-mail, phone, names,
 * user / actor ids, *_by, IP / address / birth date), REAL ROLES:
 *   rows   non-null values in the column (as the connection owner — the size of what could leak)
 *   anon   non-null values anon can read (SET ROLE anon)
 *   own    non-null values the QA student can read (SET ROLE authenticated + JWT sub = qa-student)
 *   ownOK  for a column naming the reader (user_id / student_id / profile id …): the student only sees rows whose
 *          user column is their own id
 * A column is EXPOSED when anon can read any value, or when the student can read values that are not their own.
 * Run: node scripts/live/sweep_personal_columns.cjs [--json]
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { safeBegin } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PERSONAL = /(e_?mail|phone|mobile|whatsapp|^name$|full_?name|first_?name|last_?name|display_?name|user_?name|^username$|user_id$|student_id|profile_id|actor|_by$|_by_|^by_|owner|author|reviewer|approver|ip_?addr|^ip$|address|birth|dob$|guardian|parent_)/i;
const USER_COL = /^(user_id|student_id|profile_id|owner_id|created_by)$/;

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  const c = new Client(target.pg); c.on('error', () => {}); await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  const out = [];
  try {
    await safeBegin(c, { readOnly: true });
    const [stu] = await q(`select id from auth.users where email = 'qa-student@courage-library.test'`);
    const cols = await q(`select c.table_name t, c.column_name col, t.table_type tt
                            from information_schema.columns c join information_schema.tables t using (table_schema, table_name)
                           where c.table_schema = 'public' order by 1, 2`);
    const cand = cols.filter((r) => PERSONAL.test(r.col));
    const asRole = async (role, claims, sql) => {
      await c.query('savepoint s');
      try {
        await c.query(`set local role ${role}`);
        await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
        const r = (await c.query(sql)).rows[0];
        await c.query('reset role');
        await c.query('release savepoint s');
        return r;
      } catch (e) {
        await c.query('rollback to savepoint s');
        return { err: e.code || 'ERR' };
      }
    };
    const ANON = { role: 'anon' };
    const STU = { sub: stu.id, role: 'authenticated', app_metadata: {} };
    for (const { t, col, tt } of cand) {
      const id = `public.${JSON.stringify(t)}`;
      const qc = JSON.stringify(col);
      const total = (await asRole('postgres', {}, `select count(${qc})::int n from ${id}`)) || {};
      const anon = await asRole('anon', ANON, `select count(${qc})::int n from ${id}`);
      const own = await asRole('authenticated', STU, `select count(${qc})::int n from ${id}`);
      let foreign = null;
      if (USER_COL.test(col) && own.n > 0) {
        const f = await asRole('authenticated', STU, `select count(*)::int n from ${id} where ${qc}::text <> '${stu.id}'`);
        foreign = f.n ?? f.err;
      }
      const anonN = anon.err ? 0 : anon.n;
      const stuN = own.err ? 0 : own.n;
      const exposedAnon = anonN > 0;
      const exposedStu = USER_COL.test(col) ? (foreign ?? 0) > 0 : stuN > 0 && !/^(author|reviewer|created_by|updated_by|actor_id|approved_by_user_id)$/.test(col) ? stuN > 0 : false;
      out.push({ table: t, kind: tt === 'VIEW' ? 'view' : 'table', column: col, rows: total.n ?? total.err, anon: anon.err ? `denied(${anon.err})` : anon.n, student: own.err ? `denied(${own.err})` : own.n, foreignToStudent: foreign, exposedAnon, studentReadsOthers: USER_COL.test(col) ? (foreign ?? 0) > 0 : stuN > 0 });
    }
    await c.query('ROLLBACK');
  } catch (e) {
    console.log('ERROR', red(String(e.message)).slice(0, 300));
    await c.query('ROLLBACK').catch(() => {});
    process.exit(1);
  } finally {
    await c.end().catch(() => {});
  }
  if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 1)); return; }
  const fmt = (r) => `${r.table}${r.kind === 'view' ? ' (view)' : ''} . ${r.column} | rows ${r.rows} | anon ${r.anon} | student ${r.student}${r.foreignToStudent !== null ? ` (others' rows ${r.foreignToStudent})` : ''}`;
  const anonRead = out.filter((r) => r.exposedAnon);
  const stuOthers = out.filter((r) => !r.exposedAnon && r.studentReadsOthers);
  console.log(`candidate columns: ${out.length} in ${new Set(out.map((r) => r.table)).size} tables / views`);
  console.log(`\n== readable by ANON (${anonRead.length})`);
  anonRead.forEach((r) => console.log('  ' + fmt(r)));
  console.log(`\n== readable by a signed-in STUDENT beyond their own rows (${stuOthers.length})`);
  stuOthers.forEach((r) => console.log('  ' + fmt(r)));
  const latent = out.filter((r) => !r.exposedAnon && !r.studentReadsOthers && /^\d+$/.test(String(r.anon)) && r.rows === 0);
  console.log(`\n== anon has SELECT but the table is empty today (latent) (${latent.length})`);
  latent.forEach((r) => console.log('  ' + fmt(r)));
})();
