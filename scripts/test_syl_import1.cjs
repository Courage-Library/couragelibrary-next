/**
 * SYL-IMPORT-1 — syllabus draft importer: contract validator (lib/syllabus/import-contract.ts) + fn_syllabus_import_draft
 * (migration 086) + the SSC CGL Tier-1 draft file.
 *
 * Offline (no network):
 *   U-*  one passing + one failing fixture for EVERY error code of the contract (the code union in the source must equal
 *        the covered set); errors are typed { code, path, message }, collected (not fail-first) and capped at 200;
 *        contract_version is checked first; size / node count before the deep pass
 *   S-1  architect conditions: one validator (used by the server actions), no casts / any in it, input `unknown`
 *   I10s importer never creates topics / never publishes (migration body, actions, UI)
 *   I12  data/syllabus-drafts/ssc-cgl-tier1.v1.json passes the validator; missing topics are reported, not ignored
 * Live (couragelibrary-next, verified TLS; QA exam `qa-syllabus-test` ONLY; permanent QA identities, none created):
 *   I1  qa-staff imports a valid payload (PostgREST, real session) → DRAFT, counts match, audit row with sha256
 *   I2  re-import while that DRAFT exists → DRAFT_EXISTS, no rows
 *   I3  qa-student → 42501; anon → 401 / 42501
 *   I4  unknown topic → MISSING_TOPIC with the identifier, nothing written (validator AND RPC)
 *   I5  mapping on PAPER / SECTION refused; bad depth refused (RPC)
 *   I6  weights not summing to 1 refused (RPC)
 *   I7  HTML / markdown / script in text refused (RPC)
 *   I8  oversize / too many nodes / unknown keys / wrong contract / exam mismatch / unknown cycle refused (RPC)
 *   I9  forced failure mid-import (temporary trigger, rolled back) → zero partial rows
 *   I10 live: the deployed function body never writes taxonomy / never publishes; taxonomy unchanged by the suite
 *   I11 staff cannot publish / archive the imported DRAFT (42501); admin publishes through fn_syllabus_publish (rolled back)
 *   I12 live: every topic of the CGL file resolves against the live taxonomy; the RPC accepts the full file (QA exam,
 *       rolled back — never ssc-cgl)
 *   Cleanup: the suite's own DRAFT (QA exam) is deleted as owner (DRAFT rows are deletable by design) → QA-exam syllabus
 *   rows return to the baseline; non-QA syllabus rows and the taxonomy are byte-identical (md5) before / after.
 *
 * Run: node scripts/test_syl_import1.cjs [--offline]
 */
const { safeBegin } = require('./db/live-safety.cjs'); // LIVE-LOCK-SWEEP: the one safe BEGIN (timeouts + rollback on stop)
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const OFFLINE = process.argv.includes('--offline');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 2000)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const load = (f) => {
  const js = ts.transpileModule(read(f), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', js)(m, m.exports, require);
  return m.exports;
};
const C = load('lib/syllabus/import-contract.ts');
const MIGRATION = 'supabase/migrations/20261016000086_syl_import1_import_draft.sql';
const CGL_FILE = 'data/syllabus-drafts/ssc-cgl-tier1.v1.json';

const T1 = 'quantitative-aptitude.percentage';
const T2 = 'quantitative-aptitude.average';
const T3 = 'quantitative-aptitude.ratio-proportion';
const T4 = 'english-comprehension.synonyms';
const TAG = 'syl-import1-test';
const base = () => ({
  contract_version: 1, exam: 'qa-syllabus-test', cycle_year: null, version_tag: TAG, source_note: 'SYL-IMPORT-1 suite fixture.',
  papers: [{
    code: 'p1', title: 'Paper 1', expected_questions_min: 10, expected_questions_max: 10,
    sections: [
      { code: 's1', title: 'Section 1', weightage_tier: 'CORE', expected_questions_min: 5, expected_questions_max: 5, units: [
        { code: 'u1', title: 'Percentage', order: 1, required_cognitive_depth: 'APPLICATION', weightage_tier: 'HIGH_YIELD', topics: [{ topic: T1, weight: null }] },
        { code: 'u2', title: 'Average and ratio', order: 2, topics: [{ topic: T2, weight: 0.5 }, { topic: T3, weight: 0.5 }] },
      ] },
      { code: 's2', title: 'Section 2', units: [{ code: 'u3', title: 'Synonyms', description: 'Contextual and literal synonym recognition.', topics: [{ topic: T4 }] }] },
    ],
  }],
});
const mut = (fn) => { const p = base(); fn(p); return p; };
const S0 = (p) => p.papers[0].sections[0];
const U0 = (p) => S0(p).units[0];
const U1 = (p) => S0(p).units[1];
const manyUnits = (n, bad = false) => mut((p) => {
  p.papers[0].sections = [{ code: 's1', title: 'S', units: Array.from({ length: n }, (_, i) => ({ code: bad ? `Bad Code ${i}` : `u-${i}`, title: `Unit ${i}` })) }];
});
const CATALOG = [T1, T2, T3, T4].map((t, i) => ({ id: `00000000-0000-4000-8000-00000000000${i}`, path: t, name: t.split('.')[1], is_active: true }));
const codesOf = (r) => r.errors.map((e) => e.code);
const v = (payload) => C.validateImportPayload(payload);
const vt = (text) => C.validateImportText(text);
const resolve = (payload, catalog = CATALOG, slug = 'qa-syllabus-test') => C.resolveImportTopics(C.validateImportPayload(payload).payload, catalog, slug);

// [code, passing check, failing check (must report the code at the path)]
const CASES = [
  ['INVALID_JSON', () => vt(JSON.stringify(base())), () => vt('{"contract_version": 1,'), '$'],
  ['PAYLOAD_TOO_LARGE', () => { const s = JSON.stringify(base()); return vt(s + ' '.repeat(C.IMPORT_MAX_BYTES - Buffer.byteLength(s))); },
    () => { const s = JSON.stringify(base()); return vt(s + ' '.repeat(C.IMPORT_MAX_BYTES - Buffer.byteLength(s) + 1)); }, '$'],
  ['TOO_MANY_NODES', () => v(manyUnits(C.IMPORT_MAX_NODES - 2)), () => v(manyUnits(C.IMPORT_MAX_NODES - 1)), '$.papers'],
  ['UNSUPPORTED_CONTRACT_VERSION', () => v(base()), () => v(mut((p) => { p.contract_version = 2; p.extra = 1; p.papers = 'x'; })), '$.contract_version'],
  ['INVALID_TYPE', () => v(base()), () => v(mut((p) => { p.papers[0].sections = {}; })), '$.papers[0].sections'],
  ['UNKNOWN_KEY', () => v(base()), () => v(mut((p) => { U0(p).colour = 'red'; })), '$.papers[0].sections[0].units[0].colour'],
  ['REQUIRED', () => v(base()), () => v(mut((p) => { delete S0(p).title; })), '$.papers[0].sections[0].title'],
  ['INVALID_VALUE', () => v(mut((p) => { S0(p).weightage_tier = 'LOW'; })), () => v(mut((p) => { S0(p).weightage_tier = 'VERY_HIGH'; })), '$.papers[0].sections[0].weightage_tier'],
  ['TOO_LONG', () => v(mut((p) => { U0(p).title = 'x'.repeat(200); })), () => v(mut((p) => { U0(p).title = 'x'.repeat(201); })), '$.papers[0].sections[0].units[0].title'],
  ['NOT_PLAIN_TEXT', () => v(mut((p) => { U0(p).description = 'Ratio & proportion (2/3), 50% - basics; a > b is written in words.'.replace('>', 'over'); })),
    () => v(mut((p) => { U0(p).description = '<b>bold</b>'; })), '$.papers[0].sections[0].units[0].description'],
  ['INVALID_CODE', () => v(mut((p) => { p.papers[0].code = 'tier-1'; })), () => v(mut((p) => { p.papers[0].code = 'Tier 1'; })), '$.papers[0].code'],
  ['DUPLICATE_CODE', () => v(base()), () => v(mut((p) => { p.papers[0].sections[1].units[0].code = 'u1'; })), '$.papers[0].sections[1].units[0].code'],
  ['ORDER_NOT_CONTIGUOUS', () => v(base()), () => v(mut((p) => { U1(p).order = 3; })), '$.papers[0].sections[0].units[1].order'],
  ['EMPTY_LIST', () => v(base()), () => v(mut((p) => { p.papers[0].sections[1].units = []; })), '$.papers[0].sections[1].units'],
  ['BAD_DEPTH', () => v(base()), () => v(mut((p) => { U0(p).units = [{ code: 'x', title: 'X' }]; })), '$.papers[0].sections[0].units[0].units'],
  ['MAPPING_NOT_UNIT', () => v(base()), () => v(mut((p) => { S0(p).topics = [{ topic: T1 }]; })), '$.papers[0].sections[0].topics'],
  ['RANGE_INVALID', () => v(base()), () => v(mut((p) => { S0(p).expected_questions_min = 6; })), '$.papers[0].sections[0].expected_questions_min'],
  ['DUPLICATE_TOPIC', () => v(base()), () => v(mut((p) => { U1(p).topics[1].topic = T2; })), '$.papers[0].sections[0].units[1].topics[1].topic'],
  ['DUPLICATE_TOPIC_IN_SECTION', () => v(base()), () => v(mut((p) => { U1(p).topics[1].topic = T1; })), '$.papers[0].sections[0].units[1].topics[1].topic'],
  ['WEIGHTS_INVALID', () => v(mut((p) => { U1(p).topics[0].weight = 0.25; U1(p).topics[1].weight = 0.75; })),
    () => v(mut((p) => { U1(p).topics[0].weight = 0.4; U1(p).topics[1].weight = 0.4; })), '$.papers[0].sections[0].units[1].topics'],
  ['MISSING_TOPIC', () => resolve(base()), () => resolve(mut((p) => { U0(p).topics[0].topic = 'quantitative-aptitude.percentages'; })), '$.papers[0].sections[0].units[0].topics[0].topic'],
  ['TOPIC_INACTIVE', () => resolve(base()), () => resolve(base(), CATALOG.map((t) => (t.path === T4 ? { ...t, is_active: false } : t))), '$.papers[0].sections[1].units[0].topics[0].topic'],
  ['EXAM_MISMATCH', () => resolve(base()), () => resolve(base(), CATALOG, 'ssc-cgl'), '$.exam'],
  ['CYCLE_NOT_FOUND', () => ({ errors: [C.parseImportRpcError('SYLLABUS_FORBIDDEN: x'), C.parseImportRpcError('SYLLABUS_IMPORT_INVALID: NOPE at $: x')].filter(Boolean) }),
    () => ({ errors: [C.parseImportRpcError('SYLLABUS_IMPORT_INVALID: CYCLE_NOT_FOUND at $.cycle_year: The exam has no 2031 cycle.')] }), '$.cycle_year'],
  ['DRAFT_EXISTS', () => ({ errors: [C.parseImportRpcError('SYLLABUS_IMPORT_INVALID: DRAFT_EXISTS at <script>: x')].filter(Boolean) }),
    () => ({ errors: [C.parseImportRpcError('SYLLABUS_IMPORT_INVALID: DRAFT_EXISTS at $.cycle_year: This exam already has a DRAFT')] }), '$.cycle_year'],
  ['TOO_MANY_ERRORS', () => { const r = v(manyUnits(10, true)); return { errors: r.errors.filter((e) => e.code === 'TOO_MANY_ERRORS') }; },
    () => v(manyUnits(300, true)), '$'],
];

(async () => {
  console.log('SYL-IMPORT-1 syllabus draft importer');

  // ------------------------------------------------------------------ offline
  await test('U-0 every contract error code has a passing and a failing fixture (code union == covered set)', async () => {
    const src = read('lib/syllabus/import-contract.ts');
    const union = src.slice(src.indexOf('export type ImportErrorCode ='), src.indexOf(';', src.indexOf('export type ImportErrorCode =')));
    const declared = [...union.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]).sort();
    const covered = CASES.map((c) => c[0]).sort();
    assert(JSON.stringify(declared) === JSON.stringify(covered), `declared ${declared.join(',')} vs covered ${covered.join(',')}`);
    return `${declared.length} codes`;
  });

  for (const [code, pass, fail, at] of CASES) {
    await test(`U ${code}: passing fixture clean, failing fixture → ${code} at ${at}`, async () => {
      const ok = pass();
      assert(!codesOf(ok).includes(code), `passing fixture reports ${code}: ${JSON.stringify(ok.errors).slice(0, 300)}`);
      const bad = fail();
      const hit = bad.errors.find((e) => e.code === code);
      assert(hit, `failing fixture does not report ${code}: ${JSON.stringify(bad.errors).slice(0, 300)}`);
      assert(hit.path === at, `path ${hit.path} (want ${at})`);
      assert(typeof hit.message === 'string' && hit.message.length > 0 && !/<|>/.test(hit.message), 'message missing or unsafe');
    });
  }

  await test('U-1 typed + collected errors: three independent problems → three errors with JSON paths (not fail-first); cap 200', async () => {
    const r = v(mut((p) => { U0(p).colour = 'x'; S0(p).weightage_tier = 'NOPE'; p.papers[0].sections[1].units[0].title = '<i>x</i>'; }));
    assert(!r.ok && r.payload === null, 'invalid payload accepted');
    assert(JSON.stringify(codesOf(r).sort()) === JSON.stringify(['INVALID_VALUE', 'NOT_PLAIN_TEXT', 'UNKNOWN_KEY']), codesOf(r).join(','));
    assert(r.errors.every((e) => /^\$(\.[a-z_]+(\[\d+\])?)*$/.test(e.path) && Object.keys(e).sort().join() === 'code,message,path'), 'error shape');
    const many = v(manyUnits(300, true));
    assert(many.errors.length === C.IMPORT_MAX_ERRORS && many.errors[C.IMPORT_MAX_ERRORS - 1].code === 'TOO_MANY_ERRORS', `cap: ${many.errors.length}`);
    return '3 collected; capped at 200';
  });

  await test('U-2 order of checks: contract_version first; size before JSON.parse; node count before the deep pass', async () => {
    const cv = v({ contract_version: '1', papers: 'nope', junk: true });
    assert(codesOf(cv).join() === 'UNSUPPORTED_CONTRACT_VERSION', `contract first: ${codesOf(cv)}`);
    const big = vt('{' + ' '.repeat(C.IMPORT_MAX_BYTES + 10));
    assert(codesOf(big).join() === 'PAYLOAD_TOO_LARGE', 'size before parse');
    const nodes = v(mut((p) => { p.junk = 1; p.papers[0].sections = [{ code: 'S S', title: '', units: Array.from({ length: 600 }, () => ({})) }]; }));
    assert(codesOf(nodes).join() === 'TOO_MANY_NODES', `node count before deep pass: ${codesOf(nodes).slice(0, 5)}`);
    // non-plain objects / arrays where not allowed
    assert(codesOf(v([base()])).join() === 'INVALID_TYPE' && codesOf(v(null)).join() === 'INVALID_TYPE', 'root must be an object');
    assert(codesOf(v(mut((p) => { p.papers[0] = [p.papers[0]]; }))).includes('INVALID_TYPE'), 'array as paper accepted');
    // a valid payload: normalised output, stats
    const ok = v(base());
    assert(ok.ok && ok.stats.nodes === 6 && ok.stats.mappings === 4 && ok.payload.papers[0].is_mandatory === true, JSON.stringify(ok.stats));
    const json = C.importPayloadToJson(ok.payload);
    assert(C.validateImportPayload(JSON.parse(JSON.stringify(json))).ok, 'normalised payload does not re-validate');
    return 'contract → size → nodes → deep';
  });

  await test('S-1 architect conditions: ONE validator, used by both server actions; no casts / any; input unknown', async () => {
    const src = read('lib/syllabus/import-contract.ts');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert(!/\bany\b/.test(code), '`any` in the validator');
    const casts = [...code.matchAll(/\bas\s+(?!const\b)[A-Za-z{[(]/g)];
    assert(casts.length === 0, `casts in the validator: ${casts.map((m) => code.slice(m.index - 20, m.index + 20)).join(' | ')}`);
    assert(/export function validateImportPayload\(input: unknown\)/.test(src), 'validateImportPayload must take unknown');
    assert(!/^import /m.test(src), 'the validator must be a pure module (no imports)');
    const actions = read('app/admin/syllabus/actions.ts');
    for (const name of ['previewSyllabusImportAction', 'importSyllabusDraftAction']) {
      const i = actions.indexOf(`export async function ${name}(`);
      const body = actions.slice(i, actions.indexOf('\nexport async function', i + 10) > 0 ? actions.indexOf('\nexport async function', i + 10) : undefined);
      assert(i > 0 && /validateImportText\(rawText\)/.test(body), `${name} does not use the shared validator`);
      assert(/^[^]*?\{\s*const __auth = await guardAdminAction\(\{ allowStaff: true \}\);\s*if \(!__auth\.ok\) return __auth;/.test(body), `${name}: guard is not first`);
    }
    // no second validator anywhere in TS (contract constants / rules are defined once)
    const dupes = [];
    let scanned = 0;
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(rel); continue; }
        if (!/\.(ts|tsx)$/.test(e.name) || rel === 'lib/syllabus/import-contract.ts') continue;
        scanned++;
        const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        if (/function (validateImport|isPlainText|countImportNodes)|IMPORT_MAX_NODES\s*=|CODE_RE\s*=\s*\/\^\[a-z0-9\]\+/.test(s)) dupes.push(rel);
      }
    };
    ['app', 'lib', 'components', 'services'].forEach(walk);
    assert(scanned >= 300, `files scanned ${scanned} (min 300)`); // GATE-HYGIENE-1
    assert(dupes.length === 0, `second validator: ${dupes.join(', ')}`);
    return `one validator (${scanned} files scanned); 0 casts`;
  });

  await test('I10s importer never creates topics and never publishes (migration, actions, UI)', async () => {
    const sql = read(MIGRATION).replace(/--[^\n]*/g, '');
    assert(!/INSERT INTO public\.canonical_taxonomy_nodes|UPDATE public\.canonical_taxonomy_nodes|DELETE FROM public\.canonical_taxonomy_nodes/i.test(sql), 'taxonomy write in 086');
    assert(!/fn_syllabus_publish|fn_syllabus_archive_version|status\s*=\s*'PUBLISHED'|'ARCHIVED'/i.test(sql.replace(/status = 'DRAFT'/g, '')), 'publish / archive in 086');
    assert(/fn_syllabus__create_version\(\s*p_exam_id, v_cycle_id, v_tag, 'IMPORT'/.test(sql), 'version must be created through fn_syllabus__create_version (DRAFT, IMPORT)');
    assert(/PERFORM public\.fn_syllabus__assert_role\(false\);/.test(sql), 'role check differs from fn_syllabus_create_draft');
    assert(/REVOKE ALL ON FUNCTION public\.fn_syllabus_import_draft\(uuid, jsonb\) FROM PUBLIC, anon;/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.fn_syllabus_import_draft\(uuid, jsonb\) TO authenticated;/.test(sql), 'grants');
    assert(!/\r/.test(read(MIGRATION)) && !/\r/.test(read('docs/database/rollback/086_rollback.sql')), 'CRLF in migration / rollback');
    const actions = read('app/admin/syllabus/actions.ts');
    const imp = actions.slice(actions.indexOf('// ---------------------------------------------------------------- SYL-IMPORT-1'));
    assert(!/fn_syllabus_publish|fn_syllabus_archive|canonical_taxonomy|createTaxonomy/.test(imp), 'import actions publish or touch topics');
    const ui = read('components/admin/syllabus/import-draft.tsx');
    assert(!/publish|archive|createTaxonomy/i.test(ui.replace(/Publish, archive or delete the existing draft|never publishes/g, '')), 'import UI offers publish / topic creation');
    return 'static';
  });

  let cgl = null;
  await test('I12 ssc-cgl-tier1.v1.json passes the validator offline; Tier 1 only; numeric values only where cited; missing topics reported', async () => {
    const text = read(CGL_FILE);
    const r = vt(text);
    assert(r.ok, `CGL file invalid: ${JSON.stringify(r.errors).slice(0, 500)}`);
    cgl = r.payload;
    assert(cgl.exam === 'ssc-cgl' && cgl.cycle_year === 2026, 'exam / cycle');
    assert(r.stats.papers === 1 && r.stats.sections === 4 && r.stats.units === 36 && r.stats.nodes === 41 && r.stats.mappings === 36, JSON.stringify(r.stats));
    assert(!/tier[ -]?2|module-i|paper-i|\bjso\b|\baao\b|finance and economics/i.test(text), 'Tier 2 content in the Tier 1 file');
    const p = cgl.papers[0];
    assert(p.expected_questions_min === 100 && p.expected_questions_max === 100, 'paper: 100 questions (EK EXAM_PATTERN section-2)');
    for (const s of p.sections) {
      assert(s.expected_questions_min === 25 && s.expected_questions_max === 25, `${s.code}: 25 questions (EK EXAM_PATTERN section-2)`);
      for (const u of s.units) {
        assert(u.expected_questions_min === null && u.expected_questions_max === null, `${u.code}: unit question counts must stay null (no EK value)`);
        assert(u.required_cognitive_depth === 'APPLICATION' && u.topics.length === 1 && u.topics[0].weight === null, `${u.code}: depth / topic`);
      }
    }
    // missing topics are reported, not ignored: drop one topic from the catalog → MISSING_TOPIC with the identifier
    const catalog = r.stats.topics.map((t, i) => ({ id: `id-${i}`, path: t, name: t, is_active: true }));
    assert(C.resolveImportTopics(cgl, catalog, 'ssc-cgl').errors.length === 0, 'full catalog');
    const res = C.resolveImportTopics(cgl, catalog.filter((t) => t.path !== 'general-awareness.sports'), 'ssc-cgl');
    assert(res.missing.join() === 'general-awareness.sports' && res.errors.some((e) => e.code === 'MISSING_TOPIC' && /general-awareness\.sports/.test(e.message)), 'missing topic not reported');
    const notes = read('docs/syllabus/SSC_CGL_TIER1_DRAFT_NOTES.md');
    assert(/OWNER MUST VERIFY/.test(notes) && /Missing topics/i.test(notes), 'notes: checklist / missing-topics section');
    for (const s of p.sections) for (const u of s.units) assert(notes.includes(`\`${u.code}\``), `notes: no source row for ${u.code}`);
    return `${r.stats.nodes} nodes, ${r.stats.mappings} mappings`;
  });

  if (OFFLINE) { console.log('  SKIP  live I1–I12 (--offline)'); return finish(); }

  // ------------------------------------------------------------------ live
  const { Client } = require('pg');
  const { dbTarget, readEnv } = require('./db/_db-env.cjs');
  const env = readEnv();
  const URL_ = env('NEXT_PUBLIC_SUPABASE_URL');
  const ANON = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const c = new Client({ ...dbTarget().pg, port: 6543 });
  c.on('error', () => {});
  await c.connect();
  const ro = async (sql, p) => { await safeBegin(c, { readOnly: true }); try { return (await c.query(sql, p)).rows; } finally { await c.query('ROLLBACK'); } };
  // CI-FIX-1 (#74): CAPTCHA-safe QA session (scripts/live/qa-session.cjs); the second argument is kept for call sites
  const { qaAccessToken } = require('./live/qa-session.cjs');
  const token = async (email) => qaAccessToken(email).catch((e) => {
    throw new Error(`QA session failed (${email.split('@')[0]}: ${e.code || e.name})`);
  });
  const rpc = async (bearer, fn, args) => {
    for (let i = 1; i <= 3; i++) {
      try {
        const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
        const json = await r.json().catch(() => null);
        return { status: r.status, body: json, code: json && !Array.isArray(json) ? json.code : null, message: json && typeof json.message === 'string' ? json.message : '' };
      } catch (e) { if (i === 3) throw e; }
    }
  };
  /** runs fn inside ONE transaction that is always rolled back */
  const rolledBack = async (fn) => {
    await safeBegin(c);
    try { return await fn(); } finally { await c.query('ROLLBACK'); }
  };
  const asUser = async (sub, role, email) => {
    await c.query('SET LOCAL ROLE authenticated');
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated', email, app_metadata: role ? { role } : {} })]);
  };
  /** calls the RPC as simulated staff inside a savepoint; returns the error (or null) */
  const rpcErr = async (examId, payload) => {
    await c.query('SAVEPOINT x');
    try { await c.query('SELECT public.fn_syllabus_import_draft($1, $2)', [examId, payload]); await c.query('RELEASE SAVEPOINT x'); return null; }
    catch (e) { await c.query('ROLLBACK TO SAVEPOINT x'); return e; }
  };

  let draftId = null;
  let qaExam = null;
  let before = null;
  let fpBefore = null;
  let qaRows = null;
  let fingerprint = null;
  try {
    const ids = Object.fromEntries((await ro(`SELECT email, id FROM auth.users WHERE email IN ('qa-student@courage-library.test','qa-staff@courage-library.test','qa-admin@courage-library.test')`)).map((r) => [r.email.split('@')[0], r.id]));
    assert(ids['qa-student'] && ids['qa-staff'] && ids['qa-admin'], 'QA identities missing');
    qaExam = (await ro(`SELECT id FROM public.exams WHERE slug = 'qa-syllabus-test' AND NOT is_active`))[0];
    assert(qaExam, 'QA test exam missing or active');
    const QA = qaExam.id;
    qaRows = async () => (await ro(`SELECT
        (SELECT count(*) FROM public.exam_syllabus_versions WHERE exam_id = $1)::int v,
        (SELECT count(*) FROM public.exam_syllabus_nodes n JOIN public.exam_syllabus_versions x ON x.id = n.syllabus_version_id WHERE x.exam_id = $1)::int n,
        (SELECT count(*) FROM public.exam_syllabus_canonical_mappings m JOIN public.exam_syllabus_nodes n ON n.id = m.syllabus_node_id JOIN public.exam_syllabus_versions x ON x.id = n.syllabus_version_id WHERE x.exam_id = $1)::int m,
        (SELECT count(*) FROM public.exam_syllabus_versions WHERE exam_id = $1 AND status = 'DRAFT')::int drafts`, [QA]))[0];
    fingerprint = async () => JSON.stringify(await ro(`SELECT
        (SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t.id), '')) FROM public.canonical_taxonomy_nodes t) tax,
        (SELECT md5(coalesce(string_agg(v::text, '|' ORDER BY v.id), '')) FROM public.exam_syllabus_versions v WHERE v.exam_id <> $1) vers,
        (SELECT md5(coalesce(string_agg(n::text, '|' ORDER BY n.id), '')) FROM public.exam_syllabus_nodes n JOIN public.exam_syllabus_versions v ON v.id = n.syllabus_version_id WHERE v.exam_id <> $1) nodes,
        (SELECT md5(coalesce(string_agg(m::text, '|' ORDER BY m.id), '')) FROM public.exam_syllabus_canonical_mappings m JOIN public.exam_syllabus_nodes n ON n.id = m.syllabus_node_id JOIN public.exam_syllabus_versions v ON v.id = n.syllabus_version_id WHERE v.exam_id <> $1) maps`, [QA]));
    // leftover from an interrupted run: our own tagged DRAFT only
    for (const r of await ro(`SELECT id FROM public.exam_syllabus_versions WHERE exam_id = $1 AND status = 'DRAFT' AND version_tag = $2`, [QA, TAG])) await deleteOwnDraft(r.id, QA);
    before = await qaRows();
    fpBefore = await fingerprint();
    assert(before.drafts === 0, `the QA exam already has ${before.drafts} DRAFT(s); archive them first`);
    const staffTok = await token('qa-staff@courage-library.test', 'QA_STAFF_PASSWORD');

    await test('I1 qa-staff imports a valid payload → DRAFT on the QA exam; counts match; audit row with sha256', async () => {
      const payload = base();
      const r = await rpc(staffTok, 'fn_syllabus_import_draft', { p_exam_id: QA, p_payload: payload });
      assert(r.status === 200 && r.body && r.body.success === true, `import: ${r.status} ${r.code} ${r.message.slice(0, 200)}`);
      draftId = r.body.version_id;
      assert(r.body.nodes === 6 && r.body.mappings === 4, JSON.stringify(r.body));
      const ver = (await ro(`SELECT status, source_kind, version_tag, exam_cycle_id, created_by, raw_payload_hash, metadata,
          encode(sha256(convert_to($2::jsonb::text, 'UTF8')), 'hex') expect FROM public.exam_syllabus_versions WHERE id = $1`, [draftId, JSON.stringify(payload)]))[0];
      assert(ver.status === 'DRAFT' && ver.source_kind === 'IMPORT' && ver.version_tag === TAG && ver.exam_cycle_id === null, JSON.stringify({ ...ver, created_by: undefined }));
      assert(ver.created_by === ids['qa-staff'], 'created_by is not the importing staff user');
      assert(/^[0-9a-f]{64}$/.test(ver.raw_payload_hash) && ver.raw_payload_hash === r.body.payload_sha256 && ver.raw_payload_hash === ver.expect, 'payload sha256');
      const nodes = await ro(`SELECT node_kind k, raw_slug s, node_depth d, display_order o, weightage_tier t, required_cognitive_depth c, expected_questions_min mn, expected_questions_max mx, description
          FROM public.exam_syllabus_nodes WHERE syllabus_version_id = $1 ORDER BY node_depth, raw_slug`, [draftId]);
      const shape = nodes.map((n) => `${n.k}:${n.s}:${n.d}:${n.o}`).join(' ');
      assert(shape === 'PAPER:p1:1:1 SECTION:s1:2:1 SECTION:s2:2:2 UNIT:u1:3:1 UNIT:u2:3:2 UNIT:u3:3:1', shape);
      const u1 = nodes.find((n) => n.s === 'u1');
      const s1 = nodes.find((n) => n.s === 's1');
      assert(u1.t === 'HIGH_YIELD' && u1.c === 'APPLICATION' && s1.t === 'CORE' && s1.mn === 5 && s1.mx === 5 && nodes.find((n) => n.s === 'u2').mn === null, 'node fields');
      const maps = await ro(`SELECT n.raw_slug s, t.hierarchy_path p, m.mapping_weight w, m.match_status st FROM public.exam_syllabus_canonical_mappings m
          JOIN public.exam_syllabus_nodes n ON n.id = m.syllabus_node_id JOIN public.canonical_taxonomy_nodes t ON t.id = m.canonical_node_id WHERE n.syllabus_version_id = $1 ORDER BY 1, 2`, [draftId]);
      assert(maps.map((m) => `${m.s}:${m.p}:${m.w}:${m.st}`).join(' ') === `u1:${T1}:null:MANUALLY_MAPPED u2:${T2}:0.5000:MANUALLY_MAPPED u2:${T3}:0.5000:MANUALLY_MAPPED u3:${T4}:null:MANUALLY_MAPPED`, JSON.stringify(maps));
      const audit = await ro(`SELECT actor_id, action_type, target_entity, new_value FROM public.admin_audit_logs WHERE target_id = $1`, [draftId]);
      assert(audit.length === 1 && audit[0].action_type === 'SYLLABUS_DRAFT_IMPORT' && audit[0].target_entity === 'exam_syllabus_version' && audit[0].actor_id === ids['qa-staff'], 'audit row');
      const nv = audit[0].new_value;
      assert(nv.payload_sha256 === ver.raw_payload_hash && nv.nodes === 6 && nv.mappings === 4 && nv.contract_version === 1, JSON.stringify(nv));
      const after = await qaRows();
      assert(after.v === before.v + 1 && after.n === before.n + 6 && after.m === before.m + 4 && after.drafts === 1, JSON.stringify({ before, after }));
      const report = (await ro(`SELECT public.fn_syllabus__validate($1) r`, [draftId]))[0].r;
      assert(report.ok === true, `imported draft does not validate: ${JSON.stringify(report.errors)}`);
      return `v${r.body.version_number}, 6 nodes, 4 mappings, sha256 ${ver.raw_payload_hash.slice(0, 12)}…`;
    });

    await test('I2 re-import while the DRAFT exists → DRAFT_EXISTS, no rows', async () => {
      assert(draftId, 'I1 did not create a draft');
      const mid = await qaRows();
      const r = await rpc(staffTok, 'fn_syllabus_import_draft', { p_exam_id: QA, p_payload: mut((p) => { p.version_tag = 'syl-import1-second'; }) });
      assert(r.status >= 400 && r.code === 'P0001' && /^SYLLABUS_IMPORT_INVALID: DRAFT_EXISTS/.test(r.message), `${r.status} ${r.code} ${r.message.slice(0, 160)}`);
      assert(JSON.stringify(await qaRows()) === JSON.stringify(mid), 'rows changed');
    });

    await test('I3 student refused (42501 / FORBIDDEN); anon refused (401 / 42501); nothing written', async () => {
      const mid = await qaRows();
      const studentTok = await token('qa-student@courage-library.test', 'QA_STUDENT_PASSWORD');
      const s = await rpc(studentTok, 'fn_syllabus_import_draft', { p_exam_id: QA, p_payload: base() });
      assert(s.status >= 400 && s.code === '42501' && /^SYLLABUS_FORBIDDEN/.test(s.message), `student: ${s.status} ${s.code}`);
      const a = await rpc(ANON, 'fn_syllabus_import_draft', { p_exam_id: QA, p_payload: base() });
      assert(a.status === 401 || a.code === '42501', `anon: ${a.status} ${a.code}`);
      assert(JSON.stringify(await qaRows()) === JSON.stringify(mid), 'rows changed');
      return `student ${s.status}/${s.code}; anon ${a.status}/${a.code}`;
    });

    await test('I4 unknown topic → MISSING_TOPIC with the requested identifier; nothing written (validator AND RPC)', async () => {
      const bad = mut((p) => { p.version_tag = 'syl-import1-i4'; U0(p).topics[0].topic = 'quantitative-aptitude.percentages'; });
      const catalog = (await ro(`SELECT id, hierarchy_path path, name, is_active FROM public.canonical_taxonomy_nodes WHERE node_type = 'TOPIC'`));
      const res = C.resolveImportTopics(C.validateImportPayload(bad).payload, catalog, 'qa-syllabus-test');
      assert(res.missing.join() === 'quantitative-aptitude.percentages' && !('quantitative-aptitude.percentages' in res.resolved), 'validator: not reported / fuzzy-resolved');
      // the RPC validates (and resolves topics) before its DRAFT check, so MISSING_TOPIC is reported even with the I1 draft present
      const mid = await qaRows();
      const r = await rpc(staffTok, 'fn_syllabus_import_draft', { p_exam_id: QA, p_payload: bad });
      assert(r.status >= 400 && r.code === '22023' && /MISSING_TOPIC at \$\.papers\[0\]\.sections\[0\]\.units\[0\]\.topics\[0\]\.topic/.test(r.message) && r.message.includes('quantitative-aptitude.percentages'), `${r.code} ${r.message.slice(0, 200)}`);
      assert(JSON.stringify(await qaRows()) === JSON.stringify(mid), 'rows changed');
      const created = await ro(`SELECT count(*)::int n FROM public.canonical_taxonomy_nodes WHERE hierarchy_path = 'quantitative-aptitude.percentages'`);
      assert(created[0].n === 0, 'a topic was created');
    });

    const rpcCases = async (cases) => rolledBack(async () => {
      // remove the I1 draft inside the rolled-back transaction so DRAFT_EXISTS cannot mask other errors
      if (draftId) { await c.query('DELETE FROM public.exam_syllabus_nodes WHERE syllabus_version_id = $1', [draftId]); await c.query('DELETE FROM public.exam_syllabus_versions WHERE id = $1', [draftId]); }
      const inTxn = async () => (await c.query(`SELECT (SELECT count(*) FROM public.exam_syllabus_versions WHERE exam_id = $1)::int v, (SELECT count(*) FROM public.exam_syllabus_nodes n JOIN public.exam_syllabus_versions x ON x.id = n.syllabus_version_id WHERE x.exam_id = $1)::int n`, [QA])).rows[0];
      const start = await inTxn();
      await asUser(ids['qa-staff'], 'staff', 'qa-staff@courage-library.test');
      const out = [];
      for (const [name, payload, code, at] of cases) {
        const e = await rpcErr(QA, payload);
        const m = e ? /^SYLLABUS_IMPORT_INVALID: ([A-Z_]+) at (\S+):/.exec(e.message) : null;
        if (!m || m[1] !== code || (at && m[2] !== at)) out.push(`${name}: got ${e ? `${e.code} ${e.message.slice(0, 140)}` : 'success'} (want ${code}${at ? ' at ' + at : ''})`);
      }
      await c.query('RESET ROLE');
      const end = await inTxn();
      if (JSON.stringify(start) !== JSON.stringify(end)) out.push(`rows written: ${JSON.stringify({ start, end })}`);
      return out;
    });

    await test('I5 RPC: mapping on PAPER / SECTION refused; bad depth refused', async () => {
      const bad = await rpcCases([
        ['topics on SECTION', mut((p) => { S0(p).topics = [{ topic: T1 }]; }), 'MAPPING_NOT_UNIT', '$.papers[0].sections[0].topics'],
        ['topics on PAPER', mut((p) => { p.papers[0].topics = [{ topic: T1 }]; }), 'MAPPING_NOT_UNIT', '$.papers[0].topics'],
        ['units under PAPER', mut((p) => { p.papers[0].units = [{ code: 'x', title: 'X' }]; }), 'BAD_DEPTH', '$.papers[0].units'],
        ['units under UNIT', mut((p) => { U0(p).units = [{ code: 'x', title: 'X' }]; }), 'BAD_DEPTH', '$.papers[0].sections[0].units[0].units'],
        ['sections under SECTION', mut((p) => { S0(p).sections = []; }), 'BAD_DEPTH', '$.papers[0].sections[0].sections'],
      ]);
      assert(bad.length === 0, bad.join('\n        '));
      return '5 refused, no rows';
    });

    await test('I6 RPC: weights not summing to 1 / partial weights / out of range refused', async () => {
      const bad = await rpcCases([
        ['0.4 + 0.4', mut((p) => { U1(p).topics[0].weight = 0.4; U1(p).topics[1].weight = 0.4; }), 'WEIGHTS_INVALID', '$.papers[0].sections[0].units[1].topics'],
        ['one weight missing', mut((p) => { U1(p).topics[1].weight = null; }), 'WEIGHTS_INVALID', '$.papers[0].sections[0].units[1].topics'],
        ['weight 1.5 + -0.5', mut((p) => { U1(p).topics[0].weight = 1.5; U1(p).topics[1].weight = -0.5; }), 'WEIGHTS_INVALID', '$.papers[0].sections[0].units[1].topics'],
        ['weight "0.5"', mut((p) => { U1(p).topics[0].weight = '0.5'; }), 'WEIGHTS_INVALID', '$.papers[0].sections[0].units[1].topics'],
      ]);
      assert(bad.length === 0, bad.join('\n        '));
      // the validator agrees on every case
      for (const f of [(p) => { U1(p).topics[0].weight = 0.4; U1(p).topics[1].weight = 0.4; }, (p) => { U1(p).topics[1].weight = null; }, (p) => { U1(p).topics[0].weight = 1.5; U1(p).topics[1].weight = -0.5; }]) {
        assert(codesOf(v(mut(f))).includes('WEIGHTS_INVALID'), 'validator disagrees');
      }
      return '4 refused, no rows';
    });

    await test('I7 RPC: HTML / markdown / script in text refused', async () => {
      const bad = await rpcCases([
        ['script in title', mut((p) => { U0(p).title = '<script>alert(1)</script>'; }), 'NOT_PLAIN_TEXT', '$.papers[0].sections[0].units[0].title'],
        ['html in description', mut((p) => { U0(p).description = 'a <b>b</b>'; }), 'NOT_PLAIN_TEXT', '$.papers[0].sections[0].units[0].description'],
        ['markdown link', mut((p) => { S0(p).description = 'see [this](https://x.test)'; }), 'NOT_PLAIN_TEXT', '$.papers[0].sections[0].description'],
        ['markdown bold', mut((p) => { p.papers[0].title = '**Paper**'; }), 'NOT_PLAIN_TEXT', '$.papers[0].title'],
        ['markdown heading', mut((p) => { U0(p).description = 'ok\n# Heading'; }), 'NOT_PLAIN_TEXT', '$.papers[0].sections[0].units[0].description'],
        ['code span', mut((p) => { p.source_note = 'run `rm`'; }), 'NOT_PLAIN_TEXT', '$.source_note'],
        ['javascript: url', mut((p) => { U0(p).description = 'javascript:alert(1)'; }), 'NOT_PLAIN_TEXT', '$.papers[0].sections[0].units[0].description'],
      ]);
      assert(bad.length === 0, bad.join('\n        '));
      for (const t of ['<script>alert(1)</script>', 'see [this](https://x.test)', '**Paper**', 'ok\n# Heading', 'run `rm`', 'javascript:alert(1)']) assert(!C.isPlainText(t), `validator accepts ${JSON.stringify(t)}`);
      return '7 refused, no rows';
    });

    await test('I8 RPC: oversize / too many nodes / unknown keys / wrong contract / exam mismatch / unknown cycle refused', async () => {
      const bad = await rpcCases([
        ['> 256 KB', mut((p) => { p.pad = 'x'.repeat(C.IMPORT_MAX_BYTES + 100); }), 'PAYLOAD_TOO_LARGE', '$'],
        ['501 nodes', manyUnits(C.IMPORT_MAX_NODES - 1), 'TOO_MANY_NODES', '$.papers'],
        ['unknown root key', mut((p) => { p.extra = true; }), 'UNKNOWN_KEY', '$.extra'],
        ['unknown unit key', mut((p) => { U0(p).colour = 'red'; }), 'UNKNOWN_KEY', '$.papers[0].sections[0].units[0].colour'],
        ['unknown topic key', mut((p) => { U0(p).topics[0].id = 'x'; }), 'UNKNOWN_KEY', '$.papers[0].sections[0].units[0].topics[0].id'],
        ['contract 2', mut((p) => { p.contract_version = 2; }), 'UNSUPPORTED_CONTRACT_VERSION', '$.contract_version'],
        ['exam mismatch', mut((p) => { p.exam = 'ssc-cgl'; }), 'EXAM_MISMATCH', '$.exam'],
        ['unknown cycle', mut((p) => { p.cycle_year = 2026; }), 'CYCLE_NOT_FOUND', '$.cycle_year'],
        ['order gap', mut((p) => { U1(p).order = 5; }), 'ORDER_NOT_CONTIGUOUS', '$.papers[0].sections[0].units[1].order'],
        ['duplicate code', mut((p) => { p.papers[0].sections[1].units[0].code = 's1'; }), 'DUPLICATE_CODE', '$.papers[0].sections[1].units[0].code'],
        ['range', mut((p) => { S0(p).expected_questions_max = 1; }), 'RANGE_INVALID', '$.papers[0].sections[0].expected_questions_min'],
        ['empty units', mut((p) => { p.papers[0].sections[1].units = []; }), 'EMPTY_LIST', '$.papers[0].sections[1].units'],
        ['duplicate topic in section', mut((p) => { U1(p).topics[1].topic = T1; }), 'DUPLICATE_TOPIC_IN_SECTION', '$.papers[0].sections[0].units[1].topics[1].topic'],
      ]);
      assert(bad.length === 0, bad.join('\n        '));
      return '13 refused, no rows';
    });

    await test('I9 forced failure mid-import (temporary trigger on the LAST unit, rolled back) → full rollback, zero partial rows', async () => {
      const r = await rolledBack(async () => {
        if (draftId) { await c.query('DELETE FROM public.exam_syllabus_nodes WHERE syllabus_version_id = $1', [draftId]); await c.query('DELETE FROM public.exam_syllabus_versions WHERE id = $1', [draftId]); }
        await c.query(`CREATE FUNCTION public.syl_import1_i9_boom() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $f$
          BEGIN IF NEW.raw_slug = 'u3' THEN RAISE EXCEPTION 'SYL_IMPORT1_I9_FORCED_FAILURE'; END IF; RETURN NEW; END; $f$`);
        await c.query(`CREATE TRIGGER syl_import1_i9_boom BEFORE INSERT ON public.exam_syllabus_nodes FOR EACH ROW EXECUTE FUNCTION public.syl_import1_i9_boom()`);
        const count = async () => (await c.query(`SELECT (SELECT count(*) FROM public.exam_syllabus_versions WHERE exam_id = $1)::int v,
            (SELECT count(*) FROM public.exam_syllabus_nodes n JOIN public.exam_syllabus_versions x ON x.id = n.syllabus_version_id WHERE x.exam_id = $1)::int n,
            (SELECT count(*) FROM public.admin_audit_logs WHERE action_type = 'SYLLABUS_DRAFT_IMPORT')::int a,
            (SELECT count(*) FROM public.exam_syllabus_versions WHERE version_tag = 'syl-import1-i9')::int tagged`, [QA])).rows[0];
        const start = await count();
        await asUser(ids['qa-staff'], 'staff', 'qa-staff@courage-library.test');
        const e = await rpcErr(QA, mut((p) => { p.version_tag = 'syl-import1-i9'; }));
        await c.query('RESET ROLE');
        const end = await count();
        return { e: e ? e.message : null, start, end };
      });
      assert(r.e && /SYL_IMPORT1_I9_FORCED_FAILURE/.test(r.e), `the forced failure did not fire: ${r.e}`);
      assert(JSON.stringify(r.start) === JSON.stringify(r.end) && r.end.tagged === 0, `partial rows: ${JSON.stringify(r)}`);
      const left = await ro(`SELECT (SELECT count(*) FROM pg_trigger WHERE tgname = 'syl_import1_i9_boom')::int t, (SELECT count(*) FROM pg_proc WHERE proname = 'syl_import1_i9_boom')::int f`);
      assert(left[0].t === 0 && left[0].f === 0, 'the temporary trigger / function persisted');
      return 'version + 5 nodes + mappings + audit rolled back with the 6th node';
    });

    await test('I10 live: deployed function never writes taxonomy / never publishes; taxonomy unchanged; importer created a DRAFT only', async () => {
      const fn = (await ro(`SELECT p.prosrc, p.prosecdef, p.proconfig::text cfg, coalesce(array_to_string(p.proacl, ','), '') acl FROM pg_proc p WHERE p.oid = 'public.fn_syllabus_import_draft(uuid, jsonb)'::regprocedure`))[0];
      const body = fn.prosrc.replace(/--[^\n]*/g, '');
      assert(fn.prosecdef && fn.cfg === '{"search_path=\\"\\""}', `secdef / search_path: ${fn.cfg}`);
      assert(!/canonical_taxonomy_nodes\s*(\(|SET)|INSERT INTO public\.canonical_taxonomy_nodes/i.test(body) && !/fn_syllabus_publish|fn_syllabus_archive|'PUBLISHED'|'ARCHIVED'/.test(body), 'taxonomy write or publish in the deployed body');
      const acl = fn.acl.split(',').map((a) => a.split('=')[0]);
      assert(acl.includes('authenticated') && !acl.includes('anon') && !acl.includes(''), `ACL: ${acl.join(',')}`);
      const priv = (await ro(`SELECT has_function_privilege('anon', 'public.fn_syllabus_import_draft(uuid, jsonb)', 'EXECUTE') a`))[0].a;
      assert(priv === false, 'anon can execute');
      const statuses = await ro(`SELECT status FROM public.exam_syllabus_versions WHERE id = $1`, [draftId]);
      assert(statuses[0] && statuses[0].status === 'DRAFT', 'the imported version is not a DRAFT');
      assert(JSON.parse(await fingerprint())[0].tax === JSON.parse(fpBefore)[0].tax, 'taxonomy changed');
      return 'static + live';
    });

    await test('I11 staff can import but cannot publish / archive (42501); admin publishes through fn_syllabus_publish (rolled back)', async () => {
      assert(draftId, 'no draft');
      const p = await rpc(staffTok, 'fn_syllabus_publish', { p_version_id: draftId });
      assert(p.status >= 400 && p.code === '42501', `staff publish: ${p.status} ${p.code}`);
      const a = await rpc(staffTok, 'fn_syllabus_archive_version', { p_version_id: draftId });
      assert(a.status >= 400 && a.code === '42501', `staff archive: ${a.status} ${a.code}`);
      assert((await ro(`SELECT status FROM public.exam_syllabus_versions WHERE id = $1`, [draftId]))[0].status === 'DRAFT', 'status changed');
      const r = await rolledBack(async () => {
        await asUser(ids['qa-admin'], 'admin', 'qa-admin@courage-library.test');
        const res = (await c.query('SELECT public.fn_syllabus_publish($1) r', [draftId])).rows[0].r;
        await c.query('RESET ROLE');
        const st = (await c.query('SELECT status FROM public.exam_syllabus_versions WHERE id = $1', [draftId])).rows[0].status;
        return { res, st };
      });
      assert(r.res.success === true && r.st === 'PUBLISHED', `admin publish (existing flow): ${JSON.stringify(r.res).slice(0, 300)}`);
      assert((await ro(`SELECT status FROM public.exam_syllabus_versions WHERE id = $1`, [draftId]))[0].status === 'DRAFT', 'rolled-back publish persisted');
      return 'staff 42501 ×2; admin publish OK (rolled back)';
    });

    await test('I12 live: every topic of the CGL file resolves against the live taxonomy (missing: none); the RPC accepts the full file (QA exam, rolled back)', async () => {
      assert(cgl, 'offline I12 failed');
      const catalog = await ro(`SELECT id, hierarchy_path path, name, is_active FROM public.canonical_taxonomy_nodes WHERE node_type = 'TOPIC'`);
      const res = C.resolveImportTopics(cgl, catalog, 'ssc-cgl');
      assert(res.errors.length === 0, `missing ${res.missing.join(', ') || '-'}; inactive ${res.inactive.join(', ') || '-'}`);
      const qaCopy = { ...C.importPayloadToJson(cgl), exam: 'qa-syllabus-test', cycle_year: null, version_tag: 'syl-import1-cgl-dryrun' };
      const r = await rolledBack(async () => {
        if (draftId) { await c.query('DELETE FROM public.exam_syllabus_nodes WHERE syllabus_version_id = $1', [draftId]); await c.query('DELETE FROM public.exam_syllabus_versions WHERE id = $1', [draftId]); }
        await asUser(ids['qa-staff'], 'staff', 'qa-staff@courage-library.test');
        const out = (await c.query('SELECT public.fn_syllabus_import_draft($1, $2) r', [QA, qaCopy])).rows[0].r;
        await c.query('RESET ROLE');
        const rep = (await c.query('SELECT public.fn_syllabus__validate($1) r', [out.version_id])).rows[0].r;
        return { out, rep };
      });
      assert(r.out.nodes === 41 && r.out.mappings === 36, JSON.stringify(r.out));
      assert(r.rep.ok === true, `CGL draft does not validate: ${JSON.stringify(r.rep.errors).slice(0, 300)}`);
      return `36/36 topics resolve; RPC 41 nodes / 36 mappings; validate ok; ${r.rep.warning_count} warnings`;
    });
  } finally {
    if (draftId && qaExam) await deleteOwnDraft(draftId, qaExam.id).catch((e) => console.log(`  WARN  cleanup failed: ${e.message}`));
  }

  await test('CLEANUP QA-exam syllabus rows back to the baseline; non-QA syllabus rows + taxonomy byte-identical', async () => {
    const QA = qaExam.id;
    const rows = (await ro(`SELECT (SELECT count(*) FROM public.exam_syllabus_versions WHERE exam_id = $1 AND version_tag LIKE 'syl-import1-%')::int tagged,
        (SELECT count(*) FROM public.exam_syllabus_versions WHERE exam_id = $1 AND status = 'DRAFT')::int drafts`, [QA]))[0];
    assert(rows.tagged === 0 && rows.drafts === 0, JSON.stringify(rows));
    assert(JSON.stringify(await qaRows()) === JSON.stringify(before), `QA rows ${JSON.stringify(await qaRows())} vs baseline ${JSON.stringify(before)}`);
    assert((await fingerprint()) === fpBefore, 'non-QA syllabus rows or taxonomy changed');
    return `QA exam ${before.v} versions / ${before.n} nodes / ${before.m} mappings (baseline); md5 identical`;
  });
  await c.end().catch(() => {});
  finish();

  /** deletes the suite's own DRAFT on the QA exam (nodes first, while the version is still a DRAFT; mappings cascade) */
  async function deleteOwnDraft(id, examId) {
    await safeBegin(c);
    try {
      const own = (await c.query(`SELECT 1 FROM public.exam_syllabus_versions WHERE id = $1 AND exam_id = $2 AND status = 'DRAFT' AND version_tag LIKE 'syl-import1-%'`, [id, examId])).rowCount;
      if (own !== 1) throw new Error('refusing to delete: not the suite\'s own QA DRAFT');
      await c.query('DELETE FROM public.exam_syllabus_nodes WHERE syllabus_version_id = $1', [id]);
      await c.query('DELETE FROM public.exam_syllabus_versions WHERE id = $1', [id]);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }
  }
})().catch((e) => { console.error('SUITE ERROR', String(e && e.message ? e.message : e).slice(0, 400)); process.exit(1); });

function finish() {
  console.log(`\nSYL-IMPORT-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}
