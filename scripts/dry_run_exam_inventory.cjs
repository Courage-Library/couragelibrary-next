const fs = require('fs');
const path = require('path');
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

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { ExamOnboardingService } = require('@/services/exam-onboarding/exam-onboarding.service');

async function runInventory() {
  console.log('Fetching all exams and their exact server-evaluated dependencies...');

  const { data: exams, error: examsErr } = await supabase
    .from('exams')
    .select(`
      id,
      title,
      slug,
      is_active,
      category,
      created_at,
      conducting_orgs ( id, name, slug )
    `)
    .order('created_at', { ascending: true });

  if (examsErr) {
    console.error('Error fetching exams:', examsErr);
    return;
  }

  console.log(`Total exams found in public.exams: ${exams.length}\n`);

  const results = [];

  let idx = 0;
  for (const exam of exams) {
    idx++;
    console.log(`[${idx}/${exams.length}] Evaluating "${exam.title}" (${exam.slug})...`);
    const examId = exam.id;

    // Call authoritative evaluateExamDeletionEligibility
    const eligibilityReport = await ExamOnboardingService.evaluateExamDeletionEligibility(examId, supabase);

    // Cycles
    const { data: cycles } = await supabase
      .from('exam_cycles')
      .select('id, cycle_year, status')
      .eq('exam_id', examId);
    const cycleList = (cycles || []).map(c => `${c.cycle_year} (${c.status})`).join(', ') || 'None';

    // Knowledge Documents
    const { data: docs } = await supabase
      .from('exam_knowledge_documents')
      .select('id, status')
      .eq('exam_id', examId);
    const totalDocs = docs?.length || 0;
    const publishedDocs = docs?.filter(d => d.status === 'PUBLISHED').length || 0;

    // Readiness data
    let readinessRecords = 0;
    try {
      const { count: rc } = await supabase
        .from('exam_readiness_history')
        .select('id', { count: 'exact', head: true })
        .eq('exam_id', examId);
      readinessRecords = rc || 0;
    } catch (_) {}

    // Test Fixture classification:
    // Strictly identify development/test artifacts based on explicit naming / test signatures.
    // Canonical production exams (SSC CGL, SSC CHSL, SSC MTS, SSC GD, etc.) are NOT test fixtures.
    const titleLower = exam.title.toLowerCase();
    const slugLower = exam.slug.toLowerCase();

    const isTestFixture = (
      titleLower.startsWith('test ') ||
      titleLower.startsWith('test-') ||
      titleLower.includes('phase 3') ||
      titleLower.includes('phase3') ||
      titleLower.includes('regression') ||
      titleLower.includes('mock blueprint') ||
      titleLower.includes('forensic') ||
      titleLower.includes('dummy') ||
      titleLower.includes('diff & version history') ||
      slugLower.startsWith('test-') ||
      slugLower.includes('phase3') ||
      slugLower.includes('phase-3') ||
      slugLower.includes('dummy') ||
      slugLower.includes('sample-exam')
    );

    const protectedDepsList = [];
    if (eligibilityReport.dependencies.testAttempts > 0) protectedDepsList.push(`Attempts: ${eligibilityReport.dependencies.testAttempts}`);
    if (eligibilityReport.dependencies.userExamGoals > 0) protectedDepsList.push(`Goals: ${eligibilityReport.dependencies.userExamGoals}`);
    if (eligibilityReport.dependencies.mockTemplates > 0) protectedDepsList.push(`MockTemplates: ${eligibilityReport.dependencies.mockTemplates}`);
    if (eligibilityReport.dependencies.questionMappings > 0) protectedDepsList.push(`QuestionMappings: ${eligibilityReport.dependencies.questionMappings}`);
    if (eligibilityReport.dependencies.competitionTests > 0) protectedDepsList.push(`CompetitionTests: ${eligibilityReport.dependencies.competitionTests}`);
    if (eligibilityReport.dependencies.mockTests > 0) protectedDepsList.push(`MockTests: ${eligibilityReport.dependencies.mockTests}`);

    results.push({
      id: exam.id,
      title: exam.title,
      slug: exam.slug,
      status: exam.is_active ? 'PUBLISHED' : 'DRAFT',
      isActive: exam.is_active,
      org: exam.conducting_orgs?.name || 'N/A',
      cycle: cycleList,
      attempts: eligibilityReport.dependencies.testAttempts,
      mockTemplates: eligibilityReport.dependencies.mockTemplates,
      mockTests: eligibilityReport.dependencies.mockTests,
      goals: eligibilityReport.dependencies.userExamGoals,
      liveTests: eligibilityReport.dependencies.competitionTests,
      questionMappings: eligibilityReport.dependencies.questionMappings,
      knowledgeDocs: totalDocs,
      publishedDocs,
      readinessRecords,
      protectedDepsStr: protectedDepsList.join('; ') || 'None',
      isTestFixture,
      isEligible: eligibilityReport.eligible,
      blockers: eligibilityReport.blockers,
      warnings: eligibilityReport.warnings,
      reason: eligibilityReport.reason,
      createdAt: exam.created_at
    });
  }

  console.log('=== DRY-RUN INVENTORY SUMMARY TABLE ===\n');
  console.table(results.map(r => ({
    Title: r.title.length > 30 ? r.title.slice(0, 27) + '...' : r.title,
    Slug: r.slug.length > 25 ? r.slug.slice(0, 22) + '...' : r.slug,
    Status: r.status,
    Active: r.isActive,
    'Protected Deps': r.protectedDepsStr,
    'Test?': r.isTestFixture ? 'YES' : 'NO',
    'Eligible?': r.isEligible ? 'YES' : 'NO',
    Docs: `${r.publishedDocs}/${r.knowledgeDocs}`
  })));

  console.log('\n=== DETAILED INVENTORY PER EXAM ===\n');
  results.forEach((r, idx) => {
    console.log(`${idx + 1}. [${r.status}] "${r.title}" (slug: "${r.slug}")`);
    console.log(`   ID: ${r.id}`);
    console.log(`   Org: ${r.org} | Cycles: ${r.cycle}`);
    console.log(`   Protected Dependencies: ${r.protectedDepsStr}`);
    console.log(`   Knowledge Docs: ${r.knowledgeDocs} (Published: ${r.publishedDocs}) | Readiness: ${r.readinessRecords}`);
    console.log(`   Classification: ${r.isTestFixture ? 'TEST FIXTURE' : 'REAL CANONICAL EXAM'}`);
    console.log(`   Eligibility: ${r.isEligible ? 'ELIGIBLE FOR DELETION' : 'BLOCKED'}`);
    if (r.blockers.length > 0) {
      console.log(`   Blockers: ${r.blockers.join(' | ')}`);
    }
    if (r.warnings.length > 0) {
      console.log(`   Warnings: ${r.warnings.join(' | ')}`);
    }
    console.log(`   Created At: ${r.createdAt}`);
    console.log('----------------------------------------------------------------------');
  });

  const testFixtures = results.filter(r => r.isTestFixture);
  const realExams = results.filter(r => !r.isTestFixture);
  const eligibleTestFixtures = testFixtures.filter(r => r.isEligible);
  const protectedTestFixtures = testFixtures.filter(r => !r.isEligible);

  console.log('\n======================================================================');
  console.log('AGGREGATE STATISTICS:');
  console.log(`Total Exams: ${results.length}`);
  console.log(`Real Canonical Exams (must NEVER delete): ${realExams.length}`);
  realExams.forEach(e => console.log(`   - [${e.status}] ${e.title} (${e.slug})`));
  console.log(`Test Fixtures Identified: ${testFixtures.length}`);
  console.log(`   - Eligible for controlled deletion: ${eligibleTestFixtures.length}`);
  eligibleTestFixtures.forEach(e => console.log(`       * [${e.status}] ${e.title} (${e.slug}) - ID: ${e.id}`));
  console.log(`   - Blocked / Protected (Skipped): ${protectedTestFixtures.length}`);
  protectedTestFixtures.forEach(e => console.log(`       * [${e.status}] ${e.title} (${e.slug}) -> Reason: ${e.blockers.join('; ')}`));
  console.log('======================================================================\n');
}

runInventory().catch(console.error);
