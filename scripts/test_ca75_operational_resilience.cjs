/**
 * COURAGE LIBRARY — PHASE CA-7.5 OPERATIONAL RESILIENCE TEST SUITE
 * Multi-Scenario Failure Injection, Bounded Retries, Ambiguous Recovery & Health Checks
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

async function runCA75TestSuite() {
  console.log('================================================================================');
  console.log('COURAGE LIBRARY — PHASE CA-7.5 OPERATIONAL RESILIENCE TEST SUITE');
  console.log('================================================================================\n');

  // ============================================================================
  // GROUP 1: TARGET ENVIRONMENT & HEALTH CHECKS
  // ============================================================================
  console.log('--- GROUP 1: TARGET ENVIRONMENT & HEALTH CHECKS ---');

  const envInfo = CurrentAffairsProductionSyncService.identifyTargetEnvironment();
  assertTest('ENV01', 'Target Environment Identified Safely', envInfo.isIdentified === true, `Provider: ${envInfo.provider}`);
  assertTest('ENV02', 'Target Database Name Verified', envInfo.databaseName === 'postgres', `DB Name: ${envInfo.databaseName}`);
  assertTest('ENV03', 'SSL Protection Active', envInfo.sslEnabled === true, 'SSL confirmed active');

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

  const health = await CurrentAffairsProductionSyncService.checkHealth(dbAdapter);
  assertTest('HLTH01', 'Ingestion Subsystem Overall Health', health.status === 'HEALTHY', `Status: ${health.status}`);
  assertTest('HLTH02', 'Database Health Connected', health.database === 'CONNECTED', `DB: ${health.database}`);
  assertTest('HLTH03', 'Validation Engine Operational', health.validationEngine === 'OPERATIONAL', `Validation: ${health.validationEngine}`);

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

  const taxRes = await client.query('SELECT id FROM public.canonical_taxonomy_nodes LIMIT 1');
  const validTaxNodeId = taxRes.rows[0]?.id || '00000000-0000-0000-0000-000000000001';

  const stagedArticlesToClean = [];

  // ============================================================================
  // GROUP 2: AMBIGUOUS RESPONSE & IDEMPOTENT RECOVERY
  // ============================================================================
  console.log('\n--- GROUP 2: AMBIGUOUS RESPONSE & IDEMPOTENT RECOVERY ---');

  const ambiguousArticle = {
    id: 'ca75-ambiguous-test-1',
    title: 'NITI Aayog Releases Composite Water Management Index 3.0 Report',
    summary: [
      'NITI Aayog launched the third edition of the Composite Water Management Index assessing state water governance.',
      'Gujarat and Andhra Pradesh emerged as top performers in non-Himalayan state categories.',
      'The report emphasizes groundwater recharge, micro-irrigation, and participatory water management.',
      'Exam Relevance: Key focus on water security, inter-state river water disputes, and SDG 6.',
    ],
    link: 'https://timesofindia.indiatimes.com/india/niti-aayog-water-index-report/articleshow/77112233.cms',
    primaryCategory: 'environment',
    importance: 8,
    source: 'Times of India',
    date: '2026-10-02T10:00:00.000Z',
  };

  const ambReport = await CurrentAffairsProductionSyncService.syncBatch(
    [ambiguousArticle],
    {
      dryRun: false,
      maxArticles: 1,
      taxonomyNodeMap: { ENVIRONMENT: validTaxNodeId },
      defaultTaxonomyNodeId: validTaxNodeId,
      simulateAmbiguousTimeout: true, // Trigger ambiguous response recovery
    },
    dbAdapter
  );

  assertTest('AMB01', 'Ambiguous Response Handled Safely', ambReport.importedDraftCount === 1, 'Draft confirmed created');
  assertTest('AMB02', 'Recovered Flag Marked on Ambiguous Item', ambReport.results[0].isRecovered === true, 'isRecovered = true');
  assertTest('AMB03', 'Recovered Count Incremented in Metrics', ambReport.metrics.recoveredCount === 1, `Recovered count: ${ambReport.metrics.recoveredCount}`);

  if (ambReport.results[0].createdArticleId) {
    stagedArticlesToClean.push(ambReport.results[0].createdArticleId);
  }

  // ============================================================================
  // GROUP 3: PARTIAL FAILURE & RETRY ISOLATION (5-ARTICLE MIXED BATCH)
  // ============================================================================
  console.log('\n--- GROUP 3: PARTIAL FAILURE & MULTI-ARTICLE ISOLATION ---');

  const mixed5Batch = [
    {
      id: 'ca75-item-1-valid',
      title: 'Supreme Court Upholds Validity of Tribunal Reforms Act Provisions with Conditions',
      summary: [
        'A five-judge Constitution Bench ruled on judicial independence in tribunal appointments and tenure.',
        'The court reaffirmed that search-cum-selection committees must maintain judicial primacy.',
        'Exam Relevance: Separation of powers under Article 50 and administrative tribunals under Article 323A/B.',
      ],
      link: 'https://thehindu.com/national/sc-tribunals-verdict/article11.ece',
      primaryCategory: 'national',
      importance: 9,
      source: 'The Hindu',
      date: '2026-10-02T10:30:00.000Z',
    },
    {
      id: 'ca75-item-2-valid',
      title: 'Ministry of Power Launches National Energy Storage Mission Framework',
      summary: [
        'The framework outlines target capacity of 47 GW Battery Energy Storage Systems by 2032.',
        'Viability Gap Funding mechanisms were announced for grid-scale lithium and sodium-ion deployments.',
        'Exam Relevance: Renewable energy integration, grid stability, and Nationally Determined Contributions (NDCs).',
      ],
      link: 'https://livemint.com/industry/energy-storage-mission/article12.html',
      primaryCategory: 'economy',
      importance: 8,
      source: 'Livemint',
      date: '2026-10-02T11:00:00.000Z',
    },
    {
      id: 'ca75-item-3-malformed',
      title: 'Short', // Invalid length (<10 chars)
      summary: ['Bad'],
      link: 'http://insecure-source.com/bad',
      primaryCategory: 'nonexistent-cat',
      importance: 50,
      source: 'Blog',
      date: 'invalid-date',
    },
    {
      id: 'ca75-item-4-valid',
      title: 'DRDO Successfully Tests High Altitude VSHORADS Air Defence Missile System',
      summary: [
        'Very Short Range Air Defence System flight tests were conducted from a ground-based mobile launcher.',
        'The miniaturized dual-thrust rocket motor propelled the missile to intercept simulated aerial targets.',
        'Exam Relevance: Integrated Guided Missile Development Programme and indigenous air defence architecture.',
      ],
      link: 'https://timesofindia.indiatimes.com/india/drdo-vshorads-test-success/articleshow/13.cms',
      primaryCategory: 'defence',
      importance: 9,
      source: 'Times of India',
      date: '2026-10-02T11:30:00.000Z',
    },
    {
      id: 'ca75-item-5-valid',
      title: 'Election Commission Announces Comprehensive Revision of Electoral Rolls in Border Districts',
      summary: [
        'Special summary revision initiated under Representation of the People Act 1950.',
        'Door-to-door verification protocols enhanced with digital photo electoral rolls.',
        'Exam Relevance: Article 324, RPA 1950/1951, and powers of Election Commission of India.',
      ],
      link: 'https://thehindu.com/news/national/eci-electoral-rolls-revision/article14.ece',
      primaryCategory: 'national',
      importance: 7,
      source: 'The Hindu',
      date: '2026-10-02T12:00:00.000Z',
    },
  ];

  const mixedReport = await CurrentAffairsProductionSyncService.syncBatch(
    mixed5Batch,
    {
      dryRun: false,
      maxArticles: 5,
      taxonomyNodeMap: {
        NATIONAL: validTaxNodeId,
        ECONOMY: validTaxNodeId,
        DEFENCE: validTaxNodeId,
      },
      defaultTaxonomyNodeId: validTaxNodeId,
    },
    dbAdapter
  );

  assertTest('PART01', 'Mixed Batch Run Status is PARTIAL_FAILURE', mixedReport.status === 'PARTIAL_FAILURE', `Status: ${mixedReport.status}`);
  assertTest('PART02', '4 Valid Articles Successfully Ingested as DRAFT', mixedReport.importedDraftCount === 4, `Imported: ${mixedReport.importedDraftCount}`);
  assertTest('PART03', '1 Malformed Article Rejected', mixedReport.rejectedCount === 1, `Rejected: ${mixedReport.rejectedCount}`);
  assertTest('PART04', 'Malformed Item Had Zero Futile Retries', mixedReport.results[2].retryAttempts === 0, `Retries: ${mixedReport.results[2].retryAttempts}`);

  mixedReport.results.forEach((r) => {
    if (r.createdArticleId) stagedArticlesToClean.push(r.createdArticleId);
  });

  // ============================================================================
  // GROUP 4: SAFE RESUMABILITY & IDEMPOTENT RERUN
  // ============================================================================
  console.log('\n--- GROUP 4: SAFE RESUMABILITY & IDEMPOTENT RERUN ---');

  const resumeReport = await CurrentAffairsProductionSyncService.syncBatch(
    mixed5Batch,
    {
      dryRun: false,
      maxArticles: 5,
      taxonomyNodeMap: {
        NATIONAL: validTaxNodeId,
        ECONOMY: validTaxNodeId,
        DEFENCE: validTaxNodeId,
      },
      defaultTaxonomyNodeId: validTaxNodeId,
    },
    dbAdapter
  );

  assertTest('RES01', 'Resume Run Identified 4 Existing Items as Duplicates', resumeReport.duplicateCount === 4, `Duplicates: ${resumeReport.duplicateCount}`);
  assertTest('RES02', 'Resume Run Created Zero New Drafts', resumeReport.importedDraftCount === 0, `Imported: ${resumeReport.importedDraftCount}`);
  assertTest('RES03', 'Resume Run Kept Malformed Item Rejected', resumeReport.rejectedCount === 1, `Rejected: ${resumeReport.rejectedCount}`);

  // ============================================================================
  // GROUP 5: SYSTEMIC FAILURE DETECTION & ABORT THRESHOLD
  // ============================================================================
  console.log('\n--- GROUP 5: SYSTEMIC FAILURE DETECTION & ABORT THRESHOLD ---');

  // Create a batch where items fail with systemic authorization/database errors
  const mockSystemicBatch = [
    {
      id: 'sys-1',
      title: 'Article Triggering Systemic Failure Simulation 1',
      summary: ['Test bullet 1', 'Test bullet 2', 'Exam Relevance: Sample relevance note.'],
      link: 'https://thehindu.com/article-sys-1',
      primaryCategory: 'national',
      importance: 7,
      source: 'The Hindu',
      date: '2026-10-02T13:00:00.000Z',
    },
    {
      id: 'sys-2',
      title: 'Article Triggering Systemic Failure Simulation 2',
      summary: ['Test bullet 1', 'Test bullet 2', 'Exam Relevance: Sample relevance note.'],
      link: 'https://thehindu.com/article-sys-2',
      primaryCategory: 'national',
      importance: 7,
      source: 'The Hindu',
      date: '2026-10-02T13:05:00.000Z',
    },
    {
      id: 'sys-3',
      title: 'Article Triggering Systemic Failure Simulation 3',
      summary: ['Test bullet 1', 'Test bullet 2', 'Exam Relevance: Sample relevance note.'],
      link: 'https://thehindu.com/article-sys-3',
      primaryCategory: 'national',
      importance: 7,
      source: 'The Hindu',
      date: '2026-10-02T13:10:00.000Z',
    },
    {
      id: 'sys-4',
      title: 'Article That Should Be Skipped Due To Prior Abort',
      summary: ['Test bullet 1', 'Test bullet 2', 'Exam Relevance: Sample relevance note.'],
      link: 'https://thehindu.com/article-sys-4',
      primaryCategory: 'national',
      importance: 7,
      source: 'The Hindu',
      date: '2026-10-02T13:15:00.000Z',
    },
  ];

  // Mock DB that fails with AUTH error
  const failingAuthDb = {
    query: async () => {
      throw new Error('401 UNAUTHORIZED: Database role revoked');
    },
  };

  const sysReport = await CurrentAffairsProductionSyncService.syncBatch(
    mockSystemicBatch,
    {
      dryRun: false,
      maxArticles: 5,
      systemicFailureThreshold: 3,
      taxonomyNodeMap: { NATIONAL: validTaxNodeId },
      defaultTaxonomyNodeId: validTaxNodeId,
    },
    failingAuthDb
  );

  assertTest('SYS01', 'Systemic Failure Threshold Triggered ABORTED Run Status', sysReport.status === 'ABORTED', `Status: ${sysReport.status}`);
  assertTest('SYS02', 'Downstream 4th Article Safely SKIPPED', sysReport.results[3]?.outcome === 'SKIPPED', `4th Outcome: ${sysReport.results[3]?.outcome}`);
  assertTest('SYS03', 'Metrics Recorded Systemic Abort', sysReport.metrics.runsAborted >= 1, `Runs aborted: ${sysReport.metrics.runsAborted}`);

  // ============================================================================
  // GROUP 6: STALE RUN DETECTION
  // ============================================================================
  console.log('\n--- GROUP 6: STALE RUN DETECTION ---');

  const oldRun = {
    startTime: new Date(Date.now() - 700000).toISOString(), // 11.6 minutes ago
    status: 'RUNNING',
  };
  const recentRun = {
    startTime: new Date(Date.now() - 30000).toISOString(), // 30 seconds ago
    status: 'RUNNING',
  };
  const completedOldRun = {
    startTime: new Date(Date.now() - 700000).toISOString(),
    status: 'COMPLETED',
  };

  assertTest('STL01', 'Old Running Process Detected as STALE', CurrentAffairsProductionSyncService.detectStaleRun(oldRun) === true, 'Detected stale run');
  assertTest('STL02', 'Recent Running Process Not Flagged as Stale', CurrentAffairsProductionSyncService.detectStaleRun(recentRun) === false, 'Recent run active');
  assertTest('STL03', 'Completed Process Never Flagged as Stale', CurrentAffairsProductionSyncService.detectStaleRun(completedOldRun) === false, 'Completed run ignored');

  // ============================================================================
  // GROUP 7: AUDIT LOGGING & SECURITY SCAN
  // ============================================================================
  console.log('\n--- GROUP 7: AUDIT LOGGING & SECURITY SCAN ---');

  assertTest('AUD01', 'Audit Logs Captured in Report', mixedReport.auditLogs && mixedReport.auditLogs.length > 0, `Log count: ${mixedReport.auditLogs.length}`);
  const hasStartEvent = mixedReport.auditLogs.some((l) => l.event === 'SYNC_STARTED');
  const hasImportEvents = mixedReport.auditLogs.some((l) => l.event === 'ARTICLE_IMPORTED');
  const hasRejectEvents = mixedReport.auditLogs.some((l) => l.event === 'ARTICLE_REJECTED');
  assertTest('AUD02', 'Traceable Lifecycle Audit Events Present', hasStartEvent && hasImportEvents && hasRejectEvents, 'Lifecycle events verified');

  // Verify Zero Secret Leakage across audit logs & reports
  const reportString = JSON.stringify(mixedReport) + JSON.stringify(sysReport) + JSON.stringify(health);
  const secretKeywords = ['Bearer ', 'postgresql://', 'INGESTION_KEY', 'service_role', 'eyJhbGciOi'];
  let leakDetected = false;
  secretKeywords.forEach((kw) => {
    if (reportString.includes(kw)) leakDetected = true;
  });
  assertTest('SEC01', 'Zero Secret Leakage in Reports and Logs', leakDetected === false, 'Pristine security posture');

  // ============================================================================
  // GROUP 8: CANDIDATE & SEO ISOLATION
  // ============================================================================
  console.log('\n--- GROUP 8: CANDIDATE & SEO ISOLATION ---');

  const pubCheck = await client.query(
    `SELECT count(*)::int as c FROM public.current_affairs_articles WHERE id = ANY($1) AND status = 'PUBLISHED'`,
    [stagedArticlesToClean]
  );
  assertTest('ISO01', 'Zero Staged Articles Visible to Candidates', pubCheck.rows[0].c === 0, 'Candidate visibility is 0');

  const pubPtrCheck = await client.query(
    `SELECT count(*)::int as c FROM public.current_affairs_articles WHERE id = ANY($1) AND published_version_id IS NOT NULL`,
    [stagedArticlesToClean]
  );
  assertTest('ISO02', 'Zero Staged Articles Have Published Pointers', pubPtrCheck.rows[0].c === 0, 'Published pointer is NULL');

  // ============================================================================
  // GROUP 9: DATABASE CLEANUP & BASELINE INTEGRITY AUDIT
  // ============================================================================
  console.log('\n--- GROUP 9: FORENSIC CLEANUP & BASELINE RESTORATION ---');

  for (const artId of stagedArticlesToClean) {
    await client.query('DELETE FROM public.current_affairs_articles WHERE id = $1', [artId]);
  }
  console.log(`  [CLEANUP] Deleted ${stagedArticlesToClean.length} test articles.`);

  let baselinesIntact = true;
  for (const tbl of baselineTables) {
    const r = await client.query(`SELECT count(*)::int as c FROM public.${tbl}`);
    const postCount = r.rows[0].c;
    const match = postCount === preCounts[tbl];
    if (!match) baselinesIntact = false;
    assertTest(`BASE_${tbl}`, `Baseline Restored on ${tbl}`, match, `Pre=${preCounts[tbl]}, Post=${postCount}`);
  }

  assertTest('BASE_ALL', 'All Database Baselines 100% Preserved', baselinesIntact, 'Zero production DB pollution');

  await client.end();

  // ============================================================================
  // FINAL SUMMARY
  // ============================================================================
  console.log('\n================================================================================');
  console.log(`PHASE CA-7.5 OPERATIONAL RESILIENCE SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runCA75TestSuite().catch((err) => {
  console.error('FATAL ERROR in CA-7.5 Suite:', err);
  process.exit(1);
});
