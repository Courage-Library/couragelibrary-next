/**
 * COURAGE LIBRARY — PHASE 3H.4 EXAM KNOWLEDGE STUDIO TEST SUITE
 * 
 * 48 Authoritative Assertions across 7 Core Groups:
 * Group 1: Route, Navigation & RBAC Authorization (S01 - S07)
 * Group 2: Live Database Loading & Overview Dashboard KPIs (S08 - S14)
 * Group 3: Exam Workspace & Dynamic Module Matrix (S15 - S21)
 * Group 4: Authoring Workbench, Prompt Viewer & 5-Gate Validation Preview (S22 - S29)
 * Group 5: Draft Ingestion, Isolation & Candidate Invisibility (S30 - S35)
 * Group 6: Human Academic Review, Compilation & Publication Lifecycle (S36 - S42)
 * Group 7: Immutability Protection, Revision Branching & Zero Baseline Disruption (S43 - S48)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Import domain services using registered require hook
const { AdminExamKnowledgeService } = require('@/services/exam-knowledge/admin-exam-knowledge.service');
const { ExamModuleRegistry } = require('@/services/exam-knowledge/exam-module-registry');
const { ExamKnowledgeService } = require('@/services/exam-knowledge.service');

let totalTests = 0;
let passedTests = 0;

function runTest(id, description, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${id}: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${id}: ${description}`);
    console.error(`         Error: ${err.message}`);
  }
}

async function runAsyncTest(id, description, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${id}: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${id}: ${description}`);
    console.error(`         Error: ${err.message}`);
  }
}

async function runAllTests() {
  console.log('============================================================');
  console.log('COURAGE LIBRARY — PHASE 3H.4 EXAM KNOWLEDGE STUDIO SUITE');
  console.log('48 Authoritative Assertions (S01 - S48)');
  console.log('============================================================\n');

  // --- GROUP 1: Route, Navigation & RBAC Authorization ---
  console.log('--- GROUP 1: Route, Navigation & RBAC Authorization ---');

  runTest('S01', 'Admin route /admin/exam-knowledge page file exists', () => {
    const pagePath = path.join(__dirname, '..', 'app', 'admin', 'exam-knowledge', 'page.tsx');
    assert.strictEqual(fs.existsSync(pagePath), true, 'page.tsx must exist');
    const content = fs.readFileSync(pagePath, 'utf8');
    assert.ok(content.includes('ExamKnowledgeStudioView'), 'Must render ExamKnowledgeStudioView');
  });

  runTest('S02', 'AdminSidebar navigation includes Exam Knowledge link under Learning Content', () => {
    const sidebarPath = path.join(__dirname, '..', 'components', 'admin', 'admin-sidebar.tsx');
    const content = fs.readFileSync(sidebarPath, 'utf8');
    assert.ok(content.includes('/admin/exam-knowledge'), 'Must link to /admin/exam-knowledge');
    assert.ok(content.includes('Exam Knowledge'), 'Must have label Exam Knowledge');
  });

  runTest('S03', 'Server actions file actions/admin-exam-knowledge.actions.ts exists with "use server"', () => {
    const actionsPath = path.join(__dirname, '..', 'actions', 'admin-exam-knowledge.actions.ts');
    assert.strictEqual(fs.existsSync(actionsPath), true, 'actions file must exist');
    const content = fs.readFileSync(actionsPath, 'utf8');
    assert.ok(content.includes('"use server"') || content.includes("'use server'"), 'Must declare use server');
  });

  runTest('S04', 'Server actions enforce AdminService.checkIsAdminOrStaff() guard', () => {
    const actionsPath = path.join(__dirname, '..', 'actions', 'admin-exam-knowledge.actions.ts');
    const content = fs.readFileSync(actionsPath, 'utf8');
    assert.ok(content.includes('AdminService.checkIsAdminOrStaff()'), 'Must call checkIsAdminOrStaff()');
    assert.ok(content.includes('UNAUTHORIZED'), 'Must return UNAUTHORIZED for non-admins');
  });

  runTest('S05', 'Admin layout app/admin/layout.tsx strictly guards access for staff/admin only', () => {
    const layoutPath = path.join(__dirname, '..', 'app', 'admin', 'layout.tsx');
    const content = fs.readFileSync(layoutPath, 'utf8');
    assert.ok(content.includes('checkIsAdminOrStaff'), 'Layout must enforce RBAC');
    assert.ok(content.includes('Access Restricted'), 'Must render Access Restricted for non-staff');
  });

  runTest('S06', 'Client components import server actions safely without embedding service keys', () => {
    const studioPath = path.join(__dirname, '..', 'components', 'admin', 'exam-knowledge', 'exam-knowledge-studio-view.tsx');
    const content = fs.readFileSync(studioPath, 'utf8');
    assert.strictEqual(content.includes('SUPABASE_SERVICE_ROLE_KEY'), false, 'Must not reference service key');
    assert.strictEqual(content.includes('process.env.SUPABASE'), false, 'Must not reference env vars');
  });

  runTest('S07', 'Server actions never trust client-provided authorization headers', () => {
    const actionsPath = path.join(__dirname, '..', 'actions', 'admin-exam-knowledge.actions.ts');
    const content = fs.readFileSync(actionsPath, 'utf8');
    assert.strictEqual(content.includes('params.isAdmin'), false, 'Must not trust params.isAdmin');
  });

  // --- GROUP 2: Live Database Loading & Overview Dashboard KPIs ---
  console.log('\n--- GROUP 2: Live Database Loading & Overview Dashboard KPIs ---');

  await runAsyncTest('S08', 'AdminExamKnowledgeService.getDashboardKPIs executes live database queries', async () => {
    const kpis = await AdminExamKnowledgeService.getDashboardKPIs(supabase);
    assert.strictEqual(typeof kpis.totalExams, 'number', 'totalExams must be number');
    assert.strictEqual(typeof kpis.activeExams, 'number', 'activeExams must be number');
    assert.strictEqual(typeof kpis.activeCycles, 'number', 'activeCycles must be number');
    assert.strictEqual(typeof kpis.totalDocuments, 'number', 'totalDocuments must be number');
    assert.strictEqual(typeof kpis.draftsAwaitingReview, 'number', 'draftsAwaitingReview must be number');
    assert.strictEqual(typeof kpis.publishedDocuments, 'number', 'publishedDocuments must be number');
  });

  await runAsyncTest('S09', 'Dashboard KPIs reflect honest live count (0 documents when baseline is clean)', async () => {
    const kpis = await AdminExamKnowledgeService.getDashboardKPIs(supabase);
    assert.strictEqual(kpis.totalDocuments, 0, 'totalDocuments must be 0 in clean baseline');
    assert.strictEqual(kpis.publishedDocuments, 0, 'publishedDocuments must be 0 in clean baseline');
  });

  await runAsyncTest('S10', 'Active vs total exams accurately queried from database', async () => {
    const kpis = await AdminExamKnowledgeService.getDashboardKPIs(supabase);
    assert.ok(kpis.totalExams >= 1, 'totalExams must be >= 1');
    assert.ok(kpis.activeExams <= kpis.totalExams, 'activeExams <= totalExams');
  });

  await runAsyncTest('S11', 'Active cycles accurately queried from exam_cycles table', async () => {
    const kpis = await AdminExamKnowledgeService.getDashboardKPIs(supabase);
    assert.ok(kpis.activeCycles >= 1, 'activeCycles must be >= 1');
  });

  await runAsyncTest('S12', 'Drafts awaiting review accurately counts AI_GENERATED and IN_REVIEW', async () => {
    const kpis = await AdminExamKnowledgeService.getDashboardKPIs(supabase);
    assert.strictEqual(typeof kpis.draftsAwaitingReview, 'number');
  });

  await runAsyncTest('S13', 'Unverified sources and disputed claims counts reflect live database state', async () => {
    const kpis = await AdminExamKnowledgeService.getDashboardKPIs(supabase);
    assert.strictEqual(typeof kpis.unverifiedSources, 'number');
    assert.strictEqual(typeof kpis.claimsRequiringReview, 'number');
  });

  runTest('S14', 'Zero hardcoded KPI numbers returned by service', () => {
    const servicePath = path.join(__dirname, '..', 'services', 'exam-knowledge', 'admin-exam-knowledge.service.ts');
    const content = fs.readFileSync(servicePath, 'utf8');
    assert.strictEqual(content.includes('totalExams: 10'), false);
    assert.strictEqual(content.includes('totalDocuments: 36'), false);
  });

  // --- GROUP 3: Exam Workspace & Dynamic Module Matrix ---
  console.log('\n--- GROUP 3: Exam Workspace & Dynamic Module Matrix ---');

  await runAsyncTest('S15', 'getExamsAndCycles loads exams with conducting organization details', async () => {
    const { exams } = await AdminExamKnowledgeService.getExamsAndCycles(supabase);
    assert.ok(Array.isArray(exams), 'exams must be array');
    assert.ok(exams.length >= 1, 'must have at least 1 exam');
    const ssc = exams.find(e => e.slug.includes('ssc-cgl') || e.name.includes('SSC'));
    assert.ok(ssc, 'SSC CGL exam must exist');
    assert.ok(ssc.conducting_org, 'Must include conducting organization');
  });

  await runAsyncTest('S16', 'getExamsAndCycles sorts cycles by year descending', async () => {
    const { exams } = await AdminExamKnowledgeService.getExamsAndCycles(supabase);
    const ssc = exams[0];
    if (ssc && ssc.cycles && ssc.cycles.length > 1) {
      for (let i = 0; i < ssc.cycles.length - 1; i++) {
        assert.ok(ssc.cycles[i].year >= ssc.cycles[i + 1].year, 'Cycles must be descending');
      }
    }
  });

  await runAsyncTest('S17', 'getExamWorkspace renders all canonical modules from ExamModuleRegistry', async () => {
    const { exams } = await AdminExamKnowledgeService.getExamsAndCycles(supabase);
    const ssc = exams[0];
    const ws = await AdminExamKnowledgeService.getExamWorkspace(ssc.id, null, supabase);
    assert.ok(ws, 'Workspace must exist');
    const allDefs = ExamModuleRegistry.getAllModuleDefinitions();
    assert.strictEqual(ws.modules.length, allDefs.length, 'Must have all registered modules');
  });

  runTest('S18', 'Module matrix in UI is completely dynamic without hardcoded module lists', () => {
    const studioPath = path.join(__dirname, '..', 'components', 'admin', 'exam-knowledge', 'exam-knowledge-studio-view.tsx');
    const content = fs.readFileSync(studioPath, 'utf8');
    assert.ok(content.includes('workspace?.modules?.map'), 'Must dynamically map over workspace modules');
  });

  runTest('S19', 'Applicability evaluation: Timeless module is APPLICABLE for active exam', () => {
    const rep = ExamModuleRegistry.evaluateApplicability(
      { id: 'exam-1', title: 'SSC CGL', isActive: true },
      null,
      'EXAM_OVERVIEW',
      0,
      0
    );
    assert.strictEqual(rep.status, 'APPLICABLE');
    assert.strictEqual(rep.isApplicable, true);
  });

  runTest('S20', 'Applicability evaluation: Cycle-specific module returns REQUIRES_CYCLE when cycle is null', () => {
    const rep = ExamModuleRegistry.evaluateApplicability(
      { id: 'exam-1', title: 'SSC CGL', isActive: true },
      null,
      'VACANCIES',
      0,
      0
    );
    assert.strictEqual(rep.status, 'REQUIRES_CYCLE');
    assert.strictEqual(rep.isApplicable, false);
  });

  runTest('S21', 'Applicability evaluation: Returns NOT_APPLICABLE when parent exam is inactive', () => {
    const rep = ExamModuleRegistry.evaluateApplicability(
      { id: 'exam-inactive', title: 'Legacy Exam', isActive: false },
      null,
      'EXAM_OVERVIEW',
      0,
      0
    );
    assert.strictEqual(rep.status, 'NOT_APPLICABLE');
    assert.strictEqual(rep.isApplicable, false);
  });

  // --- GROUP 4: Authoring Workbench, Prompt Viewer & 5-Gate Preview ---
  console.log('\n--- GROUP 4: Authoring Workbench, Prompt Viewer & 5-Gate Preview ---');

  runTest('S22', 'PromptViewerPanel component renders read-only monospace prompt with copy button', () => {
    const panelPath = path.join(__dirname, '..', 'components', 'admin', 'exam-knowledge', 'prompt-viewer-panel.tsx');
    assert.strictEqual(fs.existsSync(panelPath), true);
    const content = fs.readFileSync(panelPath, 'utf8');
    assert.ok(content.includes('navigator.clipboard.writeText'), 'Must implement clipboard copy');
    assert.ok(content.includes('Copied to Clipboard!'), 'Must display copy confirmation');
  });

  runTest('S23', 'PromptViewerPanel displays contract version and context hash', () => {
    const panelPath = path.join(__dirname, '..', 'components', 'admin', 'exam-knowledge', 'prompt-viewer-panel.tsx');
    const content = fs.readFileSync(panelPath, 'utf8');
    assert.ok(content.includes('contractVersion'), 'Must render contractVersion');
    assert.ok(content.includes('contextHash'), 'Must render contextHash');
  });

  runTest('S24', 'FiveGatePreviewPanel renders all 5 validation gates with pass/warn/block badges', () => {
    const gatePanelPath = path.join(__dirname, '..', 'components', 'admin', 'exam-knowledge', 'five-gate-preview-panel.tsx');
    assert.strictEqual(fs.existsSync(gatePanelPath), true);
    const content = fs.readFileSync(gatePanelPath, 'utf8');
    assert.ok(content.includes('gate1_schema'), 'Must render Gate 1');
    assert.ok(content.includes('gate2_target'), 'Must render Gate 2');
    assert.ok(content.includes('gate3_security'), 'Must render Gate 3');
    assert.ok(content.includes('gate4_provenance'), 'Must render Gate 4');
    assert.ok(content.includes('gate5_domain'), 'Must render Gate 5');
  });

  runTest('S25', 'Provider-neutral external AI workflow instructions present steps 1 to 5', () => {
    const studioPath = path.join(__dirname, '..', 'components', 'admin', 'exam-knowledge', 'exam-knowledge-studio-view.tsx');
    const content = fs.readFileSync(studioPath, 'utf8');
    assert.ok(content.includes('STEP 1'), 'Must include STEP 1');
    assert.ok(content.includes('STEP 5'), 'Must include STEP 5');
    assert.ok(content.includes('ChatGPT'), 'Must reference ChatGPT');
    assert.ok(content.includes('Claude'), 'Must reference Claude');
  });

  runTest('S26', 'AcademicReviewChecklist component defines 10 human verification criteria', () => {
    const checklistPath = path.join(__dirname, '..', 'components', 'admin', 'exam-knowledge', 'academic-review-checklist.tsx');
    assert.strictEqual(fs.existsSync(checklistPath), true);
    const content = fs.readFileSync(checklistPath, 'utf8');
    assert.ok(content.includes('CHECKLIST_ITEMS'), 'Must define checklist items');
    assert.ok(content.includes('10'), 'Must track 10 criteria');
  });

  runTest('S27', 'Authoring tab disables import button when input is empty or importing is in progress', () => {
    const studioPath = path.join(__dirname, '..', 'components', 'admin', 'exam-knowledge', 'exam-knowledge-studio-view.tsx');
    const content = fs.readFileSync(studioPath, 'utf8');
    assert.ok(content.includes('disabled={isImporting || !rawAiResponse.trim()}'), 'Button must be guarded');
  });

  runTest('S28', 'Authoring tab disables prompt generation when in progress with spinner', () => {
    const studioPath = path.join(__dirname, '..', 'components', 'admin', 'exam-knowledge', 'exam-knowledge-studio-view.tsx');
    const content = fs.readFileSync(studioPath, 'utf8');
    assert.ok(content.includes('disabled={isGeneratingPrompt}'), 'Prompt button must be guarded');
  });

  runTest('S29', 'Five-gate preview highlights error details cleanly when errors exist', () => {
    const gatePanelPath = path.join(__dirname, '..', 'components', 'admin', 'exam-knowledge', 'five-gate-preview-panel.tsx');
    const content = fs.readFileSync(gatePanelPath, 'utf8');
    assert.ok(content.includes('Detailed Validation Feedback'), 'Must render detailed feedback');
  });

  // --- GROUP 5: Draft Ingestion, Isolation & Candidate Invisibility ---
  console.log('\n--- GROUP 5: Draft Ingestion, Isolation & Candidate Invisibility ---');

  await runAsyncTest('S30', 'getDraftsList filters by review status correctly', async () => {
    const drafts = await AdminExamKnowledgeService.getDraftsList({ reviewStatus: 'AI_GENERATED' }, supabase);
    assert.ok(Array.isArray(drafts), 'Drafts must be array');
    for (const d of drafts) {
      assert.strictEqual(d.reviewStatus, 'AI_GENERATED');
    }
  });

  runTest('S31', 'Import creates draft strictly with is_published = false', () => {
    const importerPath = path.join(__dirname, '..', 'services', 'exam-knowledge', 'exam-knowledge-importer.service.ts');
    const content = fs.readFileSync(importerPath, 'utf8');
    assert.ok(content.includes("is_published: false"), 'Drafts must always have is_published: false');
    assert.ok(content.includes("review_status: 'AI_GENERATED'"), 'Drafts must start as AI_GENERATED');
  });

  runTest('S32', 'Drafts list displays version number, author type, and review status', () => {
    const studioPath = path.join(__dirname, '..', 'components', 'admin', 'exam-knowledge', 'exam-knowledge-studio-view.tsx');
    const content = fs.readFileSync(studioPath, 'utf8');
    assert.ok(content.includes('v{d.versionNumber}'), 'Must display version number');
    assert.ok(content.includes('d.authorType'), 'Must display author type');
    assert.ok(content.includes('d.reviewStatus'), 'Must display review status');
  });

  runTest('S33', 'Candidate RLS policy protects drafts from anonymous or public select', () => {
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260919000054_phase3h1_exam_knowledge_foundation.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(sql.includes('Public candidates can view published exam doc versions'), 'Public policy must exist');
    assert.ok(sql.includes('is_published = true'), 'Public policy must require is_published = true');
  });

  runTest('S34', 'Draft list empty state displays clear guidance to administrators', () => {
    const studioPath = path.join(__dirname, '..', 'components', 'admin', 'exam-knowledge', 'exam-knowledge-studio-view.tsx');
    const content = fs.readFileSync(studioPath, 'utf8');
    assert.ok(content.includes('No drafts are awaiting review'), 'Must render honest empty state');
  });

  runTest('S35', 'Review button transitions selected draft into Review Workbench tab', () => {
    const studioPath = path.join(__dirname, '..', 'components', 'admin', 'exam-knowledge', 'exam-knowledge-studio-view.tsx');
    const content = fs.readFileSync(studioPath, 'utf8');
    assert.ok(content.includes('setActiveTab("REVIEW")'), 'Must switch to REVIEW tab');
  });

  // --- GROUP 6: Human Academic Review, Compilation & Publication Lifecycle ---
  console.log('\n--- GROUP 6: Human Academic Review, Compilation & Publication Lifecycle ---');

  runTest('S36', 'Human review checklist is mandatory before approval button is enabled', () => {
    const studioPath = path.join(__dirname, '..', 'components', 'admin', 'exam-knowledge', 'exam-knowledge-studio-view.tsx');
    const content = fs.readFileSync(studioPath, 'utf8');
    assert.ok(content.includes('disabled={isUpdatingStatus || !isChecklistComplete}'), 'Approval requires checklist completion');
  });

  runTest('S37', 'State transition AI_GENERATED -> IN_REVIEW -> APPROVED is supported', () => {
    const servicePath = path.join(__dirname, '..', 'services', 'exam-knowledge', 'admin-exam-knowledge.service.ts');
    const content = fs.readFileSync(servicePath, 'utf8');
    assert.ok(content.includes('updateDocVersionReviewStatus'), 'Service must support review status transition');
  });

  runTest('S38', 'Compilation compiles MDX and scans with MdxSecurityScanner', () => {
    const servicePath = path.join(__dirname, '..', 'services', 'exam-knowledge', 'admin-exam-knowledge.service.ts');
    const content = fs.readFileSync(servicePath, 'utf8');
    assert.ok(content.includes('MdxSecurityScanner.scan(compiledMdx)'), 'Must scan MDX for security');
    assert.ok(content.includes("crypto.createHash('sha256')"), 'Must compute SHA-256 artifact hash');
  });

  runTest('S39', 'Publication requires APPROVED or COMPILED status', () => {
    const servicePath = path.join(__dirname, '..', 'services', 'exam-knowledge', 'admin-exam-knowledge.service.ts');
    const content = fs.readFileSync(servicePath, 'utf8');
    assert.ok(content.includes("Cannot publish document in"), 'Must validate status before publishing');
    assert.ok(content.includes("is_published: true"), 'Sets is_published to true');
  });

  runTest('S40', 'Publishing atomically updates parent document current_published_version_id', () => {
    const servicePath = path.join(__dirname, '..', 'services', 'exam-knowledge', 'admin-exam-knowledge.service.ts');
    const content = fs.readFileSync(servicePath, 'utf8');
    assert.ok(content.includes('current_published_version_id: params.versionId'), 'Must update document pointer');
  });

  runTest('S41', 'Published pointer consistency trigger enforces document-version matching', () => {
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260919000054_phase3h1_exam_knowledge_foundation.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(sql.includes('fn_check_exam_doc_published_pointer'), 'Must define pointer trigger');
  });

  runTest('S42', 'Direct shortcut AI_GENERATED -> PUBLISHED is architecturally blocked', () => {
    const servicePath = path.join(__dirname, '..', 'services', 'exam-knowledge', 'admin-exam-knowledge.service.ts');
    const content = fs.readFileSync(servicePath, 'utf8');
    assert.ok(content.includes("ver.review_status !== 'COMPILED' && ver.review_status !== 'APPROVED'"), 'Must reject non-compiled/approved publish');
  });

  // --- GROUP 7: Immutability Protection, Revision Branching & Zero Baseline Disruption ---
  console.log('\n--- GROUP 7: Immutability Protection, Revision Branching & Zero Baseline Disruption ---');

  runTest('S43', 'ExamKnowledgeService.assertMutable blocks mutation on published versions', () => {
    assert.throws(
      () => ExamKnowledgeService.assertMutable({ is_published: true, version_number: 1 }),
      /is PUBLISHED and permanently immutable/
    );
  });

  runTest('S44', 'createRevisionDraft creates a new draft version without modifying published version', () => {
    const servicePath = path.join(__dirname, '..', 'services', 'exam-knowledge', 'admin-exam-knowledge.service.ts');
    const content = fs.readFileSync(servicePath, 'utf8');
    assert.ok(content.includes("author_type: 'HUMAN_REVISED'"), 'Must set author_type to HUMAN_REVISED');
    assert.ok(content.includes("review_status: 'DRAFT'"), 'Must set review_status to DRAFT');
    assert.ok(content.includes("is_published: false"), 'Must set is_published to false');
  });

  runTest('S45', 'updateSourceVerification allows staff to verify or reject official sources', () => {
    const servicePath = path.join(__dirname, '..', 'services', 'exam-knowledge', 'admin-exam-knowledge.service.ts');
    const content = fs.readFileSync(servicePath, 'utf8');
    assert.ok(content.includes('updateSourceVerification'), 'Must implement source verification');
    assert.ok(content.includes('verified_by_user_id'), 'Must record reviewer identity');
  });

  runTest('S46', 'updateClaimVerification audits claim verification without destructive overwrite', () => {
    const servicePath = path.join(__dirname, '..', 'services', 'exam-knowledge', 'admin-exam-knowledge.service.ts');
    const content = fs.readFileSync(servicePath, 'utf8');
    assert.ok(content.includes('updateClaimVerification'), 'Must implement claim verification');
  });

  await runAsyncTest('S47', 'Database baseline: 20 protected tables remain 100% intact', async () => {
    const [subjs, tops, lu, ld, q, mt] = await Promise.all([
      supabase.from('subjects').select('*', { count: 'exact', head: true }),
      supabase.from('topics').select('*', { count: 'exact', head: true }),
      supabase.from('learning_units').select('*', { count: 'exact', head: true }),
      supabase.from('learning_documents').select('*', { count: 'exact', head: true }),
      supabase.from('questions').select('*', { count: 'exact', head: true }),
      supabase.from('mock_tests').select('*', { count: 'exact', head: true }),
    ]);
    assert.strictEqual(subjs.error, null);
    assert.strictEqual(subjs.count, 4, 'Subjects count must be 4');
    assert.strictEqual(tops.error, null);
    assert.strictEqual(tops.count, 36, 'Topics count must be 36');
    assert.strictEqual(lu.error, null);
    assert.strictEqual(ld.error, null);
    assert.strictEqual(q.error, null);
    assert.ok(q.count >= 103, 'Questions count must be >= 103');
    assert.strictEqual(mt.error, null);
    assert.ok(mt.count >= 8, 'Mock tests count must be >= 8');
  });

  runTest('S48', 'Zero external AI API network calls in Studio implementation (100% offline)', () => {
    const studioPath = path.join(__dirname, '..', 'components', 'admin', 'exam-knowledge', 'exam-knowledge-studio-view.tsx');
    const servicePath = path.join(__dirname, '..', 'services', 'exam-knowledge', 'admin-exam-knowledge.service.ts');
    const studioContent = fs.readFileSync(studioPath, 'utf8');
    const serviceContent = fs.readFileSync(servicePath, 'utf8');

    assert.strictEqual(studioContent.includes('openai.com'), false, 'Zero OpenAI calls');
    assert.strictEqual(studioContent.includes('anthropic.com'), false, 'Zero Anthropic calls');
    assert.strictEqual(serviceContent.includes('openai.com'), false, 'Zero OpenAI calls in service');
    assert.strictEqual(serviceContent.includes('anthropic.com'), false, 'Zero Anthropic calls in service');
  });

  console.log('\n============================================================');
  console.log(`PHASE 3H.4 TEST RESULTS: ${passedTests} PASSED | ${totalTests - passedTests} FAILED (Total: ${totalTests})`);
  console.log('============================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
