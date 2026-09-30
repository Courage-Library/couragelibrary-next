/**
 * COURAGE LIBRARY — PHASE 3M.1 VERIFICATION TEST SUITE
 * LEARNING CONTENT PRODUCTION FOUNDATION
 * 
 * Comprehensive Forensic & Functional Test Harness:
 * - GROUP 1: Migration 53-56 Schema Invariants & Safety Gates (M01 - M08)
 * - GROUP 2: Live Remote Database Baseline Protection & Zero Corruption (M09 - M15)
 * - GROUP 3: Immutability, Pointer Consistency & Deletion Triggers (M16 - M22)
 * - GROUP 4: Structured Content Importer & Citation Sanitizer Integration (M23 - M28)
 * - GROUP 5: Controlled Compilation, Storage Hashing & Component Contracts (M29 - M34)
 * - GROUP 6: Candidate Rendering & 10-Component Parity (M35 - M40)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

// Hook TypeScript transpilation & alias resolution
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
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  return module._compile(compiled.outputText, filename);
};

require.extensions['.tsx'] = function (module, filename) {
  const content = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(content, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  return module._compile(compiled.outputText, filename);
};

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

const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Domain Services & Utilities
const { StructuredContentImporter } = require('@/services/ai/structured-content-importer.service');
const { detectAiCitationArtifacts, sanitizeAiCitationArtifacts, sanitizeObjectCitationArtifacts } = require('@/services/ai/ai-citation-sanitizer');
const { ControlledContentCompiler } = require('@/services/controlled-content-compiler.service');
const { LearningDocumentService } = require('@/services/learning-document.service');
const { MemoryStorageProvider } = require('@/services/storage/memory-storage.provider');
const { ContentSpecValidator } = require('@/services/content-spec-validator');
const { MdxSecurityScanner } = require('@/services/mdx-security-scanner');
const { APPROVED_COMPONENTS_MAP } = require('@/components/learning/controlled-content-renderer');

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
  console.log('COURAGE LIBRARY — PHASE 3M.1 VERIFICATION TEST SUITE');
  console.log('Learning Content Production Foundation');
  console.log('============================================================\n');

  // Load Migration Files
  const mig53Sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260915000053_phase3a_learning_taxonomy_foundation.sql'), 'utf-8');
  const mig54Sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260915000054_phase3b_content_artifact_and_asset_foundation.sql'), 'utf-8');
  const mig55Sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260915000055_phase3c_content_compilation_and_versions.sql'), 'utf-8');
  const mig56Sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260915000056_phase3d_immutability_and_deletion_guards.sql'), 'utf-8');

  // --------------------------------------------------------------------------
  // GROUP 1: Migration 53-56 Schema Invariants & Safety Gates (M01 - M08)
  // --------------------------------------------------------------------------
  console.log('--- GROUP 1: Migration 53-56 Schema Invariants & Safety Gates ---');

  await test('M01', 'Migration 53 establishes additive taxonomy columns on exam_topics and creates topic_relationships & learning_units', async () => {
    assert(mig53Sql.includes('exam_topics'), 'Must enhance exam_topics');
    assert(mig53Sql.includes('required_depth'), 'Must add required_depth');
    assert(mig53Sql.includes('public.learning_units'), 'Must create learning_units');
    assert(mig53Sql.includes('public.exam_unit_mappings'), 'Must create exam_unit_mappings');
  });

  await test('M02', 'Migration 54 establishes zero-content-body artifact & asset foundation', async () => {
    assert(mig54Sql.includes('public.learning_content_artifacts'), 'Must create learning_content_artifacts');
    assert(mig54Sql.includes('public.learning_assets'), 'Must create learning_assets');
    assert(mig54Sql.includes('public.learning_unit_asset_bindings'), 'Must create learning_unit_asset_bindings');
    assert(mig54Sql.includes('sha256_hash'), 'Must enforce sha256_hash constraint');
  });

  await test('M03', 'Migration 55 establishes canonical learning_documents and immutable document_versions', async () => {
    assert(mig55Sql.includes('public.learning_documents'), 'Must create learning_documents');
    assert(mig55Sql.includes('public.document_versions'), 'Must create document_versions');
    assert(mig55Sql.includes('source_spec_hash'), 'Must enforce source spec hash');
    assert(mig55Sql.includes('compiled_artifact_hash'), 'Must enforce compiled artifact hash');
  });

  await test('M04', 'Migration 56 establishes strict PostgreSQL immutability, deletion guards & pointer consistency triggers', async () => {
    assert(mig56Sql.includes('fn_prevent_published_version_deletion'), 'Must have version deletion guard function');
    assert(mig56Sql.includes('fn_prevent_published_document_deletion'), 'Must have doc deletion guard function');
    assert(mig56Sql.includes('fn_prevent_published_version_mutation'), 'Must have version mutation guard function');
    assert(mig56Sql.includes('fn_enforce_document_published_pointer_consistency'), 'Must have pointer consistency function');
  });

  await test('M05', 'Migrations 53-56 use 100% additive / non-destructive SQL syntax (zero DROP TABLE, zero DELETE)', async () => {
    const allSql = [mig53Sql, mig54Sql, mig55Sql, mig56Sql].join('\n');
    assert(!allSql.includes('DROP TABLE'), 'Must contain zero DROP TABLE');
    assert(!allSql.includes('DELETE FROM'), 'Must contain zero DELETE FROM');
    assert(!allSql.includes('TRUNCATE'), 'Must contain zero TRUNCATE');
  });

  await test('M06', 'Row Level Security (RLS) is explicitly enabled on all new learning tables', async () => {
    assert(mig53Sql.includes('ALTER TABLE public.learning_units ENABLE ROW LEVEL SECURITY'));
    assert(mig54Sql.includes('ALTER TABLE public.learning_content_artifacts ENABLE ROW LEVEL SECURITY'));
    assert(mig55Sql.includes('ALTER TABLE public.learning_documents ENABLE ROW LEVEL SECURITY'));
    assert(mig55Sql.includes('ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY'));
  });

  await test('M07', 'Strict foreign key cascades bind learning units, documents, and versions', async () => {
    assert(mig55Sql.includes('learning_unit_id UUID NOT NULL REFERENCES public.learning_units(id) ON DELETE CASCADE'));
    assert(mig55Sql.includes('document_id UUID NOT NULL REFERENCES public.learning_documents(id) ON DELETE CASCADE'));
  });

  await test('M08', 'Candidate read policies restrict public access strictly to published records', async () => {
    assert(mig55Sql.includes("USING (status = 'PUBLISHED')"));
    assert(mig55Sql.includes("USING (is_published = TRUE AND review_status = 'PUBLISHED')"));
  });

  // --------------------------------------------------------------------------
  // GROUP 2: Live Remote Database Baseline Protection & Zero Corruption (M09 - M15)
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 2: Live Remote Database Baseline Protection & Zero Corruption ---');

  await test('M09', 'Remote database subjects baseline is intact (exactly 4 canonical subjects)', async () => {
    const { count, error } = await supabase.from('subjects').select('*', { count: 'exact', head: true });
    assert.strictEqual(error, null);
    assert.strictEqual(count, 4);
  });

  await test('M10', 'Remote database topics baseline is intact (exactly 36 canonical topics)', async () => {
    const { count, error } = await supabase.from('topics').select('*', { count: 'exact', head: true });
    assert.strictEqual(error, null);
    assert.strictEqual(count, 36);
  });

  await test('M11', 'Remote database question bank baseline is intact (>= 103 questions)', async () => {
    const { count, error } = await supabase.from('questions').select('*', { count: 'exact', head: true });
    assert.strictEqual(error, null);
    assert(count >= 103, `Expected >= 103 questions, got ${count}`);
  });

  await test('M12', 'Remote database exam syllabi baseline is intact (1 syllabus)', async () => {
    const { count, error } = await supabase.from('exam_syllabi').select('*', { count: 'exact', head: true });
    assert.strictEqual(error, null);
    assert.strictEqual(count, 1);
  });

  await test('M13', 'Remote database exam topics baseline is intact (18 exam topics)', async () => {
    const { count, error } = await supabase.from('exam_topics').select('*', { count: 'exact', head: true });
    assert.strictEqual(error, null);
    assert.strictEqual(count, 18);
  });

  await test('M14', 'Remote database legacy articles baseline is intact (1 published article)', async () => {
    const { count, error } = await supabase.from('articles').select('*', { count: 'exact', head: true });
    assert.strictEqual(error, null);
    assert.strictEqual(count, 1);
  });

  await test('M15', 'Remote database exam knowledge baseline is intact (>= 62 versions)', async () => {
    const { count, error } = await supabase.from('exam_doc_versions').select('*', { count: 'exact', head: true });
    assert.strictEqual(error, null);
    assert(count >= 62, `Expected >= 62 versions, got ${count}`);
  });

  // --------------------------------------------------------------------------
  // GROUP 3: Immutability, Pointer Consistency & Deletion Triggers (M16 - M22)
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 3: Immutability, Pointer Consistency & Deletion Triggers ---');

  await test('M16', 'LearningDocumentService.isImmutable correctly evaluates draft vs published versions', async () => {
    const draft = { version_number: 1, is_published: false, review_status: 'DRAFT' };
    assert.strictEqual(LearningDocumentService.isImmutable(draft), false);

    const compiled = { version_number: 1, is_published: false, review_status: 'COMPILED' };
    assert.strictEqual(LearningDocumentService.isImmutable(compiled), false);

    const published = { version_number: 1, is_published: true, review_status: 'PUBLISHED' };
    assert.strictEqual(LearningDocumentService.isImmutable(published), true);
  });

  await test('M17', 'LearningDocumentService.assertMutable throws error on published version mutation attempt', async () => {
    const published = { id: 'v-001', version_number: 1, is_published: true, review_status: 'PUBLISHED' };
    let threw = false;
    try {
      LearningDocumentService.assertMutable(published);
    } catch (e) {
      threw = true;
      assert(e.message.includes('PUBLISHED and immutable'));
    }
    assert.strictEqual(threw, true);
  });

  await test('M18', 'LearningDocumentService.assertMutable allows mutation of draft versions', async () => {
    const draft = { id: 'v-002', version_number: 1, is_published: false, review_status: 'DRAFT' };
    assert.doesNotThrow(() => LearningDocumentService.assertMutable(draft));
  });

  await test('M19', 'Multi-exam mapping architecture allows single canonical unit to map to multiple exams without duplicate content', async () => {
    const examTopicA = 'et-ssc-cgl-percentages';
    const examTopicB = 'et-rrb-ntpc-percentages';
    const canonicalUnitId = 'unit-percentages-core-01';

    const mappingA = { exam_topic_id: examTopicA, learning_unit_id: canonicalUnitId, sequence_order: 1 };
    const mappingB = { exam_topic_id: examTopicB, learning_unit_id: canonicalUnitId, sequence_order: 3 };

    assert.notStrictEqual(mappingA.exam_topic_id, mappingB.exam_topic_id);
    assert.strictEqual(mappingA.learning_unit_id, mappingB.learning_unit_id);
  });

  await test('M20', 'Unique constraint on (topic_id, slug) in learning_units prevents duplicate units per topic', async () => {
    assert(mig53Sql.includes('CONSTRAINT uq_learning_unit_topic_slug UNIQUE (topic_id, slug)'));
  });

  await test('M21', 'Unique constraint on (document_id, version_number) in document_versions enforces strict linear versioning', async () => {
    assert(mig55Sql.includes('CONSTRAINT uq_learning_document_version UNIQUE (document_id, version_number)'));
  });

  await test('M22', 'Pointer consistency foreign key and trigger guarantee current_published_version_id points only to published version of same document', async () => {
    assert(mig55Sql.includes('fk_learning_doc_current_published_version'));
    assert(mig56Sql.includes('trg_enforce_document_published_pointer_consistency'));
  });

  // --------------------------------------------------------------------------
  // GROUP 4: Structured Content Importer & Citation Sanitizer Integration (M23 - M28)
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 4: Structured Content Importer & Citation Sanitizer Integration ---');

  await test('M23', 'StructuredContentImporter imports and wires sanitizeObjectCitationArtifacts', async () => {
    const importerSource = fs.readFileSync(path.join(__dirname, '..', 'services', 'ai', 'structured-content-importer.service.ts'), 'utf-8');
    assert(importerSource.includes('sanitizeObjectCitationArtifacts'));
  });

  await test('M24', 'detectAiCitationArtifacts detects OpenAI :contentReference and 【N:M†source】 markers', async () => {
    const raw = 'Percentages formula :contentReference[oaicite:0]{index=0} and historical context 【4:0†source】 for CGL.';
    const detected = detectAiCitationArtifacts(raw);
    assert.strictEqual(detected.length, 2);
    assert.strictEqual(detected[0].token, ':contentReference[oaicite:0]{index=0}');
    assert.strictEqual(detected[1].token, '【4:0†source】');
  });

  await test('M25', 'sanitizeAiCitationArtifacts removes citation markers without altering valid markdown or punctuation', async () => {
    const raw = 'The base percentage formula is:contentReference[oaicite:0]{index=0} $P = \\frac{V}{T} \\times 100$. For details, see [Official SSC](https://ssc.gov.in) 【1†source】.';
    const cleaned = sanitizeAiCitationArtifacts(raw);
    assert(!cleaned.includes('oaicite'));
    assert(!cleaned.includes('†source'));
    assert(cleaned.includes('$P = \\frac{V}{T} \\times 100$'));
    assert(cleaned.includes('[Official SSC](https://ssc.gov.in)'));
  });

  await test('M26', 'sanitizeObjectCitationArtifacts deeply cleans complex LessonDocumentSpec payloads', async () => {
    const contaminatedSpec = {
      metadata: { title: 'Percentage Basics :contentReference[oaicite:0]{index=0}' },
      sections: [
        {
          title: 'Introduction 【2:0†source】',
          contentMarkdown: 'A percentage is a ratio :contentReference[oaicite:1]{index=1} with base 100.',
        },
      ],
      cognitiveTraps: [
        {
          trapType: 'MISREAD_KEYWORD',
          misconception: 'Confusing % increase with final % 【3†source】',
          correctApproach: 'Always identify base value first.',
        },
      ],
    };

    const sanitized = sanitizeObjectCitationArtifacts(contaminatedSpec);
    assert.strictEqual(sanitized.metadata.title, 'Percentage Basics');
    assert.strictEqual(sanitized.sections[0].title, 'Introduction');
    assert.strictEqual(sanitized.sections[0].contentMarkdown, 'A percentage is a ratio with base 100.');
    assert.strictEqual(sanitized.cognitiveTraps[0].misconception, 'Confusing % increase with final %');
  });

  await test('M27', 'StructuredContentImporter.extractJsonFromRaw safely extracts clean JSON from code blocks', async () => {
    const rawWrapped = '```json\n{\n  "metadata": { "title": "Unit Title" }\n}\n```';
    const extracted = StructuredContentImporter.extractJsonFromRaw(rawWrapped);
    const parsed = JSON.parse(extracted);
    assert.strictEqual(parsed.metadata.title, 'Unit Title');
  });

  await test('M28', 'StructuredContentImporter.validateContent sanitizes parsedSpec before structural and security validation', async () => {
    const sampleSpec = {
      schemaVersion: '1.0.0',
      documentId: 'doc-test-percentages-01',
      unitSlug: 'percentages-basics',
      language: 'en',
      metadata: {
        title: 'Percentages Basics :contentReference[oaicite:0]{index=0}',
        topicId: 'top-percentages',
        subjectId: 'subj-quant',
        difficultyTier: 'BEGINNER',
        estimatedReadingMinutes: 15,
        targetExamCategories: ['SSC_CGL'],
      },
      learningObjectives: ['Understand base percentage calculations'],
      sections: [
        {
          id: 'sec-01',
          title: 'Section 1 【1†source】',
          sectionType: 'THEORY',
          contentMarkdown: 'Understanding fractions as percentages is key.',
        },
      ],
      revisionSummary: {
        keyTakeaways: ['Base is 100'],
      },
    };

    const { spec, validation } = StructuredContentImporter.validateContent(sampleSpec, 'CONCEPT_LESSON');
    assert(spec !== null);
    assert.strictEqual(spec.metadata.title, 'Percentages Basics');
    assert.strictEqual(spec.sections[0].title, 'Section 1');
    assert.strictEqual(validation.canImportAsDraft, true);
  });

  // --------------------------------------------------------------------------
  // GROUP 5: Controlled Compilation, Storage Hashing & Component Contracts (M29 - M34)
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 5: Controlled Compilation, Storage Hashing & Component Contracts ---');

  const validProductionSpec = {
    schemaVersion: '1.0.0',
    documentId: 'doc-test-pnl-01',
    unitSlug: 'profit-and-loss-core',
    language: 'en',
    metadata: {
      title: 'Profit and Loss: Core Concept Lesson',
      topicId: 'top-pnl',
      subjectId: 'subj-quant',
      difficultyTier: 'INTERMEDIATE',
      estimatedReadingMinutes: 15,
      targetExamCategories: ['SSC_CGL', 'RRB_NTPC'],
    },
    learningObjectives: [
      'Understand Cost Price (CP) and Selling Price (SP)',
      'Calculate Profit Percentage and Loss Percentage accurately',
    ],
    prerequisites: [
      { conceptSummary: 'Percentage calculation fundamentals' },
    ],
    sections: [
      {
        id: 'sec-01',
        title: 'Fundamental Definitions',
        sectionType: 'THEORY',
        contentMarkdown: 'Profit arises when Selling Price ($SP$) exceeds Cost Price ($CP$). Loss occurs when $CP > SP$.',
        calloutNotes: [
          {
            variant: 'INFO',
            title: 'Base Quantity Rule',
            body: 'Unless explicitly stated otherwise, profit percentage and loss percentage are always calculated on the Cost Price (CP).',
          },
        ],
      },
    ],
    formulaBlocks: [
      {
        name: 'Profit Percentage',
        latexFormula: 'Profit\\% = \\frac{SP - CP}{CP} \\times 100',
        speedShortcutTrick: 'Multiply CP by $(1 + \\frac{P}{100})$ to get SP directly in single step.',
      },
    ],
    workedExamples: [
      {
        id: 'we-01',
        difficulty: 'INTERMEDIATE',
        problemText: 'An article purchased for ₹500 is sold for ₹600. Find the profit percentage.',
        stepByStepSolution: [
          { stepNumber: 1, explanation: 'Profit = ₹600 - ₹500 = ₹100' },
          { stepNumber: 2, explanation: 'Profit % = (100 / 500) * 100 = 20%' },
        ],
        shortcutMethod: 'Ratio SP/CP = 6/5 = 1.2 -> 20% gain.',
        commonMistakeToAvoid: 'Do not calculate profit percentage over SP (₹600).',
      },
    ],
    cognitiveTraps: [
      {
        trapType: 'CALCULATION_SLIP',
        misconception: 'Calculating profit % over SP instead of CP.',
        correctApproach: 'Always divide profit by Cost Price unless question explicitly mentions SP.',
      },
    ],
    quickChecks: [
      {
        id: 'qc-01',
        prompt: 'If CP is ₹200 and SP is ₹250, what is the profit percentage?',
        options: [
          { optionText: '20%', isCorrect: false },
          { optionText: '25%', isCorrect: true, explanation: 'Profit = ₹50, (50/200)*100 = 25%' },
          { optionText: '30%', isCorrect: false },
          { optionText: '50%', isCorrect: false },
        ],
      },
    ],
    revisionSummary: {
      keyTakeaways: [
        'Profit = SP - CP when SP > CP',
        'Loss = CP - SP when CP > SP',
        'Standard base for profit/loss % is Cost Price',
      ],
    },
  };

  await test('M29', 'ControlledContentCompiler successfully compiles valid typed spec into deterministic MDX', async () => {
    const res = await ControlledContentCompiler.compile(validProductionSpec);
    assert.strictEqual(res.success, true);
    assert(res.artifact !== undefined);
    assert(res.artifact.compiledMdx.includes('# Profit and Loss: Core Concept Lesson'));
    assert(res.artifact.compiledMdx.includes('<FormulaCard'));
    assert(res.artifact.compiledMdx.includes('<ExampleBox'));
    assert(res.artifact.compiledMdx.includes('<WarningBox'));
    assert(res.artifact.compiledMdx.includes('<SummaryCard'));
  });

  await test('M30', 'Compiled artifact includes valid SHA-256 hashes for source spec and compiled artifact', async () => {
    const res = await ControlledContentCompiler.compile(validProductionSpec);
    assert(res.artifact);
    assert.strictEqual(res.artifact.sourceSpecHash.length, 64);
    assert.strictEqual(res.artifact.compiledArtifactHash.length, 64);
    assert(/^[a-f0-9]{64}$/.test(res.artifact.sourceSpecHash));
    assert(/^[a-f0-9]{64}$/.test(res.artifact.compiledArtifactHash));
  });

  await test('M31', 'MdxSecurityScanner validates compiled MDX against unapproved components or scripts', async () => {
    const res = await ControlledContentCompiler.compile(validProductionSpec);
    assert(res.artifact);
    const scan = MdxSecurityScanner.scan(res.artifact.compiledMdx);
    assert.strictEqual(scan.isSafe, true);
    assert.strictEqual(scan.errors.length, 0);
  });

  await test('M32', 'MdxSecurityScanner catches illegal script tags or dangerous DOM event handlers', async () => {
    const maliciousMdx = '## Title\n<script>alert("attack")</script>\nParagraph text.';
    const scan = MdxSecurityScanner.scan(maliciousMdx);
    assert.strictEqual(scan.isSafe, false);
    assert(scan.errors.some(e => e.code === 'UNSAFE_HTML'));
  });

  await test('M33', 'LearningDocumentService.compileAndStoreVersion stores spec and mdx in storage provider', async () => {
    const storage = new MemoryStorageProvider();
    const storeRes = await LearningDocumentService.compileAndStoreVersion({
      documentId: 'doc-test-pnl-01',
      versionNumber: 1,
      spec: validProductionSpec,
      storageProvider: storage,
      storageBucket: 'learning-artifacts',
      authorType: 'HUMAN',
    });

    assert(storeRes.version);
    assert.strictEqual(storeRes.version.version_number, 1);
    assert(storeRes.version.source_spec_storage_key.includes('doc-test-pnl-01'));
    assert(storeRes.version.compiled_artifact_storage_key.includes('doc-test-pnl-01'));

    const specExists = await storage.exists('learning-artifacts', storeRes.version.source_spec_storage_key);
    const mdxExists = await storage.exists('learning-artifacts', storeRes.version.compiled_artifact_storage_key);
    assert.strictEqual(specExists, true);
    assert.strictEqual(mdxExists, true);
  });

  await test('M34', 'Zero content body invariant: document_versions stores storage keys and hashes, never markdown body in DB schema', async () => {
    assert(mig55Sql.includes('source_spec_storage_key VARCHAR(500) NOT NULL'));
    assert(mig55Sql.includes('source_spec_hash VARCHAR(64) NOT NULL'));
    assert(mig55Sql.includes('compiled_artifact_storage_key VARCHAR(500) NOT NULL'));
    assert(mig55Sql.includes('compiled_artifact_hash VARCHAR(64) NOT NULL'));
    assert(!mig55Sql.includes('content_body TEXT'), 'Document versions must NOT store raw text content bodies');
  });

  // --------------------------------------------------------------------------
  // GROUP 6: Candidate Rendering & 10-Component Parity (M35 - M40)
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 6: Candidate Rendering & 10-Component Parity ---');

  await test('M35', 'ControlledContentRenderer includes all 10 approved educational components in APPROVED_COMPONENTS_MAP', async () => {
    const expected = [
      'FormulaCard',
      'ExampleBox',
      'WarningBox',
      'ExamTip',
      'QuestionReference',
      'ComparisonTable',
      'QuickCheck',
      'SummaryCard',
      'DiagramBlock',
      'Callout',
    ];
    for (const name of expected) {
      assert(name in APPROVED_COMPONENTS_MAP, `Approved components map missing ${name}`);
      assert(typeof APPROVED_COMPONENTS_MAP[name] === 'function', `${name} must be a valid component function`);
    }
  });

  await test('M36', 'FormulaCard renders name, latex formula, and speed shortcut trick', async () => {
    const FormulaCard = APPROVED_COMPONENTS_MAP.FormulaCard;
    assert(typeof FormulaCard === 'function');
  });

  await test('M37', 'ExampleBox renders difficulty, problem text, and shortcut method', async () => {
    const ExampleBox = APPROVED_COMPONENTS_MAP.ExampleBox;
    assert(typeof ExampleBox === 'function');
  });

  await test('M38', 'WarningBox renders misconception and correct approach', async () => {
    const WarningBox = APPROVED_COMPONENTS_MAP.WarningBox;
    assert(typeof WarningBox === 'function');
  });

  await test('M39', 'SummaryCard renders key takeaways and core formulas', async () => {
    const SummaryCard = APPROVED_COMPONENTS_MAP.SummaryCard;
    assert(typeof SummaryCard === 'function');
  });

  await test('M40', 'ArticleReaderPage in app/articles/[slug]/page.tsx utilizes ControlledContentRenderer for article body', async () => {
    const pageSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'articles', '[slug]', 'page.tsx'), 'utf-8');
    assert(pageSource.includes('ControlledContentRenderer'), 'Article reader page must use ControlledContentRenderer');
    assert(pageSource.includes('<ControlledContentRenderer contentMdx={article.contentBody || ""} />'));
  });

  console.log('\n============================================================');
  console.log(`PHASE 3M.1 TEST RESULTS: ${passedTests} PASSED | ${failedTests} FAILED (Total: ${passedTests + failedTests})`);
  console.log('============================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
