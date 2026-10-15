/**
 * TYPES-1 batch B4 — covering test (content studio, authoring queue, curriculum blueprint/coverage, content
 * artifacts, learning assets, reference catalog, AI generation context).
 *
 *   B4-1 no `supabaseClient: any` / `supabase: any` client parameters remain in B4 files (AppSupabaseClient)
 *   B4-2 Class B fixes: document versions embed hinted (PGRST201); content-studio question search selects only
 *        live columns; AI context builder filters questions by questions.canonical_topic_id and reads PYQ data from
 *        question_sources (pyq_year / pyq_exam never existed on question_versions)
 *   B4-3 row → domain narrowing is centralised (toArtifact / toAsset / toBinding), not per-call casts
 *   B4-4 tracked GAP2-4 drift registered (B-CURRICULUM-MAPPING), including the synthesised-coverage warning
 *   B4-5 (live, read-only, ref-locked) every literal select in B4 files executes, except the registered tracked
 *        legacy exam-mapping / learning-unit reads
 *
 * Run: node scripts/test_types1_b4.cjs [--offline]
 */
const fs = require('fs');
const path = require('path');
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
const B4_FILES = ['services/admin-content-studio.service.ts', 'services/ai/ai-generation-orchestrator.service.ts', 'services/ai/curriculum-context-builder.service.ts', 'services/authoring-queue.service.ts', 'services/canonical-curriculum-blueprint.service.ts', 'services/content-artifact.service.ts', 'services/curriculum-coverage.service.ts', 'services/learning/reference-catalog.ts', 'services/learning-asset.service.ts'];

(async () => {
  console.log('TYPES-1 B4 covering test');

  await test('B4-1 client parameters typed (no `any` Supabase clients in B4 files)', async () => {
    for (const f of B4_FILES) {
      const hits = read(f).split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*)/.test(l) && /\b(supabaseClient|supabase|client)\??\s*:\s*any\b/.test(l));
      assert(hits.length === 0, `${f}: ${hits.join(' | ')}`);
    }
  });

  await test('B4-2 Class B fixes present', async () => {
    const cs = read('services/admin-content-studio.service.ts');
    assert(cs.includes("document_versions!document_versions_document_id_fkey(*)"), 'document versions embed not hinted');
    assert(!/question_type, explanation/.test(cs) && cs.includes(".select('id, question_id, version_number, question_text, questions(id, status)')"), 'question search still selects non-existent columns');
    const ai = read('services/ai/curriculum-context-builder.service.ts');
    assert(!/pyq_year, pyq_exam'\)/.test(ai) && (ai.match(/questions!inner\(canonical_topic_id, question_sources\(exam_name, year\)\)/g) || []).length === 2, 'AI question references not re-pointed');
    assert(ai.includes(".eq('questions.canonical_topic_id', topic.id)"), 'topic filter must go through questions');
  });

  await test('B4-3 row → domain narrowing centralised', async () => {
    const art = read('services/content-artifact.service.ts');
    const asset = read('services/learning-asset.service.ts');
    assert(/const toArtifact = \(row: Tables<'learning_content_artifacts'>\): LearningContentArtifact =>/.test(art), 'toArtifact helper');
    assert(/const toAsset = \(row: Tables<'learning_assets'>\): LearningAsset =>/.test(asset) && /const toBinding = /.test(asset), 'asset helpers');
    assert(!/\bas LearningContentArtifact\b/.test(art.replace(/const toArtifact[^\n]*\n/, '')), 'per-call artifact casts remain');
  });

  await test('B4-4 tracked GAP2-4 drift registered (incl. synthesised coverage warning)', async () => {
    const e = JSON.parse(read('docs/reports/types/TYPES1_ESCAPES.json')).escapes.find((x) => x.id === 'TYPES-1:B-CURRICULUM-MAPPING');
    assert(e && e.class === 'B' && e.owner === 'GAP2-4', 'B-CURRICULUM-MAPPING not registered for GAP2-4');
    assert(/SYNTHESISES coverage/.test(e.precondition), 'fabricated-coverage warning missing from the register');
    assert(read('services/curriculum-coverage.service.ts').includes('SYNTHESISE coverage'), 'code comment must flag the synthesised fallback');
  });

  if (OFFLINE) {
    console.log('  SKIP  live select audit (--offline)');
  } else {
    await test('B4-5 live select audit: clean except tracked legacy mapping reads', async () => {
      const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/types1-select-audit.cjs'), ...B4_FILES], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
      const fails = (r.stdout || '').split('\n').filter((l) => l.startsWith('FAIL'));
      const TRACKED = [/\s+exam_unit_mappings\s+PGRST200/, /curriculum-coverage\.service\.ts:\d+\s+learning_units\s+42703/];
      const untracked = fails.filter((l) => !TRACKED.some((re) => re.test(l)));
      assert(untracked.length === 0, untracked.join('\n        '));
      return ((r.stdout || '').trim().split('\n').pop() || '') + ` (${fails.length} tracked legacy)`;
    });
  }

  console.log(`\nTYPES-1 B4: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
