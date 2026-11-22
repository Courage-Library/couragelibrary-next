#!/usr/bin/env node
/**
 * SITEMAP-CA-1 gate (2026-11-22) — Current Affairs in /sitemap.xml, no silent read failure. Offline (no network, no DB).
 *   SC-1 published CA present: article, date and month URLs on the canonical base; lastmod from the published version
 *   SC-2 CA isolation: DRAFT / IN_REVIEW / APPROVED / ARCHIVED, PUBLISHED without a pointer, a pointer to a non-published
 *        version, or no slug are never listed — nor their date / month pages; bad dates ignored; duplicates once; cap
 *   SC-3 the sitemap itself, run with a stubbed client: published CA listed, a draft the read returned is not
 *   SC-4 error paths: a failed CA read logs one structured warning (source + code, never the message / host) and the
 *        rest of the sitemap still renders; a thrown client / lesson read logs and never throws (no 500)
 *   SC-5 source: the public anon client only (no service role), the CA read filters PUBLISHED + pointer and embeds the
 *        version, every read's error is logged, no bare catch; lint clean on both files
 *   SC-6 negative controls: each broken variant is caught
 * Run: node scripts/test_sitemap_ca1.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
const results = [];
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    results.push(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    results.push(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 900)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const ts = require('typescript');
const transpile = (src, filename) => ts.transpileModule(src, { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

/** Load a TS module from (possibly mutated) source; `stubs` replaces named imports (everything else resolves normally). */
function loadTs(rel, src, stubs = {}) {
  const filename = path.join(ROOT, rel);
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  m.require = (req) => {
    if (Object.prototype.hasOwnProperty.call(stubs, req)) return stubs[req];
    throw new Error(`unstubbed import in the sitemap harness: ${req}`);
  };
  m._compile(transpile(src ?? read(rel), filename), filename);
  return m.exports;
}

const CA_REL = 'lib/seo/ca-sitemap.ts';
const SM_REL = 'app/sitemap.ts';
const CA_SRC = read(CA_REL);
const SM_SRC = read(SM_REL);
const BASE = 'https://couragelibrary.in';

// ---------- fixtures ----------
const pubV = (at) => ({ status: 'PUBLISHED', published_at: at });
const row = (o) => ({ slug: 'x', status: 'PUBLISHED', published_version_id: 'v-1', news_date: '2026-11-20', published_at: '2026-11-20T05:00:00Z', updated_at: '2026-11-21T00:00:00Z', published_version: pubV('2026-11-20T06:00:00Z'), ...o });
const PUBLISHED = [
  row({ slug: 'rbi-holds-repo-rate', news_date: '2026-11-20', published_version: pubV('2026-11-20T06:00:00Z') }),
  row({ slug: 'grap-stage-3-delhi', news_date: '2026-11-20', published_version: pubV('2026-11-20T09:30:00Z') }),
  row({ slug: 'isro-launch-october', news_date: '2026-10-31', published_version: pubV('2026-10-31T04:00:00Z') }),
];
const NEVER = [
  row({ slug: 'draft-item', status: 'DRAFT', published_version_id: null, published_version: null, news_date: '2026-09-01' }),
  row({ slug: 'in-review-item', status: 'IN_REVIEW', published_version_id: null, published_version: null, news_date: '2026-09-02' }),
  row({ slug: 'approved-unpublished', status: 'APPROVED', published_version_id: null, published_version: null, news_date: '2026-09-03' }),
  row({ slug: 'approved-with-pointer', status: 'APPROVED', news_date: '2026-09-04' }),
  row({ slug: 'archived-item', status: 'ARCHIVED', news_date: '2026-09-05' }),
  row({ slug: 'published-no-pointer', published_version_id: null, published_version: null, news_date: '2026-09-06' }),
  row({ slug: 'published-draft-version', published_version: { status: 'DRAFT', published_at: null }, news_date: '2026-09-07' }),
  row({ slug: 'published-version-hidden', published_version: null, news_date: '2026-09-08' }),
  row({ slug: null, news_date: '2026-09-09' }),
  row({ slug: '   ', news_date: '2026-09-10' }),
  // a PUBLISHED row whose pointer is null although a version came back (a widened / inconsistent read): never listed
  row({ slug: 'published-null-pointer-with-version', published_version_id: null, news_date: '2026-09-11' }),
];
const NEVER_SLUGS = ['draft-item', 'in-review-item', 'approved-unpublished', 'approved-with-pointer', 'archived-item', 'published-no-pointer', 'published-draft-version', 'published-version-hidden', 'published-null-pointer-with-version'];
const NEVER_DAYS = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'];

function checkPure(ca) {
  const why = [];
  const out = ca.caSitemapEntries(BASE, [...PUBLISHED, ...NEVER]);
  const urls = out.entries.map((e) => e.url);
  const by = Object.fromEntries(out.entries.map((e) => [e.url, e]));
  // SC-1 present, canonical, lastmod from the published version
  for (const s of ['rbi-holds-repo-rate', 'grap-stage-3-delhi', 'isro-launch-october']) if (!urls.includes(`${BASE}/current-affairs/${s}`)) why.push(`published article missing: ${s}`);
  for (const d of ['2026-11-20', '2026-10-31']) if (!urls.includes(`${BASE}/current-affairs/date/${d}`)) why.push(`date page missing: ${d}`);
  for (const m of ['2026-11', '2026-10']) if (!urls.includes(`${BASE}/current-affairs/month/${m}`)) why.push(`month page missing: ${m}`);
  if (!urls.every((u) => u.startsWith(`${BASE}/current-affairs/`))) why.push('a URL off the canonical base');
  const lm = (u) => (by[u] && by[u].lastModified ? new Date(by[u].lastModified).toISOString() : 'none');
  if (lm(`${BASE}/current-affairs/rbi-holds-repo-rate`) !== '2026-11-20T06:00:00.000Z') why.push(`article lastmod not from the published version: ${lm(`${BASE}/current-affairs/rbi-holds-repo-rate`)}`);
  if (lm(`${BASE}/current-affairs/date/2026-11-20`) !== '2026-11-20T09:30:00.000Z') why.push(`date lastmod not the newest article of the day: ${lm(`${BASE}/current-affairs/date/2026-11-20`)}`);
  if (lm(`${BASE}/current-affairs/month/2026-10`) !== '2026-10-31T04:00:00.000Z') why.push('month lastmod');
  // SC-2 isolation
  for (const s of NEVER_SLUGS) if (urls.some((u) => u.endsWith(`/current-affairs/${s}`))) why.push(`UNPUBLISHED LISTED: ${s}`);
  for (const d of NEVER_DAYS) if (urls.some((u) => u.includes(d) || u.endsWith(d.slice(0, 7)))) why.push(`date / month of an unpublished item listed: ${d}`);
  if (out.counts.articles !== 3 || out.counts.dates !== 2 || out.counts.months !== 2 || urls.length !== 7) why.push(`counts ${JSON.stringify(out.counts)} urls ${urls.length}`);
  // bad dates, duplicates, no lastmod → no fake "now"
  const odd = ca.caSitemapEntries(BASE, [row({ slug: 'a', news_date: 'not-a-date' }), row({ slug: 'a' }), row({ slug: 'b', published_at: null, updated_at: null, published_version: pubV(null) })]);
  const ou = odd.entries.map((e) => e.url);
  if (ou.filter((u) => u.endsWith('/current-affairs/a')).length !== 1) why.push('a duplicate slug listed twice');
  if (ou.some((u) => u.includes('not-a-date'))) why.push('a malformed news_date became a date page');
  const b = odd.entries.find((e) => e.url.endsWith('/current-affairs/b'));
  if (!b || 'lastModified' in b) why.push('an item with no publish time got a lastmod ("now")');
  if (ca.caSitemapEntries(BASE, []).entries.length !== 0) why.push('empty input lists something');
  // cap
  if (!(ca.CA_SITEMAP_MAX_ARTICLES > 0 && ca.CA_SITEMAP_MAX_ARTICLES <= 45000)) why.push('cap missing or above 45,000');
  const many = Array.from({ length: ca.CA_SITEMAP_MAX_ARTICLES + 3 }, (_, i) => row({ slug: `n${i}`, news_date: '2026-11-01', published_version: pubV(new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString()) }));
  const capped = ca.caSitemapEntries(BASE, many);
  if (!capped.capped || capped.counts.articles !== ca.CA_SITEMAP_MAX_ARTICLES) why.push('the cap does not hold');
  if (capped.entries.some((e) => e.url.endsWith('/current-affairs/n0'))) why.push('the cap drops the newest instead of the oldest');
  return why;
}

// ---------- the sitemap itself, with a stubbed client ----------
function harness(smSrc, caSrc, plan) {
  const ca = loadTs(CA_REL, caSrc);
  const queries = [];
  const client = {
    from(table) {
      if (plan.throwOnFrom) throw new Error('boom from db.secret-host.supabase.co');
      const q = { table, calls: [] };
      queries.push(q);
      const b = {
        select: (s) => (q.calls.push(['select', s]), b),
        eq: (...a) => (q.calls.push(['eq', ...a]), b),
        neq: (...a) => (q.calls.push(['neq', ...a]), b),
        not: (...a) => (q.calls.push(['not', ...a]), b),
        in: (...a) => (q.calls.push(['in', ...a]), b),
        order: () => b,
        then: (res, rej) => Promise.resolve(plan.tables[table] || { data: [], error: null }).then(res, rej),
      };
      return b;
    },
    rpc: async () => {
      if (plan.throwOnRpc) throw new Error('lesson read failed at db.secret-host.supabase.co');
      return { data: [], error: null };
    },
  };
  const stubs = {
    '@supabase/supabase-js': { createClient: () => client },
    '@/config/site': { siteConfig: { url: BASE, routes: { exams: '/exams', currentAffairs: '/current-affairs' } } },
    '@/config/env': { getAppEnv: () => ({ supabaseUrl: 'https://stub.invalid', supabaseAnonKey: 'stub-anon' }) },
    '@/config/features': { isFeatureEnabled: () => false },
    '@/services/exam-knowledge/exam-module-registry': { ExamModuleRegistry: { getModuleSlug: (k) => String(k).toLowerCase() } },
    '@/types/exam-knowledge': { ExamModuleKey: {} },
    '@/lib/learn/sitemap': { learnSitemapEntries: () => [] },
    '@/lib/learn/topic-canon': { canonicalLessonPath: () => '', EMPTY_TOPIC_CANON: {} },
    '@/services/learning/topic-canon.service': { loadTopicCanon: async () => ({}) },
    '@/lib/seo/ca-sitemap': ca,
  };
  const sm = loadTs(SM_REL, smSrc, stubs);
  return { run: sm.default, queries };
}

async function runSitemap(smSrc, caSrc, plan) {
  const logs = [];
  const orig = { warn: console.warn, error: console.error, log: console.log };
  console.warn = (...a) => logs.push(['warn', a.join(' ')]);
  console.error = (...a) => logs.push(['error', a.join(' ')]);
  console.log = (...a) => logs.push(['log', a.join(' ')]);
  let entries = null;
  let threw = null;
  let queries = [];
  try {
    const h = harness(smSrc, caSrc, plan);
    queries = h.queries;
    entries = await h.run();
  } catch (e) {
    threw = e;
  } finally {
    Object.assign(console, orig);
  }
  return { entries, threw, logs, queries };
}

const EXAMS_OK = { data: [{ id: 'e1', slug: 'ssc-cgl', updated_at: '2026-11-01T00:00:00Z' }], error: null };

async function checkRuntime(smSrc, caSrc) {
  const why = [];
  // SC-3 happy path: the read returns published CA plus (as if widened) a draft — only published listed
  const ok = await runSitemap(smSrc, caSrc, { tables: { exams: EXAMS_OK, current_affairs_articles: { data: [...PUBLISHED, ...NEVER], error: null } } });
  if (ok.threw || !Array.isArray(ok.entries)) why.push(`happy path threw: ${ok.threw && ok.threw.message}`);
  else {
    const urls = ok.entries.map((e) => e.url);
    if (!urls.includes(`${BASE}/current-affairs/rbi-holds-repo-rate`) || !urls.includes(`${BASE}/current-affairs/date/2026-11-20`) || !urls.includes(`${BASE}/current-affairs/month/2026-11`)) why.push('sitemap: published CA missing');
    for (const s of NEVER_SLUGS) if (urls.some((u) => u.endsWith(`/current-affairs/${s}`))) why.push(`sitemap: UNPUBLISHED LISTED: ${s}`);
    if (!urls.includes(`${BASE}/exams/ssc-cgl`)) why.push('sitemap: exam hub missing');
    if (ok.logs.some(([k]) => k === 'warn')) why.push('a warning on the happy path');
    const caq = ok.queries.find((q) => q.table === 'current_affairs_articles');
    const has = (name, ...a) => caq && caq.calls.some((c) => c[0] === name && a.every((x, i) => c[i + 1] === x));
    if (!caq || !has('eq', 'status', 'PUBLISHED') || !has('not', 'published_version_id', 'is', null)) why.push('the CA read does not filter PUBLISHED + pointer');
    const sel = caq && (caq.calls.find((c) => c[0] === 'select') || [])[1];
    if (!sel || !/\bstatus\b/.test(sel) || !/published_version_id/.test(sel) || !/published_version:current_affairs_article_versions!fk_ca_articles_published_version\(status, published_at\)/.test(sel)) why.push('the CA read does not select status, the pointer and the published version');
  }
  // SC-4a the CA read fails: one structured warning, no message / host, the rest still renders
  const err = await runSitemap(smSrc, caSrc, { tables: { exams: EXAMS_OK, current_affairs_articles: { data: null, error: { code: '42501', message: 'permission denied (db.secret-host.supabase.co)' } } } });
  if (err.threw || !Array.isArray(err.entries)) why.push('a CA read error throws (would 500)');
  else {
    const w = err.logs.filter(([k, m]) => k === 'warn' && /SITEMAP_READ_FAILED/.test(m));
    if (w.length !== 1 || !/"source":"current_affairs"/.test(w[0][1]) || !/"code":"42501"/.test(w[0][1])) why.push(`CA read error not logged as one structured warning: ${JSON.stringify(err.logs)}`);
    if (err.logs.some(([, m]) => /secret-host|permission denied/.test(m))) why.push('the error message / host reached the log');
    const urls = err.entries.map((e) => e.url);
    if (!urls.includes(`${BASE}/exams/ssc-cgl`) || !urls.includes(`${BASE}/current-affairs`)) why.push('the rest of the sitemap is gone after a CA read error');
    if (urls.some((u) => /\/current-affairs\/./.test(u))) why.push('CA URLs listed from a failed read');
  }
  // SC-4b the client throws: static entries, one warning, no throw
  const boom = await runSitemap(smSrc, caSrc, { tables: {}, throwOnFrom: true });
  if (boom.threw || !Array.isArray(boom.entries) || !boom.entries.some((e) => e.url === `${BASE}/current-affairs`)) why.push('a thrown read is not caught (would 500) or the static entries are lost');
  else if (!boom.logs.some(([k, m]) => k === 'warn' && /"source":"sitemap"/.test(m))) why.push('the outer catch is silent (the swallowed error)');
  if (boom.logs.some(([, m]) => /secret-host/.test(m))) why.push('a thrown error message reached the log');
  // SC-4c the lesson read throws: logged, the rest still renders
  const lessons = await runSitemap(smSrc, caSrc, { tables: { exams: EXAMS_OK, current_affairs_articles: { data: PUBLISHED, error: null } }, throwOnRpc: true });
  if (lessons.threw || !Array.isArray(lessons.entries)) why.push('a lesson read error throws');
  else {
    if (!lessons.logs.some(([k, m]) => k === 'warn' && /"source":"lessons"/.test(m))) why.push('the lesson catch is silent');
    if (!lessons.entries.some((e) => e.url === `${BASE}/current-affairs/rbi-holds-repo-rate`)) why.push('CA lost after a lesson read error');
  }
  return why;
}

function checkSource(smSrc, caSrc) {
  const why = [];
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const [f, s] of [[SM_REL, smSrc], [CA_REL, caSrc]]) if (/SERVICE_ROLE|service_role|serviceRole|createAdmin|supabaseServiceRoleKey/i.test(code(s))) why.push(`${f}: a service-role read`);
  if (!/createClient<Database>\(env\.supabaseUrl, env\.supabaseAnonKey,/.test(smSrc)) why.push('sitemap: not the anon client');
  if (!/import \{ caSitemapEntries, logSitemapReadFailure, type CaSitemapRow \} from "@\/lib\/seo\/ca-sitemap";/.test(smSrc) || !/caSitemapEntries\(baseUrl, caRes\.data as unknown as CaSitemapRow\[\]\)/.test(smSrc)) why.push('sitemap: CA URLs not built by caSitemapEntries');
  if (/\/current-affairs\/\$\{/.test(code(smSrc))) why.push('sitemap: a CA URL built inline (bypasses the isolation rules)');
  for (const [src, label] of [['examsRes', 'exams'], ['docsRes', 'exam_knowledge_documents'], ['articlesRes', 'learning_documents'], ['coursesRes', 'courses'], ['caRes', 'current_affairs']]) {
    if (!smSrc.includes(`if (${src}.error) logSitemapReadFailure("${label}", ${src}.error);`)) why.push(`sitemap: ${src} error not logged`);
  }
  if (/catch\s*\{/.test(code(smSrc))) why.push('sitemap: a bare catch (silent)');
  if (!/console\.warn\(`\[sitemap\] \$\{JSON\.stringify\(\{ event: "SITEMAP_READ_FAILED", source, code \}\)\}`\);/.test(caSrc) || /\.message/.test(code(caSrc))) why.push('logger: not the structured warning, or it reads the message');
  return why;
}

async function lint() {
  const { ESLint } = require('eslint');
  const eslint = new ESLint({ cwd: ROOT });
  const res = await eslint.lintFiles([SM_REL, CA_REL]);
  const msgs = res.flatMap((r) => r.messages.map((m) => `${path.relative(ROOT, r.filePath)}:${m.line} ${m.ruleId || ''} ${m.message}`));
  return msgs;
}

(async () => {
  const CA = loadTs(CA_REL, CA_SRC);

  await test('SC-1/SC-2 published present (articles, dates, months, canonical, lastmod); unpublished never present; cap', () => {
    const why = checkPure(CA);
    assert(why.length === 0, why.join('; '));
    return `3 articles + 2 dates + 2 months listed; ${NEVER_SLUGS.length} unpublished kinds never listed; cap ${CA.CA_SITEMAP_MAX_ARTICLES}`;
  });
  await test('SC-3/SC-4 the sitemap with a stubbed client: published listed, draft not; read errors log one structured warning, never 500', async () => {
    const why = await checkRuntime(SM_SRC, CA_SRC);
    assert(why.length === 0, why.join('; '));
  });
  await test('SC-5 source: anon client only (no service role), CA via caSitemapEntries, every read error logged, no bare catch', () => {
    const why = checkSource(SM_SRC, CA_SRC);
    assert(why.length === 0, why.join('; '));
  });
  await test('SC-5b lint clean on app/sitemap.ts and lib/seo/ca-sitemap.ts (LINT-SITEMAP-1)', async () => {
    const msgs = await lint();
    assert(msgs.length === 0, msgs.join(' | '));
  });

  await test('SC-6 negative controls: each broken variant is caught', async () => {
    const mut = (s, a, b) => {
      if (!s.includes(a)) throw new Error(`mutation anchor missing: ${a.slice(0, 80)}`);
      return s.split(a).join(b);
    };
    const pureMuts = [
      ['status not checked', () => mut(CA_SRC, '    row.status === "PUBLISHED" &&\n', '')],
      ['pointer not checked', () => mut(CA_SRC, '    typeof row.published_version_id === "string" &&\n    row.published_version_id.length > 0 &&\n', '')],
      ['version status not checked', () => mut(CA_SRC, ' &&\n    row.published_version.status === "PUBLISHED"', '')],
      ['lastmod = now', () => mut(CA_SRC, 'const raw = row.published_version?.published_at ?? row.published_at ?? row.updated_at;', 'const raw = new Date().toISOString();')],
      ['lastmod from the article, not the version', () => mut(CA_SRC, 'const raw = row.published_version?.published_at ?? row.published_at ?? row.updated_at;', 'const raw = row.updated_at ?? row.published_at;')],
      ['dates from every row', () => mut(CA_SRC, '  for (const row of kept) {', '  for (const d of rows) { const day0 = typeof d.news_date === "string" ? d.news_date.slice(0, 10) : ""; if (DAY.test(day0)) dates.set(day0, undefined); }\n  for (const row of kept) {')],
      ['no cap', () => mut(CA_SRC, 'const capped = listable.length > CA_SITEMAP_MAX_ARTICLES;', 'const capped = false;')],
      ['no dedupe', () => mut(CA_SRC, '    if (seen.has(slug)) continue;\n', '')],
      ['a non-canonical base', () => mut(CA_SRC, 'url: `${baseUrl}/current-affairs/${encodeURIComponent(slug)}`', 'url: `https://couragelibrary-next.vercel.app/current-affairs/${encodeURIComponent(slug)}`')],
    ];
    const runtimeMuts = [
      ['CA read error not logged', () => [mut(SM_SRC, '    if (caRes.error) logSitemapReadFailure("current_affairs", caRes.error);\n', ''), CA_SRC]],
      ['outer catch silent', () => [mut(SM_SRC, '    logSitemapReadFailure("sitemap", error);\n', ''), CA_SRC]],
      ['outer catch rethrows (500)', () => [mut(SM_SRC, '    logSitemapReadFailure("sitemap", error);\n    return staticEntries;', '    throw error;'), CA_SRC]],
      ['lesson catch silent', () => [mut(SM_SRC, '      logSitemapReadFailure("lessons", lessonError);\n', ''), CA_SRC]],
      ['logger prints the message', () => [SM_SRC, mut(CA_SRC, 'JSON.stringify({ event: "SITEMAP_READ_FAILED", source, code })', 'JSON.stringify({ event: "SITEMAP_READ_FAILED", source, code, message: String((error as { message?: unknown })?.message) })')]],
      ['CA read drops the PUBLISHED filter', () => [mut(SM_SRC, '.select("slug, status, published_version_id, news_date, published_at, updated_at, published_version:current_affairs_article_versions!fk_ca_articles_published_version(status, published_at)")\n        .eq("status", "PUBLISHED")', '.select("slug, status, published_version_id, news_date, published_at, updated_at, published_version:current_affairs_article_versions!fk_ca_articles_published_version(status, published_at)")'), CA_SRC]],
      ['CA read drops the version embed', () => [mut(SM_SRC, ', published_version:current_affairs_article_versions!fk_ca_articles_published_version(status, published_at)', ''), CA_SRC]],
      ['CA built inline from the raw rows', () => [mut(SM_SRC, '      const ca = caSitemapEntries(baseUrl, caRes.data as unknown as CaSitemapRow[]);', '      const ca = { capped: false, entries: (caRes.data as unknown as CaSitemapRow[]).map((r) => ({ url: `${baseUrl}/current-affairs/${r.slug}` })) };'), CA_SRC]],
    ];
    const sourceMuts = [
      ['service-role client', () => checkSource(mut(SM_SRC, 'createClient<Database>(env.supabaseUrl, env.supabaseAnonKey,', 'createClient<Database>(env.supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!,'), CA_SRC)],
      ['exams error not logged', () => checkSource(mut(SM_SRC, '    if (examsRes.error) logSitemapReadFailure("exams", examsRes.error);\n', ''), CA_SRC)],
      ['bare catch', () => checkSource(mut(SM_SRC, '    } catch (lessonError) {', '    } catch {'), CA_SRC)],
    ];
    const missed = [];
    for (const [n, f] of pureMuts) {
      let why;
      try { why = checkPure(loadTs(CA_REL, f())); } catch (e) { why = /anchor missing/.test(e.message) ? [] : [e.message]; }
      if (!why.length) missed.push(n);
    }
    for (const [n, f] of runtimeMuts) {
      let why;
      try { const [s, c] = f(); why = await checkRuntime(s, c); } catch (e) { why = /anchor missing/.test(e.message) ? [] : [e.message]; }
      if (!why.length) missed.push(n);
    }
    for (const [n, f] of sourceMuts) {
      let why;
      try { why = f(); } catch (e) { why = /anchor missing/.test(e.message) ? [] : [e.message]; }
      if (!why.length) missed.push(n);
    }
    assert(missed.length === 0, `not caught: ${missed.join(', ')}`);
    return `${pureMuts.length + runtimeMuts.length + sourceMuts.length} mutations caught`;
  });

  console.log('SITEMAP-CA-1 gate');
  console.log(results.join('\n'));
  console.log(`SITEMAP-CA-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
