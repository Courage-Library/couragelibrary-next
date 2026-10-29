#!/usr/bin/env node
/**
 * CA-1 MASTER TREE — offline gate (no network, no DB; reads source + runs the TS modules with mocks).
 *   N-01 normalizeTaxonomyName: fixed expected outputs (NFKC, case, &, punctuation, whitespace, Hindi danda)
 *   N-02 the SQL normalization in migration 115 folds EXACTLY TAXONOMY_PUNCTUATION (same order of steps)
 *   R-01 the 4-level master chain: allowed children SUBJECT → TOPIC → SUBTOPIC → CONCEPT; no new DOMAIN / METHOD;
 *        mirrored by fn_guard_master_tree (depth 4, TOPIC under SUBJECT, CONCEPT under SUBTOPIC)
 *   R-02 validators: Hindi name, alias, state code, same-level move
 *   M-01 migration 115: the 11 functions are SECURITY INVOKER, REVOKEd from PUBLIC / anon / authenticated and granted
 *        to service_role only; aliases RLS on with the staff policy (no blanket USING(true)); per-parent projection
 *        slugs; unique hierarchy_path; preflight asserts; rollback file drops every object
 *   S-01 TaxonomyService: every CA-1 method denies a non-admin before any query / RPC
 *   S-02 merge needs the typed confirmation word + a reason BEFORE the RPC; move / alias / merge go through the RPCs
 *        with the session actor; DB errors map to admin messages (SYLLABUS_LOCKED, per-parent DUPLICATE_SLUG)
 *   A-01 every server action in app/admin/taxonomy/actions.ts starts with guardAdminAction (admin only)
 *   U-01 the master tree screen: Studio template with ONE primary in the header (R4), named icon buttons, labelled
 *        controls, Hindi content inputs marked lang="hi" + data-content-field (#85), English-only UI copy (R9), merge disabled until reason + word
 *   L-01 the link snapshot compares counts AND hashes; only a NEW EMPTY link set is not a change
 * Run: node scripts/test_ca1_taxonomy.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

// ---------- TS transpile + @/ alias ----------
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return originalResolveFilename.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
const transpile = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  });
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = transpile;
require.extensions['.tsx'] = transpile;

// ---------- mocks: admin guard + a recording service-role client ----------
const auth = { ok: true };
const calls = [];
let rpcResult = { data: null, error: null };
function client() {
  const chain = (table) => {
    const c = {};
    ['select', 'eq', 'order', 'update', 'insert', 'is', 'in', 'limit'].forEach((op) => {
      c[op] = (...args) => {
        calls.push({ kind: 'from', table, op, args });
        return c;
      };
    });
    c.single = async () => ({ data: null, error: { code: 'X' } });
    c.maybeSingle = async () => ({ data: null, error: null });
    c.then = (f, r) => Promise.resolve({ data: [], error: null }).then(f, r);
    return c;
  };
  return {
    from: (t) => {
      calls.push({ kind: 'from', table: t });
      return chain(t);
    },
    rpc: async (fn, args) => {
      calls.push({ kind: 'rpc', fn, args });
      return rpcResult;
    },
  };
}
const MOCKS = {
  'server-only': {},
  '@/lib/auth/require-admin': {
    guardAdminAction: async () => (auth.ok ? { ok: true, isAdmin: true, userId: '11111111-1111-4111-8111-111111111111', userEmail: 'owner@example.test', role: 'admin' } : { ok: false, success: false, error: 'FORBIDDEN', code: 'FORBIDDEN', message: 'no' }),
    sanitizeActionResult: (_n, r) => r,
  },
  '@/lib/supabase/server': { createAdminServerSupabaseClient: () => client() },
  'next/cache': { revalidatePath: () => undefined },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return originalLoad.call(this, request, parent, isMain);
};

// ---------- harness ----------
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 900)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const MIGRATION = 'supabase/migrations/20261027000115_ca1_master_tree.sql';
const FUNCS = [
  'fn_taxonomy_normalize(text)',
  'fn_taxonomy_lock_scope(uuid)',
  'fn_taxonomy_scope_conflict(uuid, text, uuid)',
  'fn_guard_master_tree()',
  'fn_guard_taxonomy_node_alias()',
  'fn_taxonomy_audit(uuid, text, text, uuid, jsonb, jsonb, text)',
  'fn_taxonomy_add_alias(uuid, text, text, text, uuid, text)',
  'fn_taxonomy_remove_alias(uuid, uuid, text)',
  'fn_taxonomy_subtree_ids(uuid)',
  'fn_taxonomy_move_node(uuid, uuid, uuid, text, text)',
  'fn_taxonomy_merge_nodes(uuid, uuid, uuid, text, text)',
];

(async () => {
  const norm = require(path.join(ROOT, 'lib/taxonomy/normalize.ts'));
  const rules = require(path.join(ROOT, 'services/taxonomy/taxonomy.rules.ts'));
  const sql = read(MIGRATION);

  await test('N-01 normalizer: NFKC, lower case, & → and, punctuation folded, whitespace collapsed, Hindi kept (danda folded)', () => {
    const cases = {
      '  Profit & Loss  ': 'profit and loss',
      'Time, Speed & Distance': 'time speed and distance',
      'Simple/Compound Interest': 'simple compound interest',
      'Number-System': 'number system',
      'Mensuration (2D)': 'mensuration 2d',
      'ＦＵＬＬ　ｗｉｄｔｈ': 'full width',
      'Café Économie': 'café économie',
      'लाभ और हानि।': 'लाभ और हानि',
      '‘Fill’ in the “blanks” – part—two…': 'fill in the blanks part two',
      '100% Questions?': '100 questions',
      '': '',
    };
    for (const [input, want] of Object.entries(cases)) assert(norm.normalizeTaxonomyName(input) === want, `${JSON.stringify(input)} → ${JSON.stringify(norm.normalizeTaxonomyName(input))}, want ${JSON.stringify(want)}`);
    assert(norm.normalizeTaxonomyName(null) === '' && norm.NORMALIZE_VECTORS.length >= 12, 'null / vectors');
    return `${Object.keys(cases).length} cases`;
  });

  await test('N-02 SQL fn_taxonomy_normalize folds exactly TAXONOMY_PUNCTUATION, in the same order (NFKC → lower → & → fold → collapse)', () => {
    const m = sql.match(/CREATE OR REPLACE FUNCTION public\.fn_taxonomy_normalize[\s\S]*?\$fn\$([\s\S]*?)\$fn\$/);
    assert(m, 'function body');
    const body = m[1];
    const lit = body.match(/'((?:[^']|'')*)',\s*\n\s*repeat\(' ', (\d+)\)/);
    assert(lit, 'translate literal');
    const chars = lit[1].replace(/''/g, "'");
    assert(chars === norm.TAXONOMY_PUNCTUATION, `SQL punctuation ${JSON.stringify(chars)} ≠ TS ${JSON.stringify(norm.TAXONOMY_PUNCTUATION)}`);
    assert(Number(lit[2]) === [...chars].length && [...chars].length === 40, `repeat ${lit[2]} vs ${[...chars].length}`);
    assert(/replace\(lower\(normalize\(coalesce\(p_text, ''\), NFKC\)\), '&', ' and '\)/.test(body), 'NFKC → lower → & order');
    assert(/regexp_replace\([\s\S]*'\\s\+', ' ', 'g'\)/.test(body) && /btrim\(/.test(body), 'collapse + trim');
    return '40 characters';
  });

  await test('R-01 the master chain SUBJECT → TOPIC → SUBTOPIC → CONCEPT (no new DOMAIN / METHOD), mirrored by fn_guard_master_tree', () => {
    const kids = (t) => rules.allowedChildTypes(t).join(',');
    assert(kids(null) === 'SUBJECT' && kids('SUBJECT') === 'TOPIC' && kids('TOPIC') === 'SUBTOPIC' && kids('SUBTOPIC') === 'CONCEPT' && kids('CONCEPT') === '', `children: ${[null, 'SUBJECT', 'TOPIC', 'SUBTOPIC', 'CONCEPT'].map(kids).join(' | ')}`);
    assert(rules.TAXONOMY_PARENT_RULES.DOMAIN.length === 0 && rules.TAXONOMY_PARENT_RULES.METHOD.length === 0, 'DOMAIN / METHOD creatable');
    assert(rules.MAX_MASTER_DEPTH === 4 && rules.MASTER_LEVELS.join(',') === 'SUBJECT,TOPIC,SUBTOPIC,CONCEPT', 'levels');
    assert(/IF NEW\.node_depth > 4 THEN/.test(sql), 'SQL depth 4');
    assert(/NEW\.node_type = 'TOPIC' AND v_parent_type <> 'SUBJECT'/.test(sql) && /NEW\.node_type = 'CONCEPT' AND v_parent_type <> 'SUBTOPIC'/.test(sql), 'SQL parent rules');
    assert(/NEW\.node_type IN \('DOMAIN', 'METHOD'\)/.test(sql), 'SQL DOMAIN / METHOD');
  });

  await test('R-02 validators: Hindi name, alias, state code (AA), same-level move', () => {
    assert(rules.validateNameHi(null) === null && rules.validateNameHi('प्रतिशत') === null && rules.validateNameHi('  ') && rules.validateNameHi('x'.repeat(161)), 'name_hi');
    assert(rules.validateAlias('Percent') === null && rules.validateAlias(' ') && rules.validateAlias('x'.repeat(161)), 'alias');
    assert(rules.validateStateCode('UP') === null && rules.validateStateCode('') === null && rules.validateStateCode('up') && rules.validateStateCode('UPX'), 'state code');
    assert(rules.isSameLevelMove('SUBJECT', 'SUBJECT') && !rules.isSameLevelMove('TOPIC', 'SUBJECT') && !rules.isSameLevelMove(null, null), 'move');
    assert(rules.SUBJECT_TYPES.join(',') === 'APTITUDE,REASONING,LANGUAGE,GK_GA,TECHNICAL,PEDAGOGY,STATE_SPECIFIC', 'subject types (REASONING: LESSON-PROMPT-2, migration 121)');
    // the CURRENT subject-type list is the one in migration 121 (115 + REASONING, LESSON-PROMPT-2)
    const sql121 = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261028000121_lesson_prompt_2.sql'), 'utf8');
    const sqlTypes = sql121.match(/subject_type IN \(([^)]*)\)/)[1].replace(/[' ]/g, '');
    assert(sqlTypes === rules.SUBJECT_TYPES.join(','), `SQL subject types ${sqlTypes}`);
  });

  await test('M-01 migration 115: INVOKER only, client EXECUTE revoked, service_role granted, RLS staff policy, per-parent slugs, unique path, preflight, rollback', () => {
    assert(!/SECURITY DEFINER/i.test(sql), 'a SECURITY DEFINER function');
    for (const f of FUNCS) {
      const esc = f.replace(/[()[\]]/g, (c) => '\\' + c);
      assert(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC, anon, authenticated;`).test(sql), `REVOKE ${f}`);
    }
    const grants = sql.match(/GRANT EXECUTE ON FUNCTION [^;]+ TO ([a-z_]+);/g) || [];
    assert(grants.length === 9 && grants.every((g) => /TO service_role;$/.test(g)), `grants: ${grants.length}`);
    assert(/ALTER TABLE public\.taxonomy_node_aliases ENABLE ROW LEVEL SECURITY;/.test(sql), 'RLS');
    assert(/REVOKE ALL ON TABLE public\.taxonomy_node_aliases FROM PUBLIC, anon, authenticated;/.test(sql) && /GRANT SELECT ON TABLE public\.taxonomy_node_aliases TO authenticated;/.test(sql), 'table grants');
    assert(/FOR SELECT TO authenticated USING \(public\.fn_jwt_is_admin_or_staff\(\)\)/.test(sql) && !/USING\s*\(\s*true\s*\)/i.test(sql), 'staff policy / blanket');
    assert(/DROP CONSTRAINT topics_slug_key;[\s\S]*UNIQUE \(subject_id, slug\)/.test(sql) && /DROP CONSTRAINT subtopics_slug_key;[\s\S]*UNIQUE \(topic_id, slug\)/.test(sql), 'per-parent slugs');
    assert(/CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_hierarchy_path ON public\.canonical_taxonomy_nodes \(hierarchy_path\)/.test(sql), 'unique path');
    assert((sql.match(/CA1_PREFLIGHT/g) || []).length >= 6, 'preflight');
    const rb = read('docs/database/rollback/115_rollback.sql');
    for (const f of FUNCS.filter((x) => !x.startsWith('fn_guard_') && !x.startsWith('fn_taxonomy_scope') && !x.startsWith('fn_taxonomy_lock') && !x.startsWith('fn_taxonomy_normalize')))
      assert(rb.includes(`DROP FUNCTION IF EXISTS public.${f.replace(/, /g, ', ')}`), `rollback ${f}`);
    assert(/topics_slug_key UNIQUE \(slug\)/.test(rb) && /DROP TABLE IF EXISTS public\.taxonomy_node_aliases/.test(rb) && /DROP FUNCTION IF EXISTS public\.fn_taxonomy_normalize/.test(rb), 'rollback body');
    return `${FUNCS.length} functions`;
  });

  const svc = require(path.join(ROOT, 'services/taxonomy/taxonomy.service.ts'));
  const T = svc.TaxonomyService;
  const A = '22222222-2222-4222-8222-222222222222';
  const B = '33333333-3333-4333-8333-333333333333';

  await test('S-01 every CA-1 service method denies a non-admin before any query or RPC', async () => {
    auth.ok = false;
    calls.length = 0;
    const res = [
      await T.updateDetails(A, { nameHi: null, subjectType: null, stateCode: null }),
      await T.listAliases(),
      await T.addAlias(A, 'x', 'en'),
      await T.removeAlias(A),
      await T.moveNode(A, B),
      await T.mergeNodes(A, B, 'a good reason', 'MERGE'),
    ];
    auth.ok = true;
    assert(res.every((r) => !r.success && r.code === 'UNAUTHORIZED'), JSON.stringify(res.map((r) => r.code)));
    assert(calls.length === 0, `calls: ${JSON.stringify(calls)}`);
  });

  await test('S-02 merge requires the typed word + reason first; move / alias / merge call the RPCs with the session actor; error mapping', async () => {
    calls.length = 0;
    const word = await T.mergeNodes(A, B, 'a good reason', 'merge');
    const reason = await T.mergeNodes(A, B, '  no ', 'MERGE');
    const same = await T.mergeNodes(A, A, 'a good reason', 'MERGE');
    const lang = await T.addAlias(A, 'x', 'fr');
    assert(!word.success && !reason.success && !same.success && !lang.success && calls.length === 0, `pre-checks: ${JSON.stringify([word, reason, same, lang].map((r) => r.code))} calls=${calls.length}`);
    rpcResult = { data: { repointed: { 'questions.canonical_topic_id': 3 }, children_moved: 1 }, error: null };
    const m = await T.mergeNodes(A, B, ' a good reason ', 'MERGE');
    const mc = calls.find((c) => c.kind === 'rpc');
    assert(m.success && m.data.childrenMoved === 1 && mc.fn === 'fn_taxonomy_merge_nodes' && mc.args.p_source_id === A && mc.args.p_target_id === B && mc.args.p_actor_email === 'owner@example.test' && mc.args.p_reason === 'a good reason', JSON.stringify({ m, mc }));
    calls.length = 0;
    rpcResult = { data: { path: 'quant.percentage' }, error: null };
    const mv = await T.moveNode(A, B, 'tidy');
    const mvc = calls.find((c) => c.kind === 'rpc');
    assert(mv.success && mv.data.path === 'quant.percentage' && mvc.fn === 'fn_taxonomy_move_node' && mvc.args.p_new_parent_id === B && mvc.args.p_actor_email === 'owner@example.test', JSON.stringify(mvc));
    calls.length = 0;
    rpcResult = { data: 'alias-id', error: null };
    const al = await T.addAlias(A, '  Percent ', 'hi');
    const alc = calls.find((c) => c.kind === 'rpc');
    assert(al.success && alc.fn === 'fn_taxonomy_add_alias' && alc.args.p_alias === 'Percent' && alc.args.p_language === 'hi' && alc.args.p_source === 'OWNER', JSON.stringify(alc));
    rpcResult = { data: null, error: { code: 'P0001', message: 'SYLLABUS_IMMUTABLE: PUBLISHED syllabus version x is read-only' } };
    const locked = await T.mergeNodes(A, B, 'a good reason', 'MERGE');
    assert(!locked.success && locked.code === 'SYLLABUS_LOCKED', JSON.stringify(locked));
    const map = svc.mapTaxonomyDbError;
    assert(map({ code: '23505', message: 'duplicate key value violates unique constraint "uq_topics_subject_slug"' }).code === 'DUPLICATE_SLUG', 'per-parent slug');
    assert(map({ code: 'P0001', message: 'TAXONOMY_RULE: alias "x" equals the name of topic "X"' }).error === 'alias "x" equals the name of topic "X"', 'rule text');
    rpcResult = { data: null, error: null };
  });

  await test('A-01 every server action starts with guardAdminAction (admin only)', () => {
    const src = read('app/admin/taxonomy/actions.ts');
    const fns = src.split(/export async function /).slice(1);
    assert(fns.length === 11, `actions: ${fns.length}`); // + CA-7 setTaxonomyNodeInternalAction; + SYLLABUS-UI-1 setTaxonomyContentSourceAction
    for (const f of fns) {
      // the guard is the first statement: only whitespace between the body's opening brace and it
      const at = f.indexOf('const __auth = await guardAdminAction()');
      const bodyStart = f.lastIndexOf('{\n', at);
      assert(at > 0 && bodyStart > 0 && f.slice(bodyStart + 2, at).trim() === '', `not guarded first: ${f.slice(0, 40)}`);
      assert(/if \(!__auth\.ok\) return __auth;/.test(f.slice(at, at + 140)), `denial not returned: ${f.slice(0, 40)}`);
      assert(!/guardAdminAction\(\{\s*allowStaff/.test(f), `staff allowed: ${f.slice(0, 40)}`);
    }
  });

  await test('U-01 master tree screen: Studio header with ONE primary, named icon buttons, labelled controls, lang="hi", English-only copy, guarded merge', () => {
    const ui = read('app/admin/taxonomy/taxonomy-manager.tsx');
    const page = read('app/admin/taxonomy/page.tsx');
    assert(/requireAdminPage\(\{ path: "\/admin\/taxonomy" \}\)/.test(page), 'admin page guard');
    const header = ui.slice(ui.indexOf('<StudioPageHeader'), ui.indexOf('<StudioStatStrip'));
    assert((header.match(/studioPrimaryAction/g) || []).length === 1, 'one primary in the header');
    assert(/<StudioDrawer/.test(ui) && /StudioStatStrip/.test(ui), 'drawer + stats');
    // icon-only buttons carry aria-label (brace-aware scan of each <button …> tag: attributes contain "=>")
    const buttons = [];
    for (let i = ui.indexOf('<button'); i >= 0; i = ui.indexOf('<button', i + 1)) {
      let depth = 0;
      let j = i;
      for (; j < ui.length; j++) {
        if (ui[j] === '{') depth++;
        else if (ui[j] === '}') depth--;
        else if (ui[j] === '>' && depth === 0) break;
      }
      const close = ui.indexOf('</button>', j);
      buttons.push({ tag: ui.slice(i, j + 1), inner: ui.slice(j + 1, close) });
    }
    const hasText = (inner) => {
      const noIcons = inner.replace(/<[A-Z][A-Za-z]*\b[^>]*\/>/g, ' ');
      if (/"[^"]*[A-Za-z][^"]*"|`[^`]*[A-Za-z][^`]*`/.test(noIcons)) return true; // a string literal with words
      let outside = noIcons;
      for (let k = 0; k < 5; k++) outside = outside.replace(/\{[^{}]*\}/g, ' ');
      return /[A-Za-z]{2,}/.test(outside.replace(/<\/?[a-z][^>]*>/g, ' '));
    };
    const iconOnly = buttons.filter((b) => !hasText(b.inner));
    const unnamed = iconOnly.filter((b) => !/aria-label=/.test(b.tag));
    assert(iconOnly.length >= 5, `icon-only buttons found: ${iconOnly.length}`);
    assert(unnamed.length === 0, `${unnamed.length} unnamed icon buttons: ${unnamed.map((b) => b.tag.slice(0, 60)).join(' | ')}`);
    const iconButtons = iconOnly;
    // every select / input has a StudioField label (htmlFor = id)
    const ids = [...ui.matchAll(/<(?:select|input) id="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) assert(ui.includes(`htmlFor="${id}"`), `no label for #${id}`);
    assert(ids.length >= 12, `controls: ${ids.length}`);
    // decision #85: Hindi CONTENT inputs carry lang="hi" + the content marker; no other element is marked, no language switch
    for (const id of ['new-name-hi', 'node-name-hi', 'alias-hi']) assert(new RegExp(`id="${id}" lang="hi" data-content-field="[a-z_]+"`).test(ui), `#${id}: lang + content marker`);
    assert((ui.match(/lang=/g) || []).length === 3 && !/<option[^>]*value="hi"/.test(ui), 'lang only on the 3 content inputs; no language <option>');
    assert(!/[\u0900-\u097F]/.test(ui), 'Devanagari literal in UI copy (R9)');
    assert(/mergeReason\.trim\(\)\.length < MERGE_REASON_MIN \|\| mergeWord !== MERGE_CONFIRM_WORD/.test(ui), 'merge button gating');
    assert(!/window\.confirm|alert\(/.test(ui), 'browser dialogs');
    return `${ids.length} labelled controls, ${iconButtons.length} icon buttons`;
  });

  await test('L-01 link snapshot: every FK into the tree + projections + Learn-more + syllabus + mock/pattern links, counts AND hashes; only a NEW EMPTY set is not a change', () => {
    const s = read('scripts/db/taxonomy-link-snapshot.cjs');
    assert(/await safeBegin\(c, \{ readOnly: true \}\);/.test(s), 'read only + LIVE-LOCK-SAFETY (shared safeBegin)');
    assert(/confrelid = 'public\.canonical_taxonomy_nodes'::regclass/.test(s) && /md5\(/.test(s), 'catalogue FKs + hash');
    for (const k of ['tree:nodes', 'proj:topics', 'proj:subtopics', 'learn:units', 'learn:documents', 'syllabus:mappings', 'exam:question_mappings', 'mock:sections', 'pattern:sections']) assert(s.includes(`'${k}'`), k);
    assert(/!\(k in before\) && snap\[k\] && snap\[k\]\.n === 0/.test(s), 'new-empty rule');
  });

  console.log(`\nCA1-TAXONOMY offline: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
