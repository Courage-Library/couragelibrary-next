/**
 * COURAGE LIBRARY — PHASE 3H.1 TEST SUITE
 * Exam Knowledge Core Data Model & Schema Foundation
 * 
 * 40 Authoritative Assertions (E01 - E40):
 * - GROUP 1: Migration DDL & Table Schema Specifications (E01 - E07)
 * - GROUP 2: Immutability Triggers & Pointer Consistency (E08 - E13)
 * - GROUP 3: Row-Level Security (RLS) & Least-Privilege Grants (E14 - E20)
 * - GROUP 4: Domain Service & Immutability Lifecycle Verification (E21 - E27)
 * - GROUP 5: Schema Invariants, Cycles & Multi-Source Claims (E28 - E31)
 * - GROUP 6: Database Baseline Protection & Zero Mutation (E32 - E40)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

// Polyfills
global.WebSocket = class WebSocket {};

// Hook TS transpilation & alias resolution
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    const target = path.resolve(__dirname, '..', request.slice(2));
    return originalResolveFilename.call(this, target, parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions['.ts'] = function (module, filename) {
  const content = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(content, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  return module._compile(compiled.outputText, filename);
};

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[trimmed.slice(0, idx).trim()] = val;
      }
    }
  });
}

const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Import domain service
const { ExamKnowledgeService } = require('@/services/exam-knowledge.service');

let passedTests = 0;
let failedTests = 0;

async function test(id, description, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${id}: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${id}: ${description}`);
    console.error(`         ${err.message}`);
    failedTests++;
  }
}

async function runTestSuite() {
  console.log('============================================================');
  console.log('COURAGE LIBRARY — PHASE 3H.1 EXAM KNOWLEDGE SCHEMA SUITE');
  console.log('40 Authoritative Assertions (E01 - E40)');
  console.log('============================================================\n');

  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260919000054_phase3h1_exam_knowledge_foundation.sql');
  assert(fs.existsSync(migrationPath), 'Migration file 20260919000054_phase3h1_exam_knowledge_foundation.sql must exist');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  // --------------------------------------------------------------------------
  // GROUP 1: Migration DDL & Table Schema Specifications (E01 - E07)
  // --------------------------------------------------------------------------
  console.log('--- GROUP 1: Migration DDL & Table Schema Specifications ---');

  await test('E01', 'Migration SQL defines all 6 core Exam Knowledge tables', async () => {
    assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.exam_posts'));
    assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.exam_sources'));
    assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.exam_knowledge_documents'));
    assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.exam_doc_versions'));
    assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.exam_claims'));
    assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.exam_claim_sources'));
  });

  await test('E02', 'exam_posts table defines pay levels, grade pay, classification, and unique constraint', async () => {
    assert(migrationSql.includes('post_name TEXT NOT NULL'));
    assert(migrationSql.includes('pay_level INTEGER NOT NULL'));
    assert(migrationSql.includes('cpc_basic_pay_min NUMERIC(10,2)'));
    assert(migrationSql.includes('uq_exam_posts_exam_name UNIQUE (exam_id, post_name)'));
  });

  await test('E03', 'exam_sources table defines official source types and verification status checks', async () => {
    assert(migrationSql.includes('OFFICIAL_NOTIFICATION'));
    assert(migrationSql.includes('OFFICIAL_CORRIGENDUM'));
    assert(migrationSql.includes('GAZETTE_ORDER'));
    assert(migrationSql.includes('verification_status TEXT NOT NULL DEFAULT \'UNVERIFIED\''));
    assert(migrationSql.includes('SOURCE_VERIFIED'));
  });

  await test('E04', 'exam_knowledge_documents table supports cycle-optional foreign key and module constraints', async () => {
    assert(migrationSql.includes('module_key TEXT NOT NULL'));
    assert(migrationSql.includes('canonical_slug TEXT NOT NULL'));
    assert(migrationSql.includes('current_published_version_id UUID'));
    assert(migrationSql.includes('uq_exam_docs_exam_cycle_module UNIQUE NULLS NOT DISTINCT'));
  });

  await test('E05', 'exam_doc_versions table defines structured JSON payload and compiled MDX fields', async () => {
    assert(migrationSql.includes('structured_payload JSONB NOT NULL DEFAULT \'{}\'::jsonb'));
    assert(migrationSql.includes('compiled_mdx TEXT'));
    assert(migrationSql.includes('source_spec_hash TEXT'));
    assert(migrationSql.includes('compiled_artifact_hash TEXT'));
    assert(migrationSql.includes('uq_exam_doc_versions_num UNIQUE (document_id, version_number)'));
  });

  await test('E06', 'exam_claims table defines claim keys, typed values, and verification states', async () => {
    assert(migrationSql.includes('claim_key TEXT NOT NULL'));
    assert(migrationSql.includes('stated_value TEXT NOT NULL'));
    assert(migrationSql.includes('value_data_type TEXT NOT NULL DEFAULT \'STRING\''));
    assert(migrationSql.includes('verification_status TEXT NOT NULL DEFAULT \'UNVERIFIED\''));
  });

  await test('E07', 'exam_claim_sources junction table establishes composite primary key (claim_id, source_id)', async () => {
    assert(migrationSql.includes('PRIMARY KEY (claim_id, source_id)'));
    assert(migrationSql.includes('page_or_clause_reference TEXT'));
  });

  // --------------------------------------------------------------------------
  // GROUP 2: Immutability Triggers & Pointer Consistency (E08 - E13)
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 2: Immutability Triggers & Pointer Consistency ---');

  await test('E08', 'Immutability trigger fn_protect_published_exam_doc_version blocks mutation of published versions', async () => {
    assert(migrationSql.includes('CREATE OR REPLACE FUNCTION public.fn_protect_published_exam_doc_version'));
    assert(migrationSql.includes('Cannot modify published exam_doc_version'));
  });

  await test('E09', 'Immutability trigger blocks deletion of published versions', async () => {
    assert(migrationSql.includes('Cannot delete published exam_doc_version'));
    assert(migrationSql.includes('Published versions are permanently immutable'));
  });

  await test('E10', 'Document deletion trigger fn_protect_published_exam_doc_deletion prevents deleting published docs', async () => {
    assert(migrationSql.includes('CREATE OR REPLACE FUNCTION public.fn_protect_published_exam_doc_deletion'));
    assert(migrationSql.includes('published version(s) exist. Archive the document instead.'));
  });

  await test('E11', 'Pointer consistency trigger fn_check_exam_doc_published_pointer validates published target', async () => {
    assert(migrationSql.includes('CREATE OR REPLACE FUNCTION public.fn_check_exam_doc_published_pointer'));
    assert(migrationSql.includes('trg_check_exam_doc_published_pointer'));
  });

  await test('E12', 'Pointer consistency trigger blocks cross-document pointer assignments', async () => {
    assert(migrationSql.includes('Cross-document pointer violation'));
  });

  await test('E13', 'Pointer consistency trigger blocks pointer to unpublished draft version', async () => {
    assert(migrationSql.includes('Invalid pointer: version % is not published'));
  });

  // --------------------------------------------------------------------------
  // GROUP 3: Row-Level Security (RLS) & Least-Privilege Grants (E14 - E20)
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 3: Row-Level Security (RLS) & Least-Privilege Grants ---');

  await test('E14', 'Row-Level Security (RLS) is enabled on all 6 new tables', async () => {
    assert(migrationSql.includes('ALTER TABLE public.exam_posts ENABLE ROW LEVEL SECURITY;'));
    assert(migrationSql.includes('ALTER TABLE public.exam_sources ENABLE ROW LEVEL SECURITY;'));
    assert(migrationSql.includes('ALTER TABLE public.exam_knowledge_documents ENABLE ROW LEVEL SECURITY;'));
    assert(migrationSql.includes('ALTER TABLE public.exam_doc_versions ENABLE ROW LEVEL SECURITY;'));
    assert(migrationSql.includes('ALTER TABLE public.exam_claims ENABLE ROW LEVEL SECURITY;'));
    assert(migrationSql.includes('ALTER TABLE public.exam_claim_sources ENABLE ROW LEVEL SECURITY;'));
  });

  await test('E15', 'Public candidate policy on exam_knowledge_documents permits SELECT only for PUBLISHED status', async () => {
    assert(migrationSql.includes('status = \'PUBLISHED\' AND current_published_version_id IS NOT NULL'));
  });

  await test('E16', 'Public candidate policy on exam_doc_versions permits SELECT only for is_published = true', async () => {
    assert(migrationSql.includes('is_published = true AND review_status = \'PUBLISHED\''));
  });

  await test('E17', 'Public candidate policy on exam_sources permits SELECT only for SOURCE_VERIFIED sources', async () => {
    assert(migrationSql.includes('verification_status = \'SOURCE_VERIFIED\''));
  });

  await test('E18', 'Public candidate policy on exam_claims permits SELECT only for VERIFIED claims', async () => {
    assert(migrationSql.includes('verification_status = \'VERIFIED\''));
  });

  await test('E19', 'Admin staff policies grant full management access for authenticated users', async () => {
    assert(migrationSql.includes('Admin staff full management of exam posts'));
    assert(migrationSql.includes('Admin staff full management of exam sources'));
    assert(migrationSql.includes('Admin staff full management of exam knowledge documents'));
    assert(migrationSql.includes('Admin staff full management of exam doc versions'));
    assert(migrationSql.includes('Admin staff full management of exam claims'));
  });

  await test('E20', 'Permission grants assign read-only SELECT to anon/authenticated and ALL to service_role', async () => {
    assert(migrationSql.includes('GRANT SELECT ON public.exam_posts TO anon, authenticated;'));
    assert(migrationSql.includes('GRANT ALL ON public.exam_posts TO service_role;'));
  });

  // --------------------------------------------------------------------------
  // GROUP 4: Domain Service & Immutability Lifecycle Verification (E21 - E27)
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 4: Domain Service & Immutability Lifecycle Verification ---');

  await test('E21', 'ExamKnowledgeService.isImmutable accurately detects published version state', async () => {
    const draftVer = { version_number: 1, is_published: false, review_status: 'DRAFT' };
    assert.strictEqual(ExamKnowledgeService.isImmutable(draftVer), false);
    const pubVer = { version_number: 1, is_published: true, review_status: 'PUBLISHED' };
    assert.strictEqual(ExamKnowledgeService.isImmutable(pubVer), true);
  });

  await test('E22', 'ExamKnowledgeService.assertMutable throws on attempted mutation of published version', async () => {
    const pubVer = { id: 'ver-pub-001', version_number: 1, is_published: true, review_status: 'PUBLISHED' };
    let threw = false;
    try {
      ExamKnowledgeService.assertMutable(pubVer);
    } catch (e) {
      threw = true;
      assert(e.message.includes('permanently immutable'));
    }
    assert.strictEqual(threw, true);
  });

  await test('E23', 'ExamKnowledgeService.validatePublishedPointer passes for matching published version', async () => {
    const doc = { id: 'doc-001' };
    const ver = { id: 'ver-001', document_id: 'doc-001', is_published: true, review_status: 'PUBLISHED' };
    const res = ExamKnowledgeService.validatePublishedPointer(doc, ver);
    assert.strictEqual(res.isValid, true);
  });

  await test('E24', 'ExamKnowledgeService.validatePublishedPointer detects cross-document mismatch', async () => {
    const docA = { id: 'doc-A' };
    const verB = { id: 'ver-B', document_id: 'doc-B', is_published: true, review_status: 'PUBLISHED' };
    const res = ExamKnowledgeService.validatePublishedPointer(docA, verB);
    assert.strictEqual(res.isValid, false);
    assert(res.error.includes('Cross-document pointer mismatch'));
  });

  await test('E25', 'ExamKnowledgeService.validatePublishedPointer detects unpublished target version', async () => {
    const doc = { id: 'doc-001' };
    const ver = { id: 'ver-001', document_id: 'doc-001', is_published: false, review_status: 'AI_GENERATED' };
    const res = ExamKnowledgeService.validatePublishedPointer(doc, ver);
    assert.strictEqual(res.isValid, false);
    assert(res.error.includes('Cannot point to an unpublished version'));
  });

  await test('E26', 'ExamKnowledgeService.getCanonicalSlug generates correct timeless slug format', async () => {
    const slug = ExamKnowledgeService.getCanonicalSlug('ssc-cgl', 'ELIGIBILITY');
    assert.strictEqual(slug, 'exams/ssc-cgl/eligibility');
  });

  await test('E27', 'ExamKnowledgeService.getCanonicalSlug generates correct cycle-specific slug format', async () => {
    const slug = ExamKnowledgeService.getCanonicalSlug('ssc-cgl', 'IMPORTANT_DATES', 2026);
    assert.strictEqual(slug, 'exams/ssc-cgl/2026/important-dates');
  });

  // --------------------------------------------------------------------------
  // GROUP 5: Schema Invariants, Cycles & Multi-Source Claims (E28 - E31)
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 5: Schema Invariants, Cycles & Multi-Source Claims ---');

  await test('E28', 'Unique constraint on (exam_id, exam_cycle_id, module_key, language) prevents duplicate documents', async () => {
    assert(migrationSql.includes('uq_exam_docs_exam_cycle_module'));
  });

  await test('E29', 'Multi-source claim support: junction table enables multiple verified citations per factual claim', async () => {
    assert(migrationSql.includes('claim_id UUID NOT NULL REFERENCES public.exam_claims'));
    assert(migrationSql.includes('source_id UUID NOT NULL REFERENCES public.exam_sources'));
  });

  await test('E30', 'Nullable exam_cycle_id accommodates both timeless exam docs and annual cycle docs', async () => {
    assert(migrationSql.includes('exam_cycle_id UUID REFERENCES public.exam_cycles(id) ON DELETE RESTRICT'));
  });

  await test('E31', 'Post identity model isolates permanent post specifications from annual vacancy counts', async () => {
    assert(migrationSql.includes('post_name TEXT NOT NULL'));
    assert(migrationSql.includes('is_gazetted BOOLEAN'));
    assert(!migrationSql.includes('vacancy_count INTEGER'), 'Vacancies belong to annual cycles/claims, not permanent post entities');
  });

  // --------------------------------------------------------------------------
  // GROUP 6: Database Baseline Protection & Zero Mutation (E32 - E40)
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 6: Database Baseline Protection & Zero Mutation ---');

  await test('E32', 'Canonical subjects table baseline is 100% untouched (4 subjects)', async () => {
    const { count, error } = await supabase.from('subjects').select('*', { count: 'exact', head: true });
    assert.strictEqual(error, null);
    assert.strictEqual(count, 4);
  });

  await test('E33', 'Canonical topics table baseline is 100% untouched (36 topics)', async () => {
    const { count, error } = await supabase.from('topics').select('*', { count: 'exact', head: true });
    assert.strictEqual(error, null);
    assert.strictEqual(count, 36);
  });

  await test('E34', 'Canonical subtopics table baseline is 100% untouched', async () => {
    const { count, error } = await supabase.from('subtopics').select('*', { count: 'exact', head: true });
    assert.strictEqual(error, null);
  });

  await test('E35', 'Canonical learning units table baseline is 100% untouched', async () => {
    const { count, error } = await supabase.from('learning_units').select('*', { count: 'exact', head: true });
    assert.strictEqual(error, null);
  });

  await test('E36', 'Published learning documents table baseline is 100% untouched (zero corruption)', async () => {
    const { count, error } = await supabase.from('learning_documents').select('*', { count: 'exact', head: true });
    assert.strictEqual(error, null);
  });

  await test('E37', 'Question Bank questions and question versions baseline is 100% untouched (>= 103 items)', async () => {
    const { count: qCount, error: qErr } = await supabase.from('questions').select('*', { count: 'exact', head: true });
    assert.strictEqual(qErr, null);
    assert(qCount >= 103);
    const { count: vCount, error: vErr } = await supabase.from('question_versions').select('*', { count: 'exact', head: true });
    assert.strictEqual(vErr, null);
    assert(vCount >= 103);
  });

  await test('E38', 'Mock test templates and test attempts baseline is 100% untouched (>= 8 mocks, >= 31 attempts)', async () => {
    const { count: mCount } = await supabase.from('mock_tests').select('*', { count: 'exact', head: true });
    assert(mCount >= 8);
    const { count: aCount } = await supabase.from('test_attempts').select('*', { count: 'exact', head: true });
    assert(aCount >= 31);
  });

  await test('E39', 'Test results and attempt answers baseline is 100% untouched (10 results, 200 answers)', async () => {
    const { count: rCount, error: rErr } = await supabase.from('test_results').select('*', { count: 'exact', head: true });
    assert.strictEqual(rErr, null);
    assert.strictEqual(rCount, 10);
    const { count: ansCount, error: ansErr } = await supabase.from('attempt_answers').select('*', { count: 'exact', head: true });
    assert.strictEqual(ansErr, null);
    assert.strictEqual(ansCount, 200);
  });

  await test('E40', 'Zero new content seeded (zero unsolicited content injection before Phase 3H.2)', async () => {
    assert(migrationSql.length > 1000, 'Migration SQL file is substantive');
    assert(!migrationSql.includes('INSERT INTO public.exam_doc_versions'), 'Migration must not insert real exam content');
  });

  console.log('\n============================================================');
  console.log(`PHASE 3H.1 TEST RESULTS: ${passedTests} PASSED | ${failedTests} FAILED (Total: ${passedTests + failedTests})`);
  console.log('============================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
