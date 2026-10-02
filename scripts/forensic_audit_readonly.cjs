/**
 * COURAGE LIBRARY — FINAL FORENSIC VERIFICATION AUDIT SCRIPT
 * READ-ONLY INSPECTION ONLY. ZERO MUTATIONS.
 */

const fs = require('fs');
const path = require('path');
const dns = require('dns');
const { Client } = require('pg');

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

// 1. Safely load connection from .env.local without exposing credentials
let connectionString = null;
const envPath = path.resolve(__dirname, '..', '.env.local');
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

async function runForensicAudit() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  console.log('=== FORENSIC DATABASE CONNECTION ESTABLISHED (READ-ONLY) ===\n');

  // 1. Table Counts Audit
  const tables = [
    'users',
    'exams',
    'exam_post_categories',
    'exam_posts',
    'questions',
    'question_versions',
    'options',
    'mock_tests',
    'test_attempts',
    'test_attempt_responses',
    'user_mistake_vault',
    'user_mistake_history',
    'canonical_taxonomy_nodes',
    'syllabus_reconciliation_queue',
    'current_affairs_articles',
    'current_affairs_article_versions',
    'current_affairs_sources',
    'current_affairs_taxonomy_mappings',
    'current_affairs_exam_mappings',
    'current_affairs_question_mappings',
    'current_affairs_learning_mappings',
  ];

  console.log('--- SECTION 2: PRODUCTION DATABASE BASELINE COUNTS ---');
  const coreTables = [
    'exams',
    'exam_cycles',
    'exam_doc_versions',
    'exam_knowledge_documents',
    'exam_patterns',
    'pattern_sections',
    'questions',
    'question_versions',
    'question_options',
    'question_answers',
    'mock_tests',
    'mock_templates',
    'mock_questions',
    'mock_sections',
    'test_attempts',
    'test_results',
    'section_results',
    'user_mistake_vault',
    'user_mistake_occurrences',
    'canonical_taxonomy_nodes',
    'topics',
    'exam_topics',
    'subjects',
    'current_affairs_articles',
    'current_affairs_article_versions',
    'current_affairs_sources',
    'current_affairs_taxonomy_mappings',
    'current_affairs_exam_mappings',
    'current_affairs_question_mappings',
    'current_affairs_learning_mappings',
  ];

  const tableCounts = {};
  for (const table of coreTables) {
    try {
      const res = await client.query(`SELECT count(*)::int as cnt FROM public."${table}"`);
      tableCounts[table] = res.rows[0].cnt;
      console.log(`  Table: public.${table.padEnd(38)} Count: ${res.rows[0].cnt}`);
    } catch (e) {
      console.log(`  Table: public.${table.padEnd(38)} Error: ${e.message}`);
    }
  }

  try {
    const authUsersRes = await client.query(`SELECT count(*)::int as cnt FROM auth.users`);
    console.log(`  Table: auth.users                            Count: ${authUsersRes.rows[0].cnt}`);
  } catch (e) {
    console.log(`  Table: auth.users                            Error: ${e.message}`);
  }

  // 2. Current Affairs Detailed Inventory
  console.log('\n--- SECTION 3: CURRENT AFFAIRS FORENSIC INVENTORY ---');
  const caArticles = await client.query(`
    SELECT 
      id,
      slug,
      news_date,
      category,
      importance_tier,
      status,
      published_version_id,
      published_at,
      created_at,
      updated_at
    FROM public.current_affairs_articles
    ORDER BY created_at DESC
  `);
  console.log(`  Total CA Master Articles in DB: ${caArticles.rows.length}`);

  const statusCounts = {};
  for (const row of caArticles.rows) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
  }
  console.log('  Status Distribution:', JSON.stringify(statusCounts));

  const versions = await client.query(`
    SELECT 
      id,
      article_id,
      version_number,
      status,
      headline,
      checksum_sha256,
      published_at,
      created_at
    FROM public.current_affairs_article_versions
    ORDER BY created_at DESC
  `);
  console.log(`  Total CA Versions in DB: ${versions.rows.length}`);

  const sources = await client.query(`
    SELECT 
      id,
      version_id,
      publisher,
      url,
      tier,
      citation_context,
      created_at
    FROM public.current_affairs_sources
    ORDER BY created_at DESC
  `);
  console.log(`  Total CA Sources in DB: ${sources.rows.length}`);

  const taxMappings = await client.query(`
    SELECT 
      id,
      article_id,
      taxonomy_node_id,
      is_primary,
      relevance_score
    FROM public.current_affairs_taxonomy_mappings
  `);
  console.log(`  Total CA Taxonomy Mappings in DB: ${taxMappings.rows.length}`);

  const examMappings = await client.query(`
    SELECT 
      id,
      article_id,
      exam_id,
      relevance_weight,
      is_high_yield
    FROM public.current_affairs_exam_mappings
  `);
  console.log(`  Total CA Exam Mappings in DB: ${examMappings.rows.length}`);

  // Print all CA Articles with metadata (redacting any private fields)
  console.log('\n--- DETAILED CA ARTICLE LISTING ---');
  for (const art of caArticles.rows) {
    const vers = versions.rows.filter((v) => v.article_id === art.id);
    const srcs = sources.rows.filter((s) => vers.some((v) => v.id === s.version_id));
    const taxes = taxMappings.rows.filter((t) => t.article_id === art.id);
    const exs = examMappings.rows.filter((e) => e.article_id === art.id);
    console.log(`  [ID: ${art.id}] Headline: "${vers[0]?.headline || 'N/A'}"`);
    console.log(`     NewsDate: ${art.news_date.toISOString().slice(0, 10)} | Category: ${art.category} | Status: ${art.status} | PubVer: ${art.published_version_id || 'NULL'} | PubAt: ${art.published_at || 'NULL'}`);
    console.log(`     Versions: ${vers.length} | Sources: ${srcs.length} (${srcs.map((s) => s.publisher).join(', ')}) | Taxonomy: ${taxes.length} | Exams: ${exs.length}`);
    console.log(`     Checksum: ${vers[0]?.checksum_sha256 || 'N/A'}`);
    console.log(`     URL: ${srcs[0]?.url || 'N/A'}\n`);
  }

  // 3. Check for Orphan Records / Foreign Key Mismatches
  console.log('--- SECTION 7: RELATIONAL INTEGRITY & ORPHAN AUDIT ---');
  const orphanVersions = await client.query(`
    SELECT count(*)::int as cnt FROM public.current_affairs_article_versions v
    LEFT JOIN public.current_affairs_articles a ON v.article_id = a.id
    WHERE a.id IS NULL
  `);
  console.log(`  Orphan Versions (no matching article): ${orphanVersions.rows[0].cnt}`);

  const orphanSources = await client.query(`
    SELECT count(*)::int as cnt FROM public.current_affairs_sources s
    LEFT JOIN public.current_affairs_article_versions v ON s.version_id = v.id
    WHERE v.id IS NULL
  `);
  console.log(`  Orphan Sources (no matching version): ${orphanSources.rows[0].cnt}`);

  const orphanTaxonomy = await client.query(`
    SELECT count(*)::int as cnt FROM public.current_affairs_taxonomy_mappings t
    LEFT JOIN public.current_affairs_articles a ON t.article_id = a.id
    WHERE a.id IS NULL
  `);
  console.log(`  Orphan Taxonomy Mappings (no matching article): ${orphanTaxonomy.rows[0].cnt}`);

  const invalidTaxNodes = await client.query(`
    SELECT count(*)::int as cnt FROM public.current_affairs_taxonomy_mappings t
    LEFT JOIN public.canonical_taxonomy_nodes c ON t.taxonomy_node_id = c.id
    WHERE c.id IS NULL
  `);
  console.log(`  Invalid Taxonomy Nodes (no matching canonical node): ${invalidTaxNodes.rows[0].cnt}`);

  const orphanExams = await client.query(`
    SELECT count(*)::int as cnt FROM public.current_affairs_exam_mappings e
    LEFT JOIN public.current_affairs_articles a ON e.article_id = a.id
    WHERE a.id IS NULL
  `);
  console.log(`  Orphan Exam Mappings (no matching article): ${orphanExams.rows[0].cnt}`);

  const invalidExams = await client.query(`
    SELECT count(*)::int as cnt FROM public.current_affairs_exam_mappings e
    LEFT JOIN public.exams x ON e.exam_id = x.id
    WHERE x.id IS NULL
  `);
  console.log(`  Invalid Exams (no matching exam in exams table): ${invalidExams.rows[0].cnt}`);

  // 4. Check for Published vs Draft Isolation
  console.log('\n--- SECTION 9 & 10: PUBLIC CANDIDATE VISIBILITY & DRAFT ISOLATION ---');
  const publishedArticles = await client.query(`
    SELECT id, slug, status, published_version_id, published_at FROM public.current_affairs_articles
    WHERE status = 'PUBLISHED'
  `);
  console.log(`  Officially Published Articles Count: ${publishedArticles.rows.length}`);

  const draftWithPublishedPointers = await client.query(`
    SELECT count(*)::int as cnt FROM public.current_affairs_articles
    WHERE status != 'PUBLISHED' AND (published_version_id IS NOT NULL OR published_at IS NOT NULL)
  `);
  console.log(`  DRAFT Articles with Published Pointers: ${draftWithPublishedPointers.rows[0].cnt}`);

  // 5. Duplicates & Hash Collisions
  console.log('\n--- SECTION 8: DUPLICATE & SHA-256 INTEGRITY AUDIT ---');
  const duplicateChecksums = await client.query(`
    SELECT checksum_sha256, count(*) as cnt FROM public.current_affairs_article_versions
    GROUP BY checksum_sha256
    HAVING count(*) > 1
  `);
  console.log(`  Duplicate SHA-256 Checksum Collisions: ${duplicateChecksums.rows.length}`);

  const duplicateSlugs = await client.query(`
    SELECT slug, count(*) as cnt FROM public.current_affairs_articles
    GROUP BY slug
    HAVING count(*) > 1
  `);
  console.log(`  Duplicate Slug Collisions: ${duplicateSlugs.rows.length}`);

  await client.end();
  console.log('\n=== AUDIT COMPLETE (READ-ONLY) ===');
}

runForensicAudit().catch(console.error);
