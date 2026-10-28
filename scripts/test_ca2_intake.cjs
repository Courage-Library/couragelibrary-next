#!/usr/bin/env node
/**
 * CA-2 SYLLABUS INTAKE — offline gate (no network, no DB; reads source + runs the pure TS modules).
 *   C-01 contract v2: a valid payload → pre-order items with stable keys + stats; strict keys, plain text, limits,
 *        uncertain needs a reason, context (exam / cycle / tier) must agree, deeper levels only as concept headings
 *   M-01 matcher: EXACT / ALIAS / CLOSE / NEW, scoped by the matched parent (a same-name node elsewhere never matches),
 *        children of an unmatched parent get suggestions only, deterministic output, ≤ 3 candidates
 *   P-01 prompt: no invention, strict JSON, every uncertain item flagged, the context echoed, contract v2
 *   D-01 migration 116: new functions SECURITY INVOKER with client EXECUTE revoked; intake tables RLS + staff read; the
 *        TOPIC roll-up (topic_id) + roll-up guards in move / merge; one PUBLISHED per (exam, cycle, tier); rollback file
 *   R-01 every app reader that means "topic" uses topic_id (SUBTOPIC / CONCEPT mappings roll up)
 *   S-01 admin only: the intake routes are in ADMIN_ONLY_ROUTES, the pages call requireAdminPage (no staff), every action
 *        guards first; the client screens import no server module
 *   U-01 screens: Studio header with ONE primary each, labelled controls, English-only copy, no lang / Devanagari (#85)
 * Run: node scripts/test_ca2_intake.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const info = fn();
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

const contract = require(path.join(ROOT, 'lib/syllabus/intake-contract.ts'));
const matcher = require(path.join(ROOT, 'lib/syllabus/tree-matcher.ts'));
const { buildSyllabusIntakePrompt } = require(path.join(ROOT, 'lib/syllabus/intake-prompt.ts'));
const CTX = { examSlug: 'ssc-cgl', cycleYear: 2026, tier: 'tier-1' };
const base = () => ({
  contract_version: 2, exam: 'ssc-cgl', cycle_year: 2026, tier: 'tier-1', source_url: 'https://ssc.gov.in/notice.pdf', as_of: '2026-10-01',
  papers: [{ name: 'Tier 1', questions: 100, subjects: [{ name: 'Quantitative Aptitude', aliases: ['Numerical Aptitude'], topics: [
    { name: 'Percentage', subtopics: [{ name: 'Successive change', concepts: [{ name: 'Net change', headings: ['Two changes', 'Three changes'] }] }] },
    { name: 'Data Sufficiency', uncertain: true, uncertain_reason: 'Only in the annexure.' },
  ] }] }],
});

test('C-01 contract v2: valid → pre-order items, stable keys, stats; strict keys / plain text / limits / uncertain reason / context / headings only on concepts', () => {
  const v = contract.validateIntakePayload(JSON.stringify(base()), CTX);
  assert(v.ok, JSON.stringify(v.errors));
  assert(v.items.map((i) => i.key).join(',') === 'p0,p0.s0,p0.s0.t0,p0.s0.t0.u0,p0.s0.t0.u0.c0,p0.s0.t1', v.items.map((i) => i.key).join(','));
  assert(v.items.every((i, n) => !i.parent_key || v.items.slice(0, n).some((p) => p.key === i.parent_key)), 'parents first');
  assert(v.stats.topics === 2 && v.stats.concepts === 1 && v.stats.uncertain === 1 && JSON.stringify(v.items[4].extra_headings) === '["Two changes","Three changes"]', JSON.stringify(v.stats));
  const bad = (mut, code) => {
    const p = base();
    mut(p);
    const r = contract.validateIntakePayload(p, CTX);
    assert(!r.ok && r.errors.some((e) => e.code === code), `${code}: ${JSON.stringify(r.ok ? 'ok' : r.errors.slice(0, 3))}`);
  };
  bad((p) => (p.extra = 1), 'UNKNOWN_KEY');
  bad((p) => (p.papers[0].subjects[0].topics[0].headings = ['x']), 'UNKNOWN_KEY');
  bad((p) => (p.papers[0].subjects[0].name = '<b>QA</b>'), 'NOT_PLAIN_TEXT');
  bad((p) => (p.papers[0].subjects[0].name = 'x'.repeat(201)), 'INVALID_VALUE');
  bad((p) => delete p.papers[0].subjects[0].topics[1].uncertain_reason, 'REQUIRED');
  bad((p) => (p.exam = 'ssc-gd'), 'CONTEXT_MISMATCH');
  bad((p) => (p.tier = null), 'CONTEXT_MISMATCH');
  bad((p) => (p.contract_version = 1), 'UNSUPPORTED_CONTRACT_VERSION');
  bad((p) => (p.source_url = 'http://ssc.gov.in'), 'INVALID_VALUE');
  bad((p) => (p.papers[0].subjects[0].topics.push({ name: 'percentage' })), 'DUPLICATE_NAME');
  bad((p) => (p.papers[0].subjects[0].weightage_tier = 'TOP'), 'INVALID_VALUE');
  bad((p) => (p.papers[0].subjects = []), 'REQUIRED');
  assert(!contract.validateIntakePayload('{not json', CTX).ok && contract.validateIntakePayload('x'.repeat(300 * 1024)).errors[0].code === 'PAYLOAD_TOO_LARGE', 'json / size');
  return `${v.items.length} items`;
});

test('M-01 matcher: EXACT / ALIAS / CLOSE / NEW scoped by the matched parent; unmatched parent → suggestions only; deterministic; ≤ 3 candidates', () => {
  const N = (id, parentId, nodeType, name, nameHi = null, isActive = true) => ({ id, parentId, nodeType, name, nameHi, isActive });
  const nodes = [
    N('S1', null, 'SUBJECT', 'Quantitative Aptitude'), N('S2', null, 'SUBJECT', 'Reasoning'),
    N('T1', 'S1', 'TOPIC', 'Percentage'), N('T2', 'S1', 'TOPIC', 'Data Interpretation'), N('T3', 'S2', 'TOPIC', 'Data Sufficiency'),
    N('U1', 'T1', 'SUBTOPIC', 'Successive Percentage Change'), N('T9', 'S1', 'TOPIC', 'Old Topic', null, false),
  ];
  const aliases = [{ nodeId: 'T2', normalized: 'di' }];
  const v = contract.validateIntakePayload(JSON.stringify({ ...base(), papers: [{ name: 'Tier 1', subjects: [
    { name: 'Quantitative Aptitude', topics: [{ name: 'PERCENTAGE!', subtopics: [{ name: 'Successive change' }] }, { name: 'DI' }, { name: 'Data Sufficiency' }, { name: 'Old Topic' }] },
    { name: 'General English', topics: [{ name: 'Idioms' }] },
  ] }] }), CTX);
  assert(v.ok, JSON.stringify(v.errors));
  const m = matcher.matchIntake(v.items, nodes, aliases);
  const by = (name) => m.find((x) => x.name === name);
  assert(by('Tier 1').match_status === 'NOT_APPLICABLE', 'paper');
  assert(by('Quantitative Aptitude').match_status === 'EXACT' && by('Quantitative Aptitude').matched_node_id === 'S1', 'subject exact');
  assert(by('PERCENTAGE!').match_status === 'EXACT' && by('PERCENTAGE!').matched_node_id === 'T1', 'normalized exact');
  assert(by('DI').match_status === 'ALIAS' && by('DI').matched_node_id === 'T2', 'alias');
  assert(by('Data Sufficiency').match_status !== 'EXACT' && !by('Data Sufficiency').candidates.some((c) => c.node_id === 'T3'), 'a same-name node under ANOTHER subject never matches');
  assert(by('Old Topic').match_status === 'NEW', 'inactive nodes never match');
  assert(by('Successive change').match_status === 'CLOSE' && by('Successive change').candidates[0].node_id === 'U1' && !by('Successive change').matched_node_id, 'close under the matched parent');
  assert(by('General English').match_status === 'NEW' && by('Idioms').match_status === 'NEW' && !by('Idioms').matched_node_id, 'new branch');
  const again = matcher.matchIntake(v.items, [...nodes].reverse(), aliases);
  assert(JSON.stringify(again) === JSON.stringify(m), 'deterministic (input order independent)');
  assert(m.every((x) => x.candidates.length <= matcher.MAX_CANDIDATES), 'max candidates');
  assert(matcher.diceSimilarity('boat and stream', 'boats and streams') >= matcher.CLOSE_THRESHOLD && matcher.diceSimilarity('percentage', 'reasoning') < matcher.CLOSE_THRESHOLD, 'dice');
  return Object.entries(matcher.matchSummary(m)).map(([k, n]) => `${k} ${n}`).join(' · ');
});

// SYLLABUS-PROMPT-2: the owner-approved prompt, VERBATIM (sha256 pinned: any edit needs a new owner approval and lands
// as a new template version in /admin/prompts, never as a silent code change)
const OWNER_PROMPT_SHA256 = '5f6271743af25292a2d38d4685b7284fab33f0899920b7605f1a04a6c6174aeb';
test('P-01 prompt (SYLLABUS-PROMPT-2): the owner-approved text verbatim; placeholders filled; tier sections only with a tier; contract v3; its own example passes', () => {
  const { SYLLABUS_TEMPLATE_V1 } = require(path.join(ROOT, 'lib/syllabus/intake-prompt.ts'));
  const sha = require('crypto').createHash('sha256').update(SYLLABUS_TEMPLATE_V1, 'utf8').digest('hex');
  assert(sha === OWNER_PROMPT_SHA256, `SYLLABUS_TEMPLATE_V1 is not the owner-approved text (sha256 ${sha})`);
  const withTier = buildSyllabusIntakePrompt({ examName: 'SSC CGL', examSlug: 'ssc-cgl', cycleYear: 2026, tier: 'tier-1' });
  const noTier = buildSyllabusIntakePrompt({ examName: 'SSC CGL', examSlug: 'ssc-cgl', cycleYear: 2026, tier: null });
  for (const p of [withTier, noTier]) {
    assert(!/\{\{/.test(p), 'an unfilled placeholder');
    for (const x of ['"SSC CGL"', 'for the 2026 cycle', 'OFFICIAL', 'PYQ_TREND', 'EXPANDED', 'HIGH_YIELD', '"based_on"', '"uncertain": true', 'no code fences', 'contract SYLLABUS_INTAKE v3']) assert(p.includes(x), `missing: ${x}`);
  }
  assert(withTier.includes('"SSC CGL" — tier-1 for the 2026 cycle') && withTier.includes('of the exam — only tier-1.') && withTier.includes('"tier": "tier-1"'), 'tier sections');
  assert(!noTier.includes('— only') && noTier.includes('"SSC CGL" for the 2026 cycle') && noTier.includes('"tier": null'), 'no tier: the sections are dropped');
  const parsed = JSON.parse(withTier.slice(withTier.indexOf('{\n')));
  assert(parsed.contract_version === 3 && parsed.exam === 'ssc-cgl' && parsed.cycle_year === 2026 && parsed.tier === 'tier-1', 'example header');
  const r = contract.validateIntakePayload(parsed, CTX);
  assert(r.ok, `the prompt's own example must pass contract v3: ${JSON.stringify(r.errors)}`);
  assert(r.stats.official === 1 && r.stats.pyq_trend === 1 && r.stats.expanded === 1, JSON.stringify(r.stats));
  return `sha256 ${sha.slice(0, 12)}…`;
});

test('C-02 contract v3: accepted (origin / avg_questions / based_on / paper duration + negative marking / name_hi at every level); v2 still accepted; a missing origin, a wrong exam / cycle / tier, missing based_on, markup → refused', () => {
  const v3 = () => ({
    contract_version: 3, exam: 'ssc-cgl', cycle_year: 2026, tier: 'tier-1', based_on: 'SSC CGL 2025 notification + PYQs 2016-2025',
    papers: [{ name: 'Tier 1', name_hi: 'टियर 1', questions: 100, marks: 200, duration_minutes: 60, negative_marking: '0.50 per wrong answer',
      subjects: [{ name: 'Quantitative Aptitude', name_hi: 'मात्रात्मक योग्यता', topics: [
        { name: 'Percentage', name_hi: 'प्रतिशत', origin: 'OFFICIAL', weightage_tier: 'HIGH_YIELD', avg_questions: 2,
          subtopics: [{ name: 'Successive Percentage Change', origin: 'PYQ_TREND', concepts: [{ name: 'Net Change of Two Changes', origin: 'EXPANDED', headings: [] }] }] },
      ] }] }],
  });
  const ok = contract.validateIntakePayload(JSON.stringify(v3()), CTX);
  assert(ok.ok && ok.header.contract_version === 3 && ok.header.based_on && ok.header.source_url === null && ok.header.as_of === null, JSON.stringify(ok.ok ? ok.header : ok.errors));
  const t = ok.items.find((i) => i.name === 'Percentage');
  const paper = ok.items.find((i) => i.level === 'PAPER');
  assert(t.origin === 'OFFICIAL' && t.avg_questions === 2 && paper.duration_minutes === 60 && paper.negative_marking === '0.50 per wrong answer' && paper.name_hi === 'टियर 1', 'v3 fields');
  assert(contract.validateIntakePayload(JSON.stringify(base()), CTX).ok, 'v2 still accepted');
  const bad = (mut, code, ctx = CTX) => {
    const p = v3();
    mut(p);
    const r = contract.validateIntakePayload(p, ctx);
    assert(!r.ok && r.errors.some((e) => e.code === code), `${code}: ${JSON.stringify(r.ok ? 'ok' : r.errors.slice(0, 3))}`);
  };
  bad((p) => delete p.papers[0].subjects[0].topics[0].subtopics[0].origin, 'REQUIRED');
  bad((p) => (p.papers[0].subjects[0].topics[0].origin = 'GUESS'), 'INVALID_VALUE');
  bad((p) => (p.papers[0].subjects[0].origin = 'OFFICIAL'), 'UNKNOWN_KEY');
  bad((p) => delete p.based_on, 'REQUIRED');
  bad((p) => (p.based_on = 'see <a href="x">notice</a>'), 'NOT_PLAIN_TEXT');
  bad((p) => (p.papers[0].negative_marking = '**0.5**'), 'NOT_PLAIN_TEXT');
  bad((p) => (p.exam = 'ssc-chsl'), 'CONTEXT_MISMATCH');
  bad((p) => (p.cycle_year = 2025), 'CONTEXT_MISMATCH');
  bad((p) => (p.tier = 'tier-2'), 'CONTEXT_MISMATCH');
  bad((p) => (p.papers[0].subjects[0].topics[0].avg_questions = -1), 'INVALID_VALUE');
  bad((p) => (p.papers[0].subjects[0].topics[0].subtopics[0].concepts[0].name = 'x\u0007'), 'NOT_PLAIN_TEXT');
  // a v2 payload may not use v3 keys
  const v2 = base();
  v2.papers[0].subjects[0].topics[0].origin = 'OFFICIAL';
  const r2 = contract.validateIntakePayload(v2, CTX);
  assert(!r2.ok && r2.errors.some((e) => e.code === 'UNKNOWN_KEY'), 'v2 + origin');
  return `${ok.items.length} items; origins ${ok.stats.official}/${ok.stats.pyq_trend}/${ok.stats.expanded}`;
});

test('D-01 migration 116: INVOKER + revoked client EXECUTE, RLS staff read, roll-up + guards, tiers, rollback', () => {
  const sql = read('supabase/migrations/20261027000116_ca2_syllabus_intake.sql');
  const newFns = ['fn_taxonomy_topic_of(uuid)', 'fn_syllabus_mapping_node_fields()', 'fn_syllabus__repointed_draft(uuid, uuid, uuid, uuid)', 'fn_syllabus_intake_audit(uuid, text, text, text, uuid, jsonb)',
    'fn_syllabus_intake_create(uuid, uuid, text, text, date, jsonb, jsonb, uuid, text)', 'fn_syllabus_intake_decide(uuid, text, uuid, uuid, text)', 'fn_syllabus_intake_import(uuid, text, uuid, text)', 'fn_syllabus_intake_discard(uuid, uuid, text)'];
  for (const f of newFns) {
    const esc = f.replace(/[()[\]]/g, (c) => '\\' + c);
    assert(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC, anon, authenticated;`).test(sql), `REVOKE ${f}`);
    const name = f.slice(0, f.indexOf('('));
    const body = sql.slice(sql.indexOf(`FUNCTION public.${name}(`));
    assert(!/^[^$]*SECURITY DEFINER/.test(body.slice(0, body.indexOf('$'))), `${name} must be SECURITY INVOKER`);
  }
  const grants = sql.match(/GRANT EXECUTE ON FUNCTION [^;]+ TO ([a-z_]+);/g) || [];
  assert(grants.every((g) => /TO service_role;$/.test(g)), 'grants only to service_role');
  // the only SECURITY DEFINER bodies are the four EXISTING functions it redefines (SECDEF count unchanged)
  const secdef = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\([^)]*\)[\s\S]{0,200}?SECURITY DEFINER/g)].map((m) => m[1]).sort();
  assert(JSON.stringify(secdef) === JSON.stringify(['fn_exam_syllabus_read_model', 'fn_syllabus_create_draft', 'fn_syllabus_publish', 'fn_syllabus_set_unit_mappings']), `SECDEF bodies: ${secdef}`);
  assert(/ENABLE ROW LEVEL SECURITY/.test(sql) && (sql.match(/USING \(public\.fn_jwt_is_admin_or_staff\(\)\)/g) || []).length === 2 && !/USING\s*\(\s*true\s*\)/i.test(sql), 'RLS staff read');
  assert(/topic_id uuid GENERATED ALWAYS AS \(COALESCE\(rollup_topic_id, canonical_node_id\)\) STORED/.test(sql), 'topic roll-up');
  assert((sql.match(/re-map them first/g) || []).length === 2, 'move + merge roll-up guards');
  assert(/COALESCE\(tier, ''\)\)\s*\n\s*WHERE status = 'PUBLISHED' AND is_active/.test(sql) && /AND tier IS NOT DISTINCT FROM v\.tier/.test(sql), 'tiers');
  assert(/fn_syllabus__import_is_plain/.test(sql) && /not an active % under its matched parent/.test(sql), 'plain text + match re-check');
  const rb = read('docs/database/rollback/116_rollback.sql');
  assert(/DROP TABLE IF EXISTS public\.syllabus_intake_items/.test(rb) && /uq_exam_syllabus_one_published/.test(rb) && /ADD EXPRESSION|canonical_node_type/.test(rb), 'rollback');
});

test('R-01 readers: every "topic" read of syllabus mappings uses topic_id', () => {
  const files = ['lib/syllabus/published-topic-exams.ts', 'services/curriculum-coverage.service.ts', 'services/question-factory/question-context-builder.service.ts'];
  for (const f of files) {
    const s = read(f);
    assert(/topic_id/.test(s) && !/(\.in|\.eq)\(['"](?:exam_syllabus_canonical_mappings\.)?canonical_node_id['"]/.test(s) && !/'canonical_node_id, node:/.test(s) && !/"canonical_node_id, node:/.test(s), f);
  }
  const page = read('app/admin/syllabus/[id]/page.tsx');
  assert(/\["SUBJECT", "TOPIC", "SUBTOPIC", "CONCEPT"\]/.test(page) && /p\.tier \?\? null\) === \(v\.tier \?\? null\)/.test(page), 'editor options + tier peer');
});

test('S-01 admin only: routes, page guards, action guards, client imports', () => {
  const nav = read('lib/admin/nav.ts');
  assert(/"\/admin\/syllabus\/intake",/.test(nav) && /\{ label: "Syllabus intake", href: "\/admin\/syllabus\/intake", icon: "syllabus", access: "admin" \}/.test(nav), 'nav + ADMIN_ONLY_ROUTES');
  for (const f of ['app/admin/syllabus/intake/page.tsx', 'app/admin/syllabus/intake/[id]/page.tsx']) {
    const s = read(f);
    assert(/await requireAdminPage\(\{ path: [^}]*\}\)/.test(s) && !/allowStaff/.test(s), `${f}: admin page guard`);
  }
  const actions = read('app/admin/syllabus/intake/actions.ts');
  const fns = actions.split(/export async function /).slice(1);
  assert(fns.length === 5, `actions: ${fns.length}`); // + addIntakeCycleAction (CA-4 ruling 1)
  for (const f of fns) {
    const at = f.indexOf('const __auth = await guardAdminAction()');
    const body = f.lastIndexOf('{\n', at);
    assert(at > 0 && body > 0 && f.slice(body + 2, at).trim() === '' && !/allowStaff/.test(f), `not guarded first: ${f.slice(0, 40)}`);
  }
  const svc = read('services/syllabus/intake.service.ts');
  for (const m of ['create', 'addCurrentCycle', 'list', 'get', 'decide', 'importDraft', 'discard']) {
    const start = svc.indexOf(`static async ${m}(`);
    assert(start > 0 && /const c = await ctx\(\);\s*if \(!c\) return fail\("UNAUTHORIZED"/.test(svc.slice(start, start + 400)), `service ${m} guard`);
  }
  for (const f of ['components/admin/syllabus/intake-wizard.tsx', 'components/admin/syllabus/intake-review.tsx']) {
    const s = read(f);
    assert(/^"use client";/.test(s) && !/@\/services\/|@\/lib\/supabase/.test(s), `${f} imports a server module`);
  }
});

test('U-02 SYLLABUS-PROMPT-2 screens: wizard = exam + cycle + tier, an optional collapsed reference link, the prompt from the ACTIVE template; review = origin badge + weightage + origin filter + based_on', () => {
  const w = read('components/admin/syllabus/intake-wizard.tsx');
  assert(!/Official notification link|in-asof|type="date"/.test(w), 'the required link / as-of fields are gone');
  assert(/<details[^>]*>\s*<summary[^>]*>Reference link \(optional\)<\/summary>/.test(w), 'a collapsed optional reference link');
  assert(/addIntakeCycleAction\(examId\)/.test(w) && /Add \$\{currentYear\} cycle/.test(w), 'ruling 1: inline "Add <year> cycle" when the exam has none');
  const svc = read('services/syllabus/intake.service.ts');
  assert(/action_type: "EXAM_CYCLE_CREATE"/.test(svc) && /if \(audit\.error\) \{\s*await c\.supabase\.from\("exam_cycles"\)\.delete\(\)/.test(svc), 'the added cycle is audited (removed again if the audit fails)');
  assert(/buildSyllabusIntakePrompt\([^)]*\}, template\?\.body\)/.test(w) && /template: \{ body: string; version: number \| null \} \| null/.test(w), 'the prompt renders the ACTIVE template');
  const page = read('app/admin/syllabus/intake/page.tsx');
  assert(/PromptTemplateService\.getActiveBody\("SYLLABUS"\)/.test(page), 'the page passes the ACTIVE SYLLABUS template');
  const rv = read('components/admin/syllabus/intake-review.tsx');
  for (const x of ['ORIGIN_LABEL', 'OFFICIAL: "Official"', 'PYQ_TREND: "PYQ trend"', 'EXPANDED: "Expanded"', 'aria-label="Filter by origin"', 'aria-pressed={origin === o}', 'Based on:', 'i.weightageTier', 'i.avgQuestions']) assert(rv.includes(x), `review: ${x}`);
  return 'wizard + review';
});

test('U-01 screens: one primary in each header, labelled controls, English-only, no lang / Devanagari (#85)', () => {
  for (const f of ['components/admin/syllabus/intake-wizard.tsx', 'components/admin/syllabus/intake-review.tsx']) {
    const s = read(f);
    const header = s.slice(s.indexOf('<StudioPageHeader', s.indexOf('return (')), s.indexOf('/>', s.indexOf('actions=', s.indexOf('<StudioPageHeader', s.indexOf('return (')))));
    assert((header.match(/studioPrimaryAction/g) || []).length === 1, `${f}: one primary in the header`);
    const ids = [...s.matchAll(/<(?:select|input|textarea) id="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) assert(s.includes(`htmlFor="${id}"`), `${f}: no label for #${id}`);
    assert(!/\slang=/.test(s) && !/[ऀ-ॿ]/.test(s) && !/\bHindi\b/.test(s), `${f}: #85 (no lang, Devanagari or Hindi label)`);
    assert(!/window\.confirm|alert\(/.test(s), `${f}: browser dialogs`);
  }
});

console.log(`\nCA2-INTAKE offline: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
