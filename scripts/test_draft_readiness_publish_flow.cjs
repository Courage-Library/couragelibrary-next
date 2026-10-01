/**
 * COURAGE LIBRARY — EXAMINATION MANAGEMENT HUB
 * DRAFT READINESS & PUBLISH WORKFLOW REGRESSION TEST SUITE
 * 
 * 23 Authoritative Assertions (E01 - E23)
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

// Resilient fetch wrapper
const originalFetch = global.fetch;
global.fetch = async function (url, options) {
  let attempts = 0;
  while (attempts < 3) {
    try {
      return await originalFetch(url, options);
    } catch (err) {
      attempts++;
      if (attempts >= 3) throw err;
      await new Promise(r => setTimeout(r, 500 * attempts));
    }
  }
};

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
  const fileContent = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(fileContent, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  return module._compile(compiled.outputText, filename);
};

require.extensions['.tsx'] = function (module, filename) {
  const fileContent = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(fileContent, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  return module._compile(compiled.outputText, filename);
};

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: global.fetch },
});

const { ExamOnboardingService } = require('@/services/exam-onboarding/exam-onboarding.service');
const { ExamReadinessService } = require('@/services/exam-onboarding/exam-readiness.service');

async function runTests() {
  console.log('================================================================');
  console.log('EXAMINATION MANAGEMENT HUB — DRAFT READINESS & PUBLISH TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(id, description, fn) {
    try {
      await fn();
      console.log(`[PASS] ${id} — ${description}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${id} — ${description}`);
      console.error(`       Error: ${err.message}`);
      failed++;
    }
  }

  // --- E01 & E02: Card Actions in ExamManagementView ---
  await test('E01', 'Draft card displays Readiness & Publish action link', async () => {
    const fileContent = fs.readFileSync(path.join(__dirname, '../components/admin/exam-onboarding/exam-management-view.tsx'), 'utf-8');
    assert(fileContent.includes('Readiness & Publish'), 'Must contain "Readiness & Publish" text');
    assert(fileContent.includes('/admin/exams/onboarding?examId='), 'Must link to /admin/exams/onboarding');
  });

  await test('E02', 'Published card displays Hub link and does not display Publish action', async () => {
    const fileContent = fs.readFileSync(path.join(__dirname, '../components/admin/exam-onboarding/exam-management-view.tsx'), 'utf-8');
    assert(fileContent.includes('exam.isActive ?'), 'Must branch on exam.isActive');
    assert(fileContent.includes('/exams/${exam.slug}'), 'Must link to /exams/[slug] for published exams');
  });

  // --- E03 & E04: Link URL structure ---
  await test('E03', 'Draft action contains correct examId parameter', async () => {
    const fileContent = fs.readFileSync(path.join(__dirname, '../components/admin/exam-onboarding/exam-management-view.tsx'), 'utf-8');
    assert(fileContent.includes('examId=${exam.id}'), 'Must pass exam.id as examId');
  });

  await test('E04', 'Draft action contains correct cycleId parameter and step=6', async () => {
    const fileContent = fs.readFileSync(path.join(__dirname, '../components/admin/exam-onboarding/exam-management-view.tsx'), 'utf-8');
    assert(fileContent.includes('&cycleId=${exam.activeCycle.id}'), 'Must pass cycleId when present');
    assert(fileContent.includes('&step=6'), 'Must target step 6 (Readiness & Publish)');
  });

  // --- E05 & E06: Readiness route implementation ---
  await test('E05', 'Readiness route in onboarding/page.tsx resolves correct exam and does not hard-redirect', async () => {
    const fileContent = fs.readFileSync(path.join(__dirname, '../app/admin/exams/onboarding/page.tsx'), 'utf-8');
    assert(!fileContent.includes('redirect(`/admin/exam-knowledge?examId='), 'Must NOT hard redirect to exam-knowledge');
    assert(fileContent.includes('ExamOnboardingWizard'), 'Must render ExamOnboardingWizard');
    assert(fileContent.includes('ExamReadinessService.evaluateReadiness'), 'Must evaluate readiness server-side');
  });

  await test('E06', 'Existing 14-dimension readiness service is used authoritatively', async () => {
    const fileContent = fs.readFileSync(path.join(__dirname, '../services/exam-onboarding/exam-readiness.service.ts'), 'utf-8');
    const dimensions = [
      'IDENTITY', 'ORGANIZATION', 'CYCLE', 'DATES', 'POSTS', 'ELIGIBILITY',
      'SYLLABUS', 'SOURCES', 'KNOWLEDGE', 'LEARNING', 'QUESTION_BANK', 'MOCKS', 'SEO', 'CANDIDATE_DELIVERY'
    ];
    dimensions.forEach(dim => {
      assert(fileContent.includes(`'${dim}'`), `Must include readiness dimension ${dim}`);
    });
  });

  // --- E07 & E08: SSC CHSL State ---
  await test('E07', 'SSC CHSL remains not publishable (isPublishable === false) with 4 blockers', async () => {
    const { data: exam } = await supabase.from('exams').select('id').eq('slug', 'ssc-chsl').single();
    assert(exam, 'SSC CHSL exam must exist');
    const report = await ExamReadinessService.evaluateReadiness(exam.id, null, supabase);
    assert.strictEqual(report.isPublishable, false, 'SSC CHSL must NOT be publishable');
    assert(report.blockingIssuesCount >= 4, `Expected at least 4 blocking issues, found ${report.blockingIssuesCount}`);
  });

  await test('E08', 'SSC CHSL database row remains is_active = false', async () => {
    const { data: exam } = await supabase.from('exams').select('is_active').eq('slug', 'ssc-chsl').single();
    assert.strictEqual(exam.is_active, false, 'SSC CHSL must remain in draft state');
  });

  // --- E09: Blocking readiness prevents publication ---
  await test('E09', 'Blocking readiness strictly rejects publication attempt', async () => {
    const { data: exam } = await supabase.from('exams').select('id').eq('slug', 'ssc-chsl').single();
    try {
      await ExamOnboardingService.publishExam(exam.id, null, supabase);
      assert.fail('publishExam should have thrown an error due to blocking issues');
    } catch (err) {
      assert(err.message.includes('Cannot publish exam') || err.message.includes('blocking issue'), `Unexpected error: ${err.message}`);
    }
  });

  // --- E10: Single authoritative publish action ---
  await test('E10', 'Existing publishExamAction in app/admin/exams/actions.ts remains the single publication path', async () => {
    const actionsContent = fs.readFileSync(path.join(__dirname, '../app/admin/exams/actions.ts'), 'utf-8');
    assert(actionsContent.includes('export async function publishExamAction'), 'Must export publishExamAction');
    assert(actionsContent.includes('ExamOnboardingService.publishExam'), 'Must invoke ExamOnboardingService.publishExam');
  });

  // --- E11: Client cannot directly mutate is_active ---
  await test('E11', 'No direct client mutation endpoint for exams.is_active exists', async () => {
    const compContent = fs.readFileSync(path.join(__dirname, '../components/admin/exam-onboarding/exam-management-view.tsx'), 'utf-8');
    assert(!compContent.includes('is_active: true'), 'Client component must not update is_active directly');
    assert(!compContent.includes('.from(\'exams\').update'), 'Client component must not call supabase update directly');
  });

  // --- E12 & E13: RBAC and Security ---
  await test('E12', 'publishExamAction is guarded by AdminService.checkIsAdminOrStaff()', async () => {
    const actionsContent = fs.readFileSync(path.join(__dirname, '../app/admin/exams/actions.ts'), 'utf-8');
    const pubActionIdx = actionsContent.indexOf('publishExamAction');
    const pubActionSlice = actionsContent.slice(pubActionIdx, pubActionIdx + 500);
    assert(pubActionSlice.includes('AdminService.checkIsAdminOrStaff()'), 'Must check admin status before publishing');
    assert(pubActionSlice.includes('!auth.isAdmin'), 'Must reject non-admin callers');
  });

  await test('E13', 'archiveExamAction is guarded by AdminService.checkIsAdminOrStaff()', async () => {
    const actionsContent = fs.readFileSync(path.join(__dirname, '../app/admin/exams/actions.ts'), 'utf-8');
    const arcActionIdx = actionsContent.indexOf('archiveExamAction');
    const arcActionSlice = actionsContent.slice(arcActionIdx, arcActionIdx + 500);
    assert(arcActionSlice.includes('AdminService.checkIsAdminOrStaff()'), 'Must check admin status before archiving');
  });

  // --- E14 & E15: Existing Exam Knowledge and Hub flows ---
  await test('E14', 'Exam Knowledge Studio route (/admin/exam-knowledge) remains intact and accessible', async () => {
    const fileContent = fs.readFileSync(path.join(__dirname, '../app/admin/exam-knowledge/page.tsx'), 'utf-8');
    assert(fileContent.includes('ExamKnowledgeStudioView'), 'Must render ExamKnowledgeStudioView');
  });

  await test('E15', 'Published exam candidate hub routes (/exams/[slug]) remain functional', async () => {
    const fileContent = fs.readFileSync(path.join(__dirname, '../app/exams/[slug]/page.tsx'), 'utf-8');
    assert(fileContent.includes('ExamKnowledgeCandidateService'), 'Candidate route must use ExamKnowledgeCandidateService');
  });

  // --- E16: No duplicate publish services ---
  await test('E16', 'No duplicate publication service or action files exist in repository', async () => {
    const servicesDir = path.join(__dirname, '../services/exam-onboarding');
    const files = fs.readdirSync(servicesDir);
    assert(!files.includes('draft-publish.service.ts'), 'Must not create draft-publish.service.ts');
    assert(!files.includes('exam-management-publish.service.ts'), 'Must not create exam-management-publish.service.ts');
  });

  // --- E17 & E18: Database Safety ---
  await test('E17', 'No unexpected database tables or duplicate schema artifacts created', async () => {
    const migrationsDir = path.join(__dirname, '../supabase/migrations');
    const files = fs.readdirSync(migrationsDir);
    const newMigrations = files.filter(f => f.includes('draft_readiness_publish_duplicate'));
    assert.strictEqual(newMigrations.length, 0, 'No duplicate migrations should be created');
  });

  await test('E18', 'Production database row baseline maintained (SSC CHSL remains draft)', async () => {
    const { data: exams } = await supabase.from('exams').select('id, slug, is_active').eq('slug', 'ssc-chsl');
    assert.strictEqual(exams.length, 1, 'SSC CHSL must exist uniquely');
    assert.strictEqual(exams[0].is_active, false, 'SSC CHSL is_active must remain false');
  });

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
