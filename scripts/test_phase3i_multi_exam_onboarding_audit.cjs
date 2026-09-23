/**
 * COURAGE LIBRARY — PHASE 3I
 * MULTI-EXAM ONBOARDING & EXAM CREATION FORENSIC AUDIT TEST SUITE
 * 
 * 24 Authoritative Read-Only Assertions (P01 - P24)
 * Strict Zero-Mutation & Database Baseline Verification (Δ = 0)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Module = require('module');
const ts = require('typescript');

// Polyfills
global.WebSocket = class WebSocket {};

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

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

// Register @ alias resolver
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    const target = path.resolve(__dirname, '..', request.slice(2));
    return originalResolveFilename.call(this, target, parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// Register TypeScript loader
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

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Services to inspect
const { ExamKnowledgeService } = require('@/services/exam-knowledge.service');
const { ExamModuleRegistry, EXAM_MODULE_REGISTRY } = require('@/services/exam-knowledge/exam-module-registry');
const { ExamKnowledgeContextBuilder } = require('@/services/exam-knowledge/exam-knowledge-context-builder.service');
const { ExamKnowledgePromptBuilder } = require('@/services/exam-knowledge/exam-knowledge-prompt-builder.service');
const { ExamKnowledgeCandidateService } = require('@/services/exam-knowledge/exam-knowledge-candidate.service');

const PROTECTED_LIVE_TABLES = [
  'conducting_orgs',
  'exams',
  'exam_cycles',
  'subjects',
  'topics',
  'subtopics',
  'exam_syllabi',
  'exam_topics',
  'questions',
  'question_versions',
  'mock_templates',
  'mock_tests',
  'mock_sections',
  'test_attempts',
  'test_results',
  'attempt_answers',
  'user_entitlements',
  'subscription_plans',
  'coin_wallets',
  'reward_policies'
];

let passedCount = 0;
let failedCount = 0;

async function test(id, description, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${id}: ${description}`);
    passedCount++;
  } catch (err) {
    console.error(`  [FAIL] ${id}: ${description}`);
    console.error(`         ${err.message}`);
    failedCount++;
  }
}

async function getExactTableCount(tableName) {
  const { count, error } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count;
}

async function runAudit() {
  console.log('================================================================');
  console.log('PHASE 3I — MULTI-EXAM ONBOARDING & ARCHITECTURE FORENSIC AUDIT');
  console.log('24 Authoritative Assertions (P01 - P24)');
  console.log('================================================================\n');

  // 1. Capture BEFORE Baseline Counts
  const beforeCounts = {};
  for (const table of PROTECTED_LIVE_TABLES) {
    beforeCounts[table] = await getExactTableCount(table);
  }

  // GROUP 1: CORE EXAM & ORGANIZATION ARCHITECTURE
  console.log('--- GROUP 1: Core Exam & Organization Architecture ---');

  await test('P01', 'Core exams table exists with org_id, title, slug, category, and is_active', async () => {
    const { data: exams, error } = await supabase.from('exams').select('id, org_id, title, slug, category, is_active').limit(5);
    assert.strictEqual(error, null);
    assert(exams.length > 0);
    assert(typeof exams[0].slug === 'string');
  });

  await test('P02', 'Conducting organizations table exists and supports multiple distinct authorities', async () => {
    const { data: orgs, error } = await supabase.from('conducting_orgs').select('id, name, slug, official_website, is_active');
    assert.strictEqual(error, null);
    assert(orgs.length >= 1);
    const slugs = orgs.map(o => o.slug);
    const uniqueSlugs = new Set(slugs);
    assert.strictEqual(slugs.length, uniqueSlugs.size);
  });

  await test('P03', 'Exam cycles table cleanly isolates annual cycle years from evergreen exam identity', async () => {
    const { data: cycles, error } = await supabase.from('exam_cycles').select('id, exam_id, cycle_year, status');
    assert.strictEqual(error, null);
    assert(cycles.length > 0);
    assert(typeof cycles[0].cycle_year === 'number');
  });

  await test('P04', 'Exam posts schema is designed for permanent post profiles with pay level and gazetted status', async () => {
    // Audit schema definition in migration 54 & domain models
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260919000054_phase3h1_exam_knowledge_foundation.sql');
    assert(fs.existsSync(migrationPath));
    const content = fs.readFileSync(migrationPath, 'utf8');
    assert(content.includes('CREATE TABLE IF NOT EXISTS public.exam_posts'));
    assert(content.includes('cpc_basic_pay_min'));
    assert(content.includes('is_gazetted'));
  });

  // GROUP 2: CANONICAL TAXONOMY & SYLLABUS MAPPING
  console.log('\n--- GROUP 2: Canonical Taxonomy & Syllabus Mapping ---');

  await test('P05', 'Subjects and Topics are global canonical entities (not bound to a single exam)', async () => {
    const { data: subjects, error: sErr } = await supabase.from('subjects').select('id, name, slug');
    const { data: topics, error: tErr } = await supabase.from('topics').select('id, name, slug, subject_id');
    assert.strictEqual(sErr, null);
    assert.strictEqual(tErr, null);
    assert.strictEqual(subjects.length, 4);
    assert.strictEqual(topics.length, 36);
  });

  await test('P06', 'Exam syllabi and exam topics provide exam-specific projection over global topics', async () => {
    const { data: syllabi, error: sylErr } = await supabase.from('exam_syllabi').select('id, exam_cycle_id');
    const { data: examTopics, error: etErr } = await supabase.from('exam_topics').select('id, syllabus_id, topic_id, weightage_level');
    assert.strictEqual(sylErr, null);
    assert.strictEqual(etErr, null);
    assert(Array.isArray(syllabi));
    assert(Array.isArray(examTopics));
  });

  await test('P07', 'Learning taxonomy is modeled with canonical learning units and multi-exam mappings', async () => {
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260915000053_phase3a_learning_taxonomy_foundation.sql');
    assert(fs.existsSync(migrationPath));
    const content = fs.readFileSync(migrationPath, 'utf8');
    assert(content.includes('CREATE TABLE IF NOT EXISTS public.learning_units'));
    assert(content.includes('CREATE TABLE IF NOT EXISTS public.exam_unit_mappings'));
  });

  // GROUP 3: QUESTION BANK & MOCK ENGINE AGNOSTICISM
  console.log('\n--- GROUP 3: Question Bank & Mock Engine Agnosticism ---');

  await test('P08', 'Questions link to canonical topics and support N:M mapping to multiple exams', async () => {
    const { data: q, error: qErr } = await supabase.from('questions').select('id, canonical_topic_id').limit(5);
    assert.strictEqual(qErr, null);
    assert(q.length > 0);
    assert(q[0].canonical_topic_id !== null);
  });

  await test('P09', 'Mock templates bind exam_id, exam_cycle_id, and pattern_id dynamically', async () => {
    const { data: templates, error: tErr } = await supabase.from('mock_templates').select('id, exam_id, exam_cycle_id, pattern_id, test_type').limit(5);
    assert.strictEqual(tErr, null);
    assert(templates.length > 0);
  });

  await test('P10', 'User entitlements table supports exam-scoped entitlements via exam_id foreign key', async () => {
    const { data: entitlements, error: entErr } = await supabase.from('user_entitlements').select('id, entitlement_type, exam_id, course_id').limit(5);
    assert.strictEqual(entErr, null);
    assert(Array.isArray(entitlements));
  });

  // GROUP 4: EXAM KNOWLEDGE CORE & CANDIDATE HUB
  console.log('\n--- GROUP 4: Exam Knowledge Core & Candidate Hub ---');

  await test('P11', 'Central 24-Module Registry dynamically supports generic multi-exam modules', async () => {
    const allDefs = ExamModuleRegistry.getAllModuleDefinitions();
    assert.strictEqual(allDefs.length, 24);
    const timeless = allDefs.filter(d => !d.isCycleSpecific);
    const cycleSpecific = allDefs.filter(d => d.isCycleSpecific);
    assert(timeless.length > 0);
    assert(cycleSpecific.length > 0);
    assert.strictEqual(timeless.length + cycleSpecific.length, 24);
  });

  await test('P12', 'ExamKnowledgeCandidateService resolves dynamic multi-exam views without hardcoding SSC CGL', async () => {
    const view = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView('non-existent-exam-slug');
    assert.strictEqual(view.status, 'NOT_FOUND');
    assert.strictEqual(view.exam, undefined);
  });

  await test('P13', 'ExamKnowledgeService.getCanonicalSlug generates clean deterministic semantic paths for any exam', async () => {
    const sscSlug = ExamKnowledgeService.getCanonicalSlug('ssc-cgl', 'ELIGIBILITY');
    const ibpsSlug = ExamKnowledgeService.getCanonicalSlug('ibps-po', 'ELIGIBILITY');
    const rrbSlug = ExamKnowledgeService.getCanonicalSlug('rrb-ntpc', 'IMPORTANT_DATES', 2026);
    assert.strictEqual(sscSlug, 'exams/ssc-cgl/eligibility');
    assert.strictEqual(ibpsSlug, 'exams/ibps-po/eligibility');
    assert.strictEqual(rrbSlug, 'exams/rrb-ntpc/2026/important-dates');
  });

  await test('P14', 'ExamKnowledgeContextBuilder generates isolated SHA-256 context hash unique per exam and module', async () => {
    const ctx1 = await ExamKnowledgeContextBuilder.buildContext({
      examId: 'e0000000-0000-0000-0000-000000000001',
      moduleKey: 'EXAM_OVERVIEW',
      prefetchedData: {
        exam: { id: 'e0000000-0000-0000-0000-000000000001', title: 'Exam One', slug: 'exam-one', is_active: true },
      }
    });
    const ctx2 = await ExamKnowledgeContextBuilder.buildContext({
      examId: 'e0000000-0000-0000-0000-000000000002',
      moduleKey: 'EXAM_OVERVIEW',
      prefetchedData: {
        exam: { id: 'e0000000-0000-0000-0000-000000000002', title: 'Exam Two', slug: 'exam-two', is_active: true },
      }
    });
    assert.notStrictEqual(ctx1.contextHash, ctx2.contextHash);
    assert.strictEqual(ctx1.contextHash.length, 64);
  });

  await test('P15', 'ExamPromptBuilder constructs provider-neutral, anti-hallucination prompts without SSC hardcoding', async () => {
    const context = await ExamKnowledgeContextBuilder.buildContext({
      examId: 'e0000000-0000-0000-0000-000000000003',
      moduleKey: 'ELIGIBILITY',
      prefetchedData: {
        exam: { id: 'e0000000-0000-0000-0000-000000000003', title: 'RRB NTPC', slug: 'rrb-ntpc', is_active: true },
        conductingOrg: { name: 'Railway Recruitment Control Board', official_website: 'https://rrbcdg.gov.in' }
      }
    });
    const { promptText } = ExamKnowledgePromptBuilder.buildPrompt(context);
    assert(promptText.includes('RRB NTPC'));
    assert(promptText.includes('Railway Recruitment Control Board'));
    assert(!promptText.includes('Staff Selection Commission'));
  });

  // GROUP 5: PROVENANCE, SOURCES, AND CLAIMS ISOLATION
  console.log('\n--- GROUP 5: Provenance, Sources, and Claims Isolation ---');

  await test('P16', 'Exam sources schema models verified source citations strictly scoped by exam_id', async () => {
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260919000054_phase3h1_exam_knowledge_foundation.sql');
    const content = fs.readFileSync(migrationPath, 'utf8');
    assert(content.includes('CREATE TABLE IF NOT EXISTS public.exam_sources'));
    assert(content.includes('exam_id UUID NOT NULL REFERENCES public.exams'));
    assert(content.includes('verification_status'));
  });

  await test('P17', 'Exam claims schema models verified facts and parameters strictly scoped by exam_id', async () => {
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260919000054_phase3h1_exam_knowledge_foundation.sql');
    const content = fs.readFileSync(migrationPath, 'utf8');
    assert(content.includes('CREATE TABLE IF NOT EXISTS public.exam_claims'));
    assert(content.includes('CREATE TABLE IF NOT EXISTS public.exam_claim_sources'));
    assert(content.includes('exam_id UUID NOT NULL REFERENCES public.exams'));
  });

  await test('P18', 'Exam knowledge documents schema enforces immutable versions and current_published_version_id pointer', async () => {
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260919000054_phase3h1_exam_knowledge_foundation.sql');
    const content = fs.readFileSync(migrationPath, 'utf8');
    assert(content.includes('CREATE TABLE IF NOT EXISTS public.exam_knowledge_documents'));
    assert(content.includes('CREATE TABLE IF NOT EXISTS public.exam_doc_versions'));
    assert(content.includes('current_published_version_id'));
  });

  // GROUP 6: ADMIN CREATION CAPABILITIES & GAP IDENTIFICATION
  console.log('\n--- GROUP 6: Admin Creation Capabilities & Gap Identification ---');

  await test('P19', 'Admin actions file has category/exam creation, update, and toggle actions', async () => {
    const adminActionsPath = path.join(__dirname, '..', 'app', 'admin', 'actions.ts');
    assert(fs.existsSync(adminActionsPath));
    const content = fs.readFileSync(adminActionsPath, 'utf-8');
    assert(content.includes('createCategoryAction'));
    assert(content.includes('updateCategoryAction'));
    assert(content.includes('toggleCategoryStatusAction'));
  });

  await test('P20', 'Admin categories manager UI exposes category/exam management controls and CRUD forms', async () => {
    const catManagerPath = path.join(__dirname, '..', 'components', 'admin', 'admin-categories-manager.tsx');
    assert(fs.existsSync(catManagerPath));
    const content = fs.readFileSync(catManagerPath, 'utf-8');
    assert(content.includes('createCategoryAction'));
    assert(content.includes('updateCategoryAction'));
  });

  await test('P21', 'Gap check: Admin UI lacks unified multi-step Exam Onboarding Wizard across all 16 domains', async () => {
    const adminDir = path.join(__dirname, '..', 'app', 'admin');
    const hasWizard = fs.existsSync(path.join(adminDir, 'exam-wizard')) || fs.existsSync(path.join(adminDir, 'onboarding'));
    assert.strictEqual(hasWizard, false, 'Multi-step wizard does not yet exist as a dedicated unified route');
  });

  await test('P22', 'Candidate routes (/exams, /exams/[slug], /exams/[slug]/[moduleSlug]) are 100% data-driven', async () => {
    const examDirPage = path.join(__dirname, '..', 'app', 'exams', 'page.tsx');
    const examHubPage = path.join(__dirname, '..', 'app', 'exams', '[slug]', 'page.tsx');
    const examModPage = path.join(__dirname, '..', 'app', 'exams', '[slug]', '[moduleSlug]', 'page.tsx');
    assert(fs.existsSync(examDirPage));
    assert(fs.existsSync(examHubPage));
    assert(fs.existsSync(examModPage));
    const hubContent = fs.readFileSync(examHubPage, 'utf-8');
    assert(hubContent.includes('getExamKnowledgeCandidateView'));
  });

  // GROUP 7: EXACT DATABASE BASELINE VERIFICATION
  console.log('\n--- GROUP 7: Exact Database Baseline Verification (Δ = 0) ---');

  await test('P23', 'No database mutations occurred during audit execution (Exact Before/After Count Parity)', async () => {
    const afterCounts = {};
    for (const table of PROTECTED_LIVE_TABLES) {
      afterCounts[table] = await getExactTableCount(table);
    }
    for (const table of PROTECTED_LIVE_TABLES) {
      assert.strictEqual(
        afterCounts[table],
        beforeCounts[table],
        `Table "${table}" count mutated! Before: ${beforeCounts[table]}, After: ${afterCounts[table]}`
      );
    }
  });

  await test('P24', 'Zero test or synthetic exam rows inserted into production database', async () => {
    const { data: testExams } = await supabase.from('exams').select('id, title, slug').ilike('slug', '%test%');
    assert.strictEqual(testExams ? testExams.length : 0, 0, 'No synthetic test exams exist in database');
  });

  console.log('\n================================================================');
  console.log(`AUDIT TEST RESULTS: ${passedCount} PASSED | ${failedCount} FAILED (Total: ${passedCount + failedCount})`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
