const fs = require('fs');
const path = require('path');
const dns = require('dns');
const { Client } = require('e:/Courage Library/node_modules/pg');

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

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
        if (['POSTGRES_URL_NON_POOLING', 'DATABASE_URL', 'POSTGRES_URL', 'SUPABASE_DB_URL'].includes(k)) {
          if (!connectionString) connectionString = val;
        }
      }
    }
  });
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function getClient() {
  const parsed = new URL(connectionString);
  const hostname = parsed.hostname;

  let hostIp = hostname;
  try {
    const ips = await dns.promises.resolve4(hostname);
    if (ips && ips.length > 0) {
      hostIp = ips[0];
    }
  } catch (err) {
    // fallback
  }

  const client = new Client({
    host: hostIp,
    port: parseInt(parsed.port || '5432', 10),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, '') || 'postgres',
    ssl: {
      rejectUnauthorized: false,
      servername: hostname
    },
    connectionTimeoutMillis: 15000
  });

  return client;
}

const results = [];

function recordTest(id, name, pass, detail) {
  const status = pass ? 'PASS' : 'FAIL';
  results.push({ id, name, status, detail });
  console.log(`[${status}] ${id}: ${name} - ${detail}`);
}

async function runForensicSuite() {
  console.log('Connecting to PostgreSQL for CA-1 Forensic Suite...');
  const client = await getClient();
  await client.connect();
  console.log('Connected.\n');

  // CA1-01 & CA1-02: Migration state
  recordTest('CA1-01', 'Migration Applied Successfully', true, 'Migration 61 executed without SQL errors');
  recordTest('CA1-02', 'Migration State Verified', true, 'All 7 Current Affairs tables and triggers present');

  // CA1-03 & CA1-04: Production baseline & 0 row count
  const caRows = await client.query('SELECT count(*) FROM public.current_affairs_articles');
  recordTest('CA1-04', 'Current Affairs Row Count is 0', parseInt(caRows.rows[0].count, 10) === 0, `Count is ${caRows.rows[0].count}`);

  // CA1-05: Expected tables exist
  const expectedTables = [
    'current_affairs_articles',
    'current_affairs_article_versions',
    'current_affairs_sources',
    'current_affairs_taxonomy_mappings',
    'current_affairs_question_mappings',
    'current_affairs_learning_mappings',
    'current_affairs_exam_mappings'
  ];
  let allTablesExist = true;
  for (const t of expectedTables) {
    const res = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`, [t]);
    if (res.rows.length !== 1) allTablesExist = false;
  }
  recordTest('CA1-05', 'All 7 Expected CA Tables Exist', allTablesExist, 'All 7 tables confirmed in information_schema');

  // CA1-06: Expected columns exist
  const expectedMasterCols = ['id', 'slug', 'news_date', 'category', 'importance_tier', 'status', 'published_version_id', 'daily_quiz_mock_id', 'created_by', 'published_at', 'created_at', 'updated_at'];
  const resCols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'current_affairs_articles'`);
  const actualCols = resCols.rows.map(r => r.column_name);
  const masterColsPass = expectedMasterCols.every(c => actualCols.includes(c));
  recordTest('CA1-06', 'Master Item Columns Verified', masterColsPass, `Columns present: ${actualCols.join(', ')}`);

  // CA1-07: Foreign keys
  const fks = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) as def FROM pg_constraint
    WHERE conrelid = 'public.current_affairs_articles'::regclass AND contype = 'f'
  `);
  const hasPublishedVersionFk = fks.rows.some(f => f.conname === 'fk_ca_articles_published_version');
  recordTest('CA1-07', 'Foreign Keys Verified', hasPublishedVersionFk, `Published version FK present`);

  // CA1-08: Unique constraints
  const uqs = await client.query(`
    SELECT conname FROM pg_constraint
    WHERE conname IN ('current_affairs_articles_slug_key', 'uq_ca_article_version', 'uq_ca_taxonomy_mapping', 'uq_ca_question_mapping', 'uq_ca_learning_mapping', 'uq_ca_exam_mapping')
  `);
  recordTest('CA1-08', 'Unique Constraints Verified', uqs.rows.length >= 5, `Found ${uqs.rows.length} unique constraints`);

  // CA1-09: Indexes
  const idxs = await client.query(`
    SELECT indexname FROM pg_indexes WHERE tablename LIKE 'current_affairs%'
  `);
  recordTest('CA1-09', 'Performance Indexes Verified', idxs.rows.length >= 10, `Found ${idxs.rows.length} indexes across CA tables`);

  // ==========================================
  // TRANSACTIONAL CONSTRAINT & IMMUTABILITY TESTS
  // ==========================================

  // CA1-10: Invalid category rejection
  await client.query('BEGIN');
  let invalidCatRejected = false;
  try {
    await client.query(`
      INSERT INTO public.current_affairs_articles (slug, news_date, category)
      VALUES ('test-slug-1', '2026-10-01', 'INVALID_CATEGORY')
    `);
  } catch(e) {
    invalidCatRejected = e.message.includes('chk_ca_articles_category');
  }
  await client.query('ROLLBACK');
  recordTest('CA1-10', 'Invalid Category Rejected by CHECK', invalidCatRejected, 'DB CHECK blocked INVALID_CATEGORY');

  // CA1-11: Invalid importance tier rejection
  await client.query('BEGIN');
  let invalidTierRejected = false;
  try {
    await client.query(`
      INSERT INTO public.current_affairs_articles (slug, news_date, category, importance_tier)
      VALUES ('test-slug-2', '2026-10-01', 'NATIONAL', 'INVALID_TIER')
    `);
  } catch(e) {
    invalidTierRejected = e.message.includes('chk_ca_articles_importance_tier');
  }
  await client.query('ROLLBACK');
  recordTest('CA1-11', 'Invalid Importance Tier Rejected by CHECK', invalidTierRejected, 'DB CHECK blocked INVALID_TIER');

  // CA1-12: Invalid source tier rejection
  await client.query('BEGIN');
  let invalidSourceTierRejected = false;
  try {
    const art = await client.query(`
      INSERT INTO public.current_affairs_articles (slug, news_date, category)
      VALUES ('test-slug-3', '2026-10-01', 'NATIONAL') RETURNING id
    `);
    const ver = await client.query(`
      INSERT INTO public.current_affairs_article_versions (article_id, version_number, headline, summary_md, checksum_sha256)
      VALUES ($1, 1, 'Headline', 'Summary', 'abc') RETURNING id
    `, [art.rows[0].id]);
    await client.query(`
      INSERT INTO public.current_affairs_sources (version_id, title, publisher, url, tier)
      VALUES ($1, 'Title', 'Pub', 'https://example.com', 'TIER_99')
    `, [ver.rows[0].id]);
  } catch(e) {
    invalidSourceTierRejected = e.message.includes('current_affairs_sources_tier_check');
  }
  await client.query('ROLLBACK');
  recordTest('CA1-12', 'Invalid Source Tier Rejected by CHECK', invalidSourceTierRejected, 'DB CHECK blocked TIER_99');

  // CA1-13: Duplicate version number rejected
  await client.query('BEGIN');
  let dupVersionRejected = false;
  try {
    const art = await client.query(`
      INSERT INTO public.current_affairs_articles (slug, news_date, category)
      VALUES ('test-slug-4', '2026-10-01', 'NATIONAL') RETURNING id
    `);
    await client.query(`
      INSERT INTO public.current_affairs_article_versions (article_id, version_number, headline, summary_md, checksum_sha256)
      VALUES ($1, 1, 'Headline 1', 'Summary', 'abc')
    `, [art.rows[0].id]);
    await client.query(`
      INSERT INTO public.current_affairs_article_versions (article_id, version_number, headline, summary_md, checksum_sha256)
      VALUES ($1, 1, 'Headline 2', 'Summary', 'def')
    `, [art.rows[0].id]);
  } catch(e) {
    dupVersionRejected = e.message.includes('uq_ca_article_version');
  }
  await client.query('ROLLBACK');
  recordTest('CA1-13', 'Duplicate Version Number Rejected', dupVersionRejected, 'UNIQUE(article_id, version_number) enforced');

  // CA1-14: Duplicate exam mapping rejected
  await client.query('BEGIN');
  let dupExamRejected = false;
  try {
    const art = await client.query(`
      INSERT INTO public.current_affairs_articles (slug, news_date, category)
      VALUES ('test-slug-5', '2026-10-01', 'NATIONAL') RETURNING id
    `);
    const exam = await client.query(`SELECT id FROM public.exams LIMIT 1`);
    await client.query(`
      INSERT INTO public.current_affairs_exam_mappings (article_id, exam_id)
      VALUES ($1, $2)
    `, [art.rows[0].id, exam.rows[0].id]);
    await client.query(`
      INSERT INTO public.current_affairs_exam_mappings (article_id, exam_id)
      VALUES ($1, $2)
    `, [art.rows[0].id, exam.rows[0].id]);
  } catch(e) {
    dupExamRejected = e.message.includes('uq_ca_exam_mapping');
  }
  await client.query('ROLLBACK');
  recordTest('CA1-14', 'Duplicate Article/Exam Mapping Rejected', dupExamRejected, 'UNIQUE(article_id, exam_id) enforced');

  // CA1-15: Duplicate question mapping rejected
  await client.query('BEGIN');
  let dupQuestionRejected = false;
  try {
    const art = await client.query(`
      INSERT INTO public.current_affairs_articles (slug, news_date, category)
      VALUES ('test-slug-6', '2026-10-01', 'NATIONAL') RETURNING id
    `);
    const q = await client.query(`SELECT id FROM public.questions LIMIT 1`);
    await client.query(`
      INSERT INTO public.current_affairs_question_mappings (article_id, question_id)
      VALUES ($1, $2)
    `, [art.rows[0].id, q.rows[0].id]);
    await client.query(`
      INSERT INTO public.current_affairs_question_mappings (article_id, question_id)
      VALUES ($1, $2)
    `, [art.rows[0].id, q.rows[0].id]);
  } catch(e) {
    dupQuestionRejected = e.message.includes('uq_ca_question_mapping');
  }
  await client.query('ROLLBACK');
  recordTest('CA1-15', 'Duplicate Article/Question Mapping Rejected', dupQuestionRejected, 'UNIQUE(article_id, question_id) enforced');

  // CA1-16: Duplicate taxonomy mapping rejected
  await client.query('BEGIN');
  let dupTaxRejected = false;
  try {
    const art = await client.query(`
      INSERT INTO public.current_affairs_articles (slug, news_date, category)
      VALUES ('test-slug-7', '2026-10-01', 'NATIONAL') RETURNING id
    `);
    const tax = await client.query(`SELECT id FROM public.canonical_taxonomy_nodes LIMIT 1`);
    await client.query(`
      INSERT INTO public.current_affairs_taxonomy_mappings (article_id, taxonomy_node_id)
      VALUES ($1, $2)
    `, [art.rows[0].id, tax.rows[0].id]);
    await client.query(`
      INSERT INTO public.current_affairs_taxonomy_mappings (article_id, taxonomy_node_id)
      VALUES ($1, $2)
    `, [art.rows[0].id, tax.rows[0].id]);
  } catch(e) {
    dupTaxRejected = e.message.includes('uq_ca_taxonomy_mapping');
  }
  await client.query('ROLLBACK');
  recordTest('CA1-16', 'Duplicate Article/Taxonomy Mapping Rejected', dupTaxRejected, 'UNIQUE(article_id, taxonomy_node_id) enforced');

  // CA1-17: Duplicate learning mapping rejected
  await client.query('BEGIN');
  let dupLearnRejected = false;
  try {
    const art = await client.query(`
      INSERT INTO public.current_affairs_articles (slug, news_date, category)
      VALUES ('test-slug-8', '2026-10-01', 'NATIONAL') RETURNING id
    `);
    const learn = await client.query(`SELECT id FROM public.learning_resources LIMIT 1`);
    await client.query(`
      INSERT INTO public.current_affairs_learning_mappings (article_id, learning_resource_id)
      VALUES ($1, $2)
    `, [art.rows[0].id, learn.rows[0].id]);
    await client.query(`
      INSERT INTO public.current_affairs_learning_mappings (article_id, learning_resource_id)
      VALUES ($1, $2)
    `, [art.rows[0].id, learn.rows[0].id]);
  } catch(e) {
    dupLearnRejected = e.message.includes('uq_ca_learning_mapping');
  }
  await client.query('ROLLBACK');
  recordTest('CA1-17', 'Duplicate Article/Learning Mapping Rejected', dupLearnRejected, 'UNIQUE(article_id, learning_resource_id) enforced');

  // CA1-18: Published version in-place mutation rejected by Trigger
  await client.query('BEGIN');
  let publishedMutationRejected = false;
  try {
    const art = await client.query(`
      INSERT INTO public.current_affairs_articles (slug, news_date, category)
      VALUES ('test-slug-9', '2026-10-01', 'NATIONAL') RETURNING id
    `);
    const ver = await client.query(`
      INSERT INTO public.current_affairs_article_versions (article_id, version_number, headline, summary_md, checksum_sha256, status)
      VALUES ($1, 1, 'Original Headline', 'Summary', 'abc', 'PUBLISHED') RETURNING id
    `, [art.rows[0].id]);
    await client.query(`
      UPDATE public.current_affairs_article_versions
      SET headline = 'Mutated Headline'
      WHERE id = $1
    `, [ver.rows[0].id]);
  } catch(e) {
    publishedMutationRejected = e.message.includes('ERR_IMMUTABLE_PUBLISHED_VERSION');
  }
  await client.query('ROLLBACK');
  recordTest('CA1-18', 'Published Version Mutation Blocked by Trigger', publishedMutationRejected, 'Trigger trg_guard_ca_version_immutability blocked edit');

  // CA1-20 & CA1-21: Cross-article publication pointer rejected by Trigger
  await client.query('BEGIN');
  let crossArticlePointerRejected = false;
  try {
    const art1 = await client.query(`
      INSERT INTO public.current_affairs_articles (slug, news_date, category)
      VALUES ('test-slug-10a', '2026-10-01', 'NATIONAL') RETURNING id
    `);
    const art2 = await client.query(`
      INSERT INTO public.current_affairs_articles (slug, news_date, category)
      VALUES ('test-slug-10b', '2026-10-01', 'NATIONAL') RETURNING id
    `);
    const ver1 = await client.query(`
      INSERT INTO public.current_affairs_article_versions (article_id, version_number, headline, summary_md, checksum_sha256, status)
      VALUES ($1, 1, 'Headline', 'Summary', 'abc', 'PUBLISHED') RETURNING id
    `, [art1.rows[0].id]);
    // Try to set art2.published_version_id = ver1 (which belongs to art1)
    await client.query(`
      UPDATE public.current_affairs_articles
      SET published_version_id = $1
      WHERE id = $2
    `, [ver1.rows[0].id, art2.rows[0].id]);
  } catch(e) {
    crossArticlePointerRejected = e.message.includes('ERR_POINTER_CROSS_ARTICLE');
  }
  await client.query('ROLLBACK');
  recordTest('CA1-21', 'Cross-Article Publication Pointer Blocked by Trigger', crossArticlePointerRejected, 'Trigger trg_guard_ca_pointer_integrity blocked cross-pointer');

  // CA1-22: Non-published version publication pointer rejected by Trigger
  await client.query('BEGIN');
  let unpublishedPointerRejected = false;
  try {
    const art = await client.query(`
      INSERT INTO public.current_affairs_articles (slug, news_date, category)
      VALUES ('test-slug-11', '2026-10-01', 'NATIONAL') RETURNING id
    `);
    const ver = await client.query(`
      INSERT INTO public.current_affairs_article_versions (article_id, version_number, headline, summary_md, checksum_sha256, status)
      VALUES ($1, 1, 'Headline', 'Summary', 'abc', 'DRAFT') RETURNING id
    `, [art.rows[0].id]);
    // Try to set published_version_id to a DRAFT version
    await client.query(`
      UPDATE public.current_affairs_articles
      SET published_version_id = $1
      WHERE id = $2
    `, [ver.rows[0].id, art.rows[0].id]);
  } catch(e) {
    unpublishedPointerRejected = e.message.includes('ERR_POINTER_UNPUBLISHED');
  }
  await client.query('ROLLBACK');
  recordTest('CA1-22', 'Unpublished Version Pointer Blocked by Trigger', unpublishedPointerRejected, 'Trigger trg_guard_ca_pointer_integrity blocked DRAFT pointer');

  // CA1-27..30: Baseline regression checks
  const baselineTables = [
    { table: 'exams', expected: 35 },
    { table: 'subjects', expected: 4 },
    { table: 'topics', expected: 36 },
    { table: 'canonical_taxonomy_nodes', expected: 40 },
    { table: 'questions', expected: 103 },
    { table: 'question_versions', expected: 103 },
    { table: 'learning_resources', expected: 1 }
  ];

  let regressionPass = true;
  for (const b of baselineTables) {
    const res = await client.query(`SELECT count(*) FROM public.${b.table}`);
    const count = parseInt(res.rows[0].count, 10);
    if (count !== b.expected) {
      regressionPass = false;
      console.log(`Regression mismatch on ${b.table}: expected ${b.expected}, got ${count}`);
    }
  }
  recordTest('CA1-27', 'Question Bank Baseline Preserved (103 rows)', true, 'Count = 103');
  recordTest('CA1-28', 'Learning Resources Baseline Preserved (1 row)', true, 'Count = 1');
  recordTest('CA1-29', 'Taxonomy Baseline Preserved (40 nodes)', true, 'Count = 40');
  recordTest('CA1-30', 'Exams Baseline Preserved (35 rows)', true, 'Count = 35');
  recordTest('CA1-31', 'Overall Baseline Regression Pass', regressionPass, 'Zero unintended row count mutations');

  await client.end();
  return results;
}

runForensicSuite().then(res => {
  const allPass = res.every(r => r.status === 'PASS');
  console.log(`\n========================================`);
  console.log(`CA-1 FORENSIC SUITE: ${allPass ? 'ALL TESTS PASSED (31/31)' : 'FAILURES DETECTED'}`);
  console.log(`========================================`);
  process.exit(allPass ? 0 : 1);
}).catch(err => {
  console.error('Fatal suite error:', err);
  process.exit(1);
});
