/**
 * Anonymous smoke (HOTFIX-1, extended by UX-2a, SEC-HOTFIX-6/7, GAP2-4b/4c, DRILL-1, SYL-IMPORT-1; moved into the repo
 * by QB-KEY-1 round 2 so its checks are audited). Anonymous requests only — safe against production.
 *   GET / 200 without diagnostics text and without the project ref (sha-compared, never printed); landing checks;
 *   /api/health 200; anon /admin 307; the 4 fixed routes → /auth/login?next=… (only when their flags are on);
 *   anon PostgREST probes (42501 / retired tables not exposed);
 *   /exams/ssc-cgl syllabus section matches the read model (AVAILABLE → paper / section titles, no coming-soon;
 *   NO_SYLLABUS → "Syllabus coming soon") — scripts/smoke/_syllabus-expect.cjs
 *   GATE-HYGIENE-1: the project-ref scan covers the HTML and every same-origin JS chunk, with a minimum-coverage
 *   assertion (0 chunks / 0 tokens scanned = FAIL); --self-test proves offline that a planted ref is caught.
 * Usage: node scripts/smoke/anonymous-smoke.cjs <baseUrl> [--expect-redirects] | --self-test
 */
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..', '..');
const { readModelForSlug, checkSyllabusSection } = require('./_syllabus-expect.cjs');
const { scanRef, chunkPaths, selfTest } = require('./_ref-scan.cjs');
if (process.argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1); // offline: planted-ref fixture
const { readEnv } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
// CI-1 (ci-public, least privilege): the anonymous smoke needs ONLY public values — the ref lock uses the public API URL
const { refFromPublicUrl, assertProjectRef } = require(path.join(ROOT, 'scripts/db/gen-types.cjs'));
const BASE = (process.argv[2] || 'http://localhost:3100').replace(/\/$/, '');
const EXPECT_REDIRECTS = process.argv.includes('--expect-redirects');
const env = readEnv();
const refHash = crypto.createHash('sha256').update(assertProjectRef(refFromPublicUrl(env))).digest('hex');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`); };
const get = async (p) => { for (let i = 1; i <= 3; i++) { try { return await fetch(BASE + p, { redirect: 'manual' }); } catch (e) { if (i === 3) throw e; } } };

(async () => {
  const home = await get('/');
  const html = await home.text();
  check('GET / → 200', home.status === 200, String(home.status));
  for (const bad of ['Supabase', 'Connection State', 'Phase 1B', 'Auth Probe', 'Target Project', 'Production']) check(`GET / has no "${bad}"`, !html.includes(bad));
  const outsideSiteUrl = html.split('https://couragelibrary-next.vercel.app').join('');
  check('GET / mentions couragelibrary-next only as the site URL (no project label)', !outsideSiteUrl.includes('couragelibrary-next'));
  // GATE-HYGIENE-1: scan the HTML AND every same-origin JS chunk it loads; 0 chunks or 0 tokens scanned is a FAIL
  {
    const paths = chunkPaths(html);
    const sources = [{ name: 'GET /', text: html }];
    let chunkFails = 0;
    for (const p of paths) {
      const r = await get(p).catch(() => null);
      if (r && r.status === 200) sources.push({ name: p, text: await r.text() }); else chunkFails++;
    }
    const scan = scanRef(sources, refHash);
    const chunks = sources.length - 1;
    check('GET / HTML + JS chunks: minimum coverage (≥ 1 chunk, ≥ 1 candidate token, every chunk fetched)', chunks >= 1 && scan.tokens >= 1 && chunkFails === 0, `${chunks}/${paths.length} chunk(s) fetched, ${scan.tokens} candidate tokens`);
    check('GET / HTML + JS chunks contain no project ref (sha-compared, never printed)', scan.hits.length === 0, scan.hits.length ? `found in ${scan.hits.length} source(s): ${scan.hits.join(', ')}` : `1 document + ${chunks} chunk(s) scanned`);
  }
  check('GET / has tagline + links', html.includes('Learn Smarter. Prepare Independently.') && html.includes('href="/exams"') && html.includes('href="/auth/login"'));
  // UX-2a: landing page content checks
  {
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
    check('UX-2a GET / contains the brand line', visible.includes('Learn Smarter. Prepare Independently.'));
    const bad = ['undefined', 'NaN', 'null'].filter((t) => new RegExp('\\b' + t + '\\b').test(visible));
    check('UX-2a GET / has no "undefined" / "NaN" / "null" text', bad.length === 0, bad.join(', '));
    let ld = [];
    let ldOk = true;
    try { ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])); } catch { ldOk = false; }
    check('UX-2a GET / JSON-LD parses (EducationalOrganization, support e-mail)', ldOk && ld.some((o) => o['@type'] === 'EducationalOrganization' && o.email === 'support@couragelibrary.in'), `${ld.length} block(s)`);
    check('UX-2a GET / has one h1', (html.match(/<h1[\s>]/g) || []).length === 1);
  }
  const health = await get('/api/health');
  check('GET /api/health → 200', health.status === 200, String(health.status));
  const adm = await get('/admin');
  check('anon /admin → 307 /auth/login', adm.status === 307 && /\/auth\/login/.test(adm.headers.get('location') || ''), `${adm.status} ${(adm.headers.get('location') || '').replace(/^https?:\/\/[^/]+/, '')}`);
  for (const [p, next] of [['/achievements', '/achievements'], ['/certificates', '/certificates'], ['/live-tests/some-event/result', '/live-tests/some-event/result'], ['/performance?exam=ssc-cgl', '/performance?exam=ssc-cgl']]) {
    const r = await get(p);
    const body = r.status === 200 ? await r.text() : '';
    // Next.js server redirect() from a page streams 307 (before the shell) or a meta/RSC redirect inside 200
    const loc = (r.headers.get('location') || '').replace(/^https?:\/\/[^/]+/, '');
    const metaMatch = body.match(/NEXT_REDIRECT;[a-z]+;([^;"]+);/) || body.match(/<meta[^>]+http-equiv="refresh"[^>]+url=([^"]+)"/i);
    const target = decodeURIComponent(loc) || (metaMatch ? decodeURIComponent(metaMatch[1].replace(/&amp;/g, '&')) : '');
    const want = `/auth/login?next=${next}`; // compared decoded (the Location / RSC payload carries the encoded form)
    if (EXPECT_REDIRECTS) check(`anon ${p} → ${want}`, target === want, `${r.status} → ${target || '(none)'}`);
    else check(`anon ${p} (flag off) → not-found, never /login`, !/(^|[^/a-z])\/login/.test(target) && (r.status === 404 || /NEXT_HTTP_ERROR_FALLBACK;404|could not be found/.test(body)), `${r.status} ${target || ''}`);
  }
  // SEC-HOTFIX-6 (INC-3): anon must not be able to execute fn_delete_exam_controlled (zero uuid — never a real exam)
  {
    const sbUrl = env('NEXT_PUBLIC_SUPABASE_URL');
    const anonKey = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    let rr = null;
    for (let i = 1; i <= 3 && !rr; i++) rr = await fetch(`${sbUrl}/rest/v1/rpc/fn_delete_exam_controlled`, { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_exam_id: '00000000-0000-0000-0000-000000000000', p_slug: 'sec-hotfix6-probe' }) }).catch(() => null);
    const rb = rr ? await rr.json().catch(() => ({})) : {};
    check('anon POST /rest/v1/rpc/fn_delete_exam_controlled → permission denied (42501)', rr && (rr.status === 401 || rr.status === 403) && rb.code === '42501', rr ? `${rr.status} ${rb.code || ''}` : 'no response');
    // GAP2-4c (084): the legacy syllabus tables are in schema retired — not exposed by PostgREST
    let rt = null;
    for (let i = 1; i <= 3 && !rt; i++) rt = await fetch(`${sbUrl}/rest/v1/exam_topics?select=*&limit=1`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }).catch(() => null);
    const tb = rt ? await rt.json().catch(() => ({})) : {};
    check('anon GET /rest/v1/exam_topics → 404 (retired, not exposed)', rt && rt.status === 404, rt ? `${rt.status} ${(tb && tb.code) || ''}` : 'no response');
    // DRILL-1 (085): drill RPCs are authenticated-only; no direct table write for anon
    const anonProbe = async (p, body) => {
      let r = null;
      for (let i = 1; i <= 3 && !r; i++) r = await fetch(`${sbUrl}/rest/v1/${p}`, { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      return { ok: r && (r.status === 401 || r.status === 403) && j.code === '42501', info: r ? `${r.status} ${j.code || ''}` : 'no response' };
    };
    const dg = await anonProbe('rpc/fn_generate_mistake_drill', { p_vault_ids: [] });
    check('anon POST /rest/v1/rpc/fn_generate_mistake_drill → permission denied (42501)', dg.ok, dg.info);
    const ds = await anonProbe('rpc/fn_submit_mistake_drill', { p_drill_id: '00000000-0000-0000-0000-000000000000', p_answers: [] });
    check('anon POST /rest/v1/rpc/fn_submit_mistake_drill → permission denied (42501)', ds.ok, ds.info);
    const si = await anonProbe('rpc/fn_syllabus_import_draft', { p_exam_id: '00000000-0000-0000-0000-000000000000', p_payload: { contract_version: 1 } });
    check('anon POST /rest/v1/rpc/fn_syllabus_import_draft → permission denied (42501)', si.ok, si.info);
    const dw = await anonProbe('user_mistake_drills', { user_id: '00000000-0000-0000-0000-000000000000', total_questions: 1, questions_data: [], status: 'IN_PROGRESS' });
    check('anon POST /rest/v1/user_mistake_drills (direct write) → permission denied (42501)', dw.ok, dw.info);
    // CA-5: lesson progress is written only by a signed-in student's RPC (auth.uid())
    const lp = await anonProbe('rpc/fn_lesson_progress_save', { p_document_id: '00000000-0000-0000-0000-000000000000', p_language: 'en', p_status: 'READING' });
    check('anon POST /rest/v1/rpc/fn_lesson_progress_save → permission denied (42501)', lp.ok, lp.info);
    const lw = await anonProbe('user_lesson_progress', { user_id: '00000000-0000-0000-0000-000000000000', document_id: '00000000-0000-0000-0000-000000000000', language: 'en', status: 'COMPLETED' });
    check('anon POST /rest/v1/user_lesson_progress (direct write) → permission denied (42501)', lw.ok, lw.info);
    // SEC-HOTFIX-7: the reward RPC is service-role only (zero uuids — never a real user / source)
    let ra = null;
    const Z = '00000000-0000-0000-0000-000000000000';
    for (let i = 1; i <= 3 && !ra; i++) ra = await fetch(`${sbUrl}/rest/v1/rpc/fn_award_gamification_reward`, { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_user_id: Z, p_event_type: 'SEC_HOTFIX7_PROBE', p_source_type: 'SMOKE', p_source_id: Z, p_idempotency_key: 'sec-hotfix7-probe', p_calculated_coins: 0, p_reason_code: 'SMOKE', p_metadata: {} }) }).catch(() => null);
    const ab = ra ? await ra.json().catch(() => ({})) : {};
    check('anon POST /rest/v1/rpc/fn_award_gamification_reward → permission denied (42501)', ra && (ra.status === 401 || ra.status === 403) && ab.code === '42501', ra ? `${ra.status} ${ab.code || ''}` : 'no response');
  }
  // GAP2-4b + QB-KEY-1 round 2: the SSC CGL hub's syllabus section must match the canonical read model
  const hub = await get('/exams/ssc-cgl');
  const hubHtml = hub.status === 200 ? await hub.text() : '';
  const sy = checkSyllabusSection(hubHtml, await readModelForSlug(env, 'ssc-cgl'));
  check('GET /exams/ssc-cgl → 200, syllabus section matches the read model', hub.status === 200 && sy.ok, `${hub.status} ${sy.detail}`);
  // CA-5 / CA-7: the generated exam course exists only while it is LIVE (launched); before that → 404. The launch state
  // comes from anon PostgREST (anon reads LIVE launch rows only; public values only)
  {
    const sbUrl = env('NEXT_PUBLIC_SUPABASE_URL');
    const anonKey = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    let lr = null;
    for (let i = 1; i <= 3 && !lr; i++) lr = await fetch(`${sbUrl}/rest/v1/exam_course_launches?select=status,exams!inner(slug)&exams.slug=eq.ssc-cgl&status=eq.LIVE`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }).catch(() => null);
    const rows = lr && lr.ok ? await lr.json().catch(() => null) : null;
    check('anon GET /rest/v1/exam_course_launches (LIVE rows) → 200', Array.isArray(rows), lr ? String(lr.status) : 'no response');
    const live = Array.isArray(rows) && rows.length > 0;
    const course = await get('/exams/ssc-cgl/course');
    const courseHtml = course.status === 200 ? await course.text() : '';
    check(live ? 'GET /exams/ssc-cgl/course (LIVE) → 200, the course heading' : 'GET /exams/ssc-cgl/course (not launched) → 404',
      live ? course.status === 200 && /course<\/h1>/.test(courseHtml) : course.status === 404, `${course.status}`);
  }
  // CA-6: the first published master lesson and exam-topic page in the sitemap render for anon (VACUOUS while none)
  const sm = await get('/sitemap.xml');
  const locs = sm.status === 200 ? [...(await sm.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname) : [];
  const learn = locs.find((p) => /^\/learn\/[a-z0-9-]+\/[a-z0-9-]+/.test(p));
  const examTopic = locs.find((p) => /^\/exams\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+/.test(p) && !/\/cycle\//.test(p));
  for (const [label, p] of [['master lesson', learn], ['exam-topic page', examTopic]]) {
    if (!p) { console.log(`  WARN  VACUOUS: no published ${label} in the sitemap yet`); continue; }
    const r = await get(p);
    const h = r.status === 200 ? await r.text() : '';
    check(`GET ${p} (${label}) → 200, self-canonical, JSON-LD`, r.status === 200 && h.includes(`${p}"`) && /application\/ld\+json/.test(h), `${r.status}`);
  }
  console.log(fails ? `\nSMOKE: ${fails} failed` : '\nSMOKE: all passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('SMOKE ERROR', String(e.message).slice(0, 160)); process.exit(1); });
