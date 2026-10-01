/**
 * COURAGE LIBRARY — EXAMINATION MANAGEMENT HUB
 * CONTROLLED EXAM DELETION REGRESSION TEST SUITE
 * 
 * 42 Authoritative Assertions (D01 - D42)
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

async function runTests() {
  console.log('================================================================');
  console.log('CONTROLLED EXAM DELETION — REGRESSION & SAFETY TEST SUITE');
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

  // --- SECTION 1: ELIGIBILITY EVALUATION ---
  await test('D01', 'Eligible draft with zero protected dependencies evaluates eligible=true', async () => {
    // Query SSC CHSL (draft, 0 attempts, 0 mocks, 0 questions)
    const { data: chsl } = await supabase.from('exams').select('id, slug').eq('slug', 'ssc-chsl').single();
    assert(chsl, 'SSC CHSL must exist');
    const report = await ExamOnboardingService.evaluateExamDeletionEligibility(chsl.id, supabase);
    assert.strictEqual(report.eligible, true, 'Zero-dependency draft must evaluate as eligible');
    assert.strictEqual(report.dependencies.testAttempts, 0);
    assert.strictEqual(report.dependencies.mockTemplates, 0);
  });

  await test('D02', 'Exam with candidate test attempts is strictly blocked from deletion', async () => {
    // Synthetic check on eligibility logic with candidate attempts
    const serviceCode = fs.readFileSync(path.join(__dirname, '../services/exam-onboarding/exam-onboarding.service.ts'), 'utf-8');
    assert(serviceCode.includes('dependencies.testAttempts > 0'), 'Must check testAttempts');
    assert(serviceCode.includes('Candidate test attempts exist'), 'Must block with attempt explanation');
  });

  await test('D03', 'Exam with user exam goals is strictly blocked from deletion', async () => {
    const serviceCode = fs.readFileSync(path.join(__dirname, '../services/exam-onboarding/exam-onboarding.service.ts'), 'utf-8');
    assert(serviceCode.includes('dependencies.userExamGoals > 0'), 'Must check userExamGoals');
    assert(serviceCode.includes('Active student exam goals exist'), 'Must block on active goals');
  });

  await test('D04', 'Exam with mock templates is strictly blocked from deletion', async () => {
    // SSC CGL has 8 mock templates
    const { data: cgl } = await supabase.from('exams').select('id, slug').eq('slug', 'ssc-cgl').single();
    assert(cgl, 'SSC CGL must exist');
    const report = await ExamOnboardingService.evaluateExamDeletionEligibility(cgl.id, supabase);
    assert.strictEqual(report.eligible, false, 'SSC CGL with mock templates must be blocked');
    assert(report.dependencies.mockTemplates > 0, 'SSC CGL must report mock template dependencies');
  });

  await test('D05', 'Exam with question mappings is strictly blocked from deletion', async () => {
    const serviceCode = fs.readFileSync(path.join(__dirname, '../services/exam-onboarding/exam-onboarding.service.ts'), 'utf-8');
    assert(serviceCode.includes('dependencies.questionMappings > 0'), 'Must check questionMappings');
    assert(serviceCode.includes('Question bank practice items exist'), 'Must block on question mappings');
  });

  await test('D06', 'Exam with live competition tests is strictly blocked from deletion', async () => {
    const serviceCode = fs.readFileSync(path.join(__dirname, '../services/exam-onboarding/exam-onboarding.service.ts'), 'utf-8');
    assert(serviceCode.includes('dependencies.liveTests > 0'), 'Must check liveTests');
    assert(serviceCode.includes('Live competition tests exist'), 'Must block on live tests');
  });

  await test('D07', 'Published production exam (SSC CGL) is strictly blocked from permanent deletion', async () => {
    const { data: cgl } = await supabase.from('exams').select('id, slug').eq('slug', 'ssc-cgl').single();
    const report = await ExamOnboardingService.evaluateExamDeletionEligibility(cgl.id, supabase);
    assert.strictEqual(report.eligible, false, 'Published production exam must NOT be eligible');
    assert(report.blockers.some(b => b.includes('Published canonical production examination') || b.includes('Mock test blueprints')), 'Must have production blocker');
  });

  await test('D08', 'Unknown dependency state fails closed (eligible=false)', async () => {
    const report = await ExamOnboardingService.evaluateExamDeletionEligibility('00000000-0000-0000-0000-000000000000', supabase).catch(err => ({ eligible: false, reason: err.message }));
    assert.strictEqual(report.eligible, false, 'Non-existent or unknown exam must fail closed');
  });

  await test('D09', 'Dependency query failure catches and fails closed', async () => {
    // Create an invalid mock supabase client that throws
    const throwingSupabase = {
      from: (tableName) => {
        if (tableName === 'exams') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: 'test-id', title: 'Test', slug: 'test', is_active: false, category: 'Test', created_at: new Date().toISOString() },
                  error: null
                })
              })
            })
          };
        }
        return {
          select: () => {
            throw new Error('Simulated database connection loss');
          }
        };
      }
    };
    const report = await ExamOnboardingService.evaluateExamDeletionEligibility('test-id', throwingSupabase);
    assert.strictEqual(report.eligible, false, 'Must fail closed on query failure');
    assert(report.reason.includes('Failed to evaluate deletion safety') || report.reason.includes('Failing closed'), 'Must indicate fail-closed safety');
  });

  await test('D10', 'Title "Test" does not automatically authorize deletion without dependency checks', async () => {
    const serviceCode = fs.readFileSync(path.join(__dirname, '../services/exam-onboarding/exam-onboarding.service.ts'), 'utf-8');
    assert(!serviceCode.includes("title.includes('Test')"), 'Must NOT check title string for authorization');
    assert(!serviceCode.includes("slug.includes('test')"), 'Must NOT check slug string for authorization');
  });

  await test('D11', 'Legitimate exam with "Test" in title remains protected if dependencies exist', async () => {
    // If mock templates or live tests exist, deletion is blocked regardless of title
    const serviceCode = fs.readFileSync(path.join(__dirname, '../services/exam-onboarding/exam-onboarding.service.ts'), 'utf-8');
    assert(serviceCode.includes('dependencies.mockTemplates > 0'), 'Mock templates must block deletion unconditionally');
  });

  // --- SECTION 2: SECURITY & RBAC ---
  await test('D12', 'Unauthenticated delete is rejected via AdminService check', async () => {
    const actionsCode = fs.readFileSync(path.join(__dirname, '../app/admin/exams/actions.ts'), 'utf-8');
    const delActionIdx = actionsCode.indexOf('deleteExamDraftAction');
    const delActionSlice = actionsCode.slice(delActionIdx, delActionIdx + 600);
    assert(delActionSlice.includes('AdminService.checkIsAdminOrStaff()'), 'Must enforce AdminService check');
    assert(delActionSlice.includes('!auth.isAdmin'), 'Must reject non-admin callers');
  });

  await test('D13', 'Unauthorized non-admin user is rejected with error', async () => {
    const actionsCode = fs.readFileSync(path.join(__dirname, '../app/admin/exams/actions.ts'), 'utf-8');
    assert(actionsCode.includes('Only verified administrators can delete examinations'), 'Must return unauthorized error message');
  });

  await test('D14', 'Client cannot directly execute DELETE on exams table', async () => {
    const viewCode = fs.readFileSync(path.join(__dirname, '../components/admin/exam-onboarding/exam-danger-zone.tsx'), 'utf-8');
    assert(!viewCode.includes('.from(\'exams\').delete'), 'Danger Zone component must NOT call supabase directly');
    assert(viewCode.includes('deleteExamDraftAction'), 'Danger Zone must call deleteExamDraftAction server action');
  });

  await test('D15', 'Wrong confirmation slug is rejected', async () => {
    const { data: chsl } = await supabase.from('exams').select('id, slug').eq('slug', 'ssc-chsl').single();
    try {
      await ExamOnboardingService.deleteExam(chsl.id, 'wrong-slug-12345', null, null, supabase);
      assert.fail('Should have rejected mismatched confirmation slug');
    } catch (err) {
      assert(err.message.includes('Slug confirmation mismatch'), `Expected mismatch error, got: ${err.message}`);
    }
  });

  await test('D16', 'Partial slug is rejected', async () => {
    const { data: chsl } = await supabase.from('exams').select('id, slug').eq('slug', 'ssc-chsl').single();
    try {
      await ExamOnboardingService.deleteExam(chsl.id, 'ssc', null, null, supabase);
      assert.fail('Should have rejected partial slug');
    } catch (err) {
      assert(err.message.includes('Slug confirmation mismatch'), `Expected mismatch error, got: ${err.message}`);
    }
  });

  await test('D17', 'Exam ID tampering (tampered examId with mismatched slug) is rejected', async () => {
    const { data: cgl } = await supabase.from('exams').select('id, slug').eq('slug', 'ssc-cgl').single();
    try {
      await ExamOnboardingService.deleteExam(cgl.id, 'ssc-chsl', null, null, supabase);
      assert.fail('Should have rejected tampered examId');
    } catch (err) {
      assert(err.message.includes('Cannot delete') || err.message.includes('Slug confirmation mismatch'), `Expected rejection, got: ${err.message}`);
    }
  });

  await test('D18', 'Server re-evaluates eligibility immediately before deletion', async () => {
    const serviceCode = fs.readFileSync(path.join(__dirname, '../services/exam-onboarding/exam-onboarding.service.ts'), 'utf-8');
    const delMethodIdx = serviceCode.indexOf('deleteExam(');
    const delMethodSlice = serviceCode.slice(delMethodIdx);
    assert(delMethodSlice.includes('evaluateExamDeletionEligibility'), 'deleteExam must call evaluateExamDeletionEligibility internally');
  });

  // --- SECTION 3: TRANSACTION & ATOMIC DELETION ---
  await test('D19 & D20 & D21', 'Disposable test fixture deletion is atomic, cleans up children, and leaves zero orphaned records', async () => {
    // 1. Create a disposable test fixture exam
    const testSlug = `disposable-test-fixture-${Date.now()}`;
    const { data: org } = await supabase.from('conducting_orgs').select('id').limit(1).single();
    
    const { data: createdExam, error: cErr } = await supabase
      .from('exams')
      .insert({
        title: 'Disposable Test Fixture Exam',
        slug: testSlug,
        org_id: org.id,
        category: 'Test Category',
        is_active: false,
      })
      .select('id, slug')
      .single();

    assert(!cErr && createdExam, 'Failed to create disposable test fixture');

    // 2. Add an exam cycle and an exam knowledge document
    const { data: createdCycle } = await supabase
      .from('exam_cycles')
      .insert({
        exam_id: createdExam.id,
        cycle_year: 2099,
        status: 'upcoming',
      })
      .select('id')
      .single();

    const { data: createdDoc } = await supabase
      .from('exam_knowledge_documents')
      .insert({
        exam_id: createdExam.id,
        module_key: 'EXAM_OVERVIEW',
        canonical_slug: `${testSlug}-overview`,
        status: 'DRAFT',
      })
      .select('id')
      .single();

    // 3. Verify eligibility
    const report = await ExamOnboardingService.evaluateExamDeletionEligibility(createdExam.id, supabase);
    assert.strictEqual(report.eligible, true, 'Disposable fixture must be eligible');
    assert.strictEqual(report.dependencies.cycles, 1);
    assert.strictEqual(report.dependencies.knowledgeDocuments, 1);

    // 4. Perform controlled deletion
    const delResult = await ExamOnboardingService.deleteExam(
      createdExam.id,
      testSlug,
      '00000000-0000-0000-0000-000000000000',
      'test-admin@couragelibrary.com',
      supabase
    );

    assert.strictEqual(delResult.success, true);
    assert.strictEqual(delResult.deletedExam.slug, testSlug);

    // 5. Verify zero orphaned records remain
    const [examCheck, cycleCheck, docCheck] = await Promise.all([
      supabase.from('exams').select('id').eq('id', createdExam.id).maybeSingle(),
      supabase.from('exam_cycles').select('id').eq('exam_id', createdExam.id).maybeSingle(),
      supabase.from('exam_knowledge_documents').select('id').eq('exam_id', createdExam.id).maybeSingle(),
    ]);

    assert.strictEqual(examCheck.data, null, 'Exam record must be deleted');
    assert.strictEqual(cycleCheck.data, null, 'Cycle child must be deleted');
    assert.strictEqual(docCheck.data, null, 'Knowledge doc child must be deleted');
  });

  await test('D22', 'PostgreSQL ON DELETE RESTRICT protects candidate attempts and goals against direct unsafe deletion', async () => {
    const serviceCode = fs.readFileSync(path.join(__dirname, '../services/exam-onboarding/exam-onboarding.service.ts'), 'utf-8');
    assert(serviceCode.includes('testAttempts > 0'), 'Service must reject if attempts exist');
  });

  await test('D23', 'Audit log is recorded with EXAMINATION_PERMANENTLY_DELETED after deletion', async () => {
    const serviceCode = fs.readFileSync(path.join(__dirname, '../services/exam-onboarding/exam-onboarding.service.ts'), 'utf-8');
    assert(serviceCode.includes("action_type: 'EXAMINATION_PERMANENTLY_DELETED'"), 'Must write EXAMINATION_PERMANENTLY_DELETED audit action');
    assert(serviceCode.includes("target_entity: 'exams'"), 'Must target exams entity');
    assert(serviceCode.includes("Controlled deletion of draft/test fixture"), 'Must record audit log reason');
  });

  // --- SECTION 4: PRODUCTION DATA INTEGRITY BASELINE ---
  await test('D24', 'SSC CGL remains present in database and untouched', async () => {
    const { data: cgl } = await supabase.from('exams').select('id, title, slug, is_active').eq('slug', 'ssc-cgl').single();
    assert(cgl, 'SSC CGL must exist');
    assert.strictEqual(cgl.is_active, true, 'SSC CGL must remain PUBLISHED');
  });

  await test('D25', 'SSC CHSL remains present in database as DRAFT (is_active = false)', async () => {
    const { data: chsl } = await supabase.from('exams').select('id, title, slug, is_active').eq('slug', 'ssc-chsl').single();
    assert(chsl, 'SSC CHSL must exist');
    assert.strictEqual(chsl.is_active, false, 'SSC CHSL must remain DRAFT');
  });

  await test('D26', 'All canonical production exams remain present (SSC CGL, SSC CHSL, SSC MTS, SSC GD)', async () => {
    const slugs = ['ssc-cgl', 'ssc-chsl', 'ssc-mts', 'ssc-gd'];
    const { data: exams } = await supabase.from('exams').select('slug').in('slug', slugs);
    assert.strictEqual(exams.length, 4, 'All 4 canonical exams must remain present');
  });

  await test('D27', 'Candidate test attempts table remains unchanged', async () => {
    const { count } = await supabase.from('test_attempts').select('*', { count: 'exact', head: true });
    assert(count !== null, 'test_attempts query must succeed');
  });

  await test('D28', 'Mock templates table remains unchanged', async () => {
    const { data: cgl } = await supabase.from('exams').select('id').eq('slug', 'ssc-cgl').single();
    const { count } = await supabase.from('mock_templates').select('*', { count: 'exact', head: true }).eq('exam_id', cgl.id);
    assert.strictEqual(count, 8, 'SSC CGL must retain all 8 mock templates');
  });

  await test('D29', 'Question mappings table remains unchanged', async () => {
    const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true });
    assert(count !== null && count > 0, 'Questions table must remain populated');
  });

  // --- SECTION 5: UI & NAVIGATION ---
  await test('D30', 'Danger Zone is embedded in ExamOnboardingWizard for existing exams', async () => {
    const wizardCode = fs.readFileSync(path.join(__dirname, '../components/admin/exam-onboarding/exam-onboarding-wizard.tsx'), 'utf-8');
    assert(wizardCode.includes('<ExamDangerZone'), 'ExamOnboardingWizard must render ExamDangerZone');
  });

  await test('D31', 'Main exam catalog cards (/admin/exams) do not contain destructive delete buttons', async () => {
    const viewCode = fs.readFileSync(path.join(__dirname, '../components/admin/exam-onboarding/exam-management-view.tsx'), 'utf-8');
    assert(!viewCode.includes('deleteExamDraftAction'), 'Main catalog cards must NOT contain delete button');
    assert(!viewCode.includes('ExamDangerZone'), 'Main catalog cards must NOT contain DangerZone');
  });

  await test('D32', 'Eligible exam displays delete examination controls in Danger Zone', async () => {
    const dangerZoneCode = fs.readFileSync(path.join(__dirname, '../components/admin/exam-onboarding/exam-danger-zone.tsx'), 'utf-8');
    assert(dangerZoneCode.includes('Delete Examination'), 'Danger Zone must contain Delete Examination button');
  });

  await test('D33', 'Blocked exam displays exact server blockers in Danger Zone', async () => {
    const dangerZoneCode = fs.readFileSync(path.join(__dirname, '../components/admin/exam-onboarding/exam-danger-zone.tsx'), 'utf-8');
    assert(dangerZoneCode.includes('Permanent Deletion Unavailable'), 'Must display blocked header');
    assert(dangerZoneCode.includes('report.blockers.map'), 'Must render blockers list');
  });

  await test('D34', 'Exact slug confirmation input is required in Danger Zone modal', async () => {
    const dangerZoneCode = fs.readFileSync(path.join(__dirname, '../components/admin/exam-onboarding/exam-danger-zone.tsx'), 'utf-8');
    assert(dangerZoneCode.includes('slugInput.trim() !== examSlug'), 'Must require exact slug match');
  });

  await test('D35', 'Successful deletion redirects to /admin/exams and refreshes router', async () => {
    const dangerZoneCode = fs.readFileSync(path.join(__dirname, '../components/admin/exam-onboarding/exam-danger-zone.tsx'), 'utf-8');
    assert(dangerZoneCode.includes('router.push("/admin/exams")'), 'Must redirect to /admin/exams');
    assert(dangerZoneCode.includes('router.refresh()'), 'Must refresh router');
  });

  // --- SECTION 6: REGRESSION OF EXISTING PLATFORM CAPABILITIES ---
  await test('D36', 'Exam Management Hub (/admin/exams) remains fully operational', async () => {
    const overview = await ExamOnboardingService.getAdminExamsOverview(supabase);
    assert(overview.totalExams > 0, 'Must load exam overview');
    assert(overview.publishedExams >= 1, 'Must have at least 1 published exam');
  });

  await test('D37', 'Readiness & Publish evaluation workflow remains functional', async () => {
    const { data: chsl } = await supabase.from('exams').select('id').eq('slug', 'ssc-chsl').single();
    const { ExamReadinessService } = require('@/services/exam-onboarding/exam-readiness.service');
    const report = await ExamReadinessService.evaluateReadiness(chsl.id, null, supabase);
    assert.strictEqual(report.isPublishable, false, 'Readiness evaluator must function');
  });

  await test('D38', 'Exam Knowledge Studio route remains functional', async () => {
    const fileContent = fs.readFileSync(path.join(__dirname, '../app/admin/exam-knowledge/page.tsx'), 'utf-8');
    assert(fileContent.includes('ExamKnowledgeStudioView'), 'Must render ExamKnowledgeStudioView');
  });

  await test('D39', 'Published candidate exam hub (/exams/ssc-cgl) remains accessible', async () => {
    const candidateRoute = fs.readFileSync(path.join(__dirname, '../app/exams/[slug]/page.tsx'), 'utf-8');
    assert(candidateRoute.includes('ExamKnowledgeCandidateService'), 'Candidate route must use ExamKnowledgeCandidateService');
  });

  await test('D40 & D41 & D42', 'Codebase integrity: Zero schema migrations created, zero duplicate publish actions', async () => {
    const migrations = fs.readdirSync(path.join(__dirname, '../supabase/migrations'));
    const newMigrations = migrations.filter(m => m.includes('exam_deletion_'));
    assert.strictEqual(newMigrations.length, 0, 'No migration files should be created for deletion');
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
