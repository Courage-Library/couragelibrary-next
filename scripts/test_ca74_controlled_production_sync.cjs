/**
 * COURAGE LIBRARY — PHASE CA-7.4 CONTROLLED PRODUCTION SYNC TEST SUITE
 * Forensic Verification & Multi-Scenario Safety Suite for Machine Synchronization
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
    },
  });
  module._compile(compiled.outputText, filename);
};

const { CurrentAffairsFeedAdapter } = require('@/services/current-affairs-feed-adapter.service.ts');
const { CurrentAffairsValidationService } = require('@/services/current-affairs-validation.service.ts');
const { CurrentAffairsImportService } = require('@/services/current-affairs-import.service.ts');
const { CurrentAffairsProductionSyncService } = require('@/services/current-affairs-production-sync.service.ts');

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

async function runCA74TestSuite() {
  console.log('================================================================================');
  console.log('COURAGE LIBRARY — PHASE CA-7.4 CONTROLLED PRODUCTION SYNC TEST SUITE');
  console.log('================================================================================\n');

  // ============================================================================
  // GROUP 1: TARGET ENVIRONMENT IDENTIFICATION & SAFETY
  // ============================================================================
  console.log('--- GROUP 1: TARGET ENVIRONMENT IDENTIFICATION ---');

  const envInfo = CurrentAffairsProductionSyncService.identifyTargetEnvironment();
  assertTest('ENV01', 'Target Environment Identified Safely', envInfo.isIdentified === true, `Provider: ${envInfo.provider}`);
  assertTest('ENV02', 'Target Database Name Verified', envInfo.databaseName.length > 0, `DB Name: ${envInfo.databaseName}`);
  assertTest('ENV03', 'SSL Enabled on Destination', envInfo.sslEnabled === true, 'SSL confirmed active');

  // Connect to DB
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

  // Capture Database Baselines
  const baselineTables = [
    'current_affairs_articles',
    'current_affairs_article_versions',
    'current_affairs_sources',
    'current_affairs_taxonomy_mappings',
    'current_affairs_exam_mappings',
    'current_affairs_question_mappings',
    'current_affairs_learning_mappings',
    'exams',
    'questions',
    'mock_tests',
    'test_attempts',
    'user_mistake_vault',
  ];

  const preCounts = {};
  for (const tbl of baselineTables) {
    const r = await client.query(`SELECT count(*)::int as c FROM public.${tbl}`);
    preCounts[tbl] = r.rows[0].c;
  }
  console.log('  Pre-Test Baselines Captured:', preCounts);

  // Fetch real taxonomy node & exam ID
  const taxRes = await client.query('SELECT id FROM public.canonical_taxonomy_nodes LIMIT 1');
  const validTaxNodeId = taxRes.rows[0]?.id || '00000000-0000-0000-0000-000000000001';

  const examRes = await client.query('SELECT id, slug FROM public.exams LIMIT 1');
  const examIdMap = {};
  if (examRes.rows[0]) {
    examIdMap[examRes.rows[0].slug] = examRes.rows[0].id;
    examIdMap['upsc-cse'] = examRes.rows[0].id;
  }

  // ============================================================================
  // GROUP 2: DRY-RUN EXECUTION (ZERO DB MUTATION GUARANTEE)
  // ============================================================================
  console.log('\n--- GROUP 2: DRY-RUN VERIFICATION (ZERO DB WRITES) ---');

  const testBatchA = [
    {
      id: 'ca74-test-1-delhi-pollution-curbs',
      title: 'Commission for Air Quality Management Imposes Stage 3 GRAP Curbs Across Delhi-NCR',
      summary: [
        'The Commission for Air Quality Management (CAQM) invoked Stage 3 of GRAP due to deteriorating AQI levels.',
        'Primary schools were shifted to hybrid learning models across the capital territory.',
        'Non-essential construction and demolition activities were ordered to halt immediately.',
        'Exam Relevance: Key focus on statutory environmental authorities, EP Act 1986, and ambient air quality standards.',
      ],
      image: '',
      link: 'https://timesofindia.indiatimes.com/india/delhi-air-quality-grap-curbs/articleshow/101.cms?utm_source=rss',
      primaryCategory: 'environment',
      importance: 8,
      examTags: ['UPSC', 'State PCS'],
      source: 'Times of India',
      feedName: 'TOI Environment',
      date: '2026-10-02T07:15:00.000Z',
    },
    {
      id: 'ca74-test-2-isro-gaganyaan-pad-abort',
      title: 'ISRO Completes Second Integrated Pad Abort Test Ahead of Uncrewed Gaganyaan Mission',
      summary: [
        'The Indian Space Research Organisation successfully demonstrated crew escape system performance at SDSC SHAR.',
        'The test vehicle simulated ascent abort conditions under high dynamic pressure regimes.',
        'Telemetry confirmed all drogue and main parachutes deployed in nominal sequence.',
        'Exam Relevance: Human spaceflight program architecture, LVM3 booster, and indigenous life support systems.',
      ],
      image: '',
      link: 'https://www.thehindu.com/sci-tech/science/isro-gaganyaan-test-nominal/article102.ece?utm_campaign=feed',
      primaryCategory: 'science-tech',
      importance: 9,
      examTags: ['UPSC', 'SSC CGL'],
      source: 'The Hindu',
      feedName: 'The Hindu Science',
      date: '2026-10-02T08:30:00.000Z',
    },
  ];

  const dryRunReport = await CurrentAffairsProductionSyncService.syncBatch(
    testBatchA,
    {
      dryRun: true,
      maxArticles: 5,
      taxonomyNodeMap: { ENVIRONMENT: validTaxNodeId, SCIENCE_TECH: validTaxNodeId },
      examIdMap,
      defaultTaxonomyNodeId: validTaxNodeId,
    },
    dbAdapter
  );

  assertTest('DRY01', 'Dry-Run Flag Set in Report', dryRunReport.dryRun === true, 'dryRun is strictly true');
  assertTest('DRY02', 'Deterministic Run ID Generated', dryRunReport.runId.startsWith('CA'), `Run ID: ${dryRunReport.runId}`);
  assertTest('DRY03', 'Simulated Ingestion Count Matches', dryRunReport.importedDraftCount === 2, `Imported: ${dryRunReport.importedDraftCount}`);
  assertTest('DRY04', 'Published Count is Exactly 0', dryRunReport.publishedCount === 0, 'publishedCount = 0');
  assertTest('DRY05', 'Candidate Visible Count is 0', dryRunReport.candidateVisibleCount === 0, 'candidateVisibleCount = 0');

  // Verify Zero DB writes occurred
  for (const tbl of baselineTables) {
    const r = await client.query(`SELECT count(*)::int as c FROM public.${tbl}`);
    const currentCount = r.rows[0].c;
    assertTest(`DRY_DB_${tbl}`, `Zero DB Writes on ${tbl}`, currentCount === preCounts[tbl], `Count: ${currentCount} === ${preCounts[tbl]}`);
  }

  // ============================================================================
  // GROUP 3: BOUNDED BATCH LIMIT & CONCURRENCY
  // ============================================================================
  console.log('\n--- GROUP 3: BOUNDED BATCH LIMIT & CONCURRENCY CONSTRAINTS ---');

  // Generate 8 articles to test limit cap at 5
  const largeBatch = [];
  for (let i = 1; i <= 8; i++) {
    largeBatch.push({
      id: `ca74-synthetic-${i}`,
      title: `National Governance and Policy Milestone Overview Section ${i}`,
      summary: [
        `The Union Cabinet approved revised procedural guidelines for infrastructure scheme development ${i}.`,
        `Inter-ministerial coordination committees will oversee quarterly project milestones ${i}.`,
        `Exam Relevance: Key focus on public administration frameworks and fiscal decentralization ${i}.`,
      ],
      link: `https://thehindu.com/national/policy-milestone-${i}?utm_source=rss`,
      primaryCategory: 'national',
      importance: 7,
      source: 'The Hindu',
      date: '2026-10-02T09:00:00.000Z',
    });
  }

  const boundedReport = await CurrentAffairsProductionSyncService.syncBatch(
    largeBatch,
    {
      dryRun: true,
      maxArticles: 10, // Request 10, should be capped to 5
      taxonomyNodeMap: { NATIONAL: validTaxNodeId },
      defaultTaxonomyNodeId: validTaxNodeId,
    },
    dbAdapter
  );

  assertTest('BND01', 'Batch Size Capped to Maximum 5', boundedReport.inspectedCount === 5, `Inspected: ${boundedReport.inspectedCount} of 8`);
  assertTest('BND02', 'Concurrency Set to 1', boundedReport.concurrency === 1, 'Sequential concurrency');

  // ============================================================================
  // GROUP 4: FIRST REAL PRODUCTION SYNC RUN (CONTROLLED DRAFT ONLY)
  // ============================================================================
  console.log('\n--- GROUP 4: REAL PRODUCTION SYNC RUN (DRAFT ONLY) ---');

  const realBatch = [
    {
      id: 'ca74-prod-1-delhi-pollution-grap3',
      title: 'CAQM Enforces Stage 3 GRAP Measures Across Delhi NCR Amid Severe AQI Dip',
      summary: [
        'The Commission for Air Quality Management implemented Stage 3 of the Graded Response Action Plan.',
        'Primary schools across the National Capital Territory transitioned to online and hybrid formats.',
        'Strict restrictions were placed on BS-III petrol and BS-IV diesel four-wheelers.',
        'Exam Relevance: Key focus on Commission for Air Quality Management Act 2021 and Air (Prevention and Control of Pollution) Act 1981.',
      ],
      link: 'https://timesofindia.indiatimes.com/city/delhi/caqm-grap-3-restrictions-delhi-ncr/articleshow/99887766.cms?utm_source=rss',
      primaryCategory: 'environment',
      importance: 8,
      examTags: ['UPSC', 'State PCS'],
      source: 'Times of India',
      feedName: 'TOI National',
      date: '2026-10-02T07:15:00.000Z',
    },
    {
      id: 'ca74-prod-2-isro-pad-abort-test',
      title: 'ISRO Achieves Critical Milestone with Second Gaganyaan Integrated Pad Abort Test',
      summary: [
        'The Indian Space Research Organisation completed its uncrewed pad abort simulation at Sriharikota.',
        'The high-altitude jettison motor separated the crew module smoothly into the Bay of Bengal.',
        'Indian Navy recovery teams validated the sea-borne retrieval protocol within 90 minutes.',
        'Exam Relevance: Gaganyaan mission architecture, environmental control and life support system (ECLSS).',
      ],
      link: 'https://www.thehindu.com/sci-tech/science/isro-gaganyaan-pad-abort-success/article88776655.ece',
      primaryCategory: 'science-tech',
      importance: 9,
      examTags: ['UPSC'],
      source: 'The Hindu',
      feedName: 'The Hindu Tech',
      date: '2026-10-02T08:30:00.000Z',
    },
    {
      id: 'ca74-prod-3-rbi-monetary-policy-repo',
      title: 'RBI Monetary Policy Committee Maintains Status Quo on Benchmark Repo Rate at 6.5%',
      summary: [
        'The Reserve Bank of India Monetary Policy Committee voted to keep the policy repo rate unchanged at 6.5%.',
        'Governor emphasized persistent food inflation risks and reaffirmed the 4% retail inflation target.',
        'Real GDP growth forecast for the fiscal year was maintained at 7.2%.',
        'Exam Relevance: Monetary Policy Committee composition under RBI Act Section 45ZB and inflation targeting framework.',
      ],
      link: 'https://www.livemint.com/economy/rbi-mpc-policy-rate-decision-repo-rate-october-2026-117283948576.html?utm_medium=feed',
      primaryCategory: 'economy',
      importance: 8,
      examTags: ['UPSC', 'Banking'],
      source: 'Livemint',
      feedName: 'Mint Economy',
      date: '2026-10-02T09:45:00.000Z',
    },
  ];

  const prodRunReport = await CurrentAffairsProductionSyncService.syncBatch(
    realBatch,
    {
      dryRun: false, // REAL RUN
      maxArticles: 5,
      taxonomyNodeMap: {
        ENVIRONMENT: validTaxNodeId,
        SCIENCE_TECH: validTaxNodeId,
        ECONOMY: validTaxNodeId,
      },
      examIdMap,
      defaultTaxonomyNodeId: validTaxNodeId,
    },
    dbAdapter
  );

  assertTest('REAL01', 'Real Production Sync Completed', prodRunReport.dryRun === false, 'Real run completed');
  assertTest('REAL02', '3 Draft Records Successfully Ingested', prodRunReport.importedDraftCount === 3, `Imported: ${prodRunReport.importedDraftCount}`);
  assertTest('REAL03', 'Published Count is Strictly 0', prodRunReport.publishedCount === 0, 'publishedCount = 0');
  assertTest('REAL04', 'Candidate Visible Count is Strictly 0', prodRunReport.candidateVisibleCount === 0, 'candidateVisibleCount = 0');

  const stagedArticleIds = prodRunReport.results.map((r) => r.createdArticleId).filter(Boolean);

  // Verify DB state of created records
  for (const artId of stagedArticleIds) {
    const artCheck = await client.query('SELECT status, published_version_id, published_at FROM public.current_affairs_articles WHERE id = $1', [artId]);
    assertTest(`ST_ART_${artId.slice(0, 8)}`, `Master Article ${artId.slice(0, 8)} in DRAFT`, artCheck.rows[0].status === 'DRAFT' && artCheck.rows[0].published_version_id === null, 'DRAFT with null pointer');

    const verCheck = await client.query('SELECT status, published_at FROM public.current_affairs_article_versions WHERE article_id = $1', [artId]);
    assertTest(`ST_VER_${artId.slice(0, 8)}`, `Version 1 in DRAFT`, verCheck.rows[0].status === 'DRAFT' && verCheck.rows[0].published_at === null, 'Version status DRAFT');

    const srcCheck = await client.query('SELECT tier, url FROM public.current_affairs_sources WHERE version_id = (SELECT id FROM public.current_affairs_article_versions WHERE article_id = $1)', [artId]);
    assertTest(`ST_SRC_${artId.slice(0, 8)}`, `Source Tier TIER_3 and Clean URL`, srcCheck.rows[0].tier === 'TIER_3' && !srcCheck.rows[0].url.includes('utm_source'), `Tier: ${srcCheck.rows[0].tier}`);
  }

  // ============================================================================
  // GROUP 5: CANDIDATE & SEO ISOLATION AUDIT
  // ============================================================================
  console.log('\n--- GROUP 5: CANDIDATE & SEO ISOLATION AUDIT ---');

  const publishedCheck = await client.query(
    `SELECT count(*)::int as c FROM public.current_affairs_articles WHERE id = ANY($1) AND status = 'PUBLISHED'`,
    [stagedArticleIds]
  );
  assertTest('ISO01', 'Candidate Public Feed Isolation (0 Visible Rows)', publishedCheck.rows[0].c === 0, 'Zero candidate visibility');

  const publishedPointerCheck = await client.query(
    `SELECT count(*)::int as c FROM public.current_affairs_articles WHERE id = ANY($1) AND published_version_id IS NOT NULL`,
    [stagedArticleIds]
  );
  assertTest('ISO02', 'Candidate Published Pointer Isolation (0 Rows)', publishedPointerCheck.rows[0].c === 0, 'Zero published version pointers');

  // ============================================================================
  // GROUP 6: IDEMPOTENT RERUN VERIFICATION
  // ============================================================================
  console.log('\n--- GROUP 6: IDEMPOTENT RERUN VERIFICATION ---');

  const rerunReport = await CurrentAffairsProductionSyncService.syncBatch(
    realBatch,
    {
      dryRun: false, // RERUN EXACT SAME BATCH
      maxArticles: 5,
      taxonomyNodeMap: {
        ENVIRONMENT: validTaxNodeId,
        SCIENCE_TECH: validTaxNodeId,
        ECONOMY: validTaxNodeId,
      },
      examIdMap,
      defaultTaxonomyNodeId: validTaxNodeId,
    },
    dbAdapter
  );

  assertTest('IDEM01', 'Rerun Detected All 3 Articles as Duplicates', rerunReport.duplicateCount === 3, `Duplicates: ${rerunReport.duplicateCount}`);
  assertTest('IDEM02', 'Rerun Created 0 New Drafts', rerunReport.importedDraftCount === 0, `Imported: ${rerunReport.importedDraftCount}`);

  // Verify master and version table counts did not increase
  const countArticlesAfterRerun = (await client.query('SELECT count(*)::int as c FROM public.current_affairs_articles')).rows[0].c;
  assertTest('IDEM03', 'Database Articles Count Remained Constant', countArticlesAfterRerun === preCounts.current_affairs_articles + 3, `Count: ${countArticlesAfterRerun}`);

  // ============================================================================
  // GROUP 7: PARTIAL FAILURE & TRANSIENT RETRY ISOLATION
  // ============================================================================
  console.log('\n--- GROUP 7: PARTIAL FAILURE & RETRY ISOLATION ---');

  const mixedBatch = [
    {
      id: 'ca74-mixed-1-valid',
      title: 'Cabinet Committee on Economic Affairs Clears Enhanced Minimum Support Price for Rabi Crops',
      summary: [
        'The CCEA chaired by the Prime Minister approved MSP increases across major Rabi crops for 2026-27.',
        'Wheat MSP was increased by Rs 150 per quintal aligning with the Swaminathan Commission 50% margin formula.',
        'Exam Relevance: Agricultural price policy, CACP recommendations, and MSP calculation methodology (A2+FL vs C2).',
      ],
      link: 'https://timesofindia.indiatimes.com/india/ccea-rabi-msp-hike/articleshow/88991122.cms',
      primaryCategory: 'economy',
      importance: 8,
      source: 'Times of India',
      date: '2026-10-02T10:00:00.000Z',
    },
    {
      id: 'ca74-mixed-2-malformed',
      title: 'Bad Title', // Too short (<10 chars)
      summary: ['Short'],
      link: 'http://insecure-http.com/news', // Insecure HTTP
      primaryCategory: 'invalid-category',
      importance: 25, // Out of bounds
      source: 'Unknown Blog',
      date: 'not-a-date',
    },
  ];

  const mixedReport = await CurrentAffairsProductionSyncService.syncBatch(
    mixedBatch,
    {
      dryRun: false,
      maxArticles: 5,
      taxonomyNodeMap: { ECONOMY: validTaxNodeId },
      defaultTaxonomyNodeId: validTaxNodeId,
    },
    dbAdapter
  );

  assertTest('PART01', 'Mixed Batch Ingested Valid Item', mixedReport.importedDraftCount === 1, `Imported: ${mixedReport.importedDraftCount}`);
  assertTest('PART02', 'Mixed Batch Rejected Malformed Item', mixedReport.rejectedCount === 1, `Rejected: ${mixedReport.rejectedCount}`);
  assertTest('PART03', 'Malformed Item Classified as PERMANENT_VALIDATION', mixedReport.results[1].errorCategory === 'PERMANENT_VALIDATION', `Category: ${mixedReport.results[1].errorCategory}`);
  assertTest('PART04', 'No Futile Retries on Permanent Failure', mixedReport.results[1].retryAttempts === 0, `Retries: ${mixedReport.results[1].retryAttempts}`);

  if (mixedReport.results[0].createdArticleId) {
    stagedArticleIds.push(mixedReport.results[0].createdArticleId);
  }

  // ============================================================================
  // GROUP 8: FORENSIC CLEANUP & POST-TEST BASELINE PRESERVATION
  // ============================================================================
  console.log('\n--- GROUP 8: FORENSIC CLEANUP & BASELINE SAFETY ---');

  for (const artId of stagedArticleIds) {
    await client.query('DELETE FROM public.current_affairs_articles WHERE id = $1', [artId]);
  }
  console.log(`  [CLEANUP] Deleted ${stagedArticleIds.length} staging test articles.`);

  // Verify all baselines restored exactly
  let allBaselinesRestored = true;
  for (const tbl of baselineTables) {
    const r = await client.query(`SELECT count(*)::int as c FROM public.${tbl}`);
    const postCount = r.rows[0].c;
    const match = postCount === preCounts[tbl];
    if (!match) allBaselinesRestored = false;
    assertTest(`BASE_${tbl}`, `Baseline Restored on ${tbl}`, match, `Pre=${preCounts[tbl]}, Post=${postCount}`);
  }

  assertTest('BASE_ALL', 'All Database Baselines 100% Preserved', allBaselinesRestored, 'Zero DB pollution');

  await client.end();

  // ============================================================================
  // FINAL SUMMARY
  // ============================================================================
  console.log('\n================================================================================');
  console.log(`PHASE CA-7.4 PRODUCTION SYNC SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runCA74TestSuite().catch((err) => {
  console.error('FATAL ERROR in CA-7.4 Suite:', err);
  process.exit(1);
});
