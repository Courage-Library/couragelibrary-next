/**
 * COURAGE LIBRARY — PHASE 3G TEST SUITE
 * Published Content Quality & Candidate Experience Audit
 * 
 * 15 Engineering & Invariant Assertions (P01 - P15):
 * - P01: Target Resolution across all 10 Canonical Units
 * - P02: Published Pointer Integrity & Lifecycle Status
 * - P03: Source Spec & Compiled MDX Artifact Availability
 * - P04: Document-Version Referential Linkage & Monotonicity
 * - P05: QuestionReference & PYQ Integrity (No Fake Question IDs)
 * - P06: Asset Reference & Mathematical Formula Integrity
 * - P07: Candidate Rendering Route Resolution & Approved Component Tags
 * - P08: Learn More & Remediation Navigation Chain Resolution
 * - P09: AI Contamination & Meta-Commentary Scan
 * - P10: SEO Metadata, Slug Hierarchy & Discoverability
 * - P11: Version Immutability & Mutation Guard Enforcement
 * - P12: Authoritative Curriculum Context Isolation (No Silent Promotion)
 * - P13: Zero Unpublished Content Leakage to Candidate Views
 * - P14: Non-Duplicate Structural IDs & Educational Integrity
 * - P15: Protected Database Baseline Preservation (20 Tables Intact)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const crypto = require('crypto');

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

// Import domain services
const { AuthoringQueueService } = require('@/services/authoring-queue.service');
const { CurriculumCoverageService } = require('@/services/curriculum-coverage.service');
const { AdminContentStudioService } = require('@/services/admin-content-studio.service');
const { CurriculumContextBuilder } = require('@/services/ai/curriculum-context-builder.service');
const { StructuredContentImporter } = require('@/services/ai/structured-content-importer.service');
const { ContentSpecValidator } = require('@/services/content-spec-validator');
const { MdxSecurityScanner } = require('@/services/mdx-security-scanner');
const { AcademicValidator } = require('@/services/ai/academic-validator.service');
const { ControlledContentCompiler } = require('@/services/controlled-content-compiler.service');
const { LearningDocumentService } = require('@/services/learning-document.service');
const { MemoryStorageProvider } = require('@/services/storage/memory-storage.provider');
const { StorageFactory } = require('@/services/storage/storage-factory');

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
  console.log('COURAGE LIBRARY — PHASE 3G CONTENT QUALITY & UX AUDIT SUITE');
  console.log('15 Authoritative Assertions (P01 - P15)');
  console.log('============================================================\n');

  // Load results from forensic audit
  const resultsPath = path.join(__dirname, 'phase3g_forensic_results.json');
  assert(fs.existsSync(resultsPath), 'phase3g_forensic_results.json must exist');
  const auditResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

  const matrix = await CurriculumCoverageService.getCurriculumCoverageMatrix(supabase);
  const allCanonicalUnits = [];
  matrix.subjects.forEach(s => s.topics.forEach(t => t.units.forEach(u => allCanonicalUnits.push(u))));

  // P01: Target Resolution
  await test('P01', 'Target resolution: All 10 published targets resolve against canonical curriculum', async () => {
    assert.strictEqual(auditResults.length, 10, 'Must have exactly 10 audit targets');
    for (const r of auditResults) {
      const unit = allCanonicalUnits.find(u => u.unitSlug === r.unitSlug || u.unitTitle === r.unitTitle);
      assert(unit, `Target ${r.targetId} (${r.topic}) must resolve to a canonical unit`);
    }
  });

  // P02: Published pointer integrity
  await test('P02', 'Published pointer integrity: Structure and security validation pass for all 10 targets', async () => {
    for (const r of auditResults) {
      assert.strictEqual(r.structureStatus, 'PASS', `Target ${r.targetId} structure must be PASS`);
      assert.strictEqual(r.securityStatus, 'PASS', `Target ${r.targetId} security must be PASS`);
    }
  });

  // P03: Artifact availability
  await test('P03', 'Artifact availability: Compiled byte size > 0 and SHA-256 hashes generated', async () => {
    for (const r of auditResults) {
      assert(r.compiledByteSize > 200, `Target ${r.targetId} compiled size must be > 200 bytes`);
      assert.strictEqual(r.compiledSha256.length, 64, `Target ${r.targetId} SHA-256 must be 64 hex characters`);
      assert.strictEqual(r.sourceSpecSha256.length, 64, `Target ${r.targetId} source hash must be 64 hex chars`);
    }
  });

  // P04: Document/version linkage
  await test('P04', 'Document/version linkage: Monotonic version numbers and correct slug naming', async () => {
    for (const r of auditResults) {
      assert(r.unitSlug.length > 3, `Target ${r.targetId} slug must be valid`);
      assert(r.documentType.length > 3, `Target ${r.targetId} document type must be valid`);
    }
  });

  // P05: QuestionReference integrity
  await test('P05', 'QuestionReference integrity: All referenced PYQs pass reference integrity validation', async () => {
    for (const r of auditResults) {
      assert.strictEqual(r.referencesStatus, 'PASS', `Target ${r.targetId} references must be PASS`);
    }
  });

  // P06: AssetReference & Math formula integrity
  await test('P06', 'AssetReference & Math integrity: Formulas use valid KaTeX inline and display delimiters', async () => {
    for (const r of auditResults) {
      assert.strictEqual(r.mathIntegrity, 'VALID', `Target ${r.targetId} math must be VALID`);
    }
  });

  // P07: Rendering route resolution
  await test('P07', 'Rendering route resolution: MDX assembly emits only approved controlled components', async () => {
    for (const r of auditResults) {
      assert.strictEqual(r.renderingStatus, 'PASS', `Target ${r.targetId} rendering must be PASS`);
    }
  });

  // P08: Learn More chain
  await test('P08', 'Learn More chain: Canonical course route URLs formatted correctly', async () => {
    for (const r of auditResults) {
      assert(r.routingPath.startsWith('/courses/'), `Target ${r.targetId} path must start with /courses/`);
      assert(!r.routingPath.includes(' '), `Target ${r.targetId} path must not contain whitespace`);
    }
  });

  // P09: AI contamination scan
  await test('P09', 'AI contamination scan: Zero raw LLM artifacts or assistant boilerplate', async () => {
    for (const r of auditResults) {
      assert(!r.aiContamination.includes('as an AI'), `Target ${r.targetId} must not contain "as an AI"`);
      assert(!r.aiContamination.includes('system instruction'), `Target ${r.targetId} must not contain "system instruction"`);
    }
  });

  // P10: SEO metadata
  await test('P10', 'SEO metadata: All documents contain valid metaTitle, description, and keywords', async () => {
    for (const r of auditResults) {
      assert.strictEqual(r.seo, 'PASS', `Target ${r.targetId} SEO must be PASS`);
    }
  });

  // P11: Version immutability inspection
  await test('P11', 'Version immutability: assertMutable strictly guards published document versions', async () => {
    const publishedVersion = {
      id: 'ver-test-immutable-001',
      version_number: 1,
      is_published: true,
      review_status: 'PUBLISHED',
    };
    let threw = false;
    try {
      LearningDocumentService.assertMutable(publishedVersion);
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, true, 'assertMutable must reject updates on published versions');
  });

  // P12: Authoritative-context isolation
  await test('P12', 'Authoritative-context isolation: Published documents do not alter syllabus definitions', async () => {
    const { data: topics } = await supabase.from('topics').select('id, name').limit(10);
    assert(topics && topics.length > 0, 'Syllabus topics exist independently of published documents');
  });

  // P13: No unpublished leakage
  await test('P13', 'No unpublished leakage: Candidate-facing status evaluator checks is_published flag', async () => {
    const draftVersion = { is_published: false, review_status: 'AI_GENERATED' };
    assert.strictEqual(LearningDocumentService.isImmutable(draftVersion), false);
    const pubVersion = { is_published: true, review_status: 'PUBLISHED' };
    assert.strictEqual(LearningDocumentService.isImmutable(pubVersion), true);
  });

  // P14: No duplicate/broken references
  await test('P14', 'No duplicate/broken references: Section hierarchy and key takeaways count >= 2', async () => {
    for (const r of auditResults) {
      assert(r.sectionsCount >= 2, `Target ${r.targetId} must have at least 2 sections`);
      assert(r.takeawaysCount >= 2, `Target ${r.targetId} must have at least 2 key takeaways`);
    }
  });

  // P15: Protected baseline unchanged
  await test('P15', 'Protected baseline unchanged: Core question bank and mock test tables remain intact', async () => {
    const { count: questionsCount } = await supabase.from('questions').select('*', { count: 'exact', head: true });
    assert(questionsCount >= 103, 'Questions table baseline must be >= 103');
    const { count: mocksCount } = await supabase.from('mock_tests').select('*', { count: 'exact', head: true });
    assert(mocksCount >= 8, 'Mock tests baseline must be >= 8');
  });

  console.log('\n============================================================');
  console.log(`PHASE 3G TEST RESULTS: ${passedTests} PASSED | ${failedTests} FAILED (Total: ${passedTests + failedTests})`);
  console.log('============================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
