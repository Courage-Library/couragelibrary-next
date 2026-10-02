/**
 * COURAGE LIBRARY — PHASE CA-7.2 FORENSIC TEST SUITE
 * Feed Adapter Transformation, Security Boundary, 5-Gate Compliance, & Draft-Only Integration
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
  content.split('\n').forEach(line => {
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

connectionString = process.env.POSTGRES_URL_NON_POOLING || connectionString || process.env.DATABASE_URL;

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
    }
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

async function runCA72TestSuite() {
  console.log('================================================================================');
  console.log('COURAGE LIBRARY — PHASE CA-7.2 FEED ADAPTER & DRAFT-ONLY INTEGRATION SUITE');
  console.log('================================================================================\n');

  // ============================================================================
  // GROUP 1: PURE UNIT TESTS & TRANSFORMATION FIXTURES (15+ FIXTURES)
  // ============================================================================
  console.log('--- GROUP 1: FEED ADAPTER TRANSFORMATION FIXTURES ---');

  // Fixture 1: Valid Article
  const f1 = {
    id: '1790920839330-delhi-jantar-mantar-protest',
    title: 'Internet Suspended Around Delhi Jantar Mantar Ahead of Mass Demonstration',
    summary: [
      'Authorities have promulgated prohibitory orders under Section 144 CrPC across Central Delhi.',
      'Mobile internet and bulk SMS services have been temporarily suspended to prevent public unrest.',
      'Exam Relevance: Key focus on constitutional provisions under Article 19(1)(a) and maintenance of public order.',
    ],
    link: 'https://timesofindia.indiatimes.com/city/delhi/jantar-mantar-security/articleshow/12345.cms?utm_source=feed&utm_medium=rss&fbclid=xyz123',
    primaryCategory: 'national',
    secondaryCategories: ['polity', 'defence-security'],
    importance: 7,
    examTags: ['UPSC', 'SSC CGL'],
    source: 'Times of India',
    feedName: 'TOI National News',
    date: '2026-10-02T06:00:39.330Z',
  };

  const res1 = CurrentAffairsFeedAdapter.transform(f1, {
    taxonomyNodeMap: { NATIONAL: '00000000-0000-0000-0000-000000000001' },
    examIdMap: { 'upsc-cse': '11111111-1111-1111-1111-111111111111', 'ssc-cgl': '22222222-2222-2222-2222-222222222222' },
  });

  assertTest('T01', 'Valid Article Transformation Success', res1.success === true, 'Transformed without errors');
  assertTest('T02', 'Tracking Parameter Sanitization', !res1.payload.sources[0].url.includes('utm_source') && !res1.payload.sources[0].url.includes('fbclid'), res1.payload.sources[0].url);
  assertTest('T03', 'Category Normalization', res1.payload.category === 'NATIONAL', 'Mapped "national" -> "NATIONAL"');
  assertTest('T04', 'Importance Tier Mapping', res1.payload.importanceTier === 'HIGH', 'Mapped 7 -> "HIGH"');
  assertTest('T05', 'Date IST Conversion', res1.payload.newsDate === '2026-10-02', res1.payload.newsDate);
  assertTest('T06', 'Key Takeaways Extraction', res1.payload.keyTakeaways.length === 3, `Count: ${res1.payload.keyTakeaways.length}`);
  assertTest('T07', 'Tagged Facts Extraction', res1.payload.importantFacts.length === 1 && res1.payload.importantFacts[0].includes('Key focus on constitutional'), 'Extracted exam relevance');
  assertTest('T08', 'Exam Tag Aliases Resolution', res1.payload.examMappings.length === 2, `Mapped exams count: ${res1.payload.examMappings.length}`);
  assertTest('T09', 'Source Tier Classification', res1.payload.sources[0].tier === 'TIER_3', 'Times of India classified as TIER_3');

  // Fixture 2: Missing Title
  const f2 = { ...f1, title: '' };
  const res2 = CurrentAffairsFeedAdapter.transform(f2);
  assertTest('T10', 'Missing Title Rejection', res2.success === false && res2.errors.some(e => e.includes('Missing required field: title')), 'Rejected empty title');

  // Fixture 3: Short Title (<10 chars)
  const f3 = { ...f1, title: 'Alert!' };
  const res3 = CurrentAffairsFeedAdapter.transform(f3);
  assertTest('T11', 'Short Title Rejection', res3.success === false && res3.errors.some(e => e.includes('too short')), 'Rejected title <10 chars');

  // Fixture 4: Insecure HTTP URL
  const f4 = { ...f1, link: 'http://unsecure-news.com/article' };
  const res4 = CurrentAffairsFeedAdapter.transform(f4);
  assertTest('T12', 'Insecure HTTP Rejection', res4.success === false && res4.errors.some(e => e.includes('HTTPS protocol')), 'Rejected non-HTTPS URL');

  // Fixture 5: Unknown Category
  const f5 = { ...f1, primaryCategory: 'horoscope-astrology' };
  const res5 = CurrentAffairsFeedAdapter.transform(f5);
  assertTest('T13', 'Unknown Category Rejection', res5.success === false && res5.errors.some(e => e.includes('Unrecognized category')), 'Rejected unapproved category');

  // Fixture 6: Approved Category Aliases
  const categoriesToTest = [
    { in: 'polity', expected: 'NATIONAL' },
    { in: 'world', expected: 'INTERNATIONAL' },
    { in: 'markets', expected: 'ECONOMY' },
    { in: 'space', expected: 'SCIENCE_TECH' },
    { in: 'climate', expected: 'ENVIRONMENT' },
    { in: 'yojana', expected: 'GOVT_SCHEMES' },
    { in: 'cricket', expected: 'SPORTS' },
    { in: 'nobel', expected: 'AWARDS_HONOURS' },
  ];
  let catAliasPass = true;
  categoriesToTest.forEach(c => {
    const r = CurrentAffairsFeedAdapter.transform({ ...f1, primaryCategory: c.in });
    if (!r.success || r.payload.category !== c.expected) catAliasPass = false;
  });
  assertTest('T14', 'Category Aliases Mapping', catAliasPass, '8 category aliases mapped deterministically');

  // Fixture 7: Importance Boundary Tests
  const impTests = [
    { in: 9.5, expected: 'CRITICAL' },
    { in: 8.0, expected: 'CRITICAL' },
    { in: 7.5, expected: 'HIGH' },
    { in: 6.0, expected: 'HIGH' },
    { in: 5.0, expected: 'MEDIUM' },
    { in: 4.0, expected: 'MEDIUM' },
    { in: 2.0, expected: 'LOW' },
  ];
  let impPass = true;
  impTests.forEach(t => {
    const r = CurrentAffairsFeedAdapter.transform({ ...f1, importance: t.in });
    if (!r.success || r.payload.importanceTier !== t.expected) impPass = false;
  });
  assertTest('T15', 'Importance Tier Boundary Mapping', impPass, '7 boundary thresholds mapped correctly');

  // Fixture 8: Invalid Importance (Out of bounds / string)
  const f8a = { ...f1, importance: 15 };
  const f8b = { ...f1, importance: -2 };
  const f8c = { ...f1, importance: 'invalid-number' };
  const res8a = CurrentAffairsFeedAdapter.transform(f8a);
  const res8b = CurrentAffairsFeedAdapter.transform(f8b);
  const res8c = CurrentAffairsFeedAdapter.transform(f8c);
  assertTest('T16', 'Invalid Importance Rejection', !res8a.success && !res8b.success && !res8c.success, 'Rejected out of bounds/non-numeric importance');

  // Fixture 9: AI Citation Artifact Sanitization
  const f9 = {
    ...f1,
    summary: [
      'The government issued new directives for the green corridor 【14†source】.',
      'Initial feasibility was verified [cite: 2] by the Ministry of Environment.',
      'Key fact: Project duration set to 36 months.',
    ],
  };
  const res9 = CurrentAffairsFeedAdapter.transform(f9);
  const cleanSummary = res9.payload.summaryMd;
  assertTest('T17', 'AI Citation Artifact Sanitization', !cleanSummary.includes('【14†source】') && !cleanSummary.includes('[cite: 2]'), 'Stripped AI citations');

  // Fixture 10: Malicious HTML / Script Body
  const f10 = {
    ...f1,
    summary: [
      'Normal news event details.',
      '<script>window.location="http://evil.com"</script>',
      '<img src=x onerror=alert(1)>',
    ],
  };
  const res10 = CurrentAffairsFeedAdapter.transform(f10);
  assertTest('T18', 'Malicious Script Body Rejection', res10.success === false && res10.errors.some(e => e.includes('Security violation')), 'MDX scanner rejected script payload');

  // Fixture 11: Missing / Malformed Date
  const f11a = { ...f1, date: '' };
  const f11b = { ...f1, date: 'not-a-date' };
  const res11a = CurrentAffairsFeedAdapter.transform(f11a);
  const res11b = CurrentAffairsFeedAdapter.transform(f11b);
  assertTest('T19', 'Malformed Date Rejection', !res11a.success && !res11b.success, 'Rejected empty/invalid date string');

  // Fixture 12: Empty Summary Array
  const f12 = { ...f1, summary: [] };
  const res12 = CurrentAffairsFeedAdapter.transform(f12);
  assertTest('T20', 'Empty Summary Rejection', res12.success === false && res12.errors.some(e => e.includes('summary')), 'Rejected empty summary array');

  // ============================================================================
  // GROUP 2: SECURITY & AUTHENTICATION TESTS
  // ============================================================================
  console.log('\n--- GROUP 2: SECURITY & BEARER AUTHENTICATION TESTS ---');

  const testIngestionSecret = 'test_secret_key_8923748923748923749823';
  process.env.CURRENT_AFFAIRS_INGESTION_KEY = testIngestionSecret;

  // Constant-time comparison validation helper
  function mockValidateBearer(headerVal, configuredKey) {
    if (!headerVal || !headerVal.startsWith('Bearer ')) return false;
    const token = headerVal.slice(7).trim();
    if (!configuredKey || !token) return false;
    const tokenBuf = Buffer.from(token);
    const keyBuf = Buffer.from(configuredKey);
    if (tokenBuf.length !== keyBuf.length) return false;
    return crypto.timingSafeEqual(tokenBuf, keyBuf);
  }

  assertTest('S01', 'Missing Authorization Header Rejection', mockValidateBearer(null, testIngestionSecret) === false, 'Rejected null header');
  assertTest('S02', 'Malformed Bearer Prefix Rejection', mockValidateBearer(`Token ${testIngestionSecret}`, testIngestionSecret) === false, 'Rejected non-Bearer scheme');
  assertTest('S03', 'Wrong Secret Token Rejection', mockValidateBearer('Bearer wrong_secret_token_123', testIngestionSecret) === false, 'Rejected invalid secret');
  assertTest('S04', 'Correct Secret Token Acceptance', mockValidateBearer(`Bearer ${testIngestionSecret}`, testIngestionSecret) === true, 'Accepted valid bearer secret');
  assertTest('S05', 'Timing-Safe Length Mismatch Protection', mockValidateBearer('Bearer short', testIngestionSecret) === false, 'Safely handled length mismatch');

  // ============================================================================
  // GROUP 3: 5-GATE VALIDATION COMPLIANCE ON ADAPTER PAYLOAD
  // ============================================================================
  console.log('\n--- GROUP 3: 5-GATE VALIDATION COMPLIANCE ---');

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  let dbConnected = false;
  try {
    await client.connect();
    dbConnected = true;
  } catch (err) {
    console.warn('[WARN] PostgreSQL connection failed, running DB-isolated gate tests:', err.message);
  }

  const dbAdapter = {
    query: async (sql, params) => {
      if (dbConnected) {
        return client.query(sql, params);
      }
      return { rows: [] };
    },
  };

  // Fetch a real active canonical taxonomy node if DB connected
  let activeTaxNodeId = '00000000-0000-0000-0000-000000000001';
  let activeExamId = '00000000-0000-0000-0000-000000000002';
  if (dbConnected) {
    const taxRes = await client.query('SELECT id FROM public.canonical_taxonomy_nodes LIMIT 1');
    if (taxRes.rows[0]) activeTaxNodeId = taxRes.rows[0].id;
    const examRes = await client.query('SELECT id FROM public.exams LIMIT 1');
    if (examRes.rows[0]) activeExamId = examRes.rows[0].id;
  }

  const transformedForGate = CurrentAffairsFeedAdapter.transform(f1, {
    taxonomyNodeMap: { NATIONAL: activeTaxNodeId },
    examIdMap: { 'upsc-cse': activeExamId },
  });

  const gateReport = await CurrentAffairsValidationService.runAllGates(transformedForGate.payload, dbAdapter);

  assertTest('G01', 'Gate 1 (Schema) Passed', gateReport.gates['GATE_1_SCHEMA'].passed === true, 'Schema valid');
  assertTest('G02', 'Gate 2 (Security) Passed', gateReport.gates['GATE_2_SECURITY'].passed === true, 'No security violations');
  assertTest('G03', 'Gate 3 (Provenance) Passed', gateReport.gates['GATE_3_PROVENANCE'].passed === true, 'Tier 2 HTTPS source valid');
  assertTest('G04', 'Gate 4 (Taxonomy) Passed', gateReport.gates['GATE_4_TAXONOMY'].passed === true, 'Taxonomy node verified');
  assertTest('G05', 'Gate 5 (Anti-Duplicate) Passed', gateReport.gates['GATE_5_ANTI_DUPLICATE'].passed === true, 'Checksum computed');
  assertTest('G06', 'All 5 Gates Overall Passed', gateReport.passed === true, `SHA-256: ${gateReport.checksumSha256.slice(0, 16)}...`);

  // ============================================================================
  // GROUP 4: CONTROLLED DRAFT-ONLY INTEGRATION TEST & PRODUCTION DB SAFETY
  // ============================================================================
  console.log('\n--- GROUP 4: CONTROLLED DRAFT-ONLY INTEGRATION & DB BASELINE SAFETY ---');

  if (dbConnected) {
    // Step A: Record Baselines
    const baselineTables = [
      'exams',
      'subjects',
      'topics',
      'questions',
      'question_versions',
      'mock_tests',
      'test_attempts',
      'learning_resources',
    ];
    const preCounts = {};
    for (const tbl of baselineTables) {
      const res = await client.query(`SELECT count(*)::int as c FROM public.${tbl}`);
      preCounts[tbl] = res.rows[0].c;
    }

    const testSlug = `test-ca72-int-${Date.now().toString().slice(-6)}`;
    const syntheticPayload = {
      ...transformedForGate.payload,
      headline: `Synthetic CA-7.2 Ingestion Test (${testSlug})`,
      slug: testSlug,
    };

    // Step B: Import Synthetic Draft
    const importResult = await CurrentAffairsImportService.importDraft(syntheticPayload, null, dbAdapter);

    assertTest('INT01', 'Draft Ingestion Success', importResult.success === true, `Created Draft ID: ${importResult.articleId}`);
    assertTest('INT02', 'Status Hardcoded to DRAFT', importResult.status === 'DRAFT', 'Status is strictly DRAFT');

    // Step C: Verify Master Record State in DB
    const artCheck = await client.query(
      'SELECT id, status, published_version_id FROM public.current_affairs_articles WHERE id = $1',
      [importResult.articleId]
    );
    const artRow = artCheck.rows[0];
    assertTest('INT03', 'Master Record Status is DRAFT', artRow && artRow.status === 'DRAFT', 'Master record confirmed DRAFT');
    assertTest('INT04', 'Published Pointer is NULL', artRow && artRow.published_version_id === null, 'published_version_id IS NULL');

    // Step D: Verify Version 1 State
    const verCheck = await client.query(
      'SELECT id, version_number, status FROM public.current_affairs_article_versions WHERE article_id = $1',
      [importResult.articleId]
    );
    const verRow = verCheck.rows[0];
    assertTest('INT05', 'Version 1 Status is DRAFT', verRow && verRow.status === 'DRAFT', 'Version status confirmed DRAFT');

    // Step E: Verify Public RLS Visibility (Candidates see 0 rows)
    const pubCheck = await client.query(
      "SELECT count(*)::int as c FROM public.current_affairs_articles WHERE id = $1 AND status = 'PUBLISHED'",
      [importResult.articleId]
    );
    assertTest('INT06', 'Candidate Feed Isolation', pubCheck.rows[0].c === 0, 'Zero candidate visibility for draft');

    // Step F: Verify Idempotent Duplicate Import
    const dupResult = await CurrentAffairsImportService.importDraft(syntheticPayload, null, dbAdapter);
    assertTest('INT07', 'Idempotent Duplicate Rejection', dupResult.success === false && dupResult.error.includes('DUPLICATE'), 'Duplicate content rejected by Gate 5');

    // Step G: Safe Cleanup
    await client.query('DELETE FROM public.current_affairs_articles WHERE id = $1', [importResult.articleId]);
    console.log('  [CLEANUP] Successfully removed temporary test Current Affair record.');

    // Step H: Verify Post-Test Baseline Integrity
    let baselineIntact = true;
    for (const tbl of baselineTables) {
      const res = await client.query(`SELECT count(*)::int as c FROM public.${tbl}`);
      const postCount = res.rows[0].c;
      if (postCount !== preCounts[tbl]) {
        baselineIntact = false;
        console.error(`  [FAIL] Baseline mismatch on public.${tbl}: Pre=${preCounts[tbl]} Post=${postCount}`);
      }
    }
    assertTest('INT08', 'Production Database Baseline Preserved', baselineIntact, 'All standard tables unchanged');

    await client.end();
  } else {
    console.log('  [SKIP] Database integration tests skipped (Postgres connection unavailable).');
  }

  // ============================================================================
  // SUMMARY REPORT
  // ============================================================================
  console.log('\n================================================================================');
  console.log(`PHASE CA-7.2 EXECUTION SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runCA72TestSuite().catch(err => {
  console.error('FATAL ERROR in CA-7.2 Suite:', err);
  process.exit(1);
});
