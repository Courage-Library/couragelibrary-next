/**
 * COURAGE LIBRARY — GAP2-3 TAXONOMY FK FLIPS SUITE
 *
 * Offline:  S-*  static — no PostgREST embed of subjects/topics/subtopics remains in services, app, lib
 *                 (except the documented pre-broken UNTOUCHED sites); every registry re-point is present;
 *                 premium-hub reads SUBJECT nodes; migration 075 + rollback present.
 * --capture (BEFORE 075): executes every registry embed through PostgREST as the real qa identities
 *           and writes scripts/fixtures/gap2_3_embed_baseline.json (status, row count, key shape,
 *           sha256 of canonical data — no data values are stored).
 * --db (AFTER 075): catalog, node-type enforcement behaviour (BEGIN … ROLLBACK), projection guard,
 *           every re-pointed embed vs the pre-flip baseline, rollback dry-run.
 *
 * Run: node scripts/test_gap2_3_fk_flips.cjs [--capture | --db]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const ARGS = new Set(process.argv.slice(2));
const REG = require('./fixtures/gap2_3_embeds.cjs');
const BASELINE = path.join(__dirname, 'fixtures/gap2_3_embed_baseline.json');
const MIGRATION = 'supabase/migrations/20261013000075_gap2_3_taxonomy_fk_flips.sql';
// Tables whose rows come and go with permanent-QA-identity E2E runs (TYPES-1 B0 hardening; the baseline
// was captured while qa-student held 3 transient rows there).
const QA_VOLATILE = new Set(['user_mistake_vault']);
const ROLLBACK = 'docs/database/rollback/075_rollback.sql';

let passed = 0;
let failed = 0;
const lines = [];
async function test(name, fn) {
  try { const info = await fn(); passed++; lines.push(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; lines.push(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 3000)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const walk = (dir, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(p, acc); } else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
};
const norm = (s) => s.replace(/\s+/g, '');
const afterSelect = (e) => {
  const s = norm(e.select);
  const o = norm(e.old);
  if (!s.includes(o)) throw new Error(`${e.id}: fragment not in select`);
  return s.split(o).join(norm(e.neu));
};

// ---------- canonical data (for hashing / comparing) ----------
function canon(v, allow, depth = 0) {
  if (Array.isArray(v)) return v.map((x) => canon(x, allow, depth + 1)).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      if (depth === 1 && /_node_type$/.test(k)) continue; // generated columns added by 075 on root rows
      out[k] = depth >= 2 && allow.includes(k) ? '<allowed-diff>' : canon(v[k], allow, depth + 1);
    }
    return out;
  }
  return v;
}
// shape = sorted key paths (array elements merged)
function shape(v, p = '', acc = new Set()) {
  if (Array.isArray(v)) { v.forEach((x) => shape(x, p + '[]', acc)); return acc; }
  if (v && typeof v === 'object') { for (const k of Object.keys(v)) { if (p === '[]' && /_node_type$/.test(k)) continue; acc.add(p + '.' + k); shape(v[k], p + '.' + k, acc); } }
  return acc;
}
const sha = (x) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);

// ---------- PostgREST as the real QA identities ----------
async function sessions(env) {
  const url = env('NEXT_PUBLIC_SUPABASE_URL');
  const anon = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const tok = async (email, key) => {
    for (let i = 1; i <= 3; i++) {
      try {
        const r = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: env(key) }) }).then((x) => x.json());
        if (r.access_token) return r.access_token;
      } catch { /* retry */ }
    }
    throw new Error(`sign-in failed (${email.split('@')[0]})`);
  };
  const service = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!service) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
  return { url, anon, service, admin: await tok('qa-admin@courage-library.test', 'QA_ADMIN_PASSWORD'), student: await tok('qa-student@courage-library.test', 'QA_STUDENT_PASSWORD') };
}
async function rest(S, who, table, select, filters) {
  const qs = `select=${encodeURIComponent(select)}${filters ? '&' + filters : ''}`;
  for (let i = 1; i <= 3; i++) {
    try {
      // 'service' = the service-role key the server code itself uses (bypasses RLS → real data coverage)
      const headers = who === 'service' ? { apikey: S.service, Authorization: `Bearer ${S.service}` } : { apikey: S.anon, Authorization: `Bearer ${S[who]}` };
      const r = await fetch(`${S.url}/rest/v1/${table}?${qs}`, { headers });
      const body = await r.json().catch(() => null);
      return { status: r.status, body, code: body && !Array.isArray(body) ? body.code : null, message: body && !Array.isArray(body) ? String(body.message || '').slice(0, 160) : null };
    } catch (e) { if (i === 3) throw e; }
  }
}
const filtersFor = (e) => `order=${e.order || 'id'}.asc&limit=5`;
const whoFor = (e) => (e.session === 'student' ? ['student', 'admin', 'service'] : ['admin', 'service']);
const summarize = (res, allow) => (res.status === 200 && Array.isArray(res.body)
  ? { status: 200, rows: res.body.length, shape: [...shape(res.body)].sort(), hash: sha(canon(res.body, allow || [])) }
  : { status: res.status, code: res.code, message: res.message });

/** Row count + md5 of every table holding a taxonomy FK (pre-flip: FKs into the projection; post-flip: *_node_fkey). */
async function tableHashes(client) {
  const { Client } = require(path.join(ROOT, 'node_modules/pg'));
  const { dbTarget } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
  let c = client;
  if (!c) {
    for (let i = 1; i <= 3; i++) {
      try { c = new Client({ ...dbTarget().pg, port: 6543 }); c.on('error', () => {}); await c.connect(); break; } catch (e) { if (i === 3) throw e; }
    }
  }
  const q = async (s, p = []) => (await c.query(s, p)).rows;
  await c.query('BEGIN READ ONLY');
  try {
    const tables = (await q(`SELECT DISTINCT cl.relname t FROM pg_constraint con JOIN pg_class cl ON cl.oid=con.conrelid JOIN pg_class tg ON tg.oid=con.confrelid
      WHERE con.contype='f' AND cl.relnamespace='public'::regnamespace AND (tg.relname IN ('subjects','topics','subtopics') OR con.conname ~ '_node_fkey$') ORDER BY 1`)).map((r) => r.t);
    const out = {};
    for (const t of tables) {
      const cols = (await q(`SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) c FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name !~ '_node_type$'`, [t]))[0].c;
      const r = (await q(`SELECT count(*)::bigint n, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) h FROM (SELECT ${cols} FROM public."${t}") x`))[0];
      out[t] = { rows: Number(r.n), md5: r.h };
    }
    return out;
  } finally {
    await c.query('ROLLBACK');
    if (!client) await c.end();
  }
}

async function capture() {
  const { readEnv } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
  const S = await sessions(readEnv());
  const out = { capturedAt: new Date().toISOString(), entries: {} };
  for (const e of REG) {
    for (const who of whoFor(e)) out.entries[`${e.id}:${who}`] = summarize(await rest(S, who, e.table, norm(e.select), filtersFor(e)), e.allowDiff);
  }
  for (const e of REG.SPECIAL) out.entries[`${e.id}:admin`] = summarize(await rest(S, 'admin', e.before.table, norm(e.before.select), e.before.filters));
  for (const e of REG.UNTOUCHED) out.entries[`${e.id}:admin`] = summarize(await rest(S, 'admin', e.table, norm(e.select), 'limit=5'));
  out.tables = await tableHashes();
  fs.writeFileSync(BASELINE, JSON.stringify(out, null, 1) + '\n');
  const counts = Object.values(out.entries).reduce((a, x) => { a[x.status] = (a[x.status] || 0) + 1; return a; }, {});
  console.log('captured', Object.keys(out.entries).length, 'embed executions', JSON.stringify(counts));
  for (const [k, v] of Object.entries(out.entries)) console.log(`  ${k.padEnd(16)} ${v.status} ${v.rows !== undefined ? 'rows=' + v.rows + ' hash=' + v.hash : (v.code || '') + ' ' + (v.message || '')}`);
}

// ===================== main =====================
(async () => {
  if (ARGS.has('--capture')) { await capture(); return; }

  // ---------- static ----------
  await test('S-01 no PostgREST embed of subjects/topics/subtopics remains (except documented pre-broken UNTOUCHED sites)', async () => {
    const files = ['services', 'app', 'lib', 'actions', 'components'].flatMap((d) => walk(path.join(ROOT, d)));
    const untouched = new Set(REG.UNTOUCHED.map((u) => u.file));
    const bad = [];
    for (const f of files) {
      const rel = path.relative(ROOT, f).replace(/\\/g, '/');
      const src = fs.readFileSync(f, 'utf8');
      // embed = (alias:)?(subjects|topics|subtopics)(!hint)?( inside a select string — not .from('topics') or method names
      const re = /(^|[\s,('"`:])(subjects|topics|subtopics)(![a-z_]+)*\(/g;
      let m;
      while ((m = re.exec(src))) {
        const lineNo = src.slice(0, m.index).split('\n').length;
        const line = src.split('\n')[lineNo - 1];
        if (/\.from\(|function |static |async |=>|getTopicSubtopics/.test(line) && !/select/.test(line)) continue;
        if (untouched.has(rel) && /subject:subjects\(\*\)/.test(line)) continue;
        bad.push(`${rel}:${lineNo}: ${line.trim().slice(0, 140)}`);
      }
    }
    assert(bad.length === 0, bad.join('\n        '));
    return `${files.length} files`;
  });
  await test(`S-02 every registry re-point is present in code (${REG.length} fragments + premium-hub)`, async () => {
    const bad = [];
    for (const e of REG) {
      const src = norm(read(e.file));
      if (!src.includes(norm(e.neu))) bad.push(`${e.id}: replacement missing in ${e.file}`);
    }
    const ph = read('services/premium-hub.service.ts');
    if (!/\.from\("canonical_taxonomy_nodes"\)/.test(ph) || !/canonical_taxonomy_nodes!parent_id\(/.test(ph) || !/\.eq\("node_type", "SUBJECT"\)/.test(ph)) bad.push('PH-476: premium-hub not moved to SUBJECT nodes');
    assert(bad.length === 0, bad.join('\n        '));
  });
  await test('S-03 migration 075 + rollback present; 075 never drops/moves projection tables', async () => {
    const m = read(MIGRATION);
    assert(/taxonomy_fk_flip_log/.test(m) && /VALIDATE CONSTRAINT/.test(m) && /NOT VALID/.test(m), 'migration shape');
    assert(!/DROP TABLE\s+(IF EXISTS\s+)?public\.(subjects|topics|subtopics)\b|SET SCHEMA/.test(m), 'projection dropped/moved');
    assert(!/\b(GRANT|REVOKE|POLICY)\b/.test(m.replace(/--.*$/gm, '')), 'grant/RLS change');
    assert(fs.existsSync(path.join(ROOT, ROLLBACK)), 'rollback missing');
  });

  if (ARGS.has('--db')) await dbTests();

  console.log(lines.join('\n'));
  console.log(`\nGAP2-3 suite: ${passed}/${passed + failed} passed${ARGS.has('--db') ? ' (offline + DB)' : ' (offline)'}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.log('SUITE ERROR', String(e && e.stack ? e.stack : e).slice(0, 1500)); process.exit(1); });

async function dbTests() {
  const { Client } = require(path.join(ROOT, 'node_modules/pg'));
  const { readEnv, dbTarget } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
  const env = readEnv();
  const EXPECTED_FLIPS = 33;
  let c;
  for (let i = 1; i <= 3; i++) {
    try { c = new Client({ ...dbTarget().pg, port: 6543 }); c.on('error', () => {}); await c.connect(); break; } catch (e) { c = null; if (i === 3) { failed++; lines.push(`  FAIL  D-00 connect: ${e.code || e.message}`); return; } }
  }
  const q = async (s, p = []) => (await c.query(s, p)).rows;
  const ro = async (fn) => { await c.query('BEGIN READ ONLY'); try { return await fn(); } finally { await c.query('ROLLBACK'); } };
  const rw = async (fn) => { await c.query('BEGIN READ WRITE'); try { return await fn(); } finally { await c.query('ROLLBACK'); } };
  const expectErr = async (sql, params, code) => {
    await c.query('SAVEPOINT x');
    try { await c.query(sql, params); await c.query('RELEASE SAVEPOINT x'); return 'NO ERROR'; } catch (e) { await c.query('ROLLBACK TO SAVEPOINT x'); return e.code === code ? null : `${e.code} ${e.message}`; }
  };
  const expectOk = async (sql, params) => {
    await c.query('SAVEPOINT x');
    try { await c.query(sql, params); await c.query('RELEASE SAVEPOINT x'); return null; } catch (e) { await c.query('ROLLBACK TO SAVEPOINT x'); return `${e.code} ${e.message}`; }
  };

  await test('D-01 zero FKs in public reference subjects/topics/subtopics (retired ones listed, not flipped)', () => ro(async () => {
    const r = await q(`SELECT n.nspname||'.'||cl.relname||'.'||con.conname x FROM pg_constraint con JOIN pg_class cl ON cl.oid=con.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace JOIN pg_class t ON t.oid=con.confrelid
      WHERE con.contype='f' AND t.relnamespace='public'::regnamespace AND t.relname IN ('subjects','topics','subtopics')`);
    const pub = r.filter((x) => x.x.startsWith('public.'));
    assert(pub.length === 0, pub.map((x) => x.x).join(', '));
    return `retired (unchanged): ${r.length}`;
  }));
  await test(`D-02 flip log: ${EXPECTED_FLIPS} rows; every flipped column has composite FK (col, col_node_type) → nodes(id, node_type), VALIDATED, ON DELETE RESTRICT, ON UPDATE NO ACTION, generated type column, index`, () => ro(async () => {
    const log = await q(`SELECT table_name, column_name, old_constraint, old_target, new_constraint, expected_node_type FROM public.taxonomy_fk_flip_log ORDER BY 1,2`);
    assert(log.length === EXPECTED_FLIPS, `flip log rows ${log.length}`);
    const uq = await q(`SELECT 1 FROM pg_constraint WHERE conrelid='public.canonical_taxonomy_nodes'::regclass AND contype='u' AND pg_get_constraintdef(oid) = 'UNIQUE (id, node_type)'`);
    assert(uq.length === 1, 'UNIQUE (id, node_type) missing');
    const bad = [];
    for (const f of log) {
      const con = (await q(`SELECT con.convalidated v, con.confdeltype d, con.confupdtype u, pg_get_constraintdef(con.oid) def FROM pg_constraint con WHERE con.conname=$1 AND con.conrelid=('public.'||$2)::regclass`, [f.new_constraint, f.table_name]))[0];
      if (!con) { bad.push(`${f.table_name}.${f.column_name}: ${f.new_constraint} missing`); continue; }
      const want = `FOREIGN KEY (${f.column_name}, ${f.column_name}_node_type) REFERENCES canonical_taxonomy_nodes(id, node_type) ON DELETE RESTRICT`;
      if (!con.v || con.d !== 'r' || con.u !== 'a' || con.def !== want) bad.push(`${f.table_name}.${f.column_name}: ${con.def} v=${con.v} d=${con.d} u=${con.u}`);
      const gen = (await q(`SELECT a.attgenerated g, pg_get_expr(d.adbin, d.adrelid) e FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=('public.'||$1)::regclass AND a.attname=$2`, [f.table_name, `${f.column_name}_node_type`]))[0];
      if (!gen || gen.g !== 's' || gen.e !== `'${f.expected_node_type}'::text`) bad.push(`${f.table_name}.${f.column_name}_node_type: ${JSON.stringify(gen)}`);
      const idx = (await q(`SELECT count(*)::int n FROM pg_index i WHERE i.indrelid=('public.'||$1)::regclass AND i.indkey[0] = (SELECT attnum FROM pg_attribute WHERE attrelid=i.indrelid AND attname=$2)`, [f.table_name, f.column_name]))[0].n;
      if (!idx) bad.push(`${f.table_name}.${f.column_name}: no index`);
      if (!['subjects', 'topics', 'subtopics'].includes(f.old_target)) bad.push(`${f.table_name}.${f.column_name}: old_target ${f.old_target}`);
    }
    assert(bad.length === 0, bad.join('\n        '));
    return `${log.length} columns`;
  }));
  await test('D-03 node-type enforcement (rolled back): SUBJECT id in TOPIC column rejected; non-existent id rejected; NULL allowed where nullable; valid id accepted', () => rw(async () => {
    const subj = (await q(`SELECT id FROM public.canonical_taxonomy_nodes WHERE node_type='SUBJECT' ORDER BY id LIMIT 1`))[0].id;
    const topics = (await q(`SELECT id FROM public.canonical_taxonomy_nodes WHERE node_type='TOPIC' ORDER BY id LIMIT 2`)).map((r) => r.id);
    const qid = (await q(`SELECT id, canonical_topic_id FROM public.questions ORDER BY id LIMIT 1`))[0];
    const otherTopic = topics.find((t) => t !== qid.canonical_topic_id);
    const res = {
      subjectIntoTopic: await expectErr(`UPDATE public.questions SET canonical_topic_id = $1 WHERE id = $2`, [subj, qid.id], '23503'),
      nonExistent: await expectErr(`UPDATE public.questions SET canonical_topic_id = $1 WHERE id = $2`, ['00000000-0000-4000-8000-000000000000', qid.id], '23503'),
      topicIntoSubject: await expectErr(`UPDATE public.mock_sections SET subject_id = $1 WHERE id = (SELECT id FROM public.mock_sections ORDER BY id LIMIT 1)`, [topics[0]], '23503'),
      nullable: await expectOk(`UPDATE public.questions SET subtopic_id = NULL WHERE id = $1`, [qid.id]),
      valid: await expectOk(`UPDATE public.questions SET canonical_topic_id = $1 WHERE id = $2`, [otherTopic, qid.id]),
      notNullStillEnforced: await expectErr(`UPDATE public.questions SET canonical_topic_id = NULL WHERE id = $1`, [qid.id], '23502'),
    };
    const bad = Object.entries(res).filter(([, v]) => v !== null);
    assert(bad.length === 0, JSON.stringify(bad));
  }));
  await test('D-04 referenced node: DELETE rejected (RESTRICT); deactivation allowed and references stay valid (rolled back)', () => rw(async () => {
    const t = (await q(`SELECT canonical_topic_id id FROM public.questions LIMIT 1`))[0].id;
    const del = await expectErr(`DELETE FROM public.canonical_taxonomy_nodes WHERE id = $1`, [t], '23503');
    assert(del === null, `delete: ${del}`);
    await q(`SELECT set_config('app.taxonomy_projection_write', '', true)`);
    const deact = await expectOk(`UPDATE public.canonical_taxonomy_nodes SET is_active = false WHERE id = $1`, [t]);
    assert(deact === null, `deactivate: ${deact}`);
    const still = (await q(`SELECT count(*)::int n FROM public.questions x JOIN public.canonical_taxonomy_nodes n ON n.id = x.canonical_topic_id WHERE n.id = $1 AND n.is_active = false`, [t]))[0].n;
    assert(still > 0, 'references not valid after deactivation');
  }));
  await test('D-05 projection guard still blocks direct projection writes (DELETE/UPDATE topics, INSERT subjects) outside the projection trigger', () => rw(async () => {
    const t = (await q(`SELECT id FROM public.topics LIMIT 1`))[0].id;
    const res = [
      await expectOk(`UPDATE public.topics SET name = name || 'x' WHERE id = $1`, [t]),
      await expectOk(`DELETE FROM public.subtopics WHERE false`, []),
      await expectOk(`INSERT INTO public.subjects (id, name, slug) VALUES (gen_random_uuid(), 'QA guard probe', 'qa-guard-probe')`, []),
    ];
    // every direct write must be REJECTED (expectOk returns the error text)
    assert(res[0] && res[2], `guard did not block: ${JSON.stringify(res)}`);
  }));
  await test('D-06 data unchanged by 075: row count + md5 of every flipped table (excluding generated *_node_type columns) equal the pre-flip baseline', async () => {
    const before = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).tables;
    const now = await tableHashes(c);
    // QA-volatile tables hold rows that permanent QA identities create and clean in E2E runs; the GAP2-3
    // baseline captured 3 transient qa-student rows there. They are compared by presence only.
    const bad = Object.keys(before).filter((t) => !now[t] || (!QA_VOLATILE.has(t) && (now[t].rows !== before[t].rows || now[t].md5 !== before[t].md5)))
      .map((t) => `${t}: ${JSON.stringify(before[t])} → ${JSON.stringify(now[t])}`);
    const extra = Object.keys(now).filter((t) => !before[t]);
    assert(bad.length === 0 && extra.length === 0, [...bad, ...extra.map((t) => 'unexpected ' + t)].join('\n        '));
    return `${Object.keys(before).length} tables`;
  });

  // ---------- embeds vs pre-flip baseline ----------
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).entries;
  const S = await sessions(env);
  await test(`E-01 every re-pointed embed (${REG.length}) returns the pre-flip status, row count, key shape and data (as qa-admin / qa-student)`, async () => {
    const bad = [];
    let compared = 0;
    for (const e of REG) {
      for (const who of whoFor(e)) {
        const b = base[`${e.id}:${who}`];
        const now = summarize(await rest(S, who, e.table, afterSelect(e), filtersFor(e)), e.allowDiff);
        compared++;
        if (e.preBroken || b.status !== 200) {
          // A query that already failed before the flip (missing column, ambiguous unrelated embed, revoked
          // table) must fail the same way — or stop failing — but never with a NEW relationship error.
          if (now.status === 200) continue;
          if (now.code === b.code && now.message === b.message) continue;
          if (now.code === 'PGRST200' || now.code === 'PGRST201') bad.push(`${e.id}:${who} NEW relationship error ${now.code} ${now.message}`);
          else if (now.code !== b.code) bad.push(`${e.id}:${who} error changed ${b.code} → ${now.code} ${now.message}`);
          continue;
        }
        if (now.status !== 200) { bad.push(`${e.id}:${who} → ${now.status} ${now.code} ${now.message}`); continue; }
        if (QA_VOLATILE.has(e.table)) {
          // QA-volatile rows (see D-06): the relationship must resolve; key shape is compared when both sides have rows.
          if (now.rows > 0 && b.rows > 0 && JSON.stringify(now.shape) !== JSON.stringify(b.shape)) bad.push(`${e.id}:${who} shape differs (QA-volatile table)`);
          continue;
        }
        if (now.rows !== b.rows) bad.push(`${e.id}:${who} rows ${b.rows} → ${now.rows}`);
        if (JSON.stringify(now.shape) !== JSON.stringify(b.shape)) bad.push(`${e.id}:${who} shape differs: -${b.shape.filter((x) => !now.shape.includes(x)).join(',')} +${now.shape.filter((x) => !b.shape.includes(x)).join(',')}`);
        // node-backed `*` mappings (allowDiff) are value-checked field by field against the projection in E-04
        else if (!e.allowDiff && now.hash !== b.hash) bad.push(`${e.id}:${who} data hash ${b.hash} → ${now.hash}`);
      }
    }
    assert(bad.length === 0, bad.join('\n        '));
    return `${compared} executions`;
  });
  await test('E-02 premium-hub: SUBJECT nodes + child TOPIC nodes return the same subjects/topics as the pre-flip projection embed', async () => {
    const e = REG.SPECIAL[0];
    const b = base[`${e.id}:admin`];
    const now = summarize(await rest(S, 'admin', e.after.table, norm(e.after.select), e.after.filters));
    assert(b.status === 200 && now.status === 200 && now.rows === b.rows && JSON.stringify(now.shape) === JSON.stringify(b.shape) && now.hash === b.hash, JSON.stringify({ b, now }));
  });
  await test('E-04 node-backed `*` embeds equal the (unchanged) projection rows field by field, except importance_level / created_at / updated_at', async () => {
    const bad = [];
    let checked = 0;
    for (const e of REG.filter((x) => x.allowDiff)) {
      const res = await rest(S, 'service', e.table, afterSelect(e), filtersFor(e));
      if (res.status !== 200) { bad.push(`${e.id}: ${res.status} ${res.code}`); continue; }
      const alias = norm(e.neu).split(':')[0];
      const projTable = /subject/.test(alias) ? 'subjects' : 'topics';
      const embedded = res.body.map((r) => r[alias]).filter(Boolean);
      if (!embedded.length) continue;
      const ids = [...new Set(embedded.map((o) => o.id))];
      const proj = await rest(S, 'service', projTable, '*', `id=in.(${ids.join(',')})`);
      const byId = Object.fromEntries((proj.body || []).map((p) => [p.id, p]));
      for (const o of embedded) {
        const p = byId[o.id];
        if (!p) { bad.push(`${e.id}: projection row missing for an embedded id`); continue; }
        const pk = Object.keys(p).filter((k) => !/_node_type$/.test(k)).sort();
        if (JSON.stringify(Object.keys(o).sort()) !== JSON.stringify(pk)) bad.push(`${e.id}: keys ${Object.keys(o).sort()} vs projection ${pk}`);
        for (const k of pk) if (!e.allowDiff.includes(k) && JSON.stringify(o[k]) !== JSON.stringify(p[k])) bad.push(`${e.id}: field ${k} differs`);
        checked++;
      }
    }
    assert(bad.length === 0, [...new Set(bad)].join('\n        '));
    return `${checked} embedded rows compared`;
  });
  await test('E-03 untouched pre-broken sites fail exactly as before (not flip-related)', async () => {
    const bad = [];
    for (const e of REG.UNTOUCHED) {
      const b = base[`${e.id}:admin`];
      const now = summarize(await rest(S, 'admin', e.table, norm(e.select), 'limit=5'));
      if (b.status === 200 || now.status !== b.status || now.code !== b.code) bad.push(`${e.id}: ${JSON.stringify(b)} → ${JSON.stringify(now)}`);
    }
    assert(bad.length === 0, bad.join('\n        '));
  });

  await test('D-07 rollback dry-run: docs/database/rollback/075_rollback.sql executes inside BEGIN … ROLLBACK and restores projection FKs', () => rw(async () => {
    // GAP2-4a (078) added a FK on canonical_taxonomy_nodes (id, node_type); the documented order is 080 → 079 → 078 → 075.
    // The dependent rollbacks run first in the same rolled-back transaction (their own BEGIN; / COMMIT; lines removed).
    for (const dep of ['080', '079', '078']) {
      const sql = read(`docs/database/rollback/${dep}_rollback.sql`);
      assert((sql.match(/^s*(BEGIN|COMMIT);s*$/gm) || []).length === 2, `${dep}_rollback.sql must have exactly one BEGIN; and one COMMIT;`);
      await c.query(sql.replace(/^s*(BEGIN|COMMIT);s*$/gm, ''));
    }
    await c.query(read(ROLLBACK));
    const back = (await q(`SELECT count(*)::int n FROM pg_constraint con JOIN pg_class t ON t.oid=con.confrelid WHERE con.contype='f' AND con.connamespace='public'::regnamespace AND t.relname IN ('subjects','topics','subtopics')`))[0].n;
    const gen = (await q(`SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND column_name ~ '_node_type$' AND is_generated='ALWAYS'`))[0].n;
    const log = (await q(`SELECT to_regclass('public.taxonomy_fk_flip_log') IS NULL g`))[0].g;
    assert(back === EXPECTED_FLIPS && gen === 0 && log, JSON.stringify({ back, gen, logDropped: log }));
  }));
  await test('D-08 live state unchanged after the rolled-back checks', () => ro(async () => {
    const n = (await q(`SELECT count(*)::int n FROM public.taxonomy_fk_flip_log`))[0].n;
    const back = (await q(`SELECT count(*)::int n FROM pg_constraint con JOIN pg_class t ON t.oid=con.confrelid WHERE con.contype='f' AND con.connamespace='public'::regnamespace AND t.relname IN ('subjects','topics','subtopics')`))[0].n;
    assert(n === EXPECTED_FLIPS && back === 0, JSON.stringify({ n, back }));
  }));
  await c.end();
}
