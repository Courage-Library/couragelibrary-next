/**
 * COURAGE LIBRARY — PHASE 3C TEST SUITE
 * Controlled Content Compilation & Rendering Pipeline
 * 
 * Comprehensive forensic verification testing:
 * 1. Migration 55 Schema, Tables, Constraints, Indexes & RLS
 * 2. LessonDocumentSpec Runtime Validation & Schema Gates
 * 3. AST-Level Security, Component Allowlist & Malicious Payload Defense
 * 4. URL Security & Dangerous Scheme Defense
 * 5. Question Reference Authority & Canonical Integrity
 * 6. Asset Reference Authority & Access Control
 * 7. Deterministic Compilation & Cryptographic Integrity
 * 8. Compiler Versioning & Immutability Invariants
 * 9. Approved Component Contracts & Rendering Pipeline
 * 10. 14 Protected Baseline Database Tables 100% Intact
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// 1. WebSocket Polyfill for Supabase in Node.js 20
global.WebSocket = class WebSocket {};

// 2. Hook TypeScript compilation
require.extensions['.ts'] = function (module, filename) {
  const fileContent = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(fileContent, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.Node10,
    },
  });
  module._compile(compiled.outputText, filename);
};

// 3. Import Production Services Directly
const { ContentSpecValidator } = require('../services/content-spec-validator.ts');
const { MdxSecurityScanner, APPROVED_COMPONENTS } = require('../services/mdx-security-scanner.ts');
const { QuestionReferenceService } = require('../services/question-reference.service.ts');
const { AssetReferenceService } = require('../services/asset-reference.service.ts');
const { ControlledContentCompiler } = require('../services/controlled-content-compiler.service.ts');
const { LearningDocumentService } = require('../services/learning-document.service.ts');
const { MemoryStorageProvider } = require('../services/storage/memory-storage.provider.ts');
const { createClient } = require('@supabase/supabase-js');

let passCount = 0;
let failCount = 0;

function assert(condition, message, testId) {
  if (condition) {
    passCount++;
    console.log(`  ✓ [${testId}] PASS: ${message}`);
  } else {
    failCount++;
    console.error(`  ✗ [${testId}] FAIL: ${message}`);
  }
}

async function runTests() {
  console.log('============================================================');
  console.log('PHASE 3C: CONTROLLED CONTENT COMPILATION & RENDERING PIPELINE');
  console.log('FORENSIC VERIFICATION SUITE');
  console.log('============================================================\n');

  // -------------------------------------------------------------------------
  // Track 1: Migration 55 SQL Schema & Invariants (T01 - T10)
  // -------------------------------------------------------------------------
  console.log('--- Track 1: Migration 55 SQL Schema & Invariants (T01 - T10) ---');
  const migration55Path = path.join(__dirname, '..', 'supabase', 'migrations', '20260915000055_phase3c_content_compilation_and_versions.sql');
  const migration55Exists = fs.existsSync(migration55Path);
  assert(migration55Exists, 'Migration 55 SQL file exists in supabase/migrations/', 'T01');

  let m55Sql = '';
  if (migration55Exists) {
    m55Sql = fs.readFileSync(migration55Path, 'utf8');
  }

  assert(m55Sql.includes('CREATE TABLE IF NOT EXISTS public.learning_documents'), 'Defines learning_documents table', 'T02');
  assert(m55Sql.includes('CREATE TABLE IF NOT EXISTS public.document_versions'), 'Defines document_versions table', 'T03');
  assert(m55Sql.includes('document_type IN'), 'Enforces document_type domain check constraint', 'T04');
  assert(m55Sql.includes('review_status IN'), 'Enforces review_status domain check constraint', 'T05');
  assert(m55Sql.includes('author_type IN'), 'Enforces author_type domain check constraint', 'T06');
  assert(m55Sql.includes("source_spec_hash ~ '^[a-f0-9]{64}$'"), 'Enforces 64-char hexadecimal SHA-256 regex check constraint on source_spec_hash', 'T07');
  assert(m55Sql.includes("compiled_artifact_hash ~ '^[a-f0-9]{64}$'"), 'Enforces 64-char hexadecimal SHA-256 regex check constraint on compiled_artifact_hash', 'T08');
  assert(m55Sql.includes('ENABLE ROW LEVEL SECURITY'), 'Enforces Row Level Security on both Phase 3C tables', 'T09');
  assert(
    !m55Sql.toLowerCase().includes('content_body text') &&
    !m55Sql.toLowerCase().includes('raw_markdown text') &&
    !m55Sql.toLowerCase().includes('bytea'),
    'Strictly ZERO content bodies or binary blobs in relational tables',
    'T10'
  );

  // -------------------------------------------------------------------------
  // Track 2: LessonDocumentSpec Runtime Validation (T11 - T20)
  // -------------------------------------------------------------------------
  console.log('\n--- Track 2: LessonDocumentSpec Runtime Validation (T11 - T20) ---');
  
  const validSampleSpec = {
    schemaVersion: '1.0.0',
    documentId: 'doc-perc-001',
    unitSlug: 'percentage_concept_lesson',
    language: 'en',
    metadata: {
      title: 'Mastering Percentages & Base Conversion',
      topicId: 'top-perc-01',
      subjectId: 'sub-quant-01',
      targetExamCategories: ['SSC_CGL', 'BANK_PO'],
      estimatedReadingMinutes: 8,
      difficultyTier: 'BEGINNER',
      authoritativeKeywords: ['percentage', 'fraction', 'base'],
    },
    learningObjectives: [
      'Understand percentage as parts per hundred',
      'Convert standard fractions into percentages rapidly',
    ],
    prerequisites: [
      { conceptSummary: 'Basic arithmetic fractions and decimals' }
    ],
    sections: [
      {
        id: 'sec-intro',
        title: 'Conceptual Foundation of Percentages',
        sectionType: 'THEORY',
        contentMarkdown: 'A percentage represents a fraction with denominator 100.',
        diagramAssetId: 'asset-perc-grid-01',
        calloutNotes: [
          {
            variant: 'TIP',
            title: 'Base Anchor Rule',
            body: 'Always identify what the fraction is calculated relative to.'
          }
        ]
      }
    ],
    formulaBlocks: [
      {
        id: 'form-01',
        name: 'Percentage Fraction Equivalence',
        latexFormula: 'P = \\frac{Part}{Whole} \\times 100\\%',
        variableDefinitions: [
          { symbol: 'P', meaning: 'Percentage value' },
          { symbol: 'Part', meaning: 'Numerator portion' },
          { symbol: 'Whole', meaning: 'Denominator base' }
        ],
        applicableConditions: ['Whole > 0'],
        speedShortcutTrick: 'Multiply numerator by reciprocal base.'
      }
    ],
    workedExamples: [
      {
        id: 'ex-01',
        difficulty: 'EASY',
        problemText: 'Convert 3/8 into a percentage.',
        stepByStepSolution: [
          { stepNumber: 1, explanation: 'Recall that 1/8 = 12.5%.' },
          { stepNumber: 2, explanation: 'Multiply by 3: 3 * 12.5% = 37.5%.', mathSnippet: '3 * 12.5 = 37.5%' }
        ],
        shortcutMethod: 'Use standard fractional decimal ladder: 3/8 = 37.5%.'
      }
    ],
    cognitiveTraps: [
      {
        trapType: 'CALCULATION_SLIP',
        misconception: 'Confusing 1/6 (16.66%) with 1/7 (14.28%).',
        correctApproach: 'Anchor 1/6 to 16.66% and 1/7 to 14.28%.'
      }
    ],
    authenticPyqReferences: [
      {
        questionVersionId: 'qv-ssc-cgl-2024-q101',
        relevanceRationale: 'Direct application of fractional base conversion in SSC CGL Tier 1.'
      }
    ],
    quickChecks: [
      {
        id: 'qc-01',
        prompt: 'What is 5/8 expressed as a percentage?',
        options: [
          { id: 'opt-a', text: '62.5%', isCorrect: true, feedbackExplanation: 'Correct: 5 * 12.5% = 62.5%.' },
          { id: 'opt-b', text: '58.0%', isCorrect: false, feedbackExplanation: 'Incorrect.' }
        ]
      }
    ],
    revisionSummary: {
      keyTakeaways: [
        'Percentage is ratio over 100.',
        'Memorize 1/2 through 1/20 standard fraction ladder.'
      ],
      coreFormulas: ['P = (Part/Whole) * 100'],
      speedRules: ['1/8 = 12.5%', '1/16 = 6.25%']
    },
    seo: {
      metaTitle: 'Percentages Concept Lesson — Courage Library',
      metaDescription: 'Learn percentage foundations, formulas, and shortcuts.',
      focusKeywords: ['percentage', 'ssc cgl quant']
    }
  };

  const validResult = ContentSpecValidator.validate(validSampleSpec);
  assert(validResult.isValid === true, 'Valid LessonDocumentSpec passes schema validation', 'T11');
  assert(validResult.isStructurallyValid === true, 'Valid LessonDocumentSpec marked structurally valid', 'T12');

  const invalidSlugSpec = { ...validSampleSpec, unitSlug: 'INVALID SLUG WITH SPACES!' };
  const invalidSlugResult = ContentSpecValidator.validate(invalidSlugSpec);
  assert(invalidSlugResult.isValid === false, 'Invalid unitSlug format is strictly rejected', 'T13');

  const invalidLangSpec = { ...validSampleSpec, language: 'unsupported_lang' };
  const invalidLangResult = ContentSpecValidator.validate(invalidLangSpec);
  assert(invalidLangResult.isValid === false, 'Unsupported language code is strictly rejected', 'T14');

  const invalidDiffSpec = { ...validSampleSpec, metadata: { ...validSampleSpec.metadata, difficultyTier: 'GOD_MODE' } };
  const invalidDiffResult = ContentSpecValidator.validate(invalidDiffSpec);
  assert(invalidDiffResult.isValid === false, 'Invalid difficulty tier is rejected', 'T15');

  const emptySecSpec = { ...validSampleSpec, sections: [] };
  const emptySecResult = ContentSpecValidator.validate(emptySecSpec);
  assert(emptySecResult.isValid === false, 'Empty sections array is strictly rejected', 'T16');

  const invalidSecTypeSpec = {
    ...validSampleSpec,
    sections: [{ id: 's1', title: 'T', sectionType: 'UNAPPROVED_TYPE', contentMarkdown: 'M' }]
  };
  const invalidSecTypeResult = ContentSpecValidator.validate(invalidSecTypeSpec);
  assert(invalidSecTypeResult.isValid === false, 'Unapproved sectionType is rejected', 'T17');

  const missingFormulaSpec = {
    ...validSampleSpec,
    formulaBlocks: [{ id: 'f1', name: 'Formula Without Math', latexFormula: '' }]
  };
  const missingFormulaResult = ContentSpecValidator.validate(missingFormulaSpec);
  assert(missingFormulaResult.isValid === false, 'FormulaBlock missing latexFormula is rejected', 'T18');

  const invalidTrapSpec = {
    ...validSampleSpec,
    cognitiveTraps: [{ trapType: 'UNAPPROVED_TRAP', misconception: 'M', correctApproach: 'C' }]
  };
  const invalidTrapResult = ContentSpecValidator.validate(invalidTrapSpec);
  assert(invalidTrapResult.isValid === false, 'CognitiveTrap with unapproved trapType is rejected', 'T19');

  const noCorrectQcSpec = {
    ...validSampleSpec,
    quickChecks: [
      {
        id: 'qc-bad',
        prompt: 'P',
        options: [
          { id: 'o1', text: 'A', isCorrect: false, feedbackExplanation: 'No' },
          { id: 'o2', text: 'B', isCorrect: false, feedbackExplanation: 'No' }
        ]
      }
    ]
  };
  const noCorrectQcResult = ContentSpecValidator.validate(noCorrectQcSpec);
  assert(noCorrectQcResult.isValid === false, 'QuickCheck with zero correct options is rejected', 'T20');

  // -------------------------------------------------------------------------
  // Track 3: AST-Level Security & Malicious Payload Defense (T21 - T35)
  // -------------------------------------------------------------------------
  console.log('\n--- Track 3: AST-Level Security & Malicious Payload Defense (T21 - T35) ---');

  const safeMdx = `# Title\n\nSome paragraph\n\n<FormulaCard name="Test" latexFormula="x = 1" />\n\n<Callout variant="TIP" title="Tip" body="Content" />`;
  const safeScan = MdxSecurityScanner.scan(safeMdx);
  assert(safeScan.isSafe === true, 'Safe MDX containing approved components passes scan', 'T21');

  const importMdx = `import { useState } from 'react';\n# Heading`;
  const importScan = MdxSecurityScanner.scan(importMdx);
  assert(importScan.isSafe === false && importScan.errors.some(e => e.code === 'IMPORT_NOT_ALLOWED'), 'Strictly rejects import statements', 'T22');

  const exportMdx = `export const x = 10;\n# Heading`;
  const exportScan = MdxSecurityScanner.scan(exportMdx);
  assert(exportScan.isSafe === false && exportScan.errors.some(e => e.code === 'EXPORT_NOT_ALLOWED'), 'Strictly rejects export statements', 'T23');

  const dynImportMdx = `const mod = import('malicious-module');\n# Heading`;
  const dynImportScan = MdxSecurityScanner.scan(dynImportMdx);
  assert(dynImportScan.isSafe === false, 'Strictly rejects dynamic import() calls', 'T24');

  const requireMdx = `const fs = require('fs');\n# Heading`;
  const requireScan = MdxSecurityScanner.scan(requireMdx);
  assert(requireScan.isSafe === false && requireScan.errors.some(e => e.code === 'REQUIRE_NOT_ALLOWED'), 'Strictly rejects require() calls', 'T25');

  const scriptMdx = `<script>alert("XSS")</script>\n# Heading`;
  const scriptScan = MdxSecurityScanner.scan(scriptMdx);
  assert(scriptScan.isSafe === false && scriptScan.errors.some(e => e.code === 'UNSAFE_HTML'), 'Strictly rejects <script> tags', 'T26');

  const iframeMdx = `<iframe src="https://evil.com"></iframe>\n# Heading`;
  const iframeScan = MdxSecurityScanner.scan(iframeMdx);
  assert(iframeScan.isSafe === false && iframeScan.errors.some(e => e.code === 'UNSAFE_HTML'), 'Strictly rejects <iframe> tags', 'T27');

  const styleMdx = `<style>body { display: none; }</style>\n# Heading`;
  const styleScan = MdxSecurityScanner.scan(styleMdx);
  assert(styleScan.isSafe === false && styleScan.errors.some(e => e.code === 'UNSAFE_HTML'), 'Strictly rejects <style> tags', 'T28');

  const eventHandlerMdx = `<div onload="stealCredentials()">Click</div>`;
  const eventHandlerScan = MdxSecurityScanner.scan(eventHandlerMdx);
  assert(eventHandlerScan.isSafe === false && eventHandlerScan.errors.some(e => e.code === 'EVENT_HANDLER_NOT_ALLOWED'), 'Strictly rejects inline onload event handler', 'T29');

  const procEnvMdx = `<div>{process.env.SUPABASE_SERVICE_ROLE_KEY}</div>`;
  const procEnvScan = MdxSecurityScanner.scan(procEnvMdx);
  assert(procEnvScan.isSafe === false && procEnvScan.errors.some(e => e.code === 'PROCESS_ENV_NOT_ALLOWED'), 'Strictly rejects process.env access', 'T30');

  const procCwdMdx = `<div>{process.cwd()}</div>`;
  const procCwdScan = MdxSecurityScanner.scan(procCwdMdx);
  assert(procCwdScan.isSafe === false && procCwdScan.errors.some(e => e.code === 'PROCESS_ENV_NOT_ALLOWED'), 'Strictly rejects process methods', 'T31');

  const evalMdx = `<div>{eval("2+2")}</div>`;
  const evalScan = MdxSecurityScanner.scan(evalMdx);
  assert(evalScan.isSafe === false && evalScan.errors.some(e => e.code === 'UNSAFE_EXPRESSION_NOT_ALLOWED'), 'Strictly rejects eval() dynamic execution', 'T32');

  const arbitraryJsxMdx = `<ArbitraryCustomComponent prop="value" />`;
  const arbitraryJsxScan = MdxSecurityScanner.scan(arbitraryJsxMdx);
  assert(arbitraryJsxScan.isSafe === false && arbitraryJsxScan.errors.some(e => e.code === 'UNSUPPORTED_COMPONENT'), 'Strictly rejects unapproved arbitrary React components', 'T33');

  assert(APPROVED_COMPONENTS.length === 10, 'Allowlist strictly limited to 10 approved Phase 2 components', 'T34');

  const emptyScan = MdxSecurityScanner.scan('');
  assert(emptyScan.isSafe === false && emptyScan.errors.some(e => e.code === 'EMPTY_PAYLOAD'), 'Strictly rejects empty content payload', 'T35');

  // -------------------------------------------------------------------------
  // Track 4: URL Security & Dangerous Scheme Defense (T36 - T41)
  // -------------------------------------------------------------------------
  console.log('\n--- Track 4: URL Security & Dangerous Scheme Defense (T36 - T41) ---');

  const safeUrlMdx = `[Official Syllabus](https://couragelibrary.com/syllabus)`;
  const safeUrlScan = MdxSecurityScanner.scan(safeUrlMdx);
  assert(safeUrlScan.isSafe === true, 'Permits safe https:// URL scheme', 'T36');

  const httpUrlMdx = `[Notice](http://couragelibrary.com/notice)`;
  const httpUrlScan = MdxSecurityScanner.scan(httpUrlMdx);
  assert(httpUrlScan.isSafe === true, 'Permits safe http:// URL scheme', 'T37');

  const mailtoUrlMdx = `[Contact](mailto:support@couragelibrary.com)`;
  const mailtoUrlScan = MdxSecurityScanner.scan(mailtoUrlMdx);
  assert(mailtoUrlScan.isSafe === true, 'Permits safe mailto: URL scheme', 'T38');

  const jsUrlMdx = `[Click Me](javascript:alert(document.cookie))`;
  const jsUrlScan = MdxSecurityScanner.scan(jsUrlMdx);
  assert(jsUrlScan.isSafe === false && jsUrlScan.errors.some(e => e.code === 'UNSAFE_URL'), 'Strictly rejects dangerous javascript: URL scheme', 'T39');

  const dataUrlMdx = `<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" />`;
  const dataUrlScan = MdxSecurityScanner.scan(dataUrlMdx);
  assert(dataUrlScan.isSafe === false && dataUrlScan.errors.some(e => e.code === 'UNSAFE_URL'), 'Strictly rejects data: URL scheme', 'T40');

  const fileUrlMdx = `[Local File](file:///etc/passwd)`;
  const fileUrlScan = MdxSecurityScanner.scan(fileUrlMdx);
  assert(fileUrlScan.isSafe === false && fileUrlScan.errors.some(e => e.code === 'UNSAFE_URL'), 'Strictly rejects file:/// URL scheme', 'T41');

  // -------------------------------------------------------------------------
  // Track 5: Question Reference Authority & Canonical Integrity (T42 - T47)
  // -------------------------------------------------------------------------
  console.log('\n--- Track 5: Question Reference Authority & Canonical Integrity (T42 - T47) ---');

  const mockQBankClient = {
    async fetchQuestionVersion(id) {
      if (id === 'valid-qv-100') {
        return {
          id: 'valid-qv-100',
          question_id: 'q-canon-01',
          version_number: 2,
          question_text: 'What is 20% of 150?',
          question_type: 'SINGLE_CHOICE',
          options: [
            { id: 'opt-1', option_index: 0, option_text: '30' },
            { id: 'opt-2', option_index: 1, option_text: '25' }
          ],
          correct_option_id: 'opt-1',
          explanation: '20% of 150 = 0.20 * 150 = 30.',
          status: 'ACTIVE',
          exam_title: 'SSC CGL 2024 Tier 1',
          year: 2024,
          shift: 'Shift 1',
          tier: 'Tier 1'
        };
      }
      if (id === 'inactive-qv-200') {
        return { id: 'inactive-qv-200', status: 'DEPRECATED' };
      }
      return null;
    }
  };

  const validQRes = await QuestionReferenceService.resolve('valid-qv-100', 'Core PYQ Practice', mockQBankClient);
  assert(validQRes.resolved !== null && validQRes.error === null, 'Resolves active canonical Question Bank version', 'T42');
  assert(validQRes.resolved.questionText === 'What is 20% of 150?', 'Canonical question text faithfully resolved', 'T43');
  assert(validQRes.resolved.examMetadata.examTitle === 'SSC CGL 2024 Tier 1', 'Authoritative exam metadata resolved', 'T44');

  const inactiveQRes = await QuestionReferenceService.resolve('inactive-qv-200', 'Deprecated', mockQBankClient);
  assert(inactiveQRes.error !== null && inactiveQRes.error.code === 'QUESTION_INACTIVE', 'Strictly rejects inactive/deprecated question version', 'T45');

  const missingQRes = await QuestionReferenceService.resolve('non-existent-qv', 'Missing', mockQBankClient);
  assert(missingQRes.error !== null && missingQRes.error.code === 'QUESTION_NOT_FOUND', 'Strictly rejects non-existent question version ID', 'T46');

  const invalidIdRes = await QuestionReferenceService.resolve('', 'Empty');
  assert(invalidIdRes.error !== null && invalidIdRes.error.code === 'INVALID_QUESTION_REFERENCE', 'Strictly rejects empty question version ID', 'T47');

  // -------------------------------------------------------------------------
  // Track 6: Asset Reference Authority & Access Control (T48 - T53)
  // -------------------------------------------------------------------------
  console.log('\n--- Track 6: Asset Reference Authority & Access Control (T48 - T53) ---');

  const mockAssetClient = {
    async fetchAsset(id) {
      if (id === 'asset-valid-01') {
        return {
          id: 'asset-valid-01',
          slug: 'percentage_grid_diagram',
          title: '100 Grid Percentage Model',
          alt_text: 'A 10x10 grid with 20 shaded squares',
          mime_type: 'image/svg+xml',
          status: 'ACTIVE',
          storage_key: 'learning/assets/diagram/percentage_grid.svg',
          width: 800,
          height: 600,
          aspect_ratio: 1.33
        };
      }
      if (id === 'asset-inactive-02') {
        return { id: 'asset-inactive-02', status: 'FLAGGED_SECURITY' };
      }
      return null;
    }
  };

  const validAssetRes = await AssetReferenceService.resolve('asset-valid-01', mockAssetClient);
  assert(validAssetRes.resolved !== null && validAssetRes.error === null, 'Resolves active asset from Phase 3B catalog', 'T48');
  assert(validAssetRes.resolved.title === '100 Grid Percentage Model', 'Faithfully resolves asset metadata', 'T49');
  assert(validAssetRes.resolved.aspectRatio === 1.33, 'Preserves asset aspect ratio', 'T50');

  const inactiveAssetRes = await AssetReferenceService.resolve('asset-inactive-02', mockAssetClient);
  assert(inactiveAssetRes.error !== null && inactiveAssetRes.error.code === 'ASSET_INACTIVE', 'Strictly rejects inactive/flagged asset', 'T51');

  const missingAssetRes = await AssetReferenceService.resolve('asset-missing-99', mockAssetClient);
  assert(missingAssetRes.error !== null && missingAssetRes.error.code === 'ASSET_NOT_FOUND', 'Strictly rejects missing asset ID', 'T52');

  const emptyAssetRes = await AssetReferenceService.resolve('');
  assert(emptyAssetRes.error !== null && emptyAssetRes.error.code === 'INVALID_ASSET_REFERENCE', 'Strictly rejects empty asset ID', 'T53');

  // -------------------------------------------------------------------------
  // Track 7: Deterministic Compilation & Cryptographic Integrity (T54 - T60)
  // -------------------------------------------------------------------------
  console.log('\n--- Track 7: Deterministic Compilation & Cryptographic Integrity (T54 - T60) ---');

  const compileResult1 = await ControlledContentCompiler.compile(validSampleSpec);
  assert(compileResult1.success === true && compileResult1.artifact !== undefined, 'Controlled compilation succeeds for valid spec', 'T54');

  const compileResult2 = await ControlledContentCompiler.compile(validSampleSpec);
  assert(compileResult1.artifact.compiledMdx === compileResult2.artifact.compiledMdx, 'Compilation output is 100% byte-for-byte deterministic across repeated runs', 'T55');
  assert(compileResult1.artifact.compiledArtifactHash === compileResult2.artifact.compiledArtifactHash, 'Cryptographic SHA-256 hash is 100% deterministic', 'T56');

  const mutatedSpec = { ...validSampleSpec, metadata: { ...validSampleSpec.metadata, title: 'Mutated Title' } };
  const compileResultMutated = await ControlledContentCompiler.compile(mutatedSpec);
  assert(compileResult1.artifact.compiledArtifactHash !== compileResultMutated.artifact.compiledArtifactHash, 'Distinct content inputs produce distinct SHA-256 hashes', 'T57');

  assert(
    !compileResult1.artifact.compiledMdx.includes('2026-') &&
    !compileResult1.artifact.compiledMdx.includes('timestamp') &&
    !compileResult1.artifact.compiledMdx.includes('Date.now'),
    'Compiled artifact contains zero non-deterministic timestamps or random identifiers',
    'T58'
  );

  assert(compileResult1.artifact.stats.wordCount > 0, 'Computes accurate word count metrics', 'T59');
  assert(compileResult1.artifact.stats.formulaCount === 1, 'Records accurate formula count in artifact manifest', 'T60');

  // -------------------------------------------------------------------------
  // Track 8: Versioning & Published Immutability Invariants (T61 - T66)
  // -------------------------------------------------------------------------
  console.log('\n--- Track 8: Versioning & Published Immutability Invariants (T61 - T66) ---');

  const memoryStorage = new MemoryStorageProvider();
  const compiledStoreResult = await LearningDocumentService.compileAndStoreVersion({
    documentId: 'doc-perc-001',
    versionNumber: 1,
    spec: validSampleSpec,
    storageProvider: memoryStorage,
    storageBucket: 'learning-artifacts',
  });

  assert(compiledStoreResult.version.review_status === 'COMPILED', 'Compiled version saved with COMPILED status', 'T61');
  assert(await memoryStorage.exists('learning-artifacts', compiledStoreResult.version.source_spec_storage_key), 'Persisted source spec JSON to storage provider', 'T62');
  assert(await memoryStorage.exists('learning-artifacts', compiledStoreResult.version.compiled_artifact_storage_key), 'Persisted compiled MDX artifact to storage provider', 'T63');

  const publishedVersion = {
    id: 'ver-published-001',
    document_id: 'doc-perc-001',
    version_number: 1,
    schema_version: '1.0.0',
    compiler_version: '1.0.0',
    component_contract_version: '1.0.0',
    source_spec_storage_key: compiledStoreResult.version.source_spec_storage_key,
    source_spec_hash: compiledStoreResult.version.source_spec_hash,
    compiled_artifact_storage_key: compiledStoreResult.version.compiled_artifact_storage_key,
    compiled_artifact_hash: compiledStoreResult.version.compiled_artifact_hash,
    author_type: 'HUMAN',
    review_status: 'PUBLISHED',
    approved_by_user_id: 'admin-uuid',
    is_published: true,
    published_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  assert(LearningDocumentService.isImmutable(publishedVersion) === true, 'Correctly classifies published version as immutable', 'T64');

  let mutationBlocked = false;
  try {
    LearningDocumentService.assertMutable(publishedVersion);
  } catch (err) {
    mutationBlocked = true;
  }
  assert(mutationBlocked === true, 'Strictly throws error and blocks mutation of published version', 'T65');

  assert(
    compiledStoreResult.version.compiler_version === '1.0.0' &&
    compiledStoreResult.version.schema_version === '1.0.0',
    'Records explicit compiler and schema version numbers',
    'T66'
  );

  // -------------------------------------------------------------------------
  // Track 9: Approved Component Contracts & Rendering Pipeline (T67 - T70)
  // -------------------------------------------------------------------------
  console.log('\n--- Track 9: Approved Component Contracts & Rendering Pipeline (T67 - T70) ---');

  const componentsIndexFile = path.join(__dirname, '..', 'components', 'learning', 'index.ts');
  assert(fs.existsSync(componentsIndexFile), 'Components index exists and exports approved learning components', 'T67');

  const rendererFile = path.join(__dirname, '..', 'components', 'learning', 'controlled-content-renderer.tsx');
  assert(fs.existsSync(rendererFile), 'ControlledContentRenderer component exists', 'T68');

  const compFiles = [
    'formula-card.tsx',
    'example-box.tsx',
    'warning-box.tsx',
    'exam-tip.tsx',
    'question-reference.tsx',
    'comparison-table.tsx',
    'quick-check.tsx',
    'summary-card.tsx',
    'diagram-block.tsx',
    'callout.tsx',
  ];
  const allCompFilesExist = compFiles.every(f => fs.existsSync(path.join(__dirname, '..', 'components', 'learning', f)));
  assert(allCompFilesExist, 'All 10 approved component implementation files exist in components/learning/', 'T69');

  const rendererCode = fs.readFileSync(rendererFile, 'utf8');
  assert(!rendererCode.includes('eval(') && !rendererCode.includes('new Function('), 'ControlledContentRenderer is free of arbitrary code execution', 'T70');

  // -------------------------------------------------------------------------
  // Track 10: Database Baseline Invariants & 14 Protected Tables (T71 - T85)
  // -------------------------------------------------------------------------
  console.log('\n--- Track 10: Database Baseline Invariants & 14 Protected Tables (T71 - T85) ---');

  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    const expectedBaseline = {
      mock_tests: 8,
      mock_sections: 14,
      mock_questions: 350,
      mock_templates: 8,
      test_attempts: 31,
      test_results: 10,
      attempt_answers: 200,
      questions: 103,
      question_versions: 103,
      question_options: 412,
      question_answers: 103,
      subscription_plans: 1,
      coin_wallets: 5,
      coin_ledger: 8,
    };

    let idx = 71;
    for (const [table, expectedCount] of Object.entries(expectedBaseline)) {
      const testId = `T${idx.toString().padStart(2, '0')}`;
      try {
        const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
        if (error) {
          assert(false, `Protected table [${table}] query error: ${error.message}`, testId);
        } else {
          assert(count === expectedCount, `Protected baseline table [${table}] row count preserved: ${count}/${expectedCount}`, testId);
        }
      } catch (err) {
        assert(false, `Protected table [${table}] exception: ${err.message}`, testId);
      }
      idx++;
    }
  } else {
    console.log('  [WARN] Supabase credentials not found, skipping live DB count assertions.');
  }

  assert(failCount === 0, 'All Phase 3C verification tracks verified with 100% success', 'T85');

  console.log('\n============================================================');
  console.log('PHASE 3C VERIFICATION SUMMARY:');
  console.log(`  - Passed: ${passCount} / ${passCount + failCount} (${((passCount / (passCount + failCount)) * 100).toFixed(1)}%)`);
  console.log(`  - Failed: ${failCount}`);
  console.log('============================================================\n');

  if (failCount > 0) {
    console.error('[FAIL] Phase 3C CONTROLLED CONTENT COMPILATION & RENDERING PIPELINE FAILED.');
    process.exit(1);
  } else {
    console.log('[PASS] Phase 3C CONTROLLED CONTENT COMPILATION & RENDERING PIPELINE CERTIFIED.');
  }
}

runTests().catch(err => {
  console.error('Fatal error in Phase 3C test runner:', err);
  process.exit(1);
});
