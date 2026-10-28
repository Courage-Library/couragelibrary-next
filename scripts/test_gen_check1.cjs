#!/usr/bin/env node
/**
 * GEN-CHECK-1 — offline gate (no network, no DB): the "Check" of the three paste screens (lesson generator, translation,
 * syllabus intake) always gives a visible, precise result.
 *   X-01 extractor: success; fenced; prose-wrapped (notice "extra text … removed"); bad JSON → line:column + snippet;
 *        truncated → CUT_OFF ("next part"); two objects → MULTIPLE; empty / no JSON / over the size cap; nothing inside
 *        the JSON is ever repaired
 *   G-01 / T-01 / I-01 the same cases through each screen's own parser (lesson paste, translation paste, intake
 *        extract + contract): success, bad JSON (line:col), fenced, prose, truncated, huge 60–80 KB paste (fast), and
 *        contract errors named by block number + id + field
 *   E-01 the shared check hook (run with a stand-in React): busy while checking, ANY exception caught and shown, the
 *        result region focused + scrolled into view — success and exception paths
 *   S-01 source: all three screens use usePasteCheck + CheckButton (the primary action, "Checking…", aria-busy) +
 *        CheckRegion (aria-live, focusable); no screen validates in onChange; the server re-extracts the same way
 * Run: node scripts/test_gen_check1.cjs
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
const compile = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.React } });
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = compile;
require.extensions['.tsx'] = compile;

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

const X = require(path.join(ROOT, 'lib/prompts/paste-extract.ts'));
const LP = require(path.join(ROOT, 'lib/prompts/lesson-prompt.ts'));
const TR = require(path.join(ROOT, 'lib/prompts/translate-prompt.ts'));
const E = require(path.join(ROOT, 'lib/prompts/lesson-examples.ts'));
const IC = require(path.join(ROOT, 'lib/syllabus/intake-contract.ts'));
const NODE = '00000000-0000-4000-8000-000000000001';

const lesson = () => E.lessonExampleFor('APTITUDE', NODE);
const pretty = (o) => JSON.stringify(o, null, 2);
const fence = (s) => '```json\n' + s + '\n```';
const prose = (s) => 'Here is the lesson you asked for:\n\n' + s + '\n\nLet me know if you want the next topic.';
const badComma = (s) => s.replace('[', '[,'); // a syntax error the parser must locate (a "," right after the first "[")
const truncate = (s) => s.slice(0, Math.floor(s.length * 0.6));
/** a 60–80 KB lesson: the example's solved example repeated with unique ids */
function hugeLesson() {
  const l = lesson();
  const one = l.blocks.find((b) => b.type === 'solved_example');
  const at = l.blocks.indexOf(one);
  const extra = [];
  for (let i = 0; pretty({ ...l, blocks: [...l.blocks, ...extra] }).length < 70 * 1024; i++) extra.push({ ...one, id: `ex-big-${i}` });
  l.blocks.splice(at + 1, 0, ...extra);
  return l;
}
const timed = (fn) => {
  const t = process.hrtime.bigint();
  const r = fn();
  return { r, ms: Number(process.hrtime.bigint() - t) / 1e6 };
};

// shared case runner: `parse(text)` → { ok, errors?, notice? } as the screen sees it
function screenCases(label, parse, valid) {
  const s = pretty(valid);
  const ok = parse(s);
  assert(ok.ok && !ok.notice, `${label}: success ${JSON.stringify(ok.errors && ok.errors.slice(0, 2))}`);
  for (const [name, text] of [['fenced', fence(s)], ['prose', prose(s)], ['fenced + prose', prose(fence(s))]]) {
    const r = parse(text);
    assert(r.ok && /extra text around the json was removed/i.test(r.notice || ''), `${label}: ${name} → ok + notice (${JSON.stringify(r).slice(0, 200)})`);
  }
  const bad = parse(badComma(s));
  const at = s.indexOf('[') + 1;
  const line = s.slice(0, at).split('\n').length;
  const col = at - s.lastIndexOf('\n', at - 1);
  assert(!bad.ok && bad.errors[0].path === `line ${line}:${col}` && /not valid JSON at line \d+, column \d+/.test(bad.errors[0].message) && bad.errors[0].message.includes('⟦here⟧'),
    `${label}: bad JSON → line:col + snippet (${JSON.stringify(bad.errors && bad.errors[0])})`);
  const cut = parse(truncate(s));
  assert(!cut.ok && /looks cut off/.test(cut.errors[0].message) && /next part/.test(cut.errors[0].message), `${label}: truncated → cut off (${JSON.stringify(cut.errors && cut.errors[0]).slice(0, 200)})`);
  const multi = parse(s + '\n' + s);
  assert(!multi.ok && /more than one JSON object/.test(multi.errors[0].message), `${label}: two answers pasted together`);
  const empty = parse('   ');
  assert(!empty.ok && /Paste/.test(empty.errors[0].message), `${label}: empty`);
  return ok;
}

test('X-01 extractor: fences + prose removed (notice), one object taken, nothing inside repaired; line:column; cut off; multiple; empty; no JSON; size cap', () => {
  const s = pretty({ a: 1, b: 'x { not a brace } "q"', c: [1, 2, { d: '}' }] });
  const ok = X.extractJson(prose(fence(s)));
  assert(ok.ok && ok.json === s && ok.removedText && /removed/.test(ok.notice) && ok.data.c[2].d === '}', 'braces inside strings are ignored; the exact JSON text is kept');
  assert(X.extractJson(s).notice === null, 'no notice when nothing was removed');
  const bad = X.extractJson('note\n{\n  "a": 1,\n  "b": 2,\n}');
  assert(!bad.ok && bad.code === 'INVALID_JSON' && bad.line === 5 && bad.column === 1 && bad.snippet.includes('⟦here⟧'), `trailing comma not repaired: ${JSON.stringify(bad)}`);
  const quote = X.extractJson('{ "a": "x\\"y" ');
  assert(!quote.ok && quote.code === 'CUT_OFF' && quote.line === 1, 'an escaped quote does not end the string; missing "}" → cut off');
  const cut = X.extractJson('{\n "blocks": [\n  { "id": "a", "type": "paragraph", "text": "half a sente');
  assert(!cut.ok && cut.code === 'CUT_OFF' && cut.line === 3 && /next part/.test(cut.message), 'ends mid-block → cut off');
  assert(X.extractJson('{"a":1} {"b":2}').code === 'MULTIPLE' && X.extractJson('').code === 'EMPTY' && X.extractJson('Sorry, I cannot do that.').code === 'NO_JSON', 'multiple / empty / no JSON');
  assert(X.extractJson('{"a":"' + 'x'.repeat(X.PASTE_MAX_BYTES) + '"}').code === 'NO_JSON' && /split the answer into parts/.test(X.extractJson('{"a":"' + 'x'.repeat(X.PASTE_MAX_BYTES) + '"}').message), 'over the size cap → ask for parts');
  // the syntax locator agrees with JSON.parse on validity (seeded mutations of real lesson JSON)
  const base = JSON.stringify(E.lessonExampleFor('GK_GA', NODE), null, 1);
  assert(X.syntaxErrorOffset(base) === null && X.syntaxErrorOffset('[]') === null && X.syntaxErrorOffset('{"a":"\\u00e9\\n","b":-1.5e3,"c":[{}],"d":null}') === null, 'valid JSON → no error');
  let seed = 7;
  const rnd = (k) => ((seed = (seed * 1103515245 + 12345) % 2147483648) % k);
  const junk = [',', '}', ']', '"', ':', 'x', '\\', '{', '[', '1', ' ', '\n'];
  let disagree = 0;
  for (let k = 0; k < 400; k++) {
    const at = rnd(base.length);
    const m = rnd(2) ? base.slice(0, at) + junk[rnd(junk.length)] + base.slice(at) : base.slice(0, at) + base.slice(at + 1);
    let valid = true;
    try { JSON.parse(m); } catch { valid = false; }
    if ((X.syntaxErrorOffset(m) === null) !== valid) disagree++;
  }
  assert(disagree === 0, `the locator disagrees with JSON.parse on ${disagree} of 400 mutations`);
  assert(X.describeBlockPath('$.blocks[2].options[0].feedback', [{}, {}, { id: 'qc-1' }]) === 'block 3 (id "qc-1") · options[0].feedback' && X.describeBlockPath('$.meta.title', []) === '$.meta.title', 'block number + id + field');
  return 'all codes';
});

test('G-01 lesson generator paste (LESSON_BLOCKS v2): success, fenced, prose, bad JSON line:col, truncated, two answers, empty; huge 60–80 KB paste parsed fast; contract errors name the block id + field', () => {
  // the generator's check: parseLessonPart (its notice) → mergeLessonParts (components/admin/lessons/lesson-generator.tsx)
  const generator = (t) => {
    const p = LP.parseLessonPart(t);
    if (!p.ok) return p;
    const m = LP.mergeLessonParts([p]);
    if (m.state !== 'COMPLETE') return { ok: false, errors: m.errors || [{ path: '$.part', message: 'missing' }] };
    return m.result.ok ? { ...m.result, notice: p.notice } : m.result;
  };
  screenCases('lesson', generator, lesson());
  const big = pretty(hugeLesson());
  const { r, ms } = timed(() => generator(prose(fence(big))));
  assert(big.length >= 60 * 1024 && big.length <= 80 * 1024 && r.ok && r.notice && ms < 1500, `huge: ${big.length} B, ok=${r.ok}, ${ms.toFixed(0)} ms`);
  const cutBig = timed(() => LP.parseLessonPaste(truncate(big)));
  assert(!cutBig.r.ok && /cut off/.test(cutBig.r.errors[0].message) && cutBig.ms < 1500, 'huge truncated → cut off, fast');
  const l = lesson();
  const qi = l.blocks.findIndex((b) => b.type === 'quick_check');
  l.blocks[qi].options[1].feedback = 42;
  const ce = LP.parseLessonPaste(JSON.stringify(l));
  assert(!ce.ok && ce.errors.some((e) => e.path.startsWith(`block ${qi + 1} (id "${l.blocks[qi].id}") · options[1]`)), `contract error by block id + field: ${JSON.stringify(ce.errors && ce.errors.slice(0, 2))}`);
  return `huge ${(big.length / 1024).toFixed(0)} KB in ${ms.toFixed(0)} ms`;
});

test('T-01 translation paste (LESSON_BLOCKS v2 hi): success, fenced, prose, bad JSON line:col, truncated, two answers, empty; huge paste; parity errors name the block', () => {
  const en = lesson();
  const hi = { contract: TR.TRANSLATION_PASTE_CONTRACT, meta: en.meta, blocks: en.blocks };
  screenCases('translation', (t) => TR.parseTranslationPaste(t, en.blocks), hi);
  const bigEn = hugeLesson();
  const big = pretty({ contract: TR.TRANSLATION_PASTE_CONTRACT, meta: bigEn.meta, blocks: bigEn.blocks });
  const { r, ms } = timed(() => TR.parseTranslationPaste(fence(big), bigEn.blocks));
  assert(r.ok && r.notice && ms < 1500, `huge translation: ok=${r.ok} ${ms.toFixed(0)} ms ${JSON.stringify(r.errors && r.errors[0])}`);
  const moved = { ...hi, blocks: hi.blocks.map((b) => (b.type === 'quick_check' ? { ...b, options: b.options.map((o, i) => ({ ...o, correct: i === b.options.length - 1 - b.options.findIndex((x) => x.correct) })) } : b)) };
  const pe = TR.parseTranslationPaste(JSON.stringify(moved), en.blocks);
  assert(!pe.ok && pe.errors.some((e) => /^block \d+ \(id "/.test(e.path)), `parity error by block: ${JSON.stringify(pe.errors && pe.errors[0])}`);
  return `huge ${(big.length / 1024).toFixed(0)} KB in ${ms.toFixed(0)} ms`;
});

test('I-01 syllabus intake paste (extract → contract, as the wizard and the server do): success, fenced, prose, bad JSON line:col, truncated, two answers, empty; huge paste', () => {
  const CTX = { examSlug: 'ssc-cgl', cycleYear: 2026, tier: 'tier-1' };
  const intake = (topics) => ({ contract_version: 2, exam: 'ssc-cgl', cycle_year: 2026, tier: 'tier-1', source_url: 'https://ssc.gov.in/notice.pdf', as_of: '2026-10-01',
    papers: [{ name: 'Tier 1', questions: 100, subjects: [{ name: 'Quantitative Aptitude', topics }] }] });
  // the wizard's check: extractJson → validateIntakePayload(x.data) (components/admin/syllabus/intake-wizard.tsx)
  const wizard = (t) => {
    const x = X.extractJson(t);
    if (!x.ok) return { ok: false, errors: [{ path: x.line ? `line ${x.line}:${x.column}` : '$', message: `${x.message}${x.snippet ? ` Near: ${x.snippet}` : ''}` }] };
    const v = IC.validateIntakePayload(x.data, CTX);
    return v.ok ? { ok: true, notice: x.notice } : { ok: false, errors: v.errors };
  };
  screenCases('intake', wizard, intake([{ name: 'Percentage', subtopics: [{ name: 'Successive change' }] }]));
  const topics = [];
  for (let i = 0; pretty(intake(topics)).length < 60 * 1024; i++) topics.push({ name: `Topic ${i}`, subtopics: [{ name: `Subtopic ${i} a` }, { name: `Subtopic ${i} b` }] });
  const big = pretty(intake(topics));
  const { r, ms } = timed(() => wizard(prose(big)));
  assert(big.length <= 80 * 1024 && ms < 1500 && (r.ok || r.errors.every((e) => !/line \d+:\d+/.test(e.path))), `huge intake parsed (${(big.length / 1024).toFixed(0)} KB, ${ms.toFixed(0)} ms): ${JSON.stringify(r.errors && r.errors[0])}`);
  return `huge ${(big.length / 1024).toFixed(0)} KB in ${ms.toFixed(0)} ms (${r.ok ? 'valid' : r.errors[0].code})`;
});

test('E-01 the shared check (usePasteCheck, stand-in React): busy while checking; success and exception paths both end not-busy with the result region focused + scrolled into view; an exception is shown, never silent', () => {
  const state = [];
  const fakeReact = {
    useState: (v) => { const cell = { v }; state.push(cell); return [cell.v, (n) => { cell.v = typeof n === 'function' ? n(cell.v) : n; }]; },
    useRef: (v) => ({ current: v }),
    useCallback: (fn) => fn,
    createElement: () => null,
  };
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'react') return fakeReact;
    if (request === 'next/link') return () => null;
    return origLoad.call(this, request, parent, isMain);
  };
  const timers = [];
  global.window = { setTimeout: (f) => timers.push(f) };
  try {
    const PC = require(path.join(ROOT, 'components/admin/studio/paste-check.tsx'));
    const shown = [];
    const hook = PC.usePasteCheck((m) => shown.push(m));
    const focus = [];
    hook.regionRef.current = { scrollIntoView: (o) => focus.push(['scroll', o.block]), focus: (o) => focus.push(['focus', o.preventScroll]) };
    const busy = () => state[0].v;
    const drain = () => { while (timers.length) timers.shift()(); };
    let ran = false;
    hook.run(() => { ran = true; });
    assert(busy() === true && !ran, 'busy is set before the check runs (the "Checking…" state paints first)');
    drain();
    assert(ran && busy() === false && JSON.stringify(focus) === '[["scroll","start"],["focus",true]]' && shown.length === 0, `success path: ${JSON.stringify({ ran, busy: busy(), focus })}`);
    focus.length = 0;
    hook.run(() => { throw new Error('boom'); });
    drain();
    assert(busy() === false && shown.length === 1 && /check failed unexpectedly \(boom\)/.test(shown[0]) && focus.length === 2, `exception path: ${JSON.stringify({ shown, focus })}`);
    hook.run(() => { throw 'plain'; }); // eslint-disable-line no-throw-literal
    drain();
    assert(shown.length === 2 && /\(plain\)/.test(shown[1]), 'a non-Error throw is shown too');
  } finally {
    Module._load = origLoad;
    delete global.window;
  }
  return 'busy → result in view; exceptions shown';
});

test('S-01 source: all three screens use usePasteCheck + CheckButton (primary, "Checking…", aria-busy) + CheckRegion (aria-live, focusable) + the exception message; nothing validates in onChange; the server re-extracts', () => {
  const pc = read('components/admin/studio/paste-check.tsx');
  assert(/className=\{studioPrimaryAction\}/.test(pc) && /busy \? "Checking…" : label/.test(pc) && /aria-busy=\{busy\}/.test(pc) && /disabled=\{busy \|\| disabled\}/.test(pc), 'CheckButton: the primary action, busy state');
  assert(/tabIndex=\{-1\}/.test(pc) && /aria-live="polite"/.test(pc) && /role="region"/.test(pc), 'CheckRegion: focusable + announced');
  const screens = { generator: 'components/admin/lessons/lesson-generator.tsx', translation: 'components/admin/lessons/lesson-translation.tsx', intake: 'components/admin/syllabus/intake-wizard.tsx' };
  for (const [name, f] of Object.entries(screens)) {
    const s = read(f);
    assert(/usePasteCheck\(onException\)/.test(s) && /<CheckButton busy=\{busy\}/.test(s) && /<CheckRegion regionRef=\{regionRef\}>/.test(s) && /\{(exception|outcome\.kind === \"exception\") && /.test(s), `${name}: the shared check`);
    assert(/const check = \(\) =>\s*\n?\s*run\(/.test(s), `${name}: the check runs through run()`);
    const handlers = s.match(/onChange=\{[^}]*\}/g) || [];
    assert(handlers.every((h) => !/parse|validate|extractJson|check\(/i.test(h)), `${name}: an onChange validates: ${handlers.filter((h) => /parse|validate|extractJson|check\(/i.test(h))}`);
    assert(!/studioQuietAction\}>\s*Check\s*</.test(s), `${name}: "Check" is not a quiet / link action`);
  }
  assert(/const x = extractJson\(input\.json\);/.test(read('services/syllabus/intake.service.ts')), 'the intake server extracts the same way');
  assert(/parseLessonPart|mergeLessonParts/.test(read('services/lessons/lesson-authoring.service.ts')), 'the lesson server merges the parts the same way');
  return '3 screens';
});

console.log(`\nGEN-CHECK-1 offline: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
