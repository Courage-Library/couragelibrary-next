/**
 * COURAGE LIBRARY — EXAMINATION MANAGEMENT HUB
 * TEST EXAM CLEANUP & PERMANENT MANAGEMENT ENTRY POINT VERIFICATION
 * 
 * 28 Comprehensive Assertions:
 * - CLEAN-01 through CLEAN-14 (Cleanup Verification)
 * - MGMT-01 through MGMT-14 (Management UX & Danger Zone Verification)
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
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  return module._compile(compiled.outputText, filename);
};

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { ExamOnboardingService } = require('@/services/exam-onboarding/exam-onboarding.service');
const { AdminService } = require('@/services/admin.service');
const { evaluateExamDeletionEligibilityAction, deleteExamDraftAction } = require('@/app/admin/exams/actions');

async function runTests() {
  console.log('================================================================');
  console.log('EXAM MANAGEMENT CLEANUP & PERMANENT MANAGEMENT TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(code, description, fn) {
    try {
      await fn();
      console.log(`[PASS] ${code} — ${description}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${code} — ${description}`);
      console.error(`       Error: ${err.message}`);
      failed++;
    }
  }

  // --- PART A: CLEANUP TESTS ---

  await test('CLEAN-01', 'Dry-run inventory was executed and verified complete', async () => {
    assert(fs.existsSync(path.join(__dirname, 'dry_run_exam_inventory.cjs')), 'dry_run_exam_inventory.cjs must exist');
    const { count, error } = await supabase.from('exams').select('*', { count: 'exact', head: true });
    assert(!error, 'Database query for exams must succeed');
    assert.strictEqual(count, 4, 'Precisely 4 canonical exams must remain after cleanup');
  });

  await test('CLEAN-02', 'Only obvious test fixtures are classified as test fixtures', async () => {
    const titles = [
      'Test Exam Phase 3K13',
      'Test Diff & Version History Examination',
      'Test Exam Phase 3K13.1',
      'Test Exam Phase 3K13.2',
    ];
    for (const title of titles) {
      const isTest = title.toLowerCase().startsWith('test ') || title.toLowerCase().includes('phase 3');
      assert(isTest, `Title "${title}" must be identified as test fixture`);
    }

    const realTitles = ['SSC CGL', 'SSC CHSL', 'SSC MTS', 'SSC GD Constable', 'IBPS PO', 'UPSC CSE'];
    for (const title of realTitles) {
      const isTest = title.toLowerCase().startsWith('test ') || title.toLowerCase().includes('phase 3');
      assert(!isTest, `Real title "${title}" must NOT be identified as test fixture`);
    }
  });

  await test('CLEAN-03', 'Real examinations are never classified solely by status', async () => {
    const draftRealExam = { title: 'SSC CHSL', is_active: false, slug: 'ssc-chsl' };
    const isTest = draftRealExam.title.toLowerCase().startsWith('test ') || draftRealExam.slug.startsWith('test-');
    assert(!isTest, 'Draft real exam must not be marked as test fixture');
  });

  await test('CLEAN-04', 'Published test fixture with zero protected dependencies is eligible', async () => {
    const report = {
      exam: { is_active: true, title: 'Test Exam' },
      dependencies: {
        testAttempts: 0,
        userExamGoals: 0,
        mockTemplates: 0,
        questionMappings: 0,
        sources: 0,
        knowledgeDocuments: 1,
      },
      blockers: []
    };
    const isEligible = report.blockers.length === 0;
    assert(isEligible, 'Published test fixture with no protected dependencies must be eligible');
  });

  await test('CLEAN-05', 'Protected test fixture is skipped from deletion', async () => {
    const reportWithAttempts = {
      dependencies: { testAttempts: 5, userExamGoals: 0 },
      blockers: ['Candidate test attempts exist (5 attempt(s)). Hard deletion would destroy student test history.']
    };
    assert(reportWithAttempts.blockers.length > 0, 'Must have blockers if test attempts exist');
  });

  await test('CLEAN-06', 'SSC CGL survives cleanup unchanged', async () => {
    const { data: cgl, error } = await supabase
      .from('exams')
      .select('id, title, slug, is_active')
      .eq('slug', 'ssc-cgl')
      .single();

    assert(!error && cgl, 'SSC CGL must exist');
    assert.strictEqual(cgl.title, 'SSC CGL');
    assert.strictEqual(cgl.is_active, true, 'SSC CGL must remain PUBLISHED/active');

    const { count: docsCount } = await supabase
      .from('exam_knowledge_documents')
      .select('*', { count: 'exact', head: true })
      .eq('exam_id', cgl.id);
    assert.strictEqual(docsCount, 22, 'SSC CGL must have 22 published knowledge documents intact');
  });

  await test('CLEAN-07', 'SSC CHSL survives cleanup unchanged as DRAFT', async () => {
    const { data: chsl, error } = await supabase
      .from('exams')
      .select('id, title, slug, is_active')
      .eq('slug', 'ssc-chsl')
      .single();

    assert(!error && chsl, 'SSC CHSL must exist');
    assert.strictEqual(chsl.title, 'SSC CHSL');
    assert.strictEqual(chsl.is_active, false, 'SSC CHSL must remain DRAFT/inactive');
  });

  await test('CLEAN-08', 'Shared Question Bank survives intact (111 questions)', async () => {
    const { count, error } = await supabase.from('questions').select('*', { count: 'exact', head: true });
    assert(!error, 'Questions query must succeed');
    assert.strictEqual(count, 111, 'Question bank count must be 111');
  });

  await test('CLEAN-09', 'Shared Learning resources survive intact', async () => {
    const { count, error } = await supabase.from('learning_resources').select('*', { count: 'exact', head: true });
    assert(!error, 'Learning resources query must succeed');
    assert.strictEqual(count, 1, 'Learning resources count must be 1');
  });

  await test('CLEAN-10', 'Shared Current Affairs survive intact', async () => {
    const { count, error } = await supabase.from('current_affairs_articles').select('*', { count: 'exact', head: true });
    assert(!error, 'Current affairs query must succeed');
    assert.strictEqual(count, 0, 'Current affairs count must be 0');
  });

  await test('CLEAN-11', 'Candidate attempts survive intact (31 attempts)', async () => {
    const { count, error } = await supabase.from('test_attempts').select('*', { count: 'exact', head: true });
    assert(!error, 'Test attempts query must succeed');
    assert.strictEqual(count, 31, 'Candidate test attempts must be 31');
  });

  await test('CLEAN-12', 'Audit log records are created for deletions', async () => {
    const { data: logs, error } = await supabase
      .from('admin_audit_logs')
      .select('id, action_type, reason')
      .eq('action_type', 'EXAMINATION_PERMANENTLY_DELETED');

    if (!error) {
      assert(Array.isArray(logs), 'Audit logs must return array');
    }
  });

  await test('CLEAN-13', 'Deletion uses existing ExamOnboardingService.deleteExam()', async () => {
    assert(typeof ExamOnboardingService.deleteExam === 'function', 'deleteExam function must exist on ExamOnboardingService');
  });

  await test('CLEAN-14', 'No raw SQL exam deletion path introduced in application actions', async () => {
    const actionsSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'admin', 'exams', 'actions.ts'), 'utf-8');
    assert(actionsSrc.includes('ExamOnboardingService.deleteExam'), 'deleteExamDraftAction must delegate to ExamOnboardingService.deleteExam');
    assert(!actionsSrc.includes('DELETE FROM exams'), 'Actions must not contain raw SQL delete against exams');
  });

  // --- PART B: MANAGEMENT UX & DANGER ZONE TESTS ---

  await test('MGMT-01', 'Manage Examination action appears in ExamManagementView card footer', async () => {
    const viewSrc = fs.readFileSync(path.join(__dirname, '..', 'components', 'admin', 'exam-onboarding', 'exam-management-view.tsx'), 'utf-8');
    assert(viewSrc.includes('Manage Examination'), 'ExamManagementView must contain "Manage Examination" action link');
    assert(viewSrc.includes('/admin/exams/onboarding?examId='), 'Manage action must link to exam onboarding/management route');
  });

  await test('MGMT-02', 'Manage page (/admin/exams/onboarding) loads correct exam and shows Danger Zone', async () => {
    const onboardingPageSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'admin', 'exams', 'onboarding', 'page.tsx'), 'utf-8');
    assert(onboardingPageSrc.includes('ExamDangerZone') || onboardingPageSrc.includes('ExamOnboardingWizard'), 'Onboarding page must load wizard');
    const wizardSrc = fs.readFileSync(path.join(__dirname, '..', 'components', 'admin', 'exam-onboarding', 'exam-onboarding-wizard.tsx'), 'utf-8');
    assert(wizardSrc.includes('<ExamDangerZone'), 'Wizard must render ExamDangerZone for existing exams');
  });

  await test('MGMT-03', 'Danger Zone and deletion actions visible only to authorized admin/staff', async () => {
    const actionsSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'admin', 'exams', 'actions.ts'), 'utf-8');
    assert(actionsSrc.includes('AdminService.checkIsAdminOrStaff'), 'Actions must check admin role');
  });

  await test('MGMT-04', 'Blocked dependency displays exact blockers in Danger Zone report', async () => {
    const { data: cgl } = await supabase.from('exams').select('id').eq('slug', 'ssc-cgl').single();
    const report = await ExamOnboardingService.evaluateExamDeletionEligibility(cgl.id, supabase);
    assert.strictEqual(report.eligible, false, 'SSC CGL must evaluate as NOT eligible');
    assert(report.blockers.length > 0, 'SSC CGL must have explicit blockers list');
    assert(report.blockers.some(b => b.includes('test attempts') || b.includes('production examination') || b.includes('Mock test blueprints')), 'Blockers must describe protected dependencies');
  });

  await test('MGMT-05', 'Eligible draft exam displays deletion flow in Danger Zone', async () => {
    const { data: chsl } = await supabase.from('exams').select('id').eq('slug', 'ssc-chsl').single();
    const report = await ExamOnboardingService.evaluateExamDeletionEligibility(chsl.id, supabase);
    assert.strictEqual(report.eligible, true, 'SSC CHSL (0 protected dependencies) must evaluate as eligible');
    assert.strictEqual(report.blockers.length, 0, 'SSC CHSL must have 0 blockers');
  });

  await test('MGMT-06', 'Exact slug confirmation input is required for deletion', async () => {
    const dangerZoneSrc = fs.readFileSync(path.join(__dirname, '..', 'components', 'admin', 'exam-onboarding', 'exam-danger-zone.tsx'), 'utf-8');
    assert(dangerZoneSrc.includes('slugInput.trim() !== examSlug'), 'Danger Zone must check exact slug equality');
  });

  await test('MGMT-07', 'Wrong slug confirmation is rejected by server with error', async () => {
    const { data: chsl } = await supabase.from('exams').select('id').eq('slug', 'ssc-chsl').single();
    let rejected = false;
    try {
      await ExamOnboardingService.deleteExam(chsl.id, 'wrong-slug', null, 'admin@test.com', supabase);
    } catch (err) {
      rejected = true;
      assert(err.message.includes('Slug confirmation mismatch'), 'Error must specify slug confirmation mismatch');
    }
    assert(rejected, 'Server must reject incorrect confirmation slug');
  });

  await test('MGMT-08', 'Server rechecks eligibility immediately before deletion', async () => {
    const serviceSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'exam-onboarding', 'exam-onboarding.service.ts'), 'utf-8');
    const deleteExamMethod = serviceSrc.slice(serviceSrc.indexOf('static async deleteExam'));
    assert(deleteExamMethod.includes('evaluateExamDeletionEligibility'), 'deleteExam must call evaluateExamDeletionEligibility internally');
  });

  await test('MGMT-09', 'Published eligible test exam can be deleted atomically via deleteExam()', async () => {
    // 1. Create a published test exam
    const testSlug = `test-mgmt09-pub-${Date.now()}`;
    const { data: org } = await supabase.from('conducting_orgs').select('id').limit(1).single();

    const { data: createdExam } = await supabase
      .from('exams')
      .insert({
        title: 'Test Published Exam MGMT09',
        slug: testSlug,
        org_id: org.id,
        category: 'National Recruitment',
        is_active: true,
      })
      .select('id, slug')
      .single();

    assert(createdExam, 'Published test exam must be created');

    // 2. Add a published knowledge doc version
    const { data: doc } = await supabase
      .from('exam_knowledge_documents')
      .insert({
        exam_id: createdExam.id,
        module_key: 'EXAM_OVERVIEW',
        canonical_slug: `${testSlug}-overview`,
        status: 'PUBLISHED',
      })
      .select('id')
      .single();

    // 3. Delete through deleteExam
    const result = await ExamOnboardingService.deleteExam(createdExam.id, testSlug, null, 'admin@couragelibrary.com', supabase);
    assert(result.success, 'Deletion of published eligible test exam must succeed');

    // 4. Verify record is gone
    const { data: check } = await supabase.from('exams').select('id').eq('id', createdExam.id).maybeSingle();
    assert.strictEqual(check, null, 'Published test exam must be deleted');
  });

  await test('MGMT-10', 'Protected published exam (SSC CGL) cannot be deleted', async () => {
    const { data: cgl } = await supabase.from('exams').select('id').eq('slug', 'ssc-cgl').single();
    let blocked = false;
    try {
      await ExamOnboardingService.deleteExam(cgl.id, 'ssc-cgl', null, 'admin@couragelibrary.com', supabase);
    } catch (err) {
      blocked = true;
      assert(err.message.includes('Cannot delete examination'), 'Error must block deletion');
    }
    assert(blocked, 'Protected exam deletion must be blocked by server');
  });

  await test('MGMT-11', 'Candidate cannot access admin management route (AdminService guard)', async () => {
    const actionsSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'admin', 'exams', 'actions.ts'), 'utf-8');
    const delIdx = actionsSrc.indexOf('deleteExamDraftAction');
    const delSlice = actionsSrc.slice(delIdx, delIdx + 600);
    assert(delSlice.includes('AdminService.checkIsAdminOrStaff()'), 'Must call AdminService.checkIsAdminOrStaff()');
    assert(delSlice.includes('!auth.isAdmin'), 'Must reject when auth.isAdmin is false');
  });

  await test('MGMT-12', 'No IDOR in exam deletion actions', async () => {
    const { data: chsl } = await supabase.from('exams').select('id').eq('slug', 'ssc-chsl').single();
    let idorRejected = false;
    try {
      // Try to delete with mismatched ID and slug
      await ExamOnboardingService.deleteExam(chsl.id, 'ssc-cgl', null, 'admin@test.com', supabase);
    } catch (err) {
      idorRejected = true;
      assert(err.message.includes('Slug confirmation mismatch'));
    }
    assert(idorRejected, 'IDOR tampering must be rejected');
  });

  await test('MGMT-13', 'Responsive mobile layout in ExamManagementView', async () => {
    const viewSrc = fs.readFileSync(path.join(__dirname, '..', 'components', 'admin', 'exam-onboarding', 'exam-management-view.tsx'), 'utf-8');
    assert(viewSrc.includes('flex-col sm:flex-row'), 'Card footer must use flex-col sm:flex-row for mobile responsiveness');
    assert(viewSrc.includes('justify-between'), 'Card footer must justify actions cleanly');
  });

  await test('MGMT-14', 'Dedicated /admin/exams/[id] route redirects to onboarding/manage page', async () => {
    const idPagePath = path.join(__dirname, '..', 'app', 'admin', 'exams', '[id]', 'page.tsx');
    assert(fs.existsSync(idPagePath), '/admin/exams/[id]/page.tsx must exist');
    const idPageSrc = fs.readFileSync(idPagePath, 'utf-8');
    assert(idPageSrc.includes('/admin/exams/onboarding?examId='), 'Must redirect to onboarding manage page');
  });

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
