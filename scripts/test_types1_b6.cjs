/**
 * TYPES-1 batch B6 — covering test (admin core, layout header, storage, taxonomy service, ssr client typing,
 * /api/health version).
 *
 *   B6-1 all three @supabase/ssr factories (server, browser, middleware) go through fromSsrClient → AppSupabaseClient;
 *        no `supabase: any` client parameters remain in B6 files
 *   B6-2 deployedVersion(): short hex SHA only ("dev" locally, "unknown" for non-hex); /api/health exposes `version`
 *        and reads no other environment variable
 *   B6-3 Class B fixes in code: question delete guard uses attempt_answers (test_responses never existed); taxonomy
 *        embeds via canonical nodes (GAP2-3 rules); admin stats count real tables; admin billing returns
 *        { plans, orders } from plan_code / base_price_inr / payment_orders; flags + descriptive lists read the real
 *        tables; no institutes.city; plan insert uses plan_code / base_price_inr; bulk importer guards cycle/template
 *   B6-4 tracked admin-module drift is registered (B-ADM-DESCRIPTIVE / -COMMUNITY / -INSTITUTES, owner Community)
 *   B6-5 (live, read-only, ref-locked) every literal select in B6 files executes against couragelibrary-next
 *
 * Run: node scripts/test_types1_b6.cjs [--offline]
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OFFLINE = process.argv.includes('--offline');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1500)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const load = (f) => {
  const js = ts.transpileModule(read(f), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', 'process', js)(m, m.exports, require, process);
  return m.exports;
};
const B6_FILES = ['app/admin/actions.ts', 'components/admin/exam-onboarding/exam-management-view.tsx', 'components/layout/header.tsx', 'lib/admin/bulk-importer.ts', 'services/admin-premium.service.ts', 'services/admin.service.ts', 'services/storage/storage-factory.ts', 'services/storage/supabase-storage.provider.ts', 'services/taxonomy/taxonomy.service.ts'];

(async () => {
  console.log('TYPES-1 B6 covering test');

  await test('B6-1 ssr factories typed via fromSsrClient; no `any` client parameters in B6 files', async () => {
    assert(/export function fromSsrClient\(client: unknown\): AppSupabaseClient/.test(read('lib/supabase/types.ts')), 'adapter missing');
    assert(/return fromSsrClient\(ssrClient\);/.test(read('lib/supabase/server.ts')), 'server factory');
    const client = read('lib/supabase/client.ts');
    assert(/export function createClient\(\): AppSupabaseClient/.test(client) && /browserClient = fromSsrClient\(/.test(client), 'browser factory');
    assert(/const supabase = fromSsrClient\(createServerClient<Database>\(/.test(read('lib/supabase/middleware.ts')), 'middleware client');
    for (const f of B6_FILES) {
      const hits = read(f).split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*)/.test(l) && /\b(supabase|supabaseClient)\??\s*:\s*any\b/.test(l));
      assert(hits.length === 0, `${f}: ${hits.join(' | ')}`);
    }
  });

  await test('B6-2 /api/health `version` = deployed short SHA only', async () => {
    const { deployedVersion } = load('lib/deploy/version.ts');
    assert(deployedVersion('0123456789abcdef0123456789abcdef01234567') === '0123456', 'full sha → 7 chars');
    assert(deployedVersion('ABCDEF0') === 'abcdef0', 'lowercased');
    assert(deployedVersion('') === 'dev' && deployedVersion(undefined) === 'dev' || process.env.VERCEL_GIT_COMMIT_SHA, 'local → dev');
    for (const bad of ['main', 'v1.2.3', '../etc', 'abc', 'zzzzzzz', '<script>']) assert(deployedVersion(bad) === 'unknown', `non-sha ${bad} must be "unknown"`);
    const route = read('app/api/health/route.ts');
    assert(/version: deployedVersion\(\)/.test(route), 'route must expose version');
    assert(!/process\.env/.test(route), 'route must not read environment variables directly');
    assert((read('lib/deploy/version.ts').match(/process\.env\.[A-Z_]+/g) || []).every((v) => v === 'process.env.VERCEL_GIT_COMMIT_SHA'), 'version helper reads only VERCEL_GIT_COMMIT_SHA');
  });

  await test('B6-3 Class B fixes present', async () => {
    const act = read('app/admin/actions.ts');
    const svc = read('services/admin.service.ts');
    assert(!/from\("test_responses"\)/.test(act) && /from\("attempt_answers"\)\.select\("id"\)\.in\("mock_question_id", mockQuestionIds\)/.test(act), 'delete guard must check attempt_answers');
    assert(svc.includes('subjects:canonical_taxonomy_nodes!pattern_sections_subject_id_node_fkey') && svc.includes('topics:canonical_taxonomy_nodes!root_subject_id') && svc.includes('topics:canonical_taxonomy_nodes!questions_canonical_topic_id_node_fkey'), 'taxonomy embeds must use canonical nodes');
    assert(!/\n\s+topics \(\n/.test(svc) && !/\n\s+subjects \(\n/.test(svc), 'a legacy topics/subjects embed remains');
    assert(svc.includes('sb.from("descriptive_questions").select("*", { count: "exact", head: true })') && svc.includes('sb.from("discussion_moderation_flags").select("*", { count: "exact", head: true })'), 'admin stats must count real tables');
    assert(/return \{ plans, orders \};/.test(svc) && svc.includes('plan_code, base_price_inr') && svc.includes('from("payment_orders")'), 'admin billing shape / columns');
    assert(svc.includes('.from("discussion_moderation_flags")\n') || /\.from\("discussion_moderation_flags"\)\s*\n\s*\.select\("id, reason, status, created_at, target_type, target_id, reported_by_user_id"\)/.test(svc), 'flags list must read discussion_moderation_flags');
    assert(/\.from\("descriptive_questions"\)\s*\n\s*\.select\("id, title, question_text, word_limit_max, is_published, created_at"\)/.test(svc), 'descriptive list must read descriptive_questions');
    assert(!/\bcity\b[^\n]*select|select\([^)]*\bcity\b/.test(svc), 'institutes.city still selected');
    assert(/plan_code: code,/.test(act) && /base_price_inr: priceInr,/.test(act), 'plan insert columns');
    const bi = read('lib/admin/bulk-importer.ts');
    assert(/exam_cycle_id: cycleRow\.id,/.test(bi) && /else if \(!templateId\)/.test(bi), 'bulk importer guards');
  });

  await test('B6-4 tracked admin-module drift registered (owner Community)', async () => {
    const reg = JSON.parse(read('docs/reports/types/TYPES1_ESCAPES.json')).escapes;
    for (const id of ['TYPES-1:B-ADM-DESCRIPTIVE', 'TYPES-1:B-ADM-COMMUNITY', 'TYPES-1:B-ADM-INSTITUTES']) {
      const e = reg.find((x) => x.id === id);
      assert(e && e.class === 'B' && /Community/.test(e.owner), `${id} not registered with owner Community`);
    }
  });

  if (OFFLINE) {
    console.log('  SKIP  live select audit (--offline)');
  } else {
    await test('B6-5 live select audit: B6 files clean', async () => {
      const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/types1-select-audit.cjs'), ...B6_FILES], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
      const fails = (r.stdout || '').split('\n').filter((l) => l.startsWith('FAIL'));
      assert(fails.length === 0, fails.join('\n        '));
      return (r.stdout || '').trim().split('\n').pop();
    });
  }

  console.log(`\nTYPES-1 B6: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
