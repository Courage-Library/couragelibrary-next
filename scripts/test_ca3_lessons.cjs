#!/usr/bin/env node
/**
 * CA-3 LESSON BLOCKS — offline gate (no network, no DB; reads source + runs the pure TS modules).
 *   B-01 validator (lib/lessons/blocks.ts): the shared vectors give the expected verdicts; HTML / URLs / markup links /
 *        control characters / unknown types or keys / duplicate ids / LaTeX outside the allow-list are refused
 *   B-02 rich text → AST only (bold / italic / code / math / node links); markup-looking text stays literal text
 *   B-03 SQL parity: migration 117's LaTeX allow-list, block types and text rule equal the TS ones
 *   C-01 v1 → blocks converter: valid output, zero lost texts; fail-closed on a diagram asset, PYQ references,
 *        unsupported markdown, an unknown callout variant
 *   D-01 migrations 117 / 118: functions INVOKER + client EXECUTE revoked + service_role only; bodies never
 *        client-readable; published frozen; one current per language; retirement guards; rollback files
 *   R-01 reader: /articles renders LessonBlocksRenderer only; servable = published BLOCKS; the lesson is loaded with the
 *        service role ONLY for an unlocked viewer; no HTML injection API anywhere in the renderer
 *   M-01 the MDX path is retired: compileAndStoreVersion / compileVersion / publishVersion fail closed
 *   S-01 admin only: /admin/lessons routes, page guards, action guards; the client editor imports no server module
 *   U-01 editor: one primary in the header, labelled controls, English-only (#85), no browser dialogs
 *   K-01 KaTeX (architect ruling): an allowed formula renders server-side (KaTeX HTML, no katex-error); a disallowed
 *        command is rejected at validation and never reaches KaTeX; a malformed formula falls back to the reading;
 *        the options are trust:false / strict:"error" / throwOnError:false / maxSize / maxExpand
 *   K-02 the only HTML injection in a lesson is KatexMath with renderLatex output; KaTeX never reaches a client component;
 *        CSS + fonts self-hosted (no CDN); katex pinned to an exact version
 * Run: node scripts/test_ca3_lessons.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {}; // katex-render is server-only; the gate runs it in Node
  return originalLoad.call(this, request, parent, isMain);
};
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

const B = require(path.join(ROOT, 'lib/lessons/blocks.ts'));
const C = require(path.join(ROOT, 'lib/lessons/convert-v1.ts'));
const M117 = read('supabase/migrations/20261027000117_ca3_lesson_blocks.sql');
const M118 = read('supabase/migrations/20261027000118_ca3_retire_mdx.sql');

test('B-01 validator: shared vectors give the expected verdicts', () => {
  const wrong = B.VALIDATION_VECTORS.filter((v) => B.validateLesson(v.meta, v.blocks).ok !== v.ok).map((v) => v.name);
  assert(wrong.length === 0, `wrong verdicts: ${wrong.join(', ')}`);
  for (const t of ['<b>x</b>', '</p>', '<!-- x -->', 'see https://x.test', 'javascript:alert(1)', '[a](b)', 'a\u0007b', 'a\u0085b']) assert(B.textProblem(t), `not refused: ${JSON.stringify(t)}`);
  for (const t of ['x < 5 and y > 3', 'Plain **bold** and $x^2$', 'Line one\nline two\twith a tab', 'प्रतिशत']) assert(!B.textProblem(t), `refused: ${JSON.stringify(t)}`);
  assert(B.latexProblem('\\href{x}{y}') && B.latexProblem('\\input{x}') && B.latexProblem('\\def\\a{1}') && !B.latexProblem('\\frac{1}{2} \\times 100\\%'), 'latex allow-list');
  return `${B.VALIDATION_VECTORS.length} vectors`;
});

test('B-02 rich text is parsed to an AST only; markup-looking text stays literal', () => {
  const ast = B.parseRichText('A **bold** *it* `c` $x^2$ [[node:11111111-1111-4111-8111-111111111111|Percent]] end');
  assert(JSON.stringify(ast.map((n) => n.t)) === JSON.stringify(['text', 'bold', 'text', 'italic', 'text', 'code', 'text', 'math', 'text', 'node_link', 'text']), JSON.stringify(ast));
  const lit = B.parseRichText('**unclosed and $\\href{x}{y}$ stays');
  assert(lit.every((n) => n.t === 'text'), `a bad math span / unclosed marker became a node: ${JSON.stringify(lit)}`);
  assert(B.richToPlain('a **b** [[node:11111111-1111-4111-8111-111111111111|c]]') === 'a b c', 'plain text');
});

test('B-03 SQL parity: LaTeX allow-list, block types and the text rule in migration 117 equal the TS ones', () => {
  const arr = (src) => [...src.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
  const latexBody = M117.slice(M117.indexOf('FUNCTION public.fn_lesson__latex_problem'), M117.indexOf('$fn$;', M117.indexOf('FUNCTION public.fn_lesson__latex_problem')));
  const sqlCmds = arr(latexBody.slice(latexBody.indexOf('ARRAY[')));
  assert(JSON.stringify([...sqlCmds].sort()) === JSON.stringify([...B.LATEX_COMMANDS].sort()), `LaTeX lists differ: sql-only ${sqlCmds.filter((x) => !B.LATEX_COMMANDS.includes(x))} ts-only ${B.LATEX_COMMANDS.filter((x) => !sqlCmds.includes(x))}`);
  const typesSrc = M117.slice(M117.indexOf('c_types constant text[] := ARRAY['), M117.indexOf('];', M117.indexOf('c_types constant text[] := ARRAY[')));
  assert(JSON.stringify(arr(typesSrc).sort()) === JSON.stringify([...B.BLOCK_TYPES].sort()), 'block type lists differ');
  for (const frag of ["WHEN s ~ '<[a-zA-Z!/?]' THEN 'HTML'", "position('](' in s) > 0 THEN 'MARKUP_LINK'", "~* '(https?://|javascript:|data:|vbscript:)' THEN 'URL'", "translate(s, E'\\n\\t', '') ~ '[[:cntrl:]]'"])
    assert(M117.includes(frag), `SQL text rule missing: ${frag}`);
  return `${sqlCmds.length} LaTeX commands, ${B.BLOCK_TYPES.length} block types`;
});

test('C-01 converter: valid output, zero lost texts; fail-closed on what it cannot place', () => {
  const spec = {
    schemaVersion: '1.0.0', metadata: { title: 'T', estimatedReadingMinutes: 5 }, learningObjectives: ['O1'], prerequisites: [{ conceptSummary: 'P1' }],
    sections: [{ id: 's1', title: 'S', contentMarkdown: 'Intro **x**.\n\n- a\n- b\n\n1. one\n2. two\n\n## Sub', calloutNotes: [{ variant: 'MEMORY_HOOK', title: 'Hook', body: 'B' }] }],
    formulaBlocks: [{ id: 'f', name: 'F', latexFormula: '\\frac{a}{b}', variableDefinitions: [{ symbol: 'a', meaning: 'top' }], applicableConditions: ['b > 0'], speedShortcutTrick: 'K' }],
    workedExamples: [{ id: 'w', difficulty: 'HARD', problemText: 'Q', stepByStepSolution: [{ stepNumber: 2, explanation: 'two' }, { stepNumber: 1, explanation: 'one', mathSnippet: '1+1' }], shortcutMethod: 'S', commonMistakeToAvoid: 'M' }],
    cognitiveTraps: [{ trapType: 'MISREAD_KEYWORD', misconception: 'X', correctApproach: 'Y' }],
    quickChecks: [{ id: 'q', prompt: 'P', options: [{ id: 'a', text: 'A', isCorrect: true, feedbackExplanation: 'F' }, { id: 'b', text: 'B', isCorrect: false }] }],
    revisionSummary: { keyTakeaways: ['K1'], coreFormulas: ['a+b'], speedRules: ['R1'] }, seo: { metaTitle: 'MT', metaDescription: 'MD', focusKeywords: ['k'] },
  };
  const out = C.convertV1(spec);
  const v = B.validateLesson(out.meta, out.blocks);
  assert(v.ok, JSON.stringify(v.errors));
  assert(C.coverageGaps(spec, out).length === 0, `lost: ${C.coverageGaps(spec, out)}`);
  const ex = out.blocks.find((b) => b.type === 'solved_example');
  assert(ex.steps[0].text === 'one' && ex.steps[0].math === '1+1', 'steps in stepNumber order with their math');
  const throws = (mut) => { const s2 = JSON.parse(JSON.stringify(spec)); mut(s2); try { C.convertV1(s2); return false; } catch (e) { return e instanceof C.ConversionError; } };
  assert(throws((s2) => (s2.sections[0].diagramAssetId = 'x')), 'diagram asset');
  assert(throws((s2) => (s2.authenticPyqReferences = [{ questionVersionId: 'v', relevanceRationale: 'r' }])), 'PYQ refs');
  assert(throws((s2) => (s2.sections[0].contentMarkdown = 'a\n| t |')), 'unsupported markdown');
  assert(throws((s2) => (s2.sections[0].calloutNotes[0].variant = 'DANGER')), 'unknown callout');
  return `${out.blocks.length} blocks, ${C.v1Texts(spec).length} texts kept`;
});

test('D-01 migrations 117 / 118: INVOKER + revoked + service_role; bodies never client-readable; frozen when published; retirement guards; rollbacks', () => {
  assert(!/SECURITY DEFINER/i.test(M117) && !/SECURITY DEFINER/i.test(M118), 'SECURITY DEFINER in a CA-3 migration');
  const fns = ['fn_lesson__text_problem(text)', 'fn_lesson__latex_problem(text)', 'fn_lesson_blocks_errors(jsonb, jsonb)', 'fn_lesson_save_draft(uuid, text, jsonb, jsonb, text, uuid, text)', 'fn_lesson_publish(uuid, uuid, text)', 'fn_lesson_version_blocks_guard()'];
  for (const f of fns) assert(M117.includes(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`), `REVOKE ${f}`);
  assert((M117.match(/GRANT EXECUTE ON FUNCTION [^;]+ TO ([a-z_]+);/g) || []).every((g) => / TO service_role;$/.test(g)), 'grants only to service_role');
  assert(/GRANT SELECT \(%s\) ON TABLE public\.document_versions TO %I/.test(M117) && /column_name NOT IN \('blocks', 'lesson_meta'\)/.test(M117) && /CA3_PROOF: a client role can read lesson bodies/.test(M117), 'body column grants + proof');
  assert(/NEW\.blocks IS DISTINCT FROM OLD\.blocks OR/.test(M117) && /NEW\.lesson_meta IS DISTINCT FROM OLD\.lesson_meta OR/.test(M117), 'published frozen incl. blocks / meta');
  assert(/CREATE UNIQUE INDEX uq_document_versions_one_current_per_language/.test(M117) && /encode\(sha256\(convert_to\(NEW\.lesson_meta::text \|\| E'\\n' \|\| NEW\.blocks::text/.test(M117), 'one current per language + DB hash');
  assert(/MDX_PATH_RETIRED: new lesson versions are DB blocks/.test(M118) && /only demotion is allowed/.test(M118) && /must be a DB lesson \(BLOCKS\)/.test(M118) && /CA3_RETIRE_PREFLIGHT/.test(M118), '118 guards + preflight');
  for (const f of ['117', '118']) assert(fs.existsSync(path.join(ROOT, `docs/database/rollback/${f}_rollback.sql`)), `rollback ${f}`);
});

test('R-01 reader: blocks only, loaded with the service role for unlocked viewers, no HTML injection API', () => {
  const page = read('app/articles/[slug]/page.tsx');
  assert(/LessonBlocksRenderer/.test(page) && !/ControlledContentRenderer/.test(page), 'article page renderer');
  const res = read('services/learning/learning-resolver.service.ts');
  assert(/ver\.content_format === 'BLOCKS' &&/.test(res), 'servable = BLOCKS');
  assert(/if \(!doc\.is_locked && ver\?\.id\) \{\s*try \{\s*const admin = createAdminServerSupabaseClient\(\);/.test(res), 'lesson loaded with the service role only when unlocked');
  assert(!/getLearningArtifactStorage|compiled_artifact_storage_key/.test(res), 'resolver still reads the MDX storage');
  for (const f of ['components/learning/lesson-blocks-renderer.tsx', 'components/learning/lesson-quick-check.tsx', 'components/admin/lessons/lesson-editor.tsx'])
    assert(!/dangerouslySetInnerHTML|innerHTML|eval\(|new Function/.test(read(f)), `${f}: HTML injection API`);
});

test('M-01 the MDX path is retired: every legacy writer fails closed', () => {
  const lds = read('services/learning-document.service.ts');
  assert(/export const MDX_PATH_RETIRED = true;/.test(lds) && /if \(MDX_PATH_RETIRED\) throw new MdxPathRetiredError\(\);\s*\/\/ 1\. Compile/.test(lds), 'compileAndStoreVersion');
  const st = read('services/admin-content-studio.service.ts');
  assert((st.match(/if \(MDX_PATH_RETIRED\) throw new MdxPathRetiredError\(\);/g) || []).length === 2, 'compileVersion + publishVersion');
});

test('S-01 admin only: routes, page guards, action guards, client imports', () => {
  const nav = read('lib/admin/nav.ts');
  assert(/"\/admin\/lessons",\n  "\/admin\/lessons\/\[id\]",/.test(nav) && /\{\s*label: "Lessons", href: "\/admin\/lessons", icon: "learning", access: "admin",/.test(nav), 'nav + ADMIN_ONLY_ROUTES');
  for (const f of ['app/admin/lessons/page.tsx', 'app/admin/lessons/[id]/page.tsx']) {
    const s = read(f);
    assert(/await requireAdminPage\(\{ path: "\/admin\/lessons" \}\)/.test(s) && !/allowStaff/.test(s), `${f}: admin page guard`);
  }
  const fns = read('app/admin/lessons/actions.ts').split(/export async function /).slice(1);
  assert(fns.length === 7, `actions: ${fns.length}`); // CA-3 draft + publish; CA-4 generated draft + translation draft; CA-7 course launch + exam note draft / publish
  for (const f of fns) {
    const at = f.indexOf('const __auth = await guardAdminAction()');
    const body = f.lastIndexOf('{\n', at);
    assert(at > 0 && body > 0 && f.slice(body + 2, at).trim() === '' && !/allowStaff/.test(f), `not guarded first: ${f.slice(0, 40)}`);
  }
  const ed = read('components/admin/lessons/lesson-editor.tsx');
  assert(/^"use client";/.test(ed) && !/@\/services\/|@\/lib\/supabase/.test(ed), 'client editor imports a server module');
});

test('U-01 editor: one primary in the header, labelled controls, English-only (#85), no browser dialogs', () => {
  const s = read('components/admin/lessons/lesson-editor.tsx');
  const i = s.indexOf('<StudioPageHeader', s.indexOf('return (\n    <div className="space-y-5">\n      <StudioPageHeader\n        title={`Edit lesson'));
  const header = s.slice(i, s.indexOf('/>', s.indexOf('actions=', i)));
  assert((header.match(/studioPrimaryAction/g) || []).length === 1, 'one primary');
  for (const id of [...s.matchAll(/<(?:select|input|textarea) id="([^"]+)"/g)].map((m) => m[1])) assert(s.includes(`htmlFor="${id}"`), `no label for #${id}`);
  assert(!/\slang=/.test(s) && !/[ऀ-ॿ]/.test(s) && !/\bHindi\b/.test(s) && !/window\.confirm|alert\(/.test(s), '#85 / dialogs');
});

test('K-01 KaTeX: allowed renders server-side; disallowed rejected at validation; malformed falls back to the reading', () => {
  const K = require(path.join(ROOT, 'lib/lessons/katex-render.ts'));
  const ok1 = K.renderLatex('\\frac{a}{b} \\times 100\\%', 'display');
  assert(ok1 && /class="katex/.test(ok1) && !/katex-error/.test(ok1) && !/\\frac/.test(ok1.replace(/<annotation[\s\S]*?<\/annotation>/g, '')), 'allowed display formula must render as KaTeX HTML (no raw LaTeX)');
  const inl = K.renderLatex('x^2 + y^2', 'inline');
  assert(inl && /<math/.test(inl), 'inline math carries MathML for screen readers');
  for (const bad of ['\\href{https://x.test}{y}', '\\url{x}', '\\includegraphics{x}', '\\htmlClass{x}{y}', '\\def\\a{1}']) {
    assert(B.latexProblem(bad), `allow-list must refuse ${bad}`);
    assert(!B.validateLesson({ title: 'T' }, [{ id: 'f', type: 'formula', latex: bad, reading: 'r' }]).ok, `validation must refuse ${bad}`);
    assert(K.renderLatex(bad, 'display') === null, `${bad} must never reach KaTeX`);
  }
  for (const broken of ['\\frac{1}{', 'a^{b', '\\sqrt[', '{{{{']) assert(K.renderLatex(broken, 'display') === null, `malformed ${broken} must give null (→ the reading)`);
  const comp = read('components/learning/katex-math.tsx');
  assert(/if \(!html\) \{\s*return display \? <span className="block text-body text-fg">\{reading \|\| latex\}<\/span>/.test(comp), 'fallback to the reading');
  assert(/<span aria-hidden="true" dangerouslySetInnerHTML=\{\{ __html: html \}\} \/>\s*\{reading && <span className="sr-only">\{reading\}<\/span>\}/.test(comp), 'block formula: KaTeX hidden from AT + the reading as sr-only text');
  const kr = read('lib/lessons/katex-render.ts');
  assert(/trust: false,/.test(kr) && /strict: "error",/.test(kr) && /throwOnError: false,/.test(kr) && /maxSize: 10,/.test(kr) && /maxExpand: 100,/.test(kr), 'KaTeX options');
  assert(/latexProblem\(latex\)\) return null;/.test(kr) && /html\.includes\("katex-error"\)\) return null;/.test(kr), 'allow-list first; katex-error → null');
});

test('K-02 HTML injection only via KatexMath + renderLatex; KaTeX server-only; self-hosted CSS; exact pin', () => {
  const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : /\.(tsx?)$/.test(e.name) ? [`${d}/${e.name}`] : []));
  const files = ['app', 'components', 'lib', 'services'].flatMap(walk);
  const katexImporters = files.filter((f) => /from ['"]katex['"]|require\(['"]katex['"]\)/.test(read(f)));
  assert(JSON.stringify(katexImporters) === JSON.stringify(['lib/lessons/katex-render.ts']), `katex imported by: ${katexImporters}`);
  assert(/^import "server-only";/.test(read('lib/lessons/katex-render.ts')), 'katex-render must be server-only');
  const mathUsers = files.filter((f) => /components\/learning\/katex-math/.test(read(f)));
  for (const f of mathUsers) assert(!/^"use client";/.test(read(f)), `${f} is a client component importing KatexMath`);
  const comp = read('components/learning/katex-math.tsx');
  assert((comp.match(/dangerouslySetInnerHTML/g) || []).length === 2 && /const html = renderLatex\(latex, display \? "display" : "inline"\);/.test(comp), 'KatexMath injects only renderLatex output');
  assert(/import "katex\/dist\/katex\.min\.css";/.test(comp) && !files.some((f) => /cdn\.jsdelivr\.net\/npm\/katex|unpkg\.com\/katex|cdnjs[^'"]*katex/.test(read(f))), 'self-hosted KaTeX CSS, no CDN');
  const pkg = JSON.parse(read('package.json'));
  assert(pkg.dependencies.katex === '0.16.11' && pkg.devDependencies['@types/katex'] === '0.16.7', `katex pins: ${pkg.dependencies.katex} / ${pkg.devDependencies['@types/katex']}`);
  return `${mathUsers.length} server user(s) of KatexMath`;
});

console.log(`\nCA3-LESSONS offline: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
