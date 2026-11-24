#!/usr/bin/env node
/**
 * PUBLIC-READ-404 (LIVE-GREEN-1 3c, owner 2026-11-24) — offline gate: in the three CACHED public loaders (the master
 * lesson /learn, the exam-topic page, the exam course) a failed read THROWS — it is never null / [] (→ notFound()) and,
 * because Next's unstable_cache stores only a result that RETURNED, it is never cached: the next request reads again.
 * Before, one failed read cached a 404 for 15–30 min (sweep 2026-11-24; UX2A L-17 in dispatch 45362983737).
 *   P-1 must(): data passes; an error throws PublicReadError naming the read only (no data, no DB text)
 *   P-2 the REAL unstable_cache (next/dist/server/web/spec-extension/unstable-cache.js, outside a request, with an
 *       in-memory incremental cache): a loader that THROWS is not cached — the next call runs the read again and the
 *       good result is then cached; NEGATIVE CONTROL: a loader that RETURNS null (the old behaviour) is cached and
 *       the next call never reads (the cached 404)
 *   P-3 static: loadMasterDataUncached / loadExamTopicUncached / loadCourseDataUncached / isCourseLive read only
 *       through must() (or an explicit `error` check that throws); no `{ data }` without `error`, no .catch(() => null)
 *       / .catch(() => []) on a read; the exam hub keeps only its explicit isCourseLive(...).catch(() => false)
 *   P-4 negative controls: each broken variant is caught
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
const results = [];
async function test(name, fn) {
  try { const info = await fn(); passed++; results.push(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; results.push(`  FAIL  ${name}\n        ${String(e && e.message).slice(0, 600)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
function loadTs(rel, src = read(rel)) {
  const filename = path.join(ROOT, rel);
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  m._compile(ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
  return m.exports;
}

const HELPER = 'lib/data/read-error.ts';
const FILES = {
  master: 'services/learning/master-lesson.service.ts',
  topic: 'services/learning/exam-topic.service.ts',
  course: 'services/learning/course.service.ts',
  hub: 'app/(site)/exams/[slug]/page.tsx',
};

// ---------------------------------------------------------------- P-1
function checkMust(src = read(HELPER)) {
  const H = loadTs(HELPER, src);
  assert(H.must({ data: [1, 2], error: null }, 'x').length === 2 && H.must({ data: null }, 'x') === null, 'must() must pass data (and null for a missing row)');
  let e = null;
  try { H.must({ data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } }, 'learn node'); } catch (x) { e = x; }
  assert(e && e.name === 'PublicReadError' && e.message === 'public read failed: learn node', `a read error must throw PublicReadError naming the read only (got ${e ? e.name + ': ' + e.message : 'no throw'})`);
  return 'data / null pass; error → PublicReadError("learn node")';
}

// ---------------------------------------------------------------- P-2 the real unstable_cache
function fakeIncrementalCache() {
  const store = new Map();
  const ic = {
    sets: 0,
    isOnDemandRevalidate: false,
    async generateSimpleCacheKey(k) { return typeof k === 'string' ? k : JSON.stringify(k); },
    async get(key) { return store.has(key) ? { value: store.get(key), isStale: false } : null; },
    async set(key, value) { ic.sets++; store.set(key, value); },
  };
  return ic;
}
async function checkCacheSemantics() {
  // Next's own server installs this global at startup (next/dist/server/node-environment); outside a server we do it
  globalThis.AsyncLocalStorage = globalThis.AsyncLocalStorage || require('async_hooks').AsyncLocalStorage;
  const { unstable_cache } = require('next/dist/server/web/spec-extension/unstable-cache.js');
  // (a) a THROWING loader is not cached
  globalThis.__incrementalCache = fakeIncrementalCache();
  let calls = 0;
  const throwingThenOk = async () => { calls++; if (calls === 1) throw new Error('public read failed: learn node'); return { ok: true }; };
  const get = () => unstable_cache(throwingThenOk, ['lg3c-throw', 'k1'], { revalidate: 1800 })();
  let first = null;
  try { await get(); } catch (e) { first = e; }
  assert(first && /public read failed/.test(first.message), 'the failed read must reject');
  assert(globalThis.__incrementalCache.sets === 0, `a rejected read was stored in the cache (${globalThis.__incrementalCache.sets} set)`);
  const second = await get();
  assert(calls === 2 && second && second.ok === true, `the next call must read again (calls ${calls})`);
  const third = await get();
  assert(calls === 2 && third && third.ok === true, `the good result must then be cached (calls ${calls})`);
  // (b) NEGATIVE CONTROL: a loader that RETURNS null (the old error → null) IS cached → the next call never reads
  globalThis.__incrementalCache = fakeIncrementalCache();
  let nullCalls = 0;
  const nullThenOk = async () => { nullCalls++; return nullCalls === 1 ? null : { ok: true }; };
  const getNull = () => unstable_cache(nullThenOk, ['lg3c-null', 'k1'], { revalidate: 1800 })();
  const n1 = await getNull();
  const n2 = await getNull();
  assert(n1 === null && n2 === null && nullCalls === 1, `control: a returned null must be cached (calls ${nullCalls}, second ${JSON.stringify(n2)}) — else this check proves nothing`);
  delete globalThis.__incrementalCache;
  return 'thrown read: not stored, next call re-reads, then cached · control: a returned null is cached (the old 30-min 404)';
}

// ---------------------------------------------------------------- P-3 static
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
function body(src, name) {
  const i = src.search(new RegExp(`(async )?function ${name}\\(`));
  assert(i >= 0, `function ${name} not found`);
  let depth = 0;
  const open = src.indexOf('{', src.indexOf(')', i));
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(open, j + 1);
  }
  throw new Error(`function ${name}: unbalanced`);
}
function checkStatic(srcs) {
  const bad = [];
  const fns = [['master', 'loadMasterDataUncached'], ['topic', 'loadExamTopicUncached'], ['course', 'loadCourseDataUncached'], ['course', 'isCourseLive']];
  for (const [k, fn] of fns) {
    const src = srcs[k];
    if (!/import \{ must \} from "@\/lib\/data\/read-error";/.test(src)) bad.push(`${FILES[k]}: does not import must()`);
    const b = strip(body(src, fn));
    // a `{ data … }` destructure without `error` ignores a failed read
    for (const m of b.matchAll(/\{\s*data\b[^}]*\}\s*(?:,|\]|=)/g)) if (!/\berror\b/.test(m[0])) bad.push(`${fn}: ${m[0].replace(/\s+/g, ' ').slice(0, 50)} ignores error`);
    // an explicit `error` destructure must be checked by a throw in the same function
    if (/\{\s*data\b[^}]*\berror\b/.test(b) && !/if \([^)]*\berror\b[^)]*\) throw /.test(b)) bad.push(`${fn}: an error is destructured but never thrown`);
    if (/\.catch\(\(\)\s*=>\s*(null|\[\]|undefined)\)/.test(b)) bad.push(`${fn}: .catch(() => null / []) on a read`);
    if (!/must\(/.test(b)) bad.push(`${fn}: no must()`);
  }
  if (/return !error && /.test(strip(body(srcs.course, 'isCourseLive')))) bad.push('isCourseLive: an error is "not launched" again');
  const hub = strip(srcs.hub);
  if (!/isCourseLive\(exam\.id\)\.catch\(\(\) => false\)/.test(hub)) bad.push('the exam hub calls isCourseLive without its explicit .catch(() => false) (the hub would 5xx on a launch-read error)');
  assert(bad.length === 0, bad.join(' | '));
  return `${fns.length} loader functions read only through must(); the hub's course link keeps its explicit fallback`;
}

(async () => {
  const SRC = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, read(f)]));
  await test('P-1 must(): data passes, an error throws PublicReadError (read name only)', () => checkMust());
  await test('P-2 the real unstable_cache: a thrown read is not cached (next request re-reads); a returned null IS cached (control)', () => checkCacheSemantics());
  await test('P-3 the cached loaders read only through must(); no ignored error, no .catch(() => null)', () => checkStatic(SRC));
  await test('P-4 negative controls: each broken variant is caught', async () => {
    const mut = (s, a, b) => { assert(s.includes(a), `anchor missing: ${a.slice(0, 60)}`); return s.replace(a, b); };
    const cases = [
      ['must() swallows the error', () => checkMust(mut(read(HELPER), '  if (res.error) throw new PublicReadError(where);\n', ''))],
      ['must() puts the DB text in the message', () => checkMust(mut(read(HELPER), 'super(`public read failed: ${where}`);', 'super(`public read failed: ${where}`); this.message += ""; this.message = `public read failed: ${where} (statement timeout)`;'))],
      ['master node read ignores its error again', () => checkStatic({ ...SRC, master: mut(SRC.master, '  const node = must(\n    await admin', '  const { data: node } = (\n    await admin').replace('      .maybeSingle(),\n    "learn node",\n  );', '      .maybeSingle()\n  );') })],
      ['exam-topic swallows a read with .catch(() => null)', () => checkStatic({ ...SRC, topic: mut(SRC.topic, '  const nodes = must(await admin.from("canonical_taxonomy_nodes").select("id, parent_id, is_active").eq("is_active", true), "taxonomy nodes");', '  const nodes = await admin.from("canonical_taxonomy_nodes").select("id, parent_id, is_active").eq("is_active", true).then((r) => r.data).catch(() => null);') })],
      ['course exam read ignores its error again', () => checkStatic({ ...SRC, course: mut(SRC.course, '  const exam = must(await admin.from("exams").select("id, slug, title").eq("slug", examSlug).eq("is_active", true).maybeSingle(), "exam");', '  const { data: exam } = await admin.from("exams").select("id, slug, title").eq("slug", examSlug).eq("is_active", true).maybeSingle();') })],
      ['isCourseLive: error = not launched again', () => checkStatic({ ...SRC, course: mut(SRC.course, '  const data = must(await createPublicServerSupabaseClient().from("exam_course_launches").select("status").eq("exam_id", examId).eq("status", "LIVE").limit(1), "course launch");\n  return Boolean(data?.length);', '  const { data, error } = await createPublicServerSupabaseClient().from("exam_course_launches").select("status").eq("exam_id", examId).eq("status", "LIVE").limit(1);\n  return !error && Boolean(data?.length);') })],
      ['the hub loses its explicit fallback', () => checkStatic({ ...SRC, hub: mut(SRC.hub, 'isCourseLive(exam.id).catch(() => false)', 'isCourseLive(exam.id)') })],
    ];
    const missed = [];
    for (const [name, fn] of cases) {
      let caught = false;
      try { await fn(); } catch (e) { if (/anchor missing/.test(String(e.message))) { missed.push(`${name}: ${e.message}`); continue; } caught = true; }
      if (!caught) missed.push(name);
    }
    assert(missed.length === 0, `not caught: ${missed.join(' | ')}`);
    return `${cases.length}/${cases.length} broken variants caught`;
  });
  console.log('PUBLIC-READ-404 (LIVE-GREEN-1 3c)');
  for (const r of results) console.log(r);
  console.log(`\nPUBLIC-READ-404: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
