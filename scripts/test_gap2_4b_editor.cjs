/**
 * GAP2-4b batch 1 — admin syllabus editor + admin English-only cleanup.
 *
 * Offline (no network, no DB):
 *   E-01 actions file: every export guards first (staff for drafting, ADMIN ONLY for publish / archive), writes only
 *        through the role-checked fn_syllabus_* RPCs on the caller's session client, no service role, no table writes
 *   E-02 error mapping: 42501 → FORBIDDEN; SYLLABUS_* codes → curated VALIDATION text; trigger / constraint
 *        conditions recognised; anything else → generic DB_ERROR; no database text or ids reach the UI
 *   E-03 server-action role matrix (stubbed guard, recording RPC mock): anon / student denied before any RPC;
 *        staff drafts but cannot publish / archive; admin can; validation-blocked publish returns the report
 *   E-04 English only (decision #35, clarified by #85): no UI-language / medium switch, no Hindi UI labels,
 *        lang="hi" only on content inputs marked data-content-field; E-04b self-tests both sides
 *   E-08 GAP2-4c "Suggest topics": the pure helper ranks exact / contained / similar topic names, ignores
 *        unrelated ones, is deterministic and bounded; the editor only pre-fills checkboxes (no action / RPC call,
 *        no auto-mapping) and the helper imports nothing (no DB, no network)
 * Live (--live [http://localhost:3100]; local production build only; QA identities; QA test exam only):
 *   E-05 qa-staff: new draft on the QA exam → add section + unit → "Suggest topics" lists the matching topic
 *        unticked and maps nothing until "Save topics" → tick + save → validate (no errors);
 *        publish is disabled for staff with an explanation; keyboard tree navigation; every control labelled
 *   E-06 qa-admin: publish the TEST version (confirm dialog) → read model AVAILABLE → archive → NO_SYLLABUS
 *   E-07 the seeded GD / CGL drafts are untouched; no DRAFT is left on the QA exam (leftovers archived)
 *
 * Run: node scripts/test_gap2_4b_editor.cjs [--live [http://localhost:3100]]
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const BASE = (args.find((a) => /^https?:/.test(a)) || 'http://localhost:3100').replace(/\/$/, '');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * Decision #85 (clarifies #35, consistent with #82): the admin UI never switches its own language / medium and its copy
 * stays English. The ONLY Hindi allowed is a field that edits Hindi content: an <input> / <textarea> marked lang="hi" AND
 * data-content-field="…"; a field label may name the language only when it labels such an input. Returns the violations.
 */
function englishOnlyViolations(src) {
  const violations = [];
  // every opening tag (brace-aware: attributes contain "=>" and nested braces)
  const tags = [];
  for (let i = src.indexOf('<'); i >= 0; i = src.indexOf('<', i + 1)) {
    const m = /^<([A-Za-z][\w.]*)/.exec(src.slice(i, i + 40));
    if (!m) continue;
    let depth = 0;
    let j = i;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      else if (src[j] === '>' && depth === 0) break;
    }
    tags.push({ name: m[1], text: src.slice(i, j + 1) });
  }
  const attr = (t, a) => {
    const m = new RegExp(`\\s${a}=(?:"([^"]*)"|'([^']*)'|\\{([^}]*)\\})`).exec(t.text);
    return m ? (m[1] ?? m[2] ?? `{${m[3]}}`) : null;
  };
  const isContentInput = (t) => /^(input|textarea)$/.test(t.name) && attr(t, 'lang') === 'hi' && attr(t, 'data-content-field') !== null;
  const contentIds = new Set(tags.filter(isContentInput).map((t) => attr(t, 'id')).filter(Boolean));
  if (/<option[^>]*value=["'](hindi|hi|both)["']/i.test(src)) violations.push('Hindi / bilingual <option> (a UI-language or medium switch)');
  if (/>\s*[^<{]*\b(Hindi|Bilingual)\b[^<{]*</.test(src)) violations.push('Hindi / bilingual UI label (text)');
  if (/[\u0900-\u097F]/.test(src) || /Devanagari/.test(src)) violations.push('Devanagari in admin code');
  for (const t of tags) {
    const lang = attr(t, 'lang');
    const marker = attr(t, 'data-content-field');
    if (lang !== null && lang !== 'en' && !isContentInput(t)) violations.push(`lang=${lang} on <${t.name}> that is not a marked content input`);
    if (marker !== null && !isContentInput(t)) violations.push(`data-content-field on <${t.name}> without lang="hi"`);
    const label = attr(t, 'label');
    if (label && /\b(Hindi|Bilingual)\b/.test(label) && !contentIds.has(attr(t, 'htmlFor'))) violations.push(`label "${label}" does not label a marked Hindi content input`);
    if (t.name === 'label' && attr(t, 'htmlFor')) {
      const close = src.indexOf('</label>', src.indexOf(t.text));
      const inner = src.slice(src.indexOf(t.text) + t.text.length, close);
      if (/\b(Hindi|Bilingual)\b/.test(inner) && !contentIds.has(attr(t, 'htmlFor'))) violations.push(`<label> "${inner.trim()}" does not label a marked Hindi content input`);
    }
  }
  // a <label htmlFor> naming Hindi for a marked content input is allowed: drop the generic text hit for exactly that case
  if (violations.includes('Hindi / bilingual UI label (text)')) {
    const texts = [...src.matchAll(/>\s*([^<{]*\b(?:Hindi|Bilingual)\b[^<{]*)</g)];
    const allowed = texts.every((m) => {
      const before = src.slice(0, m.index + 1);
      const open = before.lastIndexOf('<label');
      if (open < 0 || before.lastIndexOf('</label>') > open) return false;
      const t = tags.find((x) => src.indexOf(x.text) === open);
      return !!t && contentIds.has(attr(t, 'htmlFor'));
    });
    if (allowed) violations.splice(violations.indexOf('Hindi / bilingual UI label (text)'), 1);
  }
  return { violations, contentInputs: contentIds.size };
}

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 3000)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

// ---------------------------------------------------------------- tiny TS module loader with stubs
function loadTs(rel, stubs) {
  const file = path.join(ROOT, rel);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const m = new Module(file);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  const req = (id) => {
    if (stubs[id]) return stubs[id];
    if (id.startsWith('@/')) {
      const target = id.slice(2);
      const cand = [`${target}.ts`, `${target}.tsx`, `${target}/index.ts`].find((c) => fs.existsSync(path.join(ROOT, c)));
      if (!cand) throw new Error(`unresolved ${id}`);
      return loadTs(cand, stubs);
    }
    return m.require(id);
  };
  new Function('module', 'exports', 'require', 'process', js)(m, m.exports, req, process);
  return m.exports;
}

const ACTION_FILE = 'app/admin/syllabus/actions.ts';
const ACTIONS = ['createSyllabusDraftAction', 'upsertSyllabusNodeAction', 'moveSyllabusNodeAction', 'deleteSyllabusNodeAction', 'setUnitMappingsAction', 'validateSyllabusVersionAction', 'publishSyllabusVersionAction', 'archiveSyllabusVersionAction',
  'previewSyllabusImportAction', 'importSyllabusDraftAction'];
// SYL-IMPORT-1: the import preview is read-only (validator + taxonomy read through lib/syllabus/import-catalog); no RPC
const READ_ONLY = new Set(['previewSyllabusImportAction']);
const ADMIN_ONLY = new Set(['publishSyllabusVersionAction', 'archiveSyllabusVersionAction']);
const U = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const SAMPLE_ARGS = {
  createSyllabusDraftAction: [U, null, null],
  upsertSyllabusNodeAction: [U, { kind: 'SECTION', title: 'S' }],
  moveSyllabusNodeAction: [U, U2, null, 1],
  deleteSyllabusNodeAction: [U, U2],
  setUnitMappingsAction: [U, U2, [U], null],
  validateSyllabusVersionAction: [U],
  publishSyllabusVersionAction: [U],
  archiveSyllabusVersionAction: [U],
  previewSyllabusImportAction: [U, '{', { examSlug: 'qa-syllabus-test', cycleYears: [] }],
  importSyllabusDraftAction: [U, JSON.stringify({ contract_version: 1, exam: 'qa-syllabus-test', papers: [{ code: 'p', title: 'P', sections: [{ code: 's', title: 'S', units: [{ code: 'u', title: 'U' }] }] }] })],
};

function makeHarness() {
  const state = { role: 'admin', rpcCalls: [], nextRpc: null };
  const actionFailure = (code, message) => ({ ok: false, success: false, error: code, code, message });
  const requireAdminStub = {
    actionFailure,
    async guardAdminAction(opts = {}) {
      if (state.role === 'anon') return actionFailure('UNAUTHORIZED', 'Sign in required.');
      if (state.role === 'student') return actionFailure('FORBIDDEN', 'You do not have permission to perform this action.');
      if (state.role === 'staff' && !opts.allowStaff) return actionFailure('FORBIDDEN', 'You do not have permission to perform this action.');
      return { ok: true, isAdmin: true, userId: U, role: state.role, userEmail: '' };
    },
  };
  const stubs = {
    '@/lib/auth/require-admin': requireAdminStub,
    'next/cache': { revalidatePath() {} },
    '@/lib/supabase/server': {
      async createServerSupabaseClient() {
        return {
          async rpc(fn, params) {
            state.rpcCalls.push({ fn, params });
            if (state.nextRpc) return state.nextRpc(fn, params);
            return { data: { success: true, version_id: U, version_number: 1, node_id: U2, created: true, deleted_nodes: 1, ok: true, errors: [], warnings: [], counts: {} }, error: null };
          },
          from() {
            throw new Error('direct table access is not allowed in syllabus actions');
          },
        };
      },
      createAdminServerSupabaseClient() {
        throw new Error('service role is not allowed in syllabus actions');
      },
    },
  };
  const actions = loadTs(ACTION_FILE, stubs);
  const errors = loadTs('lib/syllabus/syllabus-errors.ts', stubs);
  return { state, actions, errors };
}

(async () => {
  console.log('GAP2-4b editor suite');

  await test('E-01 actions: guard first (staff vs admin-only), RPC-only writes on the session client, no service role / table writes', async () => {
    const src = read(ACTION_FILE);
    const bad = [];
    for (const name of ACTIONS) {
      const i = src.indexOf(`export async function ${name}(`);
      if (i < 0) { bad.push(`${name} missing`); continue; }
      const body = src.slice(i, src.indexOf('\nexport async function', i + 10) > 0 ? src.indexOf('\nexport async function', i + 10) : undefined);
      const guard = ADMIN_ONLY.has(name) ? /^[^]*?\{\s*const __auth = await guardAdminAction\(\);\s*if \(!__auth\.ok\) return __auth;/ : /^[^]*?\{\s*const __auth = await guardAdminAction\(\{ allowStaff: true \}\);\s*if \(!__auth\.ok\) return __auth;/;
      if (!guard.test(body)) bad.push(`${name}: guard is not the first statement (or wrong staff policy)`);
      if (!READ_ONLY.has(name) && !/supabase\.rpc\("fn_syllabus_/.test(body)) bad.push(`${name}: no fn_syllabus_* RPC`);
      if (READ_ONLY.has(name) && /supabase\.rpc\(/.test(body)) bad.push(`${name}: read-only action calls an RPC`);
    }
    if (/\.from\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(src)) bad.push('table access in actions');
    if (/createAdminServerSupabaseClient|SERVICE_ROLE/.test(src)) bad.push('service role in actions');
    const exported = [...src.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
    if (JSON.stringify(exported.sort()) !== JSON.stringify([...ACTIONS].sort())) bad.push(`unexpected exports: ${exported.join(', ')}`);
    assert(bad.length === 0, bad.join('\n        '));
    return `${ACTIONS.length} actions`;
  });

  await test('E-02 error mapping: FORBIDDEN / curated VALIDATION / generic DB_ERROR; no database text or ids', async () => {
    const { errors } = makeHarness();
    const map = (err) => errors.mapSyllabusError('t', err);
    const cases = [
      [{ code: '42501', message: 'SYLLABUS_FORBIDDEN: admin role required' }, 'FORBIDDEN'],
      [{ code: '42501', message: 'permission denied for function fn_syllabus_publish' }, 'FORBIDDEN'],
      [{ code: 'P0001', message: `SYLLABUS_NOT_DRAFT: version ${U} is PUBLISHED` }, 'VALIDATION'],
      [{ code: 'P0001', message: `SYLLABUS_PARENT_OTHER_VERSION: parent node ${U} belongs to another syllabus version` }, 'VALIDATION'],
      [{ code: '22023', message: 'SYLLABUS_WEIGHTS_INVALID: one weight per topic' }, 'VALIDATION'],
      [{ code: '23503', message: `SYLLABUS_TOPICS_INVALID: not active TOPIC nodes: ["${U}"]` }, 'VALIDATION'],
      [{ code: 'P0001', message: `Circular parent relationship detected: syllabus node ${U} is an ancestor` }, 'VALIDATION'],
      [{ code: '23505', message: 'duplicate key value violates unique constraint "uq_syllabus_node_sibling_slug"' }, 'VALIDATION'],
      [{ code: '42P01', message: 'relation "public.exam_syllabus_nodes" does not exist' }, 'DB_ERROR'],
      [{ code: '57014', message: 'canceling statement due to statement timeout' }, 'DB_ERROR'],
      [null, 'DB_ERROR'],
    ];
    const bad = [];
    const orig = console.error;
    console.error = () => {};
    try {
      for (const [err, want] of cases) {
        const r = map(err);
        if (r.ok !== false || r.error !== want) bad.push(`${JSON.stringify(err)} → ${r.error} (want ${want})`);
        if (/[0-9a-f]{8}-[0-9a-f]{4}|relation|constraint|violates|statement|fn_|SYLLABUS_|public\./i.test(r.message)) bad.push(`raw text leaked: ${r.message}`);
      }
    } finally {
      console.error = orig;
    }
    assert(bad.length === 0, bad.join('\n        '));
    return `${cases.length} cases`;
  });

  await test('E-03 role matrix: anon / student denied before any RPC; staff drafts, not publish / archive; admin all; blocked publish returns report', async () => {
    const { state, actions } = makeHarness();
    const bad = [];
    for (const role of ['anon', 'student', 'staff', 'admin']) {
      for (const name of ACTIONS) {
        state.role = role;
        state.rpcCalls = [];
        state.nextRpc = null;
        const r = await actions[name](...SAMPLE_ARGS[name]);
        const allowed = role === 'admin' || (role === 'staff' && !ADMIN_ONLY.has(name));
        if (allowed && (!r.ok || (state.rpcCalls.length === 0) !== READ_ONLY.has(name))) bad.push(`${role} ${name}: expected allowed, got ${JSON.stringify(r).slice(0, 120)}`);
        if (!allowed && (r.ok || state.rpcCalls.length > 0)) bad.push(`${role} ${name}: expected denied before RPC, got ok=${r.ok} rpc=${state.rpcCalls.length}`);
        if (!allowed && role === 'anon' && r.error !== 'UNAUTHORIZED') bad.push(`anon ${name}: ${r.error}`);
        if (!allowed && role !== 'anon' && r.error !== 'FORBIDDEN') bad.push(`${role} ${name}: ${r.error}`);
      }
    }
    // validation-blocked publish: nothing published, the report comes back, curated message
    state.role = 'admin';
    state.nextRpc = () => ({ data: { success: false, code: 'VALIDATION_FAILED', report: { ok: false, error_count: 1, errors: [{ code: 'UNIT_UNMAPPED', node_id: U2, topic_id: null, message: 'UNIT "x" is not mapped to any topic.' }], warnings: [] } }, error: null });
    const blocked = await actions.publishSyllabusVersionAction(U);
    if (blocked.ok || blocked.error !== 'VALIDATION' || !blocked.report || blocked.report.error_count !== 1) bad.push(`blocked publish: ${JSON.stringify(blocked).slice(0, 200)}`);
    // RPC error mapping through an action
    state.nextRpc = () => ({ data: null, error: { code: 'P0001', message: `SYLLABUS_IMMUTABLE: PUBLISHED syllabus version ${U} is read-only` } });
    const imm = await actions.upsertSyllabusNodeAction(U, { id: U2, title: 'x' });
    if (imm.ok || imm.error !== 'VALIDATION' || /[0-9a-f]{8}-/.test(imm.message)) bad.push(`immutable mapping: ${JSON.stringify(imm)}`);
    // input validation happens before any RPC
    state.rpcCalls = [];
    state.nextRpc = null;
    const badInput = await actions.setUnitMappingsAction(U, U2, ['not-a-uuid'], null);
    const badWeights = await actions.setUnitMappingsAction(U, U2, [U], [0.5, 0.5]);
    const badNode = await actions.upsertSyllabusNodeAction(U, { kind: 'CHAPTER', title: 'x' });
    if (badInput.ok || badWeights.ok || badNode.ok || state.rpcCalls.length) bad.push('invalid input reached the RPC');
    // empty expected range is sent as NULL, never 0
    state.rpcCalls = [];
    await actions.upsertSyllabusNodeAction(U, { kind: 'UNIT', title: 'x', expected_questions_min: null, expected_questions_max: null });
    const sent = state.rpcCalls[0] && state.rpcCalls[0].params.p_node;
    if (!sent || sent.expected_questions_min !== null || sent.expected_questions_max !== null) bad.push(`expected range not NULL: ${JSON.stringify(sent)}`);
    assert(bad.length === 0, bad.join('\n        '));
    return '4 roles × 8 actions; blocked publish; error + input mapping';
  });

  await test('E-04 English only (decision #35, clarified by #85): no UI-language / medium switch, no Hindi UI labels, lang="hi" only on content inputs', async () => {
    const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []));
    const files = [...walk('app/admin'), ...walk('components/admin')].filter((f) => !f.endsWith('.ts') || f.endsWith('page.ts'));
    assert(files.length >= 30, `admin UI files scanned ${files.length} (min 30)`); // GATE-HYGIENE-1
    const bad = [];
    let contentInputs = 0;
    for (const f of files) {
      const r = englishOnlyViolations(read(f));
      contentInputs += r.contentInputs;
      r.violations.forEach((v) => bad.push(`${f}: ${v}`));
    }
    assert(bad.length === 0, bad.join('\n        '));
    return `${files.length} admin UI files; ${contentInputs} Hindi content input(s)`;
  });

  await test('E-04b self-test: the #85 checker fails every forbidden form and passes only marked Hindi content inputs', async () => {
    const DEV = String.fromCharCode(0x0939, 0x093f, 0x0902); // built at runtime: no Devanagari in this file
    const fail = {
      'UI-language switch': '<select><option value="en">English</option><option value="hi">Hindi</option></select>',
      'medium switch (both)': '<select><option value="both">Both</option></select>',
      'Hindi UI label (JSX text)': '<h2>Hindi medium</h2>',
      'Devanagari UI label': `<h2>{"Hindi (${DEV})"}</h2>`,
      'lang="hi" on a display element': '<span lang="hi">{name}</span>',
      'dynamic lang on a display element': '<p lang={x ? "en" : "hi"}>{t}</p>',
      'lang="hi" input without the content marker': '<input id="a" lang="hi" value={v} />',
      'content marker without lang="hi"': '<input id="a" data-content-field="name_hi" value={v} />',
      'Hindi label on a non-content input': '<StudioField label="Hindi name" htmlFor="a"><input id="a" value={v} /></StudioField>',
    };
    const pass = {
      'marked Hindi content input + its label': '<StudioField label="Hindi name" htmlFor="a"><input id="a" lang="hi" data-content-field="name_hi" value={v} /></StudioField>',
      'marked Hindi content textarea': '<label htmlFor="b">Hindi alias</label><textarea id="b" lang="hi" data-content-field="alias_hi" />',
      'English only screen': '<StudioField label="Name" htmlFor="c"><input id="c" lang="en" value={v} /></StudioField>',
    };
    const wrong = [];
    for (const [k, src] of Object.entries(fail)) if (englishOnlyViolations(src).violations.length === 0) wrong.push(`should FAIL: ${k}`);
    for (const [k, src] of Object.entries(pass)) {
      const v = englishOnlyViolations(src).violations;
      if (v.length) wrong.push(`should PASS: ${k} — ${v.join('; ')}`);
    }
    assert(wrong.length === 0, wrong.join('\n        '));
    return `${Object.keys(fail).length} forbidden forms fail · ${Object.keys(pass).length} allowed forms pass`;
  });

  await test('E-08 Suggest topics: pure ranked helper; UI only pre-fills checkboxes (no auto-mapping)', async () => {
    const src = read('lib/syllabus/topic-suggest.ts');
    assert(!/^\s*import\b/m.test(src) && !/fetch\(|supabase|rpc\(/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'helper must be pure (no imports, no network / DB)');
    const { suggestTopics, normalizeTopicText, topicSimilarity } = loadTs('lib/syllabus/topic-suggest.ts', {});
    const topics = [
      { id: 't1', name: 'Percentage', subject_name: 'Quantitative Aptitude' },
      { id: 't2', name: 'Profit & Loss', subject_name: 'Quantitative Aptitude' },
      { id: 't3', name: 'Syllogism', subject_name: 'Reasoning' },
      { id: 't4', name: 'Time and Work', subject_name: 'Quantitative Aptitude' },
      { id: 't5', name: 'Indian Polity', subject_name: 'General Awareness' },
    ];
    assert(normalizeTopicText('  Profit & Loss (Basics) ') === 'profit and loss basics', 'normalizer');
    assert(topicSimilarity('Percentage', 'percentage') === 1 && topicSimilarity('', 'x') === 0, 'similarity bounds');
    const ids = (title, opts) => suggestTopics(title, topics, opts).map((x) => x.topic.id);
    assert(ids('Percentage')[0] === 't1', 'exact match first');
    assert(ids('Profit and loss')[0] === 't2', '"&" ≡ "and"');
    assert(ids('Percentages')[0] === 't1', 'near match');
    assert(ids('Percentage and profit').includes('t1'), 'topic named by a title word');
    assert(ids('Time & Work problems')[0] === 't4', 'contained phrase');
    assert(!ids('Constitution of India basics').includes('t3'), 'unrelated topic suggested');
    assert(ids('').length === 0 && ids('Percentage', { limit: 1 }).length === 1, 'empty title / limit');
    assert(JSON.stringify(suggestTopics('Percentage', topics)) === JSON.stringify(suggestTopics('Percentage', topics)), 'deterministic');
    const ui = read('components/admin/syllabus/syllabus-editor.tsx');
    assert(/setSuggestions\(suggestTopics\(selected\.title, topics\)\)/.test(ui), 'editor does not use the helper');
    const block = ui.slice(ui.indexOf('{suggestions !== null'), ui.indexOf('Active topics</legend>'));
    assert(/checked=\{picked\.some/.test(block) && !/Action\(|setUnitMappings|run\(/.test(block), 'suggestions must only toggle the pending selection');
    return '8 ranking cases; UI pre-fill only';
  });

  if (LIVE) await live();
  console.log(`\nGAP2-4b editor: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('SUITE ERROR', String(e && (e.message || e)).slice(0, 400));
  process.exit(1);
});

// ---------------------------------------------------------------- live part
async function live() {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('live part runs against a local build only');
  const { chromium } = require('playwright');
  const { Client } = require('pg');
  const { dbTarget, readEnv } = require('./db/_db-env.cjs');
  const env = readEnv();
  const db = new Client({ ...dbTarget().pg, port: 6543 });
  db.on('error', () => {});
  await db.connect();
  const ro = async (sql, p) => {
    await db.query('BEGIN READ ONLY');
    try {
      return (await db.query(sql, p)).rows;
    } finally {
      await db.query('ROLLBACK');
    }
  };
  const qaExam = (await ro(`SELECT id FROM public.exams WHERE slug = 'qa-syllabus-test' AND NOT is_active`))[0];
  assert(qaExam, 'QA test exam (migration 081) missing or active');
  // GAP2-4c: the unit is titled after a real active topic so "Suggest topics" has an exact match
  const suggestTopic = (await ro(`SELECT name FROM public.canonical_taxonomy_nodes WHERE node_type = 'TOPIC' AND is_active ORDER BY name LIMIT 1`))[0];
  assert(suggestTopic, 'no active TOPIC');
  const seededShape = async () =>
    JSON.stringify(await ro(`SELECT e.slug, v.status, v.updated_at, (SELECT count(*) FROM public.exam_syllabus_nodes n WHERE n.syllabus_version_id = v.id)::int nodes,
      (SELECT max(n.updated_at) FROM public.exam_syllabus_nodes n WHERE n.syllabus_version_id = v.id) nu FROM public.exam_syllabus_versions v JOIN public.exams e ON e.id = v.exam_id
      WHERE e.slug IN ('ssc-gd','ssc-cgl') ORDER BY e.slug, v.version_number`));
  const before = await seededShape();
  const readModel = async () => (await ro(`SELECT public.fn_exam_syllabus_read_model($1) r`, [qaExam.id]))[0].r;

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const signIn = async (email, key) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    // CI-FIX-1 (#74): CAPTCHA-safe QA session cookies (no login form; scripts/live/qa-session.cjs). `key` is unused.
    await require('./live/qa-session.cjs').qaBrowserLogin(ctx, email, BASE);
    const page = await ctx.newPage();
    // each edit = server action + RPC + router.refresh (several Supabase round trips); allow slow links
    page.setDefaultTimeout(120000);
    return page;
  };
  const waitMsg = async (page, rx) => page.locator('[role=status], [role=alert]').filter({ hasText: rx }).first().waitFor({ timeout: 120000 });
  let versionUrl = null;
  try {
    await test('E-05 qa-staff: draft → section + unit → map topic → validate; publish disabled for staff; keyboard tree; labelled controls', async () => {
      const page = await signIn('qa-staff@courage-library.test', 'QA_STAFF_PASSWORD');
      await page.goto(`${BASE}/admin/syllabus?exam=${qaExam.id}`, { waitUntil: 'networkidle', timeout: 120000 });
      await page.getByRole('button', { name: 'New empty draft' }).click();
      // client-side router.push (no load event): poll the URL; on timeout report what the page says
      const isEditor = () => /\/admin\/syllabus\/[0-9a-f-]{36}$/.test(page.url());
      for (let t = 0; t < 120 && !isEditor(); t++) await page.waitForTimeout(1000);
      if (!isEditor()) throw new Error(`no editor after New empty draft: ${(await page.locator('[role=status],[role=alert]').allTextContents()).join(' | ')}`);
      versionUrl = page.url();
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Add section' }).click();
      await waitMsg(page, /Section added/);
      await page.getByRole('treeitem').first().waitFor({ timeout: 120000 }); // the success message precedes the refreshed tree
      await page.getByRole('treeitem').first().click();
      await page.getByLabel('Title').fill('QA Section');
      await page.getByRole('button', { name: 'Save details' }).click();
      await waitMsg(page, /Details saved/);
      await page.getByRole('button', { name: 'Add unit inside' }).click();
      await waitMsg(page, /Unit added/);
      await page.getByRole('treeitem', { level: 2 }).first().waitFor({ timeout: 120000 });
      // keyboard: focus the section item, ArrowDown → the unit, Enter selects it
      const items = page.getByRole('treeitem');
      await items.first().focus();
      await page.keyboard.press('ArrowDown');
      const focused = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-level'));
      assert(focused === '2', `ArrowDown did not reach the unit (aria-level ${focused})`);
      await page.keyboard.press('Enter');
      await page.getByLabel('Title').fill(suggestTopic.name);
      await page.getByRole('button', { name: 'Save details' }).click();
      await waitMsg(page, /Details saved/);
      // ArrowLeft moves to the parent; ArrowLeft again collapses it
      await page.getByRole('treeitem', { level: 2 }).first().focus();
      await page.keyboard.press('ArrowLeft');
      const lvl = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-level'));
      assert(lvl === '1', 'ArrowLeft did not move to the parent');
      await page.keyboard.press('ArrowLeft');
      assert((await page.getByRole('treeitem', { level: 1 }).first().getAttribute('aria-expanded')) === 'false', 'ArrowLeft did not collapse');
      await page.keyboard.press('ArrowRight');
      await page.getByRole('treeitem', { level: 2 }).first().click();
      // GAP2-4c: "Suggest topics" lists the matching topic unticked and maps nothing by itself
      await page.getByRole('button', { name: 'Suggest topics' }).click();
      const sug = page.locator('fieldset', { has: page.locator('legend', { hasText: 'Suggested topics' }) });
      await sug.waitFor({ timeout: 30000 });
      assert((await sug.locator('label').first().textContent()).includes(suggestTopic.name), `top suggestion is not "${suggestTopic.name}"`);
      assert(!(await sug.locator('input[type=checkbox]').first().isChecked()), 'a suggestion was pre-ticked');
      assert(!(await page.getByRole('button', { name: /^Save topics \(1\)/ }).isVisible().catch(() => false)), 'suggestion counted as selected');
      const mapped = await ro(`SELECT count(*)::int n FROM public.exam_syllabus_canonical_mappings m JOIN public.exam_syllabus_nodes n ON n.id = m.syllabus_node_id
                                WHERE n.syllabus_version_id = $1`, [versionUrl.split('/').pop()]);
      assert(mapped[0].n === 0, 'Suggest topics wrote a mapping');
      // staff tick the suggestion, then save (the only write path)
      await page.locator('fieldset input[type=checkbox]').first().check();
      await page.waitForTimeout(1500); // a late refresh must not wipe the unsaved selection (regression for the reset-on-refresh bug)
      assert(await page.locator('fieldset input[type=checkbox]').first().isChecked(), 'topic selection was reset by a refresh');
      assert(await page.getByRole('button', { name: 'Save topics (1)' }).isVisible(), 'selected topic not counted');
      await page.getByRole('button', { name: /^Save topics/ }).click();
      await waitMsg(page, /Topics saved/);
      await page.getByRole('treeitem', { level: 2 }).filter({ hasText: '1 topic' }).waitFor({ timeout: 120000 });
      await page.getByRole('button', { name: 'Validate now' }).click();
      await waitMsg(page, /No errors/);
      // staff cannot publish
      const pub = page.getByRole('button', { name: 'Publish', exact: true });
      assert(await pub.isDisabled(), 'Publish enabled for staff');
      assert(await page.getByText('Only an admin can publish').isVisible(), 'no staff explanation');
      // every visible form control is labelled
      const unnamed = await page.evaluate(() =>
        [...document.querySelectorAll('main input, main select, main textarea, main button, [role=treeitem]')]
          .filter((el) => el.getClientRects().length && !el.closest('[hidden]'))
          .filter((el) => {
            const id = el.id;
            const name = (el.getAttribute('aria-label') || (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent) || el.closest('label')?.textContent || el.textContent || '').trim();
            return !name;
          })
          .map((el) => el.outerHTML.slice(0, 100)),
      );
      assert(unnamed.length === 0, `unnamed controls: ${unnamed.join(' | ')}`);
      await page.context().close();
      return 'draft built and valid; staff publish disabled';
    });

    await test('E-06 qa-admin: publish the TEST version → read model AVAILABLE → archive → NO_SYLLABUS', async () => {
      assert(versionUrl, 'no draft from E-05');
      const page = await signIn('qa-admin@courage-library.test', 'QA_ADMIN_PASSWORD');
      await page.goto(versionUrl, { waitUntil: 'networkidle', timeout: 120000 });
      await page.getByRole('button', { name: 'Publish', exact: true }).click();
      const dlg = page.getByRole('dialog', { name: /^Publish version/ });
      await dlg.waitFor();
      assert(/No version is published|will be archived/.test(await dlg.textContent()), 'confirm dialog does not say what will be archived');
      await dlg.getByRole('button', { name: 'Publish now' }).click();
      await waitMsg(page, /is published/);
      const rm = await readModel();
      assert(rm.state === 'AVAILABLE' && rm.nodes.length === 2 && rm.nodes.some((n) => n.title === suggestTopic.name && n.topics.length === 1), `read model: ${JSON.stringify(rm).slice(0, 200)}`);
      await page.goto(`${BASE}/admin/syllabus?exam=${qaExam.id}`, { waitUntil: 'networkidle', timeout: 120000 });
      assert(await page.getByText('Published (live)').first().isVisible(), 'versions list does not show the live version');
      await page.getByRole('button', { name: /^Archive version/ }).first().click();
      await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
      await waitMsg(page, /archived/);
      const after = await readModel();
      assert(after.state === 'NO_SYLLABUS', `after archive: ${after.state}`);
      await page.context().close();
      return 'published, visible in the read model, archived';
    });
  } finally {
    // E-07 cleanup + invariants: archive any DRAFT left on the QA exam (admin JWT through the RPC), seeded drafts untouched
    const admin = (await ro(`SELECT id FROM auth.users WHERE email = 'qa-admin@courage-library.test'`))[0];
    const left = await ro(`SELECT id FROM public.exam_syllabus_versions WHERE exam_id = $1 AND status = 'DRAFT'`, [qaExam.id]);
    for (const v of left) {
      await db.query('BEGIN READ WRITE');
      try {
        await db.query('SET LOCAL ROLE authenticated');
        await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: admin.id, role: 'authenticated', email: 'qa-admin@courage-library.test', app_metadata: { role: 'admin' } })]);
        await db.query('SELECT public.fn_syllabus_archive_version($1)', [v.id]);
        await db.query('COMMIT');
      } catch (e) {
        await db.query('ROLLBACK');
        throw e;
      }
    }
    await test('E-07 seeded GD / CGL drafts untouched; no DRAFT left on the QA exam', async () => {
      assert((await seededShape()) === before, 'a seeded draft changed');
      const drafts = await ro(`SELECT count(*)::int n FROM public.exam_syllabus_versions WHERE exam_id = $1 AND status <> 'ARCHIVED'`, [qaExam.id]);
      assert(drafts[0].n === 0, `${drafts[0].n} non-archived versions on the QA exam`);
      return left.length ? `${left.length} leftover draft(s) archived` : 'nothing left over';
    });
    await browser.close();
    await db.end();
  }
}
