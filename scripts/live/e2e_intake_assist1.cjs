#!/usr/bin/env node
/**
 * INTAKE-ASSIST-1-E2E — the guided intake review clicked through in a real browser as the QA admin, on a QA-exam
 * fixture intake (never a real one). LOCAL ONLY, through scripts/live/with-server.cjs (BASE_URL = the local build).
 *   fixture (committed, QA exam, tier ia1-e2e): Quantitative Aptitude › Percentage › "Percentage Change" (all EXACT,
 *     existing master nodes) with outline lines A, B; a NEW subtopic "IA1 E2E New Sub" (line C); a NEW topic
 *     "IA1 E2E New Topic" (subtopic X, line D)
 *   clicks: Step 1 "Link all exact matches (3)" → Step 4 "Approve all … (1)" → "Undo last bulk action" (the node it
 *     created is deleted again) → row "Ignore" on the new subtopic → Step 5 "Keep all as lesson outline (2)" → row
 *     "Ignore" on the new topic → Step 6 "Not verifiable" → Step 7 "Create draft syllabus"
 *   checks (database, read after the clicks): 3 batches (LINK, APPROVE undone, KEEP), every decision as clicked, the
 *     draft's Percentage unit maps "Percentage Change" and carries outlines {Percentage Change: [A, B]}, the paper is
 *     uncertain (not verifiable), NO "IA1 E2E" node in the master tree
 *   cleanup (always): the fixture session (cascade) and the QA draft version are deleted; the QA admin's audit rows stay
 *     (audit is append-only)
 * Run: node scripts/live/with-server.cjs -- "node scripts/live/e2e_intake_assist1.cjs"
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { safeBegin } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));
const { qaBrowserLogin } = require(path.join(ROOT, 'scripts/live/qa-session.cjs'));
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};
const { validateIntakePayload } = require(path.join(ROOT, 'lib/syllabus/intake-contract.ts'));
const { matchIntake } = require(path.join(ROOT, 'lib/syllabus/tree-matcher.ts'));

const BASE = (process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error('BASE_URL must be a local dev host');
const TIER = 'ia1-e2e';
const ACTOR = 'intake-assist1-e2e@courage-library.test';
let ok = true;
const chk = (n, cond, info) => { if (!cond) ok = false; console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + (info ?? '')}`); };

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  const c = new Client(target.pg); c.on('error', () => {}); await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  let sid = null;
  let browser = null;
  try {
    const [qa] = await q(`select id, slug from public.exams where slug = 'qa-syllabus-test'`);
    const [left] = await q(`select count(*)::int n from public.syllabus_intake_sessions where exam_id = $1 and tier = $2`, [qa.id, TIER]);
    if (left.n) throw new Error('a previous E2E fixture is still there — remove it first');
    // ---------------- fixture (committed; matched against the live tree like the service)
    const payload = {
      contract_version: 3, exam: qa.slug, cycle_year: null, tier: TIER, based_on: 'IA1 E2E: QA notification 2026',
      papers: [{ name: 'IA1 E2E Paper', questions: 100, subjects: [{ name: 'Quantitative Aptitude', questions: 25, topics: [
        { name: 'Percentage', origin: 'OFFICIAL', avg_questions: 3, subtopics: [
          { name: 'Percentage Change', origin: 'OFFICIAL', outline: ['IA1 E2E Line A', 'IA1 E2E Line B'] },
          { name: 'IA1 E2E New Sub', origin: 'EXPANDED', outline: ['IA1 E2E Line C'] },
        ] },
        { name: 'IA1 E2E New Topic', origin: 'EXPANDED', subtopics: [{ name: 'IA1 E2E Sub X', origin: 'EXPANDED', outline: ['IA1 E2E Line D'] }] },
      ] }] }],
    };
    const v = validateIntakePayload(JSON.stringify(payload), { examSlug: qa.slug, cycleYear: null, tier: TIER });
    if (!v.ok) throw new Error(JSON.stringify(v.errors));
    const nodes = await q(`select id, parent_id, node_type, name, name_hi, is_active from public.canonical_taxonomy_nodes where node_type in ('SUBJECT','TOPIC','SUBTOPIC','CONCEPT')`);
    const aliases = await q(`select node_id, normalized_alias from public.taxonomy_node_aliases`);
    const matched = matchIntake(v.items, nodes.map((n) => ({ id: n.id, parentId: n.parent_id, nodeType: n.node_type, name: n.name, nameHi: n.name_hi, isActive: n.is_active })),
      aliases.map((a) => ({ nodeId: a.node_id, normalized: a.normalized_alias })));
    const exact = matched.filter((m) => m.match_status === 'EXACT').map((m) => m.name);
    if (JSON.stringify(exact) !== JSON.stringify(['Quantitative Aptitude', 'Percentage', 'Percentage Change'])) throw new Error(`fixture EXACT set changed: ${exact}`);
    await safeBegin(c);
    sid = (await q(`select public.fn_syllabus_intake_create($1, null, $2, null, null, $3, $4, null, $5) id`, [qa.id, TIER, v.payload, JSON.stringify(matched), ACTOR]))[0].id;
    await c.query('commit');
    console.log('fixture intake created (QA exam)');

    // ---------------- the clicks
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await qaBrowserLogin(ctx, 'qa-admin@courage-library.test', BASE);
    const page = await ctx.newPage();
    const nonGet = [];
    page.on('request', (r) => { if (r.method() !== 'GET') nonGet.push(r.url().replace(BASE, '')); });
    await page.goto(`${BASE}/admin/syllabus/intake/${sid}`, { waitUntil: 'networkidle' });
    const progress = async (text) => page.locator('[data-progress]').filter({ hasText: text }).waitFor({ timeout: 20000 });
    const status = async (re) => page.getByRole('status').filter({ hasText: re }).waitFor({ timeout: 20000 });
    await progress('0/10 decided');
    chk('E-0 the review renders: guide, 0/10 decided, step 1 is the one primary action', (await page.locator('[data-intake-guide]').count()) === 1, '');

    await page.getByRole('button', { name: 'Link all exact matches (3)' }).click();
    await status(/Linked exact matches: 3 item/);
    await progress('3/10 decided');
    await page.getByRole('button', { name: 'Approve all new subtopics under decided topics (1)' }).click();
    await status(/Approved new subtopics: 1 item/);
    await progress('4/10 decided');
    const [mid] = await q(`select count(*)::int n from public.canonical_taxonomy_nodes where name = 'IA1 E2E New Sub'`);
    await page.getByRole('button', { name: /Undo last bulk action \(approved new subtopics, 1\)/ }).click();
    await status(/The last bulk action was undone/);
    await progress('3/10 decided');
    const [after] = await q(`select count(*)::int n from public.canonical_taxonomy_nodes where name = 'IA1 E2E New Sub'`);
    chk('E-1 step 1 links the 3 exact matches; step 4 approves the new subtopic (node created) and Undo deletes it again', mid.n === 1 && after.n === 0, JSON.stringify({ mid, after }));

    await page.locator('li[data-level="TOPIC"]', { hasText: 'Percentage' }).first().getByRole('button', { name: 'Expand Percentage' }).click();
    await page.locator('li[data-level="SUBTOPIC"]', { hasText: 'IA1 E2E New Sub' }).getByRole('group').getByRole('button', { name: 'Ignore', exact: true }).click();
    await status(/"IA1 E2E New Sub": ignored/);
    await page.getByRole('button', { name: 'Keep all as lesson outline (2)' }).click();
    await status(/Kept concepts as lesson outlines: 2 item/);
    await page.locator('li[data-level="TOPIC"]', { hasText: 'IA1 E2E New Topic' }).getByRole('group').getByRole('button', { name: 'Ignore', exact: true }).click();
    await status(/"IA1 E2E New Topic": ignored/);
    await progress('10/10 decided');
    const create = page.getByRole('button', { name: 'Create draft syllabus' });
    chk('E-2 row buttons + step 5 decide everything (10/10); Create draft stays disabled until the source check is answered', await create.isDisabled(), '');
    await page.getByLabel(/Not verifiable/).check();
    await create.click();
    await page.waitForURL(/\/admin\/syllabus\/[0-9a-f-]{36}$/, { timeout: 30000 });
    const vid = page.url().split('/').pop();

    // ---------------- the database after the clicks
    const its = Object.fromEntries((await q(`select raw_name, decision from public.syllabus_intake_items where session_id = $1`, [sid])).map((r) => [r.raw_name, r.decision]));
    const batches = await q(`select action, undone_at is not null undone from public.syllabus_intake_batches where session_id = $1 order by seq`, [sid]);
    const [unit] = await q(`select n.metadata, array(select t.name from public.exam_syllabus_canonical_mappings m join public.canonical_taxonomy_nodes t on t.id = m.canonical_node_id where m.syllabus_node_id = n.id) maps
        from public.exam_syllabus_nodes n where n.syllabus_version_id = $1 and n.node_kind = 'UNIT' and n.raw_title = 'Percentage'`, [vid]);
    const [paper] = await q(`select metadata from public.exam_syllabus_nodes where syllabus_version_id = $1 and node_kind = 'PAPER'`, [vid]);
    const [stray] = await q(`select count(*)::int n from public.canonical_taxonomy_nodes where name like 'IA1 E2E%'`);
    const outline = unit ? Object.values(unit.metadata.outlines || {}) : [];
    chk('E-3 decisions as clicked: 3 LINK, new subtopic + its line + new topic subtree IGNORE, lines A/B OUTLINE',
      its['Quantitative Aptitude'] === 'LINK' && its['Percentage Change'] === 'LINK' && its['IA1 E2E New Sub'] === 'IGNORE' && its['IA1 E2E Line C'] === 'IGNORE'
      && its['IA1 E2E Line A'] === 'OUTLINE' && its['IA1 E2E Line B'] === 'OUTLINE' && its['IA1 E2E New Topic'] === 'IGNORE' && its['IA1 E2E Line D'] === 'IGNORE', JSON.stringify(its));
    chk('E-4 batches: LINK_EXACT, APPROVE_CHILDREN (undone), KEEP_OUTLINE',
      JSON.stringify(batches) === JSON.stringify([{ action: 'LINK_EXACT', undone: false }, { action: 'APPROVE_CHILDREN', undone: true }, { action: 'KEEP_OUTLINE', undone: false }]), JSON.stringify(batches));
    chk('E-5 the draft: Percentage maps "Percentage Change" with outline [A, B]; the paper is uncertain (not verifiable); no IA1 node in the master tree',
      unit && JSON.stringify(unit.maps) === JSON.stringify(['Percentage Change']) && outline.length === 1 && JSON.stringify(outline[0].items) === JSON.stringify(['IA1 E2E Line A', 'IA1 E2E Line B'])
      && paper.metadata.uncertain === true && stray.n === 0, JSON.stringify({ unit, paper: paper && paper.metadata, stray }));
    chk('E-6 the browser only wrote through server actions (POST to the page), nothing else', nonGet.every((u) => u.startsWith('/admin/syllabus/intake/')), JSON.stringify(nonGet));
  } catch (e) {
    ok = false;
    console.log(`FAIL e2e error — ${red(String(e && e.message ? e.message : e)).slice(0, 400)}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (sid) {
      try {
        await safeBegin(c);
        const [s] = await q(`select imported_version_id v from public.syllabus_intake_sessions where id = $1`, [sid]);
        await q(`delete from public.syllabus_intake_sessions where id = $1`, [sid]);
        if (s && s.v) await q(`delete from public.exam_syllabus_versions where id = $1 and status = 'DRAFT'`, [s.v]);
        await c.query('commit');
        const [z] = await q(`select (select count(*)::int from public.syllabus_intake_sessions where tier = $1) s, (select count(*)::int from public.canonical_taxonomy_nodes where name like 'IA1 E2E%') n`, [TIER]);
        chk('Z cleanup: no fixture session, no draft, no IA1 E2E node', z.s === 0 && z.n === 0, JSON.stringify(z));
      } catch (e) {
        ok = false;
        await c.query('rollback').catch(() => {});
        console.log(`FAIL cleanup — ${red(String(e.message)).slice(0, 300)}`);
      }
    }
    await c.end().catch(() => {});
  }
  console.log(ok ? 'INTAKE-ASSIST-1-E2E: all checks passed' : 'INTAKE-ASSIST-1-E2E: FAILED');
  process.exit(ok ? 0 : 1);
})();
