#!/usr/bin/env node
/**
 * SYLLABUS-PUBLISH-IMPACT — READ ONLY against the live data: the real computePublishImpact (lib/syllabus/publish-impact.ts)
 * with a service-role read client, for every DRAFT syllabus version (today: SSC CGL v4). Nothing is written.
 *   I-1 the version students see now = the read model's pick (fn_exam_syllabus_read_model, anonymous) for that exam
 *   I-2 a PUBLISHED version of the same exam + cycle with ANOTHER tier is listed in otherPublished (publish does not
 *       archive it); when it is tier NULL ("all tiers") it is marked shownToStudents (the read model keeps picking it)
 *   I-3 topic arithmetic: removed ∩ added = ∅; topics = |new version's distinct rolled-up topics| (= validate counts.topics)
 *   I-4 removed topics carry their real counts (published lessons / questions / progress, checked with SQL)
 *   I-5 needsTypedConfirm ⇔ some removed topic has lessons, questions or progress
 * Run: node scripts/live/test_publish_impact.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { createClient } = require(path.join(ROOT, 'node_modules/@supabase/supabase-js'));
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { safeBegin } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));
const { projectConfig } = require(path.join(ROOT, 'scripts/live/qa-session.cjs'));

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
const origLoad = Module._load;
// the module's server-only guard and its default (cookie-bound) client are not used here: the gate passes its own client
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {};
  if (request === '@/lib/supabase/server') return { createAdminServerSupabaseClient: () => { throw new Error('not used in the gate'); } };
  return origLoad.call(this, request, parent, isMain);
};
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};
const { computePublishImpact } = require(path.join(ROOT, 'lib/syllabus/publish-impact.ts'));
const { needsTypedConfirm } = require(path.join(ROOT, 'lib/syllabus/editor-assist.ts'));

let ok = true;
const chk = (n, cond, info) => { if (!cond) ok = false; console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + (info ?? '')}`); };

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  const cfg = projectConfig();
  const db = createClient(cfg.url, cfg.service, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const anon = createClient(cfg.url, cfg.anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const c = new Client(target.pg); c.on('error', () => {}); await c.connect();
  try {
    await safeBegin(c, { readOnly: true });
    const q = async (s, p) => (await c.query(s, p)).rows;
    const drafts = await q(`select v.id, v.exam_id, v.exam_cycle_id, v.tier, v.version_number, e.slug from public.exam_syllabus_versions v join public.exams e on e.id = v.exam_id
        where v.status = 'DRAFT' and e.slug <> 'qa-syllabus-test' order by e.slug, v.version_number`);
    if (!drafts.length) console.log('SKIP no real DRAFT version to measure');
    for (const d of drafts) {
      const tag = `${d.slug} v${d.version_number}`;
      const impact = await computePublishImpact(d.id, db);
      if (!impact) { chk(`${tag}: impact computed`, false, 'null'); continue; }
      const rm = await anon.rpc('fn_exam_syllabus_read_model', { p_exam_id: d.exam_id, p_exam_cycle_id: d.exam_cycle_id });
      const shown = rm.data && rm.data.version ? rm.data.version.id : null;
      chk(`I-1 ${tag}: "students now see" = the read model's version`, (impact.current ? impact.current.id : null) === shown, JSON.stringify({ impact: impact.current, shown }));
      const others = await q(`select id, tier from public.exam_syllabus_versions where exam_id = $1 and exam_cycle_id is not distinct from $2 and status = 'PUBLISHED' and is_active and tier is distinct from $3`, [d.exam_id, d.exam_cycle_id, d.tier]);
      chk(`I-2 ${tag}: other-tier published versions listed (${others.length}); an all-tiers one stays what students see`,
        others.length === impact.otherPublished.length && others.every((o) => impact.otherPublished.some((x) => x.id === o.id && (o.tier !== null || d.tier === null || x.shownToStudents))),
        JSON.stringify({ others, listed: impact.otherPublished }));
      const [val] = await q(`select (public.fn_syllabus__validate($1)->'counts'->>'topics')::int n`, [d.id]);
      chk(`I-3 ${tag}: ${impact.topics} topics (= validate), +${impact.topicsAdded.length} −${impact.topicsRemoved.length}, no topic both added and removed`,
        impact.topics === val.n && !impact.topicsAdded.some((a) => impact.topicsRemoved.some((r) => r.id === a.id)), JSON.stringify({ topics: impact.topics, validate: val.n }));
      let bad = [];
      for (const t of impact.topicsRemoved) {
        const [r] = await q(`with recursive sub as (select id from public.canonical_taxonomy_nodes where id = $1 union all select n.id from public.canonical_taxonomy_nodes n join sub on n.parent_id = sub.id)
            select (select count(*)::int from public.learning_documents d where d.node_id in (select id from sub) and d.status = 'PUBLISHED') l,
                   (select count(*)::int from public.questions x where x.canonical_topic_id = $1 and x.status = 'published') qn,
                   (select count(*)::int from public.user_lesson_progress p where p.node_id in (select id from sub)) pr`, [t.id]);
        if (r.l !== t.publishedLessons || r.qn !== t.publishedQuestions || r.pr !== t.progressRows) bad.push(`${t.name}: ${JSON.stringify(r)} vs ${JSON.stringify(t)}`);
      }
      chk(`I-4 ${tag}: removed topics' lessons / questions / progress match SQL (${impact.topicsRemoved.map((t) => t.name).join(', ') || 'none removed'})`, bad.length === 0, bad.join(' | '));
      const expect = impact.topicsRemoved.some((t) => t.publishedLessons || t.publishedQuestions || t.progressRows);
      chk(`I-5 ${tag}: typed confirmation required = ${expect}`, needsTypedConfirm(impact) === expect, '');
      console.log(`  ${tag}: now v${impact.current ? impact.current.versionNumber : '-'}; other tiers ${impact.otherPublished.map((o) => `v${o.versionNumber}(${o.tier ?? 'all'}${o.shownToStudents ? ', shown' : ''})`).join(' ') || 'none'}; units +${impact.unitsAdded} −${impact.unitsRemoved}; with lessons ${impact.withLessons}, with questions ${impact.withQuestions}`);
    }
  } catch (e) {
    ok = false;
    console.log(`FAIL suite error — ${red(String(e && e.message ? e.message : e)).slice(0, 400)}`);
  } finally {
    await c.query('rollback').catch(() => {});
    await c.end().catch(() => {});
  }
  console.log(ok ? 'PUBLISH-IMPACT live: all checks passed' : 'PUBLISH-IMPACT live: FAILED');
  process.exit(ok ? 0 : 1);
})();
