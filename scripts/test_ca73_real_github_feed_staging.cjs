/**
 * COURAGE LIBRARY — PHASE CA-7.3 REAL GITHUB FEED STAGING INTEGRATION
 * Forensic Validation & End-to-End Test Suite for Real News Feed Ingestion
 */

const fs = require('fs');
const path = require('path');
const dns = require('dns');
const crypto = require('crypto');
const { Client } = require('pg');

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

// 1. Read .env.local safely
let connectionString = null;
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[k]) {
          process.env[k] = val;
        }
        if (['POSTGRES_URL_NON_POOLING', 'DATABASE_URL', 'POSTGRES_URL', 'SUPABASE_DB_URL'].includes(k)) {
          if (!connectionString) connectionString = val;
        }
      }
    }
  });
}

if (!connectionString) {
  connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING;
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Setup TS transpilation
const Module = require('module');
const ts = require('typescript');

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
    },
  });
  module._compile(compiled.outputText, filename);
};

const { CurrentAffairsFeedAdapter } = require('@/services/current-affairs-feed-adapter.service.ts');
const { CurrentAffairsValidationService } = require('@/services/current-affairs-validation.service.ts');
const { CurrentAffairsImportService } = require('@/services/current-affairs-import.service.ts');

const results = [];
let passedCount = 0;
let failedCount = 0;

function assertTest(id, name, condition, details) {
  if (condition) {
    passedCount++;
    results.push({ id, name, status: 'PASS', details });
    console.log(`  [PASS] ${id}: ${name} ${details ? '(' + details + ')' : ''}`);
  } else {
    failedCount++;
    results.push({ id, name, status: 'FAIL', details });
    console.error(`  [FAIL] ${id}: ${name} — ${details}`);
  }
}

async function runCA73StagingSuite() {
  console.log('================================================================================');
  console.log('COURAGE LIBRARY — PHASE CA-7.3 REAL GITHUB FEED STAGING INTEGRATION SUITE');
  console.log('================================================================================\n');

  // ============================================================================
  // SECTION 1: REAL ARTICLE FIXTURE INSPECTION
  // ============================================================================
  console.log('--- STEP 1: REAL GITHUB FEED ARTICLE INSPECTION & VERIFICATION ---');

  const realArticleFixture = {
    id: '1790920839330-internet-suspended-around-delhi-s-jantar-mantar-ahead-of-protest-against-cec-gyanesh-kumar-dipke-warns-of-nationwide-unrest-live',
    title: "Internet Suspended Around Delhi's Jantar Mantar Ahead of Protest Against CEC Gyanesh Kumar",
    summary: [
      'Authorities have suspended mobile internet and increased security deployment around Jantar Mantar in New Delhi.',
      'The precautionary measure was enacted ahead of a planned demonstration concerning the Chief Election Commissioner.',
      'Section 144 CrPC has been promulgated in sensitive bordering areas.',
      'Exam Relevance: Key focus on constitutional authorities, Article 324 (Election Commission), and maintenance of public order.',
    ],
    image: '',
    link: 'https://timesofindia.indiatimes.com/india/delhi-jantar-mantar-security-alert/articleshow/1790920839.cms?utm_source=rss&utm_medium=feed',
    primaryCategory: 'national',
    secondaryCategories: ['polity', 'defense-security'],
    importance: 7,
    examTags: ['UPSC', 'SSC', 'State PCS'],
    source: 'Times of India',
    feedName: 'TOI National',
    date: '2026-10-02T06:00:39.330Z',
  };

  assertTest('ST01', 'Real Article Structure Verified', typeof realArticleFixture.id === 'string' && realArticleFixture.summary.length === 4, `ID: ${realArticleFixture.id.slice(0, 30)}...`);
  assertTest('ST02', 'Tracking Parameters Present in Raw Link', realArticleFixture.link.includes('utm_source=rss'), 'Confirmed raw fixture contains tracking params');

  // Connect to PostgreSQL
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const dbAdapter = {
    query: async (sql, params) => {
      return client.query(sql, params);
    },
  };

  // Fetch real taxonomy node from DB
  const taxRes = await client.query(`SELECT id, name, slug FROM public.canonical_taxonomy_nodes LIMIT 5`);
  let validTaxNodeId = '00000000-0000-0000-0000-000000000001';
  if (taxRes.rows.length > 0) {
    validTaxNodeId = taxRes.rows[0].id;
  }

  // Fetch real exams from DB
  const examRes = await client.query(`SELECT id, slug FROM public.exams LIMIT 5`);
  const examIdMap = {};
  if (examRes.rows.length > 0) {
    examRes.rows.forEach((e) => {
      if (e.slug) examIdMap[e.slug] = e.id;
    });
  }

  // ============================================================================
  // SECTION 2: ADAPTER TRANSFORMATION
  // ============================================================================
  console.log('\n--- STEP 2: FEED ADAPTER TRANSFORMATION & NORMALIZATION ---');

  const transformResult = CurrentAffairsFeedAdapter.transform(realArticleFixture, {
    taxonomyNodeMap: { NATIONAL: validTaxNodeId },
    examIdMap,
    defaultTaxonomyNodeId: validTaxNodeId,
  });

  assertTest('ST03', 'Adapter Transformation Succeeded', transformResult.success === true, 'No transformation errors');
  const payload = transformResult.payload;

  assertTest('ST04', 'Headline Sanitization', payload.headline === "Internet Suspended Around Delhi's Jantar Mantar Ahead of Protest Against CEC Gyanesh Kumar", payload.headline);
  assertTest('ST05', 'IST Date Partitioning', payload.newsDate === '2026-10-02', `Partition Date: ${payload.newsDate}`);
  assertTest('ST06', 'Category Canonicalization', payload.category === 'NATIONAL', 'Mapped "national" -> "NATIONAL"');
  assertTest('ST07', 'Importance Tier Mapping', payload.importanceTier === 'HIGH', 'Mapped 7 -> "HIGH"');
  assertTest('ST08', 'Tracking Parameter Sanitization', !payload.sources[0].url.includes('utm_source'), payload.sources[0].url);
  assertTest('ST09', 'Source Tier Classification', payload.sources[0].tier === 'TIER_3', `Tier: ${payload.sources[0].tier}`);
  assertTest('ST10', 'Key Takeaways Count', payload.keyTakeaways.length === 4, `Count: ${payload.keyTakeaways.length}`);
  assertTest('ST11', 'Important Facts Extraction', payload.importantFacts && payload.importantFacts.length >= 1, payload.importantFacts ? payload.importantFacts[0] : 'None');

  // ============================================================================
  // SECTION 3: 5-GATE VALIDATION ENGINE EXECUTION
  // ============================================================================
  console.log('\n--- STEP 3: 5-GATE VALIDATION ENGINE COMPLIANCE ---');

  const gateReport = await CurrentAffairsValidationService.runAllGates(payload, dbAdapter);

  assertTest('ST12', 'Gate 1 (Schema & Data Types) Passed', gateReport.gates['GATE_1_SCHEMA']?.passed === true, 'Schema valid');
  assertTest('ST13', 'Gate 2 (MDX & Security Scanner) Passed', gateReport.gates['GATE_2_SECURITY']?.passed === true, 'No security violations');
  assertTest('ST14', 'Gate 3 (Source Tier & Provenance) Passed', gateReport.gates['GATE_3_PROVENANCE']?.passed === true, `Tier 3 HTTPS verified: ${payload.sources[0].url}`);
  assertTest('ST15', 'Gate 4 (Taxonomy & Syllabus) Passed', gateReport.gates['GATE_4_TAXONOMY']?.passed === true, `Taxonomy Node ID: ${validTaxNodeId}`);
  assertTest('ST16', 'Gate 5 (SHA-256 Checksum & Deduplication) Passed', gateReport.gates['GATE_5_ANTI_DUPLICATE']?.passed === true, `Checksum: ${gateReport.checksumSha256.slice(0, 16)}...`);
  assertTest('ST17', '5-Gate Holistic Approval', gateReport.passed === true, 'All 5 validation gates passed');

  // ============================================================================
  // SECTION 4: CONTROLLED STAGING IMPORT EXECUTION (DRAFT-ONLY)
  // ============================================================================
  console.log('\n--- STEP 4: DATABASE BASELINES & CONTROLLED DRAFT IMPORT ---');

  // Record table baselines
  const countArticlesBefore = parseInt((await client.query('SELECT count(*) FROM public.current_affairs_articles')).rows[0].count, 10);
  const countVersionsBefore = parseInt((await client.query('SELECT count(*) FROM public.current_affairs_article_versions')).rows[0].count, 10);
  const countSourcesBefore = parseInt((await client.query('SELECT count(*) FROM public.current_affairs_sources')).rows[0].count, 10);
  const countTaxBefore = parseInt((await client.query('SELECT count(*) FROM public.current_affairs_taxonomy_mappings')).rows[0].count, 10);

  console.log(`  Pre-test Baselines: articles=${countArticlesBefore}, versions=${countVersionsBefore}, sources=${countSourcesBefore}, tax_mappings=${countTaxBefore}`);

  // Ingest Draft via CurrentAffairsImportService
  const importResult = await CurrentAffairsImportService.importDraft(payload, null, dbAdapter);

  assertTest('ST18', 'Draft Ingestion Execution Success', importResult.success === true, `Draft Article ID: ${importResult.articleId}`);
  assertTest('ST19', 'Draft Status In Result', importResult.status === 'DRAFT', `Status: ${importResult.status}`);

  const stagedArticleId = importResult.articleId;
  const stagedVersionId = importResult.versionId;

  // ============================================================================
  // SECTION 5: FORENSIC DATABASE STATE VERIFICATION
  // ============================================================================
  console.log('\n--- STEP 5: FORENSIC DATABASE RECORD VERIFICATION ---');

  // 1. Inspect Master Record
  const masterRes = await client.query(
    'SELECT id, slug, news_date, category, importance_tier, status, published_version_id, published_at FROM public.current_affairs_articles WHERE id = $1',
    [stagedArticleId]
  );
  assertTest('ST20', 'Master Record Exists in DB', masterRes.rows.length === 1, `Found 1 master row`);
  const masterRow = masterRes.rows[0];
  assertTest('ST21', 'Master Record Status is DRAFT', masterRow.status === 'DRAFT', `status=${masterRow.status}`);
  assertTest('ST22', 'Master Published Version Pointer is NULL', masterRow.published_version_id === null, 'published_version_id IS NULL');
  assertTest('ST23', 'Master Published At Timestamp is NULL', masterRow.published_at === null, 'published_at IS NULL');
  // Format date correctly in IST
  const rowDate = masterRow.news_date instanceof Date
    ? `${masterRow.news_date.getFullYear()}-${String(masterRow.news_date.getMonth() + 1).padStart(2, '0')}-${String(masterRow.news_date.getDate()).padStart(2, '0')}`
    : String(masterRow.news_date).split('T')[0];
  assertTest('ST24', 'Master News Date Partition Matches', rowDate === '2026-10-02', `news_date=${rowDate}`);
  assertTest('ST25', 'Master Category Matches', masterRow.category === 'NATIONAL', `category=${masterRow.category}`);

  // 2. Inspect Version 1 Snapshot
  const versionRes = await client.query(
    'SELECT id, article_id, version_number, headline, summary_md, key_takeaways, important_facts, checksum_sha256, status, published_at FROM public.current_affairs_article_versions WHERE article_id = $1',
    [stagedArticleId]
  );
  assertTest('ST26', 'Version Snapshot Count is Exactly 1', versionRes.rows.length === 1, `Version count: ${versionRes.rows.length}`);
  const versionRow = versionRes.rows[0];
  assertTest('ST27', 'Version Number is 1', versionRow.version_number === 1, `version_number=${versionRow.version_number}`);
  assertTest('ST28', 'Version Status is DRAFT', versionRow.status === 'DRAFT', `status=${versionRow.status}`);
  assertTest('ST29', 'Version Published At is NULL', versionRow.published_at === null, 'published_at IS NULL');
  assertTest('ST30', 'Version SHA-256 Matches Gate 5 Checksum', versionRow.checksum_sha256 === gateReport.checksumSha256, `Checksum: ${versionRow.checksum_sha256.slice(0, 16)}...`);
  assertTest('ST31', 'Version Headline Intact', versionRow.headline === payload.headline, versionRow.headline);

  // 3. Inspect Provenance Source Record
  const sourcesRes = await client.query(
    'SELECT id, version_id, title, publisher, url, tier FROM public.current_affairs_sources WHERE version_id = $1',
    [stagedVersionId]
  );
  assertTest('ST32', 'Provenance Sources Created', sourcesRes.rows.length === 1, `Source count: ${sourcesRes.rows.length}`);
  const sourceRow = sourcesRes.rows[0];
  assertTest('ST33', 'Provenance Publisher Verified', sourceRow.publisher === 'Times of India', `Publisher: ${sourceRow.publisher}`);
  assertTest('ST34', 'Provenance Tier Verified as TIER_3', sourceRow.tier === 'TIER_3', `Tier: ${sourceRow.tier}`);
  assertTest('ST35', 'Provenance URL Cleaned', !sourceRow.url.includes('utm_source'), sourceRow.url);

  // 4. Inspect Taxonomy Mapping
  const taxMappingRes = await client.query(
    'SELECT id, article_id, taxonomy_node_id, is_primary FROM public.current_affairs_taxonomy_mappings WHERE article_id = $1',
    [stagedArticleId]
  );
  assertTest('ST36', 'Taxonomy Mapping Created', taxMappingRes.rows.length >= 1, `Taxonomy mapping count: ${taxMappingRes.rows.length}`);
  assertTest('ST37', 'Primary Taxonomy Mapping Flagged', taxMappingRes.rows.some((r) => r.is_primary === true), 'Primary flag true');

  // ============================================================================
  // SECTION 6: CANDIDATE FEED ISOLATION VERIFICATION
  // ============================================================================
  console.log('\n--- STEP 6: CANDIDATE FEED ISOLATION AUDIT ---');

  // Check candidate published feed query
  const publishedCandidateQuery = await client.query(
    `SELECT count(*) FROM public.current_affairs_articles WHERE id = $1 AND status = 'PUBLISHED'`,
    [stagedArticleId]
  );
  assertTest('ST38', 'Candidate Feed Isolation: 0 Published Rows for Staging Record', parseInt(publishedCandidateQuery.rows[0].count, 10) === 0, 'Zero candidate visibility');

  const publishedVersionPointerQuery = await client.query(
    `SELECT count(*) FROM public.current_affairs_articles WHERE id = $1 AND published_version_id IS NOT NULL`,
    [stagedArticleId]
  );
  assertTest('ST39', 'Candidate Feed Isolation: 0 Published Pointer Rows', parseInt(publishedVersionPointerQuery.rows[0].count, 10) === 0, 'Pointer is strictly null');

  // ============================================================================
  // SECTION 7: IDEMPOTENCY & DUPLICATE SUBMISSION REJECTION
  // ============================================================================
  console.log('\n--- STEP 7: ANTI-DUPLICATE IDEMPOTENCY VERIFICATION ---');

  // Attempt duplicate ingestion of exact same payload
  const duplicateImportResult = await CurrentAffairsImportService.importDraft(payload, null, dbAdapter);

  assertTest(
    'ST40',
    'Duplicate Ingestion Detected & Handled Safely',
    duplicateImportResult.success === false &&
      (duplicateImportResult.error.includes('GATE_VALIDATION_FAILED') ||
        duplicateImportResult.error.includes('duplicate') ||
        duplicateImportResult.error.includes('DUPLICATE')),
    `Result: ${duplicateImportResult.error || 'Blocked by Gate 5'}`
  );

  // Verify no second version or second article was spawned
  const countArticlesAfterDuplicate = parseInt((await client.query('SELECT count(*) FROM public.current_affairs_articles')).rows[0].count, 10);
  assertTest('ST41', 'No Duplicate Master Article Created', countArticlesAfterDuplicate === countArticlesBefore + 1, `Master count remained: ${countArticlesAfterDuplicate}`);

  // ============================================================================
  // SECTION 8: FORENSIC CLEANUP & DB BASELINE PRESERVATION
  // ============================================================================
  console.log('\n--- STEP 8: FORENSIC CLEANUP & BASELINE INTEGRITY AUDIT ---');

  // Delete test draft and cascade
  await client.query('DELETE FROM public.current_affairs_articles WHERE id = $1', [stagedArticleId]);

  const countArticlesAfter = parseInt((await client.query('SELECT count(*) FROM public.current_affairs_articles')).rows[0].count, 10);
  const countVersionsAfter = parseInt((await client.query('SELECT count(*) FROM public.current_affairs_article_versions')).rows[0].count, 10);
  const countSourcesAfter = parseInt((await client.query('SELECT count(*) FROM public.current_affairs_sources')).rows[0].count, 10);
  const countTaxAfter = parseInt((await client.query('SELECT count(*) FROM public.current_affairs_taxonomy_mappings')).rows[0].count, 10);

  assertTest('ST42', 'Database Articles Count Restored Exactly', countArticlesAfter === countArticlesBefore, `Count: ${countArticlesAfter} === ${countArticlesBefore}`);
  assertTest('ST43', 'Database Versions Count Restored Exactly', countVersionsAfter === countVersionsBefore, `Count: ${countVersionsAfter} === ${countVersionsBefore}`);
  assertTest('ST44', 'Database Sources Count Restored Exactly', countSourcesAfter === countSourcesBefore, `Count: ${countSourcesAfter} === ${countSourcesBefore}`);
  assertTest('ST45', 'Database Taxonomy Mappings Count Restored Exactly', countTaxAfter === countTaxBefore, `Count: ${countTaxAfter} === ${countTaxBefore}`);

  await client.end();

  // ============================================================================
  // FINAL SUMMARY
  // ============================================================================
  console.log('\n================================================================================');
  console.log(`PHASE CA-7.3 REAL GITHUB STAGING SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runCA73StagingSuite().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
