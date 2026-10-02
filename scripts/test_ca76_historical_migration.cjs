/**
 * COURAGE LIBRARY — PHASE CA-7.6 HISTORICAL CURRENT AFFAIRS MIGRATION TEST SUITE
 * Forensic Inventory Audit, Quality Assessment, Bounded Multi-Batch Ingestion & Candidate Isolation
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

async function runCA76TestSuite() {
  console.log('================================================================================');
  console.log('COURAGE LIBRARY — PHASE CA-7.6 HISTORICAL MIGRATION TEST SUITE');
  console.log('================================================================================\n');

  // ============================================================================
  // SECTION 1: HISTORICAL CORPUS SYNTHESIS & INVENTORY AUDIT
  // ============================================================================
  console.log('--- STEP 1: HISTORICAL CORPUS INVENTORY & QUALITY AUDIT ---');

  // Representative historical corpus spanning active exam cycle (late Sept to Oct 2026)
  const historicalCorpus = [
    {
      id: 'hist-20260928-01',
      title: 'Supreme Court Issues Landmark Guidelines on Preventive Detention Procedural Safeguards',
      summary: [
        'A three-judge bench mandated that detention advisory boards must convene within strictly defined timelines.',
        'Detenus must be provided full grounds of detention in their native language within 48 hours.',
        'Exam Relevance: Article 22 preventive detention safeguards, Habeas Corpus writs under Article 32.',
      ],
      link: 'https://thehindu.com/national/sc-preventive-detention-guidelines/article101.ece?utm_source=rss',
      primaryCategory: 'national',
      importance: 9,
      examTags: ['UPSC', 'State PCS'],
      source: 'The Hindu',
      feedName: 'The Hindu National',
      date: '2026-09-28T08:00:00.000Z',
    },
    {
      id: 'hist-20260929-02',
      title: 'SEBI Notifies Stricter Disclosure Norms for High Risk Foreign Portfolio Investors',
      summary: [
        'Securities and Exchange Board of India mandated granular beneficial ownership disclosures for concentrated FPIs.',
        'Funds holding more than 50% of their Indian equity AUM in a single corporate group are subject to compliance.',
        'Exam Relevance: Capital market regulation, SEBI Act 1992, and prevention of round-tripping.',
      ],
      link: 'https://livemint.com/market/sebi-fpi-disclosure-norms-september-2026/article102.html',
      primaryCategory: 'economy',
      importance: 8,
      examTags: ['UPSC', 'Banking'],
      source: 'Livemint',
      feedName: 'Mint Markets',
      date: '2026-09-29T10:15:00.000Z',
    },
    {
      id: 'hist-20260930-03',
      title: 'Ministry of Environment Declares Extended Eco-Sensitive Zone Around Kaziranga National Park',
      summary: [
        'The notification establishes an animal corridor buffer zone connecting Kaziranga with Karbi Anglong hills.',
        'Commercial mining, stone quarrying, and polluting industries are strictly banned in the core buffer.',
        'Exam Relevance: Wildlife Protection Act 1972, eco-sensitive zones under Environment Protection Act 1986.',
      ],
      link: 'https://timesofindia.indiatimes.com/india/kaziranga-eco-sensitive-zone-expansion/articleshow/103.cms?utm_medium=feed',
      primaryCategory: 'environment',
      importance: 8,
      examTags: ['UPSC', 'State PCS'],
      source: 'Times of India',
      feedName: 'TOI Environment',
      date: '2026-09-30T11:45:00.000Z',
    },
    {
      id: 'hist-20261001-04',
      title: 'Indian Army Inducts Indigenous Swarm Drone Systems for High Altitude Border Surveillance',
      summary: [
        'The Artificial Intelligence enabled swarm drones were developed under the Make in India defence initiative.',
        'The systems feature autonomous target acquisition, encrypted communication, and multi-sensor payload fusion.',
        'Exam Relevance: Indigenization of defence technology, DRDO technology transfer, and border management.',
      ],
      link: 'https://thehindu.com/defence/army-inducts-swarm-drones-lac/article104.ece',
      primaryCategory: 'defence',
      importance: 8,
      examTags: ['UPSC', 'SSC CGL'],
      source: 'The Hindu',
      feedName: 'The Hindu Defence',
      date: '2026-10-01T09:30:00.000Z',
    },
    {
      id: 'hist-20261001-05',
      title: 'Department of Biotechnology Announces Genome India Phase 2 Whole Genome Sequencing Project',
      summary: [
        'Phase 2 targets sequencing 50,000 diverse Indian population genomes to create a national genetic reference catalog.',
        'The database will accelerate rare disease research, precision medicine, and pharmacogenomics in India.',
        'Exam Relevance: Biotechnology applications in healthcare, genetics, and BioE3 policy framework.',
      ],
      link: 'https://timesofindia.indiatimes.com/sci-tech/genome-india-phase-2-launch/articleshow/105.cms',
      primaryCategory: 'science-tech',
      importance: 9,
      examTags: ['UPSC'],
      source: 'Times of India',
      feedName: 'TOI Science',
      date: '2026-10-01T14:20:00.000Z',
    },
    {
      id: 'hist-20261002-06',
      title: 'Prime Minister Inaugurates Global Renewable Energy Investors Meet in Gandhinagar',
      summary: [
        'RE-INVEST 2026 convened over 40 countries to deliberate on green hydrogen, offshore wind, and battery storage.',
        'India reiterated commitment to achieving 500 GW non-fossil electricity capacity ahead of 2030.',
        'Exam Relevance: International Solar Alliance, National Green Hydrogen Mission, and COP commitments.',
      ],
      link: 'https://livemint.com/industry/re-invest-2026-renewable-energy-summit/article106.html',
      primaryCategory: 'economy',
      importance: 8,
      examTags: ['UPSC', 'State PCS'],
      source: 'Livemint',
      feedName: 'Mint Energy',
      date: '2026-10-02T08:00:00.000Z',
    },
  ];

  const inventory = CurrentAffairsProductionSyncService.auditHistoricalCorpus(historicalCorpus);

  assertTest('INV01', 'Total Historical Corpus Size Audited', inventory.totalArticles === 6, `Total: ${inventory.totalArticles}`);
  assertTest('INV02', 'Earliest Article Date Identified', inventory.earliestDate === '2026-09-28', `Earliest: ${inventory.earliestDate}`);
  assertTest('INV03', 'Latest Article Date Identified', inventory.latestDate === '2026-10-02', `Latest: ${inventory.latestDate}`);
  assertTest('INV04', '100% Valid HTTPS Provenance', inventory.validHttpsCount === 6, `HTTPS count: ${inventory.validHttpsCount}/${inventory.totalArticles}`);
  assertTest('INV05', '100% Tier 3 National Media Sources', inventory.sourceTierDistribution.TIER_3 === 6 && inventory.sourceTierDistribution.TIER_4 === 0, `Tier 3 count: ${inventory.sourceTierDistribution.TIER_3}`);
  assertTest('INV06', 'Zero Missing Source Publishers', inventory.missingSourceCount === 0, 'missingSourceCount = 0');
  assertTest('INV07', 'Zero Missing Summary Bullets', inventory.missingSummaryCount === 0, 'missingSummaryCount = 0');
  assertTest('INV08', 'Zero Unknown Categories', inventory.unknownCategoryCount === 0, 'unknownCategoryCount = 0');
  assertTest('INV09', 'Assessment Verdict Approved', inventory.assessmentVerdict === 'APPROVED_FOR_BOUNDED_MIGRATION', `Verdict: ${inventory.assessmentVerdict}`);

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

  const taxRes = await client.query('SELECT id FROM public.canonical_taxonomy_nodes LIMIT 1');
  const validTaxNodeId = taxRes.rows[0]?.id || '00000000-0000-0000-0000-000000000001';

  // ============================================================================
  // SECTION 2: DRY-RUN HISTORICAL MIGRATION
  // ============================================================================
  console.log('\n--- STEP 2: DRY-RUN HISTORICAL MIGRATION (ZERO DB WRITES) ---');

  const dryRunMigration = await CurrentAffairsProductionSyncService.migrateHistoricalCorpus(
    historicalCorpus,
    {
      dryRun: true,
      maxArticlesPerBatch: 25,
      taxonomyNodeMap: {
        NATIONAL: validTaxNodeId,
        ECONOMY: validTaxNodeId,
        ENVIRONMENT: validTaxNodeId,
        DEFENCE: validTaxNodeId,
        SCIENCE_TECH: validTaxNodeId,
      },
      defaultTaxonomyNodeId: validTaxNodeId,
    },
    dbAdapter
  );

  assertTest('DRY01', 'Dry-Run Flag Enforced in Migration', dryRunMigration.dryRun === true, 'dryRun is strictly true');
  assertTest('DRY02', 'All 6 Items Simulated Ingested', dryRunMigration.importedDraftCount === 6, `Imported: ${dryRunMigration.importedDraftCount}`);
  assertTest('DRY03', 'Published Count is Exactly 0', dryRunMigration.publishedCount === 0, 'publishedCount = 0');
  assertTest('DRY04', 'Candidate Visible Count is Exactly 0', dryRunMigration.candidateVisibleCount === 0, 'candidateVisibleCount = 0');

  // Verify Zero DB writes occurred
  for (const tbl of baselineTables) {
    const r = await client.query(`SELECT count(*)::int as c FROM public.${tbl}`);
    const currentCount = r.rows[0].c;
    assertTest(`DRY_DB_${tbl}`, `Zero DB Writes on ${tbl}`, currentCount === preCounts[tbl], `Count: ${currentCount} === ${preCounts[tbl]}`);
  }

  // ============================================================================
  // SECTION 3: BOUNDED REAL HISTORICAL MIGRATION (DRAFT ONLY)
  // ============================================================================
  console.log('\n--- STEP 3: BOUNDED REAL HISTORICAL MIGRATION ---');

  const realMigration = await CurrentAffairsProductionSyncService.migrateHistoricalCorpus(
    historicalCorpus,
    {
      dryRun: false, // REAL MIGRATION
      maxArticlesPerBatch: 25,
      taxonomyNodeMap: {
        NATIONAL: validTaxNodeId,
        ECONOMY: validTaxNodeId,
        ENVIRONMENT: validTaxNodeId,
        DEFENCE: validTaxNodeId,
        SCIENCE_TECH: validTaxNodeId,
      },
      defaultTaxonomyNodeId: validTaxNodeId,
    },
    dbAdapter
  );

  assertTest('MIG01', 'Real Migration Completed', realMigration.dryRun === false, 'Real migration executed');
  assertTest('MIG02', 'All 6 Historical Drafts Ingested', realMigration.importedDraftCount === 6, `Imported: ${realMigration.importedDraftCount}`);
  assertTest('MIG03', 'Published Count is Strictly 0', realMigration.publishedCount === 0, 'publishedCount = 0');
  assertTest('MIG04', 'Candidate Visible Count is Strictly 0', realMigration.candidateVisibleCount === 0, 'candidateVisibleCount = 0');

  const migratedArticleIds = [];
  realMigration.batchReports.forEach((br) => {
    br.results.forEach((r) => {
      if (r.createdArticleId) migratedArticleIds.push(r.createdArticleId);
    });
  });

  assertTest('MIG05', '6 Staged Article IDs Tracked', migratedArticleIds.length === 6, `Count: ${migratedArticleIds.length}`);

  // Inspect Master and Version Records in PostgreSQL
  for (const artId of migratedArticleIds) {
    const artCheck = await client.query(
      'SELECT id, status, published_version_id, published_at FROM public.current_affairs_articles WHERE id = $1',
      [artId]
    );
    const artRow = artCheck.rows[0];
    assertTest(`ART_DRAFT_${artId.slice(0, 8)}`, `Master Article ${artId.slice(0, 8)} in DRAFT`, artRow.status === 'DRAFT' && artRow.published_version_id === null && artRow.published_at === null, 'DRAFT with null pointer');

    const verCheck = await client.query(
      'SELECT id, status, version_number, published_at FROM public.current_affairs_article_versions WHERE article_id = $1',
      [artId]
    );
    const verRow = verCheck.rows[0];
    assertTest(`VER_DRAFT_${artId.slice(0, 8)}`, `Version 1 ${artId.slice(0, 8)} in DRAFT`, verRow.status === 'DRAFT' && verRow.version_number === 1 && verRow.published_at === null, 'Version 1 in DRAFT');
  }

  // ============================================================================
  // SECTION 4: CANDIDATE & SEO ISOLATION VERIFICATION
  // ============================================================================
  console.log('\n--- STEP 4: CANDIDATE & SEO ISOLATION VERIFICATION ---');

  const pubCheck = await client.query(
    `SELECT count(*)::int as c FROM public.current_affairs_articles WHERE id = ANY($1) AND status = 'PUBLISHED'`,
    [migratedArticleIds]
  );
  assertTest('ISO01', 'Zero Migrated Articles Visible to Candidates', pubCheck.rows[0].c === 0, 'Candidate visibility is 0');

  const pubPtrCheck = await client.query(
    `SELECT count(*)::int as c FROM public.current_affairs_articles WHERE id = ANY($1) AND published_version_id IS NOT NULL`,
    [migratedArticleIds]
  );
  assertTest('ISO02', 'Zero Migrated Articles Have Published Version Pointers', pubPtrCheck.rows[0].c === 0, 'published_version_id IS NULL');

  // ============================================================================
  // SECTION 5: IDEMPOTENT RERUN & CHECKPOINT RECOVERY
  // ============================================================================
  console.log('\n--- STEP 5: IDEMPOTENT RERUN & CHECKPOINT RECOVERY ---');

  const rerunMigration = await CurrentAffairsProductionSyncService.migrateHistoricalCorpus(
    historicalCorpus,
    {
      dryRun: false, // RERUN EXACT SAME CORPUS
      maxArticlesPerBatch: 25,
      taxonomyNodeMap: {
        NATIONAL: validTaxNodeId,
        ECONOMY: validTaxNodeId,
        ENVIRONMENT: validTaxNodeId,
        DEFENCE: validTaxNodeId,
        SCIENCE_TECH: validTaxNodeId,
      },
      defaultTaxonomyNodeId: validTaxNodeId,
    },
    dbAdapter
  );

  assertTest('RERUN01', 'Rerun Detected All 6 Items as Duplicates', rerunMigration.duplicateCount === 6, `Duplicates: ${rerunMigration.duplicateCount}`);
  assertTest('RERUN02', 'Rerun Created Zero New Drafts', rerunMigration.importedDraftCount === 0, `Imported: ${rerunMigration.importedDraftCount}`);

  const countAfterRerun = (await client.query('SELECT count(*)::int as c FROM public.current_affairs_articles')).rows[0].c;
  assertTest('RERUN03', 'Database Article Count Remained Constant (6 Drafts)', countAfterRerun === preCounts.current_affairs_articles + 6, `Count: ${countAfterRerun}`);

  // ============================================================================
  // SECTION 6: FORENSIC CLEANUP & BASELINE RESTORATION
  // ============================================================================
  console.log('\n--- STEP 6: FORENSIC CLEANUP & BASELINE SAFETY ---');

  for (const artId of migratedArticleIds) {
    await client.query('DELETE FROM public.current_affairs_articles WHERE id = $1', [artId]);
  }
  console.log(`  [CLEANUP] Deleted ${migratedArticleIds.length} historical test articles.`);

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
  console.log(`PHASE CA-7.6 HISTORICAL MIGRATION SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runCA76TestSuite().catch((err) => {
  console.error('FATAL ERROR in CA-7.6 Suite:', err);
  process.exit(1);
});
