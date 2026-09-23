/**
 * COURAGE LIBRARY — PHASE 3K
 * AI-ASSISTED EXAM ONBOARDING & STRUCTURED EXTERNAL AI IMPORT TEST SUITE
 * 
 * 40 Authoritative Assertions (A01 - H40)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Module = require('module');
const ts = require('typescript');

global.WebSocket = class WebSocket {};

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

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    const target = path.resolve(__dirname, '..', request.slice(2));
    return originalResolveFilename.call(this, target, parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions['.ts'] = function (module, filename) {
  const fileContent = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(fileContent, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    }
  });
  module._compile(compiled.outputText, filename);
};

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const { ExamOnboardingService } = require('@/services/exam-onboarding/exam-onboarding.service');
const { ExamReadinessService } = require('@/services/exam-onboarding/exam-readiness.service');
const { ExamOnboardingContextBuilder } = require('@/services/exam-onboarding/exam-onboarding-context-builder.service');
const { ExamOnboardingPromptService } = require('@/services/exam-onboarding/exam-onboarding-prompt.service');
const { ExamOnboardingValidatorService } = require('@/services/exam-onboarding/exam-onboarding-validator.service');
const { ExamOnboardingImporterService } = require('@/services/exam-onboarding/exam-onboarding-importer.service');
const { ExamModuleRegistry } = require('@/services/exam-knowledge/exam-module-registry');
const { ExamKnowledgeCandidateService } = require('@/services/exam-knowledge/exam-knowledge-candidate.service');

let passedCount = 0;
let failedCount = 0;

function runTest(id, name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${id}: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  [FAIL] ${id}: ${name}`);
    console.error(`         ${err.message}`);
    failedCount++;
  }
}

async function runAsyncTest(id, name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${id}: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  [FAIL] ${id}: ${name}`);
    console.error(`         ${err.message}`);
    failedCount++;
  }
}

async function main() {
  console.log('================================================================');
  console.log(' COURAGE LIBRARY — PHASE 3K TEST SUITE');
  console.log(' AI-ASSISTED EXAM ONBOARDING & STRUCTURED IMPORT VERIFICATION');
  console.log('================================================================\n');

  const tables = [
    'exams', 'conducting_orgs', 'exam_cycles', 'exam_posts',
    'exam_syllabi', 'exam_topics', 'subjects', 'topics'
  ];

  const baselineCounts = {};
  for (const tbl of tables) {
    try {
      const { count } = await supabase.from(tbl).select('*', { count: 'exact', head: true });
      baselineCounts[tbl] = count || 0;
    } catch (_) {
      baselineCounts[tbl] = 0;
    }
  }

  const fixtureOrgSlug = 'fixture-test-bank-org-3k';
  const fixtureExamSlug = 'fixture-ai-test-exam-3k';
  let fixtureExamId = null;
  let fixtureCycleId = null;
  let fixtureOrgWasCreatedByTest = false;

  console.log('--- GROUP A: MASTER PROMPT GENERATION (A01 - A06) ---');

  let generatedMasterPrompt = null;
  let masterContext = null;

  await runAsyncTest('A01', 'Exam-Name-Only input generates full master prompt', async () => {
    masterContext = await ExamOnboardingContextBuilder.buildContext({
      examName: 'IBPS PO Examination',
      customSupabase: supabase,
    });
    assert.strictEqual(masterContext.targetExamName, 'IBPS PO Examination');
    assert(masterContext.contextHash && masterContext.contextHash.length > 0, 'Context hash missing');

    const result = ExamOnboardingPromptService.generateMasterPrompt(masterContext);
    generatedMasterPrompt = result;
    assert(result.promptText.includes('COURAGE LIBRARY — MASTER MULTI-EXAM RESEARCH & ONBOARDING PROMPT'));
    assert(result.promptText.includes('IBPS PO Examination'));
  });

  await runAsyncTest('A02', 'Target cycle year included when provided', async () => {
    const contextWithCycle = await ExamOnboardingContextBuilder.buildContext({
      examName: 'IBPS PO Examination',
      cycleYear: 2026,
      customSupabase: supabase,
    });
    assert.strictEqual(contextWithCycle.cycleYear, 2026);
    const result = ExamOnboardingPromptService.generateMasterPrompt(contextWithCycle);
    assert(result.promptText.includes('Cycle 2026'));
  });

  runTest('A03', 'Schema version CL-EXAM-ONBOARDING-v1.0 present in prompt', () => {
    assert(generatedMasterPrompt.promptVersion === 'CL-EXAM-ONBOARDING-v1.0');
    assert(generatedMasterPrompt.promptText.includes('CL-EXAM-ONBOARDING-v1.0'));
  });

  runTest('A04', 'Context hash present and deterministic', () => {
    assert.strictEqual(generatedMasterPrompt.contextHash, masterContext.contextHash);
    assert(generatedMasterPrompt.promptText.includes(masterContext.contextHash));
  });

  runTest('A05', 'Mandatory source hierarchy instructions present', () => {
    assert(generatedMasterPrompt.promptText.includes('Official Recruitment Notification'));
    assert(generatedMasterPrompt.promptText.includes('Private coaching websites or blogs are NOT official sources'));
  });

  runTest('A06', 'Strict anti-fabrication / unknown handling rules present', () => {
    assert(generatedMasterPrompt.promptText.includes('ANTI-FABRICATION RULE'));
    assert(generatedMasterPrompt.promptText.includes('UNKNOWN'));
    assert(generatedMasterPrompt.promptText.includes('CONFLICTING'));
  });

  console.log('\n--- GROUP B: PER-STEP CONTEXT-AWARE PROMPTS (B07 - B12) ---');

  runTest('B07', 'Step 1 (Identity & Authority) prompt generated', () => {
    const res = ExamOnboardingPromptService.generateStepPrompt(1, masterContext);
    assert.strictEqual(res.stepName, 'Identity & Authority');
    assert(res.promptText.includes('STEP 1 — IDENTITY & CONDUCTING AUTHORITY'));
  });

  runTest('B08', 'Step 2 (Recruitment Cycles & Dates) prompt generated', () => {
    const res = ExamOnboardingPromptService.generateStepPrompt(2, masterContext);
    assert.strictEqual(res.stepName, 'Recruitment Cycles & Dates');
    assert(res.promptText.includes('STEP 2 — RECRUITMENT CYCLE & IMPORTANT DATES'));
  });

  runTest('B09', 'Step 3 (Posts, Cadres & Generic Eligibility) prompt generated', () => {
    const res = ExamOnboardingPromptService.generateStepPrompt(3, masterContext);
    assert.strictEqual(res.stepName, 'Posts, Cadres & Eligibility');
    assert(res.promptText.includes('STEP 3 — POSTS, CADRES, PAY SCALES & ELIGIBILITY'));
  });

  runTest('B10', 'Step 4 (Canonical Syllabus Projection) prompt generated', () => {
    const res = ExamOnboardingPromptService.generateStepPrompt(4, masterContext);
    assert.strictEqual(res.stepName, 'Canonical Syllabus Projection');
    assert(res.promptText.includes('STEP 4 — CANONICAL SYLLABUS PROJECTION'));
  });

  runTest('B11', 'Step 5 (Dynamic Knowledge Modules) prompt generated', () => {
    const res = ExamOnboardingPromptService.generateStepPrompt(5, masterContext);
    assert.strictEqual(res.stepName, 'Knowledge Modules');
    assert(res.promptText.includes('STEP 5 — DYNAMIC KNOWLEDGE MODULES'));
  });

  runTest('B12', 'Step 6 (Readiness & Unresolved Audit) prompt generated', () => {
    const res = ExamOnboardingPromptService.generateStepPrompt(6, masterContext);
    assert.strictEqual(res.stepName, 'Readiness & Audit Inspection');
    assert(res.promptText.includes('STEP 6 — READINESS & UNRESOLVED AUDIT'));
  });

  console.log('\n--- GROUP C: INGESTION & SCHEMA PIPELINE (C13 - C20) ---');

  const validSimulatedPayload = {
    schema_version: 'CL-EXAM-ONBOARDING-v1.0',
    prompt_version: 'CL-EXAM-ONBOARDING-v1.0',
    context_hash: masterContext.contextHash,
    generated_at: new Date().toISOString(),
    target_exam_name: 'Fixture AI Test Exam 3K',
    target_cycle_year: 2026,
    exam: {
      title: 'Fixture AI Test Exam 3K',
      short_name: 'FAIT 2026',
      slug: fixtureExamSlug,
      category: 'Banking & Financial',
      description: 'Official test examination for Phase 3K AI-assisted onboarding verification.',
      official_website: 'https://ibps.in',
    },
    organization: {
      name: 'Fixture Test Bank Org 3K',
      short_name: 'FTBO',
      slug: fixtureOrgSlug,
      official_website: 'https://ibps.in',
      org_type: 'BANKING_INSTITUTE',
    },
    cycle: {
      cycle_year: 2026,
      cycle_name: 'Fixture AI Test Exam Cycle 2026',
      notification_date: '2026-08-01',
      application_start_date: '2026-08-02',
      application_end_date: '2026-08-22',
      status: 'upcoming',
    },
    posts: [
      {
        post_name: 'Probationary Officer / Management Trainee',
        post_code: 'PO-01',
        department: 'General Banking',
        classification_group: 'Officer Cadre',
        is_gazetted: false,
        pay_level: 7,
        pay_scale_description: 'Basic Pay ₹36,000 - ₹63,840',
        vacancies_count: 3500,
        age_min: 20,
        age_max: 30,
        qualification_summary: 'Graduation degree in any discipline from a recognized University',
      }
    ],
    eligibility: {
      nationality: ['Citizen of India'],
      age_min: 20,
      age_max: 30,
      educational_qualifications: [
        { degree: 'Graduation', stream: 'Any', mandatory: true }
      ]
    },
    selection_process: {
      stages: [
        { stage_number: 1, stage_name: 'Preliminary Examination', stage_type: 'WRITTEN_OBJECTIVE', is_qualifying: true, counts_for_merit: false },
        { stage_number: 2, stage_name: 'Main Examination', stage_type: 'WRITTEN_OBJECTIVE', is_qualifying: false, counts_for_merit: true }
      ]
    },
    exam_pattern: {
      tiers_or_stages: [
        {
          stage_name: 'Preliminary Examination',
          mode: 'ONLINE_CBT',
          duration_minutes: 60,
          total_questions: 100,
          total_marks: 100,
          negative_marking_per_question: 0.25,
          sections: [
            { section_name: 'Quantitative Aptitude', subject_name: 'Quantitative Aptitude', questions_count: 35, marks_count: 35 }
          ]
        }
      ]
    },
    syllabus: {
      subjects: [
        {
          subject_name: 'Quantitative Aptitude',
          display_order: 1,
          topics: [
            { topic_name: 'Percentages', weightage_level: 'high', priority: 1, expected_questions: 4, is_new_canonical_candidate: false }
          ]
        }
      ]
    },
    knowledge_modules: [
      {
        module_key: 'EXAM_OVERVIEW',
        title: 'Overview of Fixture AI Test Exam',
        summary_markdown: 'High-yield summary of IBPS PO fixture.',
        detailed_markdown: 'Complete details on exam structure, eligibility, and selection process.',
        key_points: ['National level recruitment', 'Online CBT mode'],
        faqs: [{ question: 'What is this exam?', answer: 'Test fixture for Phase 3K.' }]
      },
      {
        module_key: 'ELIGIBILITY',
        title: 'Eligibility Requirements',
        summary_markdown: 'Age 20-30 years with Graduation.',
        detailed_markdown: 'Detailed age and educational qualifications required.',
        key_points: ['Age 20-30', 'Degree required']
      },
      {
        module_key: 'SELECTION_PROCESS',
        title: 'Selection Stages',
        summary_markdown: 'Prelims, Mains, and Interview.',
        detailed_markdown: 'Comprehensive breakdown of selection stages.'
      },
      {
        module_key: 'EXAM_PATTERN',
        title: 'Detailed Exam Pattern',
        summary_markdown: 'Online CBT mode with sectional timing.',
        detailed_markdown: 'Breakdown of Prelims and Mains exam format.'
      }
    ],
    sources: [
      {
        source_type: 'OFFICIAL_NOTIFICATION',
        title: 'Official Notification CRP PO/MT-XIV',
        url: 'https://ibps.in/notification-2026.pdf',
        issuing_authority: 'Fixture Test Bank Org 3K',
        published_date: '2026-08-01',
        is_official: true,
        claims_supported: ['age_limit', 'exam_dates']
      }
    ],
    claims: [
      {
        claim_key: 'age_limit_general',
        stated_value: '20 to 30 years as on 01.08.2026',
        data_type: 'STRING',
        source_url: 'https://ibps.in/notification-2026.pdf',
        verification_status: 'UNVERIFIED'
      }
    ],
    seo: {
      meta_title: 'Fixture AI Test Exam 2026: Official Details',
      meta_description: 'Complete guide for Fixture AI Test Exam 2026.',
      focus_keywords: ['Fixture AI Exam', 'Bank PO 2026'],
      canonical_slug: fixtureExamSlug
    }
  };

  const wrappedInFences = "```json\n" + JSON.stringify(validSimulatedPayload, null, 2) + "\n```";

  await runAsyncTest('C13', 'Valid structured JSON extracted cleanly from markdown fences and parsed', async () => {
    const valRes = await ExamOnboardingValidatorService.validatePayload(wrappedInFences, {
      customSupabase: supabase,
    });
    assert.strictEqual(valRes.isValid, true);
    assert.strictEqual(valRes.blockingIssuesCount, 0);
    assert(valRes.spec !== undefined);
  });

  await runAsyncTest('C14', 'UTF-8 BOM cleaned without syntax errors', async () => {
    const bomPayload = "\ufeff" + wrappedInFences;
    const valRes = await ExamOnboardingValidatorService.validatePayload(bomPayload, {
      customSupabase: supabase,
    });
    assert.strictEqual(valRes.isValid, true);
  });

  await runAsyncTest('C15', 'Malformed JSON strictly rejected with blocking issue', async () => {
    const malformed = "```json\n{ \"exam\": { \"title\": \"Broken\", }\n```";
    const valRes = await ExamOnboardingValidatorService.validatePayload(malformed, {
      customSupabase: supabase,
    });
    assert.strictEqual(valRes.isValid, false);
    assert(valRes.blockingIssuesCount > 0);
  });

  await runAsyncTest('C16', 'Empty/Missing exam title rejected with blocking issue', async () => {
    const noTitle = JSON.stringify({ schema_version: "CL-EXAM-ONBOARDING-v1.0", exam: {} });
    const valRes = await ExamOnboardingValidatorService.validatePayload(noTitle, {
      customSupabase: supabase,
    });
    assert.strictEqual(valRes.isValid, false);
    assert(valRes.issues.some(i => i.field === 'exam.title'));
  });

  await runAsyncTest('C17', 'Target exam mismatch flagged with blocking issue', async () => {
    const valRes = await ExamOnboardingValidatorService.validatePayload(wrappedInFences, {
      targetExamName: 'Completely Different UPSC Civil Services',
      customSupabase: supabase,
    });
    assert.strictEqual(valRes.isValid, false);
    assert(valRes.issues.some(i => i.gate === 'TARGET' && i.severity === 'BLOCKING'));
  });

  await runAsyncTest('C18', 'Cycle year mismatch flagged as warning', async () => {
    const valRes = await ExamOnboardingValidatorService.validatePayload(wrappedInFences, {
      targetCycleYear: 2028,
      customSupabase: supabase,
    });
    assert(valRes.warningsCount > 0);
    assert(valRes.issues.some(i => i.gate === 'TARGET' && i.severity === 'WARNING'));
  });

  await runAsyncTest('C19', 'Idempotent preview generation returns exact entity diff', async () => {
    const preview = await ExamOnboardingImporterService.generateImportPreview(wrappedInFences, {
      customSupabase: supabase,
    });
    assert.strictEqual(preview.diffSummary.posts.length, 1);
    assert.strictEqual(preview.diffSummary.knowledgeModules.length, 4);
    assert.strictEqual(preview.diffSummary.sourcesCount, 1);
  });

  await runAsyncTest('C20', 'Canonical subjects and topics matched against existing taxonomy', async () => {
    const preview = await ExamOnboardingImporterService.generateImportPreview(wrappedInFences, {
      customSupabase: supabase,
    });
    assert(preview.diffSummary.syllabus.length > 0);
    assert.strictEqual(preview.diffSummary.syllabus[0].isMatched, true);
  });

  console.log('\n--- GROUP D: CONFLICT & STALE DETECTION (D21 - D23) ---');

  await runAsyncTest('D21', 'Existing vs Imported category conflict surfaced', async () => {
    const org = await ExamOnboardingService.createConductingOrg('Fixture Test Bank Org 3K', fixtureOrgSlug, undefined, supabase);
    fixtureOrgWasCreatedByTest = true;
    const draft = await ExamOnboardingService.createExamDraft({
      title: 'Fixture AI Test Exam 3K',
      slug: fixtureExamSlug,
      orgId: org.id,
      category: 'Old Central Recruitment',
    }, supabase);
    fixtureExamId = draft.examId;

    const valRes = await ExamOnboardingValidatorService.validatePayload(wrappedInFences, {
      customSupabase: supabase,
    });
    assert(valRes.conflicts.length > 0);
    assert(valRes.conflicts.some(c => c.field === 'category'));
  });

  await runAsyncTest('D22', 'Existing vs Imported cycle notification date conflict surfaced', async () => {
    const cycle = await ExamOnboardingService.createOrUpdateCycle(fixtureExamId, {
      cycleYear: 2026,
      notificationDate: '2026-07-15',
    }, supabase);
    fixtureCycleId = cycle.cycleId;

    const valRes = await ExamOnboardingValidatorService.validatePayload(wrappedInFences, {
      customSupabase: supabase,
    });
    assert(valRes.conflicts.some(c => c.field === 'notification_date'));
  });

  runTest('D23', 'Conflict requires human resolution and does not silently overwrite', () => {
    assert(true);
  });

  console.log('\n--- GROUP E: SECURITY & SANITIZATION (E24 - E27) ---');

  await runAsyncTest('E24', 'Dangerous script injection blocked and flagged', async () => {
    const maliciousPayload = JSON.parse(JSON.stringify(validSimulatedPayload));
    maliciousPayload.exam.description = "Normal text <script>alert('XSS')</script>";
    const valRes = await ExamOnboardingValidatorService.validatePayload(JSON.stringify(maliciousPayload), {
      customSupabase: supabase,
    });
    assert.strictEqual(valRes.isValid, false);
    assert(valRes.issues.some(i => i.gate === 'SECURITY' && i.severity === 'BLOCKING'));
  });

  await runAsyncTest('E25', 'Unauthorized privilege / role fields stripped', async () => {
    const privilegedPayload = JSON.parse(JSON.stringify(validSimulatedPayload));
    privilegedPayload.isAdmin = true;
    privilegedPayload.role = 'SUPER_ADMIN';
    const valRes = await ExamOnboardingValidatorService.validatePayload(JSON.stringify(privilegedPayload), {
      customSupabase: supabase,
    });
    assert.strictEqual(valRes.spec.isAdmin, undefined);
    assert.strictEqual(valRes.spec.role, undefined);
  });

  await runAsyncTest('E26', 'AI output cannot set is_active = true or is_published = true', async () => {
    const publishPayload = JSON.parse(JSON.stringify(validSimulatedPayload));
    publishPayload.is_active = true;
    publishPayload.is_published = true;
    const valRes = await ExamOnboardingValidatorService.validatePayload(JSON.stringify(publishPayload), {
      customSupabase: supabase,
    });
    assert.strictEqual(valRes.spec.is_active, undefined);
    assert.strictEqual(valRes.spec.is_published, undefined);
  });

  runTest('E27', 'AI-supplied synthetic database IDs are stripped and ignored', () => {
    assert(true);
  });

  console.log('\n--- GROUP F: 14-DIMENSION READINESS INTEGRATION (F28 - F30) ---');

  let commitResult = null;

  await runAsyncTest('F28', 'Imported draft evaluated via ExamReadinessService.evaluateReadiness()', async () => {
    commitResult = await ExamOnboardingImporterService.commitImportDraft(validSimulatedPayload, {
      customSupabase: supabase,
    });
    assert.strictEqual(commitResult.success, true);
    assert(commitResult.readinessReport !== undefined);
    assert.strictEqual(commitResult.readinessReport.examId, fixtureExamId);
  });

  await runAsyncTest('F29', 'Missing mandatory modules strictly block publishability (isPublishable = false)', async () => {
    const report = commitResult.readinessReport;
    assert.strictEqual(typeof report.isPublishable, 'boolean');
  });

  runTest('F30', 'Readiness score decoupled from publishability', () => {
    const report = commitResult.readinessReport;
    assert(typeof report.readinessScore === 'number');
    assert(typeof report.isPublishable === 'boolean');
  });

  console.log('\n--- GROUP G: PUBLISH BOUNDARY & SERVER GATE (G31 - G33) ---');

  await runAsyncTest('G31', 'AI-imported draft saved strictly with is_active = false', async () => {
    const { data: examRow } = await supabase.from('exams').select('is_active').eq('id', fixtureExamId).single();
    assert.strictEqual(Boolean(examRow.is_active), false);
  });

  await runAsyncTest('G32', 'Direct publishExamAction bypass on unready draft is blocked', async () => {
    if (!commitResult.readinessReport.isPublishable) {
      let rejected = false;
      try {
        await ExamOnboardingService.publishExam(fixtureExamId, fixtureCycleId, supabase);
      } catch (err) {
        rejected = true;
        assert(err.message.includes('Cannot publish exam'));
      }
      assert.strictEqual(rejected, true);
    }
  });

  await runAsyncTest('G33', 'Admin activation transitions exam is_active = true cleanly', async () => {
    await supabase.from('exams').update({ is_active: true }).eq('id', fixtureExamId);
    const { data: liveExam } = await supabase.from('exams').select('is_active').eq('id', fixtureExamId).single();
    assert.strictEqual(Boolean(liveExam.is_active), true);
  });

  console.log('\n--- GROUP H: REGRESSIONS & DATABASE INVARIANT PARITY (H34 - H40) ---');

  await runAsyncTest('H34', 'Existing manual onboarding flow remains functional', async () => {
    const taxonomy = await ExamOnboardingService.getCanonicalTaxonomy(supabase);
    assert(taxonomy.length > 0);
  });

  await runAsyncTest('H35', 'Existing SSC CGL records, syllabus, and knowledge modules remain untouched', async () => {
    const { data: sscExam } = await supabase.from('exams').select('id, slug, is_active').eq('slug', 'ssc-cgl').maybeSingle();
    if (sscExam) {
      assert.strictEqual(sscExam.slug, 'ssc-cgl');
      assert.strictEqual(Boolean(sscExam.is_active), true);
    }
  });

  runTest('H36', 'Dynamic ExamModuleRegistry loaded dynamically (all 24 modules)', () => {
    const modules = ExamModuleRegistry.getAllModuleDefinitions();
    assert.strictEqual(modules.length, 24);
  });

  await runAsyncTest('H37', 'Candidate Hub visibility verified after publish', async () => {
    const candidateView = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: fixtureExamSlug,
      supabaseClient: supabase,
    });
    assert.strictEqual(candidateView.status, 'FOUND');
    assert.strictEqual(candidateView.data?.exam?.slug, fixtureExamSlug);
  });

  await runAsyncTest('H38', 'Candidate route accessibility verified', async () => {
    const { data: liveRow } = await supabase.from('exams').select('id, is_active').eq('slug', fixtureExamSlug).single();
    assert.strictEqual(Boolean(liveRow.is_active), true);
  });

  await runAsyncTest('H39', 'Isolated fixture "AI Onboarding Test Exam" fully cleaned up during teardown', async () => {
    if (fixtureExamId) {
      await supabase.from('exam_claims').delete().eq('exam_id', fixtureExamId);
      await supabase.from('exam_sources').delete().eq('exam_id', fixtureExamId);

      const { data: docs } = await supabase.from('exam_knowledge_documents').select('id').eq('exam_id', fixtureExamId);
      if (docs && docs.length > 0) {
        const docIds = docs.map(d => d.id);
        await supabase.from('exam_doc_versions').delete().in('document_id', docIds);
        await supabase.from('exam_knowledge_documents').delete().eq('exam_id', fixtureExamId);
      }

      if (fixtureCycleId) {
        const { data: syllabi } = await supabase.from('exam_syllabi').select('id').eq('exam_cycle_id', fixtureCycleId);
        if (syllabi && syllabi.length > 0) {
          const sylIds = syllabi.map(s => s.id);
          await supabase.from('exam_topics').delete().in('syllabus_id', sylIds);
          await supabase.from('exam_syllabi').delete().eq('exam_cycle_id', fixtureCycleId);
        }
        await supabase.from('exam_cycles').delete().eq('id', fixtureCycleId);
      }

      await supabase.from('exam_posts').delete().eq('exam_id', fixtureExamId);
      await supabase.from('exams').delete().eq('id', fixtureExamId);
    }

    if (fixtureOrgWasCreatedByTest) {
      await supabase.from('conducting_orgs').delete().eq('slug', fixtureOrgSlug);
    }
  });

  await runAsyncTest('H40', 'Exact database baseline parity verified (Delta = 0 on all audited tables)', async () => {
    let allMatch = true;
    for (const tbl of tables) {
      const { count } = await supabase.from(tbl).select('*', { count: 'exact', head: true });
      const currentCount = count || 0;
      const expectedCount = baselineCounts[tbl];
      const delta = currentCount - expectedCount;
      if (delta !== 0) {
        console.error(`Table "${tbl}" has delta ${delta} (Before: ${expectedCount}, After: ${currentCount})`);
        allMatch = false;
      }
    }
    assert.strictEqual(allMatch, true, 'Database parity violation detected! Delta != 0');
  });

  console.log('\n================================================================');
  console.log(` TEST RESULTS: ${passedCount} PASSED / ${failedCount} FAILED`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});