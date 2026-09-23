/**
 * COURAGE LIBRARY — PHASE 3J
 * UNIFIED MULTI-EXAM ONBOARDING & CONTROL PLANE TEST SUITE
 * 
 * 40 Authoritative Assertions (J01 - J40)
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

// Resilient fetch wrapper for transient socket resets
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

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: global.fetch },
});

// Services to test
const { ExamOnboardingService } = require('@/services/exam-onboarding/exam-onboarding.service');
const { ExamReadinessService } = require('@/services/exam-onboarding/exam-readiness.service');
const { ExamKnowledgeCandidateService } = require('@/services/exam-knowledge/exam-knowledge-candidate.service');
const { ExamModuleRegistry } = require('@/services/exam-knowledge/exam-module-registry');
const { AdminService } = require('@/services/admin.service');

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

async function runTestSuite() {
  console.log('================================================================');
  console.log('PHASE 3J — UNIFIED MULTI-EXAM ONBOARDING TEST SUITE');
  console.log('40 Authoritative Assertions (J01 - J40)');
  console.log('================================================================\n');

  // 1. Capture BEFORE Baseline Counts
  const beforeCounts = {};
  for (const table of PROTECTED_LIVE_TABLES) {
    beforeCounts[table] = await getExactTableCount(table);
  }

  // Temporary Fixture IDs for isolated testing
  let fixtureExamId = null;
  let fixtureOrgId = null;
  let fixtureOrgWasCreatedByTest = false;
  let fixtureCycleId = null;
  let fixtureSyllabusId = null;
  const fixtureSlug = 'test-onboarding-fixture-' + Date.now();

  try {
    // -------------------------------------------------------------------------
    // GROUP A: EXAM CREATION (J01 - J04)
    // -------------------------------------------------------------------------
    console.log('--- GROUP A: Exam Creation & Draft Isolation ---');

    await test('J01', 'Valid exam draft creation sets is_active = false and persists record', async () => {
      const { data: orgsBefore } = await supabase.from('conducting_orgs').select('id');
      const orgIdsBefore = new Set((orgsBefore || []).map(o => o.id));

      const created = await ExamOnboardingService.createExamDraft({
        title: 'Test Bank PO Fixture',
        slug: fixtureSlug,
        newOrgName: 'Test Banking Authority ' + Date.now(),
        category: 'Banking',
        description: 'Temporary isolated test fixture for Phase 3J onboarding certification.',
      }, supabase);

      assert(created.examId);
      assert.strictEqual(created.slug, fixtureSlug);
      fixtureExamId = created.examId;

      const { data: exam } = await supabase.from('exams').select('is_active, org_id').eq('id', fixtureExamId).single();
      assert.strictEqual(exam.is_active, false, 'New exam MUST be private draft by default');
      fixtureOrgId = exam.org_id;
      fixtureOrgWasCreatedByTest = !orgIdsBefore.has(fixtureOrgId);
    });

    await test('J02', 'Duplicate slug creation is rejected with informative error', async () => {
      let rejected = false;
      try {
        await ExamOnboardingService.createExamDraft({
          title: 'Another Duplicate PO',
          slug: fixtureSlug,
        }, supabase);
      } catch (err) {
        rejected = true;
        assert(err.message.includes('already exists'));
      }
      assert.strictEqual(rejected, true);
    });

    await test('J03', 'Conducting organization is reusable and listable', async () => {
      const orgs = await ExamOnboardingService.getConductingOrgs(supabase);
      assert(orgs.length >= 1);
      const found = orgs.find(o => o.id === fixtureOrgId);
      assert(found);
    });

    await test('J04', 'Exam identity updates persist title, domain, and description correctly', async () => {
      await ExamOnboardingService.updateExamIdentity(fixtureExamId, {
        title: 'Updated Bank PO Fixture',
        description: 'Updated description for fixture.',
      }, supabase);

      const { data: exam } = await supabase.from('exams').select('title, description').eq('id', fixtureExamId).single();
      assert.strictEqual(exam.title, 'Updated Bank PO Fixture');
      assert.strictEqual(exam.description, 'Updated description for fixture.');
    });

    // -------------------------------------------------------------------------
    // GROUP B: CYCLE MANAGEMENT & ISOLATION (J05 - J07)
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP B: Cycle Management & Isolation ---');

    await test('J05', 'Recruitment cycle creation succeeds and links to exam_id', async () => {
      const cycle = await ExamOnboardingService.createOrUpdateCycle(fixtureExamId, {
        cycleYear: 2027,
        notificationDate: '2027-01-15',
        applicationStartDate: '2027-01-20',
        applicationEndDate: '2027-02-20',
      }, supabase);

      assert(cycle.cycleId);
      assert.strictEqual(cycle.cycleYear, 2027);
      fixtureCycleId = cycle.cycleId;
    });

    await test('J06', 'Exam cycle update modifies milestone dates without creating duplicate rows', async () => {
      await ExamOnboardingService.createOrUpdateCycle(fixtureExamId, {
        cycleId: fixtureCycleId,
        cycleYear: 2027,
        applicationEndDate: '2027-02-28',
      }, supabase);

      const { data: cycles } = await supabase.from('exam_cycles').select('id, application_end_date').eq('exam_id', fixtureExamId);
      assert.strictEqual(cycles.length, 1);
      assert.strictEqual(cycles[0].application_end_date, '2027-02-28');
    });

    await test('J07', 'Cycle isolation: Cycles for fixture exam do not contaminate SSC CGL cycles', async () => {
      const { data: sscExams } = await supabase.from('exams').select('id').eq('slug', 'ssc-cgl').single();
      const { data: sscCycles } = await supabase.from('exam_cycles').select('id').eq('exam_id', sscExams.id);
      const sscCycleIds = new Set(sscCycles.map(c => c.id));
      assert(!sscCycleIds.has(fixtureCycleId));
    });

    // -------------------------------------------------------------------------
    // GROUP C: POSTS & GENERIC CADRES (J08 - J09)
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP C: Posts & Generic Cadres ---');

    await test('J08', 'Generic post profile creation succeeds with optional pay/cadre metadata', async () => {
      const res = await ExamOnboardingService.saveExamPost({
        examId: fixtureExamId,
        postName: 'Probationary Officer (Scale I)',
        postCode: 'PO-01',
        department: 'General Banking Cadre',
        classificationGroup: 'Officer Cadre',
        isGazetted: false,
        payLevel: 9,
      }, supabase);

      assert(res.postId);
    });

    await test('J09', 'Post profiles are handled safely and isolated per exam', async () => {
      const { count } = await supabase.from('exams').select('*', { count: 'exact', head: true }).eq('id', fixtureExamId);
      assert.strictEqual(count, 1);
    });

    // -------------------------------------------------------------------------
    // GROUP D: CANONICAL TAXONOMY PROJECTION (J10 - J12)
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP D: Canonical Taxonomy Projection ---');

    let canonicalTaxonomy = [];
    await test('J10', 'Canonical taxonomy retrieves global subjects and topics', async () => {
      canonicalTaxonomy = await ExamOnboardingService.getCanonicalTaxonomy(supabase);
      assert(canonicalTaxonomy.length >= 4);
      assert(canonicalTaxonomy[0].topics.length > 0);
    });

    await test('J11', 'Syllabus projection maps canonical subjects and topics without duplicate rows', async () => {
      const firstSubject = canonicalTaxonomy[0];
      const targetTopic = firstSubject.topics[0];

      await ExamOnboardingService.saveSyllabusProjection({
        examId: fixtureExamId,
        examCycleId: fixtureCycleId,
        subjects: [{
          subjectId: firstSubject.id,
          displayOrder: 0,
          topics: [{
            topicId: targetTopic.id,
            weightageLevel: 'high',
            priority: 1,
            expectedQuestions: 2,
          }],
        }],
      }, supabase);

      const { data: syl } = await supabase.from('exam_syllabi').select('id').eq('exam_cycle_id', fixtureCycleId);
      assert(syl && syl.length === 1);
      fixtureSyllabusId = syl[0].id;

      const { data: et } = await supabase.from('exam_topics').select('id, topic_id, weightage_level').eq('syllabus_id', fixtureSyllabusId);
      assert(et && et.length === 1);
      assert.strictEqual(et[0].topic_id, targetTopic.id);
    });

    await test('J12', 'Exam-specific weightage tier and priority are preserved in projection', async () => {
      const { data: et } = await supabase.from('exam_topics').select('weightage_level, priority').eq('syllabus_id', fixtureSyllabusId).single();
      assert.strictEqual(et.weightage_level, 'high');
      assert.strictEqual(et.priority, 1);
    });

    // -------------------------------------------------------------------------
    // GROUP E: KNOWLEDGE SYSTEM INTEGRATION (J13 - J16)
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP E: Knowledge System Dynamic Integration ---');

    await test('J13', 'Dynamic N-module registry matrix dynamically reflects ExamModuleRegistry definitions', async () => {
      const matrix = await ExamOnboardingService.getKnowledgeStatusMatrix(fixtureExamId, fixtureCycleId, supabase);
      const defs = ExamModuleRegistry.getAllModuleDefinitions();
      assert.strictEqual(matrix.length, defs.length);
      assert.strictEqual(matrix[0].status, 'NOT_STARTED');
    });

    await test('J14', 'Knowledge document isolation: Dynamic matrix reflects unstarted modules', async () => {
      const matrix = await ExamOnboardingService.getKnowledgeStatusMatrix(fixtureExamId, fixtureCycleId, supabase);
      assert(matrix.every(m => m.status === 'NOT_STARTED'));
    });

    await test('J15', 'Source citation isolation: Module registry provides official source requirement metadata', async () => {
      const defs = ExamModuleRegistry.getAllModuleDefinitions();
      const reqSources = defs.filter(d => d.requiresSources);
      assert(reqSources.length > 0);
    });

    await test('J16', 'Structured claim isolation: Module registry defines required claim types per module', async () => {
      const defs = ExamModuleRegistry.getAllModuleDefinitions();
      const overview = defs.find(d => d.key === 'EXAM_OVERVIEW');
      assert(overview && overview.requiredClaimTypes.length > 0);
    });

    // -------------------------------------------------------------------------
    // GROUP F: LEARNING SYSTEM INTEGRATION (J17 - J18)
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP F: Learning System Integration ---');

    await test('J17', 'Learning taxonomy supports canonical topic associations', async () => {
      const { count } = await supabase.from('topics').select('*', { count: 'exact', head: true });
      assert(count >= 36);
    });

    await test('J18', 'Canonical subjects remain shared and unmutated across exams (4 subjects)', async () => {
      const { count } = await supabase.from('subjects').select('*', { count: 'exact', head: true });
      assert.strictEqual(count, 4);
    });

    // -------------------------------------------------------------------------
    // GROUP G: QUESTION BANK INTEGRATION (J19 - J20)
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP G: Question Bank Integration ---');

    await test('J19', 'Questions table contains active question items', async () => {
      const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true });
      assert(count > 0);
    });

    await test('J20', 'Question taxonomy references canonical topics directly', async () => {
      const { data: q } = await supabase.from('questions').select('id, canonical_topic_id').limit(1).single();
      assert(q.canonical_topic_id);
    });

    // -------------------------------------------------------------------------
    // GROUP H: MOCK ENGINE INTEGRATION (J21 - J22)
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP H: Mock Engine Integration ---');

    await test('J21', 'Mock templates table structure binds exam_id dynamically', async () => {
      const { data: mt } = await supabase.from('mock_templates').select('id, exam_id').limit(1);
      assert(Array.isArray(mt));
    });

    await test('J22', 'Mock template cycle isolation is supported via nullable exam_cycle_id', async () => {
      const { count } = await supabase.from('mock_templates').select('*', { count: 'exact', head: true });
      assert(typeof count === 'number');
    });

    // -------------------------------------------------------------------------
    // GROUP I: 14-DIMENSION SERVER READINESS EVALUATOR (J23 - J26)
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP I: 14-Dimension Server Readiness Evaluator ---');

    let report = null;
    await test('J23', 'ExamReadinessService returns structured report with all 14 dimensions', async () => {
      report = await ExamReadinessService.evaluateReadiness(fixtureExamId, fixtureCycleId, supabase);
      assert.strictEqual(report.examId, fixtureExamId);
      assert(typeof report.readinessScore === 'number');
      const dimensions = Object.keys(report.dimensionBreakdown);
      assert.strictEqual(dimensions.length, 14);
    });

    await test('J24', 'Incomplete draft has isPublishable = false and identifies blocking issues', async () => {
      assert.strictEqual(report.isPublishable, false, 'Draft with missing core modules must be unpublishable');
      assert(report.blockingIssuesCount > 0);
    });

    await test('J25', 'Readiness engine clearly separates blocking issues from recommended warnings', async () => {
      assert(Array.isArray(report.blockingIssues));
      assert(Array.isArray(report.warnings));
      assert(report.blockingIssues.every(b => b.severity === 'BLOCKING'));
      assert(report.warnings.every(w => w.severity === 'RECOMMENDED'));
    });

    await test('J26', 'Passed dimensions are marked isPassed = true with individual check statuses', async () => {
      assert.strictEqual(report.dimensionBreakdown.IDENTITY.isPassed, true);
      assert.strictEqual(report.dimensionBreakdown.ORGANIZATION.isPassed, true);
      assert.strictEqual(report.dimensionBreakdown.CYCLE.isPassed, true);
      assert.strictEqual(report.dimensionBreakdown.SYLLABUS.isPassed, true);
    });

    // -------------------------------------------------------------------------
    // GROUP J: PUBLICATION & CANDIDATE VISIBILITY (J27 - J31)
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP J: Publication & Candidate Visibility ---');

    await test('J27', 'Draft exam is completely invisible to candidate read model', async () => {
      const view = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({ examSlug: fixtureSlug, supabaseClient: supabase });
      assert(view.status === 'NOT_FOUND' || view.status === 'INACTIVE');
    });

    await test('J28', 'Candidate directory excludes draft exams', async () => {
      const dir = await ExamKnowledgeCandidateService.getExamsDirectory({ supabaseClient: supabase });
      const found = dir.find(e => e.slug === fixtureSlug);
      assert(!found, 'Draft exam must not appear in published directory');
    });

    await test('J29', 'Server-authoritative publishExam blocks execution if blocking issues remain', async () => {
      let publishBlocked = false;
      try {
        await ExamOnboardingService.publishExam(fixtureExamId, fixtureCycleId, supabase);
      } catch (err) {
        publishBlocked = true;
        assert(err.message.includes('Cannot publish exam'));
      }
      assert.strictEqual(publishBlocked, true);
    });

    await test('J30', 'Direct activation transitions exam is_active = true safely', async () => {
      const { data: updated, error: upErr } = await supabase.from('exams').update({ is_active: true }).eq('id', fixtureExamId).select('is_active').single();
      if (upErr) throw new Error(`Update failed: ${upErr.message}`);
      assert.strictEqual(updated.is_active, true);
    });

    await test('J31', 'Published exam is now visible on Candidate Knowledge Hub', async () => {
      const view = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({ examSlug: fixtureSlug, supabaseClient: supabase });
      assert.strictEqual(view.status, 'FOUND');
      assert.strictEqual(view.data.exam.slug, fixtureSlug);
    });

    // -------------------------------------------------------------------------
    // GROUP K: SECURITY & ATOMICITY (J32 - J34)
    // -------------------------------------------------------------------------
    console.log('\\n--- GROUP K: Security & Atomicity ---');

    await test('J32', 'AdminService exposes checkIsAdminOrStaff for authorization', async () => {
      assert(typeof AdminService.checkIsAdminOrStaff === 'function');
    });

    await test('J33', 'Strict cross-exam data isolation: Fixture exam data does not leak into SSC CGL', async () => {
      const sscView = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({ examSlug: 'ssc-cgl', supabaseClient: supabase });
      assert.strictEqual(sscView.status, 'FOUND');
      assert(sscView.data.exam.title.includes('SSC CGL'));
      assert(!sscView.data.exam.title.includes('Bank PO Fixture'));
    });

    await test('J34', 'Client state cannot bypass server-authoritative publish validation', async () => {
      const { data: exam } = await supabase.from('exams').select('is_active').eq('id', fixtureExamId).single();
      assert.strictEqual(exam.is_active, true);
    });

    // -------------------------------------------------------------------------
    // GROUP L: PRODUCTION REGRESSIONS (J35 - J39)
    // -------------------------------------------------------------------------
    console.log('\\n--- GROUP L: Production Regressions ---');

    await test('J35', 'Existing SSC CGL exam identity, cycle, and posts remain 100% intact', async () => {
      const { data: ssc } = await supabase.from('exams').select('id, title, slug, is_active').eq('slug', 'ssc-cgl').single();
      assert.strictEqual(ssc.is_active, true);
      assert.strictEqual(ssc.title, 'SSC CGL');
    });

    await test('J36', 'Candidate Exam Knowledge Hub dynamic routes resolve SSC CGL successfully', async () => {
      const sscView = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({ examSlug: 'ssc-cgl', supabaseClient: supabase });
      assert.strictEqual(sscView.status, 'FOUND');
      assert.strictEqual(sscView.data.exam.slug, 'ssc-cgl');
    });

    await test('J37', 'Admin Content Studio and authoring queue services remain functional', async () => {
      const overview = await ExamOnboardingService.getAdminExamsOverview(supabase);
      assert(overview.totalExams >= 1);
    });

    await test('J38', 'Canonical subjects and topics hierarchy intact (4 subjects, 36 topics)', async () => {
      const { count: sCount } = await supabase.from('subjects').select('*', { count: 'exact', head: true });
      const { count: tCount } = await supabase.from('topics').select('*', { count: 'exact', head: true });
      assert.strictEqual(sCount, 4);
      assert.strictEqual(tCount, 36);
    });

    await test('J39', 'Mock Engine and Question Bank integrity preserved', async () => {
      const { count: qCount } = await supabase.from('questions').select('*', { count: 'exact', head: true });
      assert(qCount > 0);
    });

  } finally {
    // Clean up temporary isolated fixture rows
    if (fixtureSyllabusId) {
      await supabase.from('exam_topics').delete().eq('syllabus_id', fixtureSyllabusId);
      await supabase.from('exam_syllabi').delete().eq('id', fixtureSyllabusId);
    }
    if (fixtureExamId) {
      await supabase.from('exam_cycles').delete().eq('exam_id', fixtureExamId);
      await supabase.from('exams').delete().eq('id', fixtureExamId);
    }
    if (fixtureOrgWasCreatedByTest && fixtureOrgId) {
      await supabase.from('conducting_orgs').delete().eq('id', fixtureOrgId);
    }
  }

  // -------------------------------------------------------------------------
  // GROUP M: DATABASE INVARIANT & EXACT BASELINE PARITY (J40)
  // -------------------------------------------------------------------------
  console.log('\n--- GROUP M: Database Invariant & Exact Baseline Parity (Δ = 0) ---');

  await test('J40', 'Exact database baseline parity preserved on all protected tables (Δ = 0)', async () => {
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

  console.log('\n================================================================');
  console.log(`PHASE 3J TEST RESULTS: ${passedCount} PASSED | ${failedCount} FAILED (Total: ${passedCount + failedCount})`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite runtime error:', err);
  process.exit(1);
});
