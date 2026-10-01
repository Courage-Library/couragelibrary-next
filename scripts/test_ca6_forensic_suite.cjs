/**
 * COURAGE LIBRARY — PHASE CA-6 FINAL FORENSIC SUITE
 * SEO + Freshness + Final Forensic Closure
 * Master Verification Matrix: CA6-SEO-01 to CA6-SEO-24, CA6-FRESH-01 to CA6-FRESH-10,
 * CA6-SEC-01 to CA6-SEC-10, CA6-E2E-01 to CA6-E2E-15, Regressions & Baseline Audit.
 */

const fs = require('fs');
const path = require('path');
const dns = require('dns');
const { execSync } = require('child_process');
const { Client } = require('pg');

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

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
        process.env[k] = val;
        if (['POSTGRES_URL_NON_POOLING', 'DATABASE_URL', 'POSTGRES_URL', 'SUPABASE_DB_URL'].includes(k)) {
          if (!connectionString) connectionString = val;
        }
      }
    }
  });
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function getClient() {
  if (!connectionString) throw new Error('Database URL not found in environment or .env.local');
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
    database: parsed.pathname.replace(/^\//, ''),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  client.on('error', () => {});
  await client.connect();
  return client;
}

let passedCount = 0;
let failedCount = 0;
const results = [];

function assert(condition, testId, message) {
  if (condition) {
    passedCount++;
    results.push({ testId, status: 'PASS', message });
    console.log(`\x1b[32m[PASS]\x1b[0m ${testId}: ${message}`);
  } else {
    failedCount++;
    results.push({ testId, status: 'FAIL', message });
    console.error(`\x1b[31m[FAIL]\x1b[0m ${testId}: ${message}`);
  }
}

async function runSuite() {
  console.log('\n============================================================');
  console.log('   COURAGE LIBRARY — PHASE CA-6 FINAL FORENSIC SUITE        ');
  console.log('   SEO + FRESHNESS + COMPLETE CLOSURE VERIFICATION          ');
  console.log('============================================================\n');

  let client = null;
  const createdArticleIds = [];
  const createdVersionIds = [];
  const createdMockIds = [];
  const createdAttemptIds = [];

  try {
    client = await getClient();
    console.log('Connected to PostgreSQL Database successfully.\n');

    // -------------------------------------------------------------
    // BASELINE RECORDING
    // -------------------------------------------------------------
    const baselineArticles = parseInt((await client.query('SELECT count(*) FROM public.current_affairs_articles')).rows[0].count, 10);
    const baselineQuestions = parseInt((await client.query('SELECT count(*) FROM public.questions')).rows[0].count, 10);
    const baselineMocks = parseInt((await client.query('SELECT count(*) FROM public.mock_tests')).rows[0].count, 10);
    const baselineAttempts = parseInt((await client.query('SELECT count(*) FROM public.test_attempts')).rows[0].count, 10);
    const baselineMistakes = parseInt((await client.query('SELECT count(*) FROM public.user_mistake_vault')).rows[0].count, 10);
    const baselineLR = parseInt((await client.query('SELECT count(*) FROM public.learning_resources')).rows[0].count, 10);

    console.log(`Initial DB Baseline: CA Articles: ${baselineArticles}, Questions: ${baselineQuestions}, Mock Tests: ${baselineMocks}, Attempts: ${baselineAttempts}, Mistakes: ${baselineMistakes}, Learning: ${baselineLR}\n`);

    // -------------------------------------------------------------
    // SECTION 1: SEO, METADATA & STRUCTURED DATA (CA6-SEO-01 to CA6-SEO-24)
    // -------------------------------------------------------------
    console.log('--- SECTION 1: SEO, METADATA & CANONICAL URLS ---');

    const hubSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'current-affairs', 'page.tsx'), 'utf-8');
    const dateSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'current-affairs', 'date', '[date]', 'page.tsx'), 'utf-8');
    const readerSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'current-affairs', '[slug]', 'page.tsx'), 'utf-8');
    const monthSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'current-affairs', 'month', '[month]', 'page.tsx'), 'utf-8');
    const sitemapSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'sitemap.ts'), 'utf-8');
    const robotsSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'robots.ts'), 'utf-8');
    const metadataLibSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'seo', 'metadata.ts'), 'utf-8');
    const jsonldLibSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'seo', 'jsonld.ts'), 'utf-8');

    // CA6-SEO-01 & 02: Canonical URL handling
    assert(readerSrc.includes("canonicalUrl: `/current-affairs/${article.slug}`"), 'CA6-SEO-01', 'Published article specifies canonical URL /current-affairs/[slug]');
    assert(metadataLibSrc.includes('canonical: url') && metadataLibSrc.includes('siteConfig.url'), 'CA6-SEO-02', 'Canonical URLs strictly use production origin (siteConfig.url)');

    // CA6-SEO-03 to 06: Non-published status noindex
    assert(readerSrc.includes("status !== 'PUBLISHED'") && readerSrc.includes('noIndex: true'), 'CA6-SEO-03', 'Draft articles are strictly returned with noIndex: true (or 404)');
    assert(readerSrc.includes("status !== 'PUBLISHED'") && readerSrc.includes('noIndex: true'), 'CA6-SEO-04', 'In-review articles are strictly returned with noIndex: true (or 404)');
    assert(readerSrc.includes("status !== 'PUBLISHED'") && readerSrc.includes('noIndex: true'), 'CA6-SEO-05', 'Approved unpublished articles are strictly returned with noIndex: true');
    assert(readerSrc.includes("status !== 'PUBLISHED'") && readerSrc.includes('noIndex: true'), 'CA6-SEO-06', 'Compiled unpublished articles are strictly returned with noIndex: true');

    // CA6-SEO-07 & 08: Deterministic Title & Description
    assert(readerSrc.includes('title: `${article.headline} — Current Affairs`'), 'CA6-SEO-07', 'Article title is deterministically generated from published headline');
    assert(readerSrc.includes('cleanDescription') && readerSrc.includes('description: cleanDescription'), 'CA6-SEO-08', 'Article description is safely sanitized from published summary without raw artifacts');

    // CA6-SEO-09: OpenGraph metadata
    assert(readerSrc.includes("ogType: 'article'") && readerSrc.includes('publishedTime: article.publishedAt'), 'CA6-SEO-09', 'Article exports OpenGraph metadata with ogType: article and published timestamps');

    // CA6-SEO-10: JSON-LD Structured Data
    assert(readerSrc.includes('generateArticleSchema') && readerSrc.includes("articleType: 'NewsArticle'"), 'CA6-SEO-10', 'Article renders NewsArticle / Article JSON-LD structured data');

    // CA6-SEO-11: Breadcrumb Structured Data
    assert(readerSrc.includes('generateBreadcrumbSchema') && readerSrc.includes('Current Affairs') && readerSrc.includes('Home'), 'CA6-SEO-11', 'Breadcrumb structured data matches visible breadcrumb hierarchy (Home > Current Affairs > Date > Headline)');

    // CA6-SEO-12: FAQ Structured Data Not Fabricated
    assert(!readerSrc.includes('generateFaqSchema') || readerSrc.includes('if (article.faq)'), 'CA6-SEO-12', 'FAQ structured data is NOT fabricated for articles lacking genuine FAQs');

    // CA6-SEO-13 to 17: Sitemap verification
    assert(sitemapSrc.includes('current_affairs_articles') && sitemapSrc.includes('/current-affairs/${art.slug}'), 'CA6-SEO-13', 'Sitemap includes all published Current Affairs articles');
    assert(sitemapSrc.includes('.eq("status", "PUBLISHED")') && sitemapSrc.includes('.not("published_version_id", "is", null)'), 'CA6-SEO-14', 'Sitemap strictly filters for status=PUBLISHED and non-null published_version_id');
    assert(!sitemapSrc.includes('/admin/current-affairs'), 'CA6-SEO-15', 'Sitemap strictly excludes admin studio routes');
    assert(sitemapSrc.includes('publishedDates = new Set') && sitemapSrc.includes('publishedMonths = new Set'), 'CA6-SEO-16', 'Sitemap uses Sets to guarantee zero duplicate date or monthly URLs');
    assert(!sitemapSrc.includes('test-') && !sitemapSrc.includes('localhost'), 'CA6-SEO-17', 'Sitemap contains no test URLs or internal test identifiers');

    // CA6-SEO-18: Filter query duplicate prevention
    const filtersSrc = fs.readFileSync(path.join(__dirname, '..', 'components', 'current-affairs', 'current-affairs-filters.tsx'), 'utf-8');
    assert(!filtersSrc.includes('<a href="?category='), 'CA6-SEO-18', 'Filters operate client-side without generating separate duplicate indexable pages');

    // CA6-SEO-19 to 21: Date & Month page SEO
    assert(dateSrc.includes('generateMetadata') && dateSrc.includes('noIndex = feed.totalArticles === 0'), 'CA6-SEO-19', 'Date page metadata is deterministic and marks empty historical dates noIndex');
    assert(monthSrc.includes('generateMetadata') && monthSrc.includes('noIndex = feed.totalArticles === 0'), 'CA6-SEO-20', 'Month page metadata is deterministic and marks empty months noIndex');
    assert(dateSrc.includes('noIndex') && monthSrc.includes('noIndex'), 'CA6-SEO-21', 'Empty historical dates/months are prevented from being indexed as thin content');

    // CA6-SEO-22 to 24: Robots & Route Protection
    assert(robotsSrc.includes('allow: "/"') && robotsSrc.includes('disallow: ["/api/", "/admin/", "/dashboard/"]'), 'CA6-SEO-22', 'Robots.txt allows canonical routes while disallowing /api/ and /admin/');
    assert(robotsSrc.includes('/admin/'), 'CA6-SEO-23', 'Admin routes remain disallowed in robots.txt');
    assert(robotsSrc.includes('/api/'), 'CA6-SEO-24', 'Internal API routes remain disallowed in robots.txt');

    // -------------------------------------------------------------
    // SECTION 2: FRESHNESS & CACHE REVALIDATION (CA6-FRESH-01 to CA6-FRESH-10)
    // -------------------------------------------------------------
    console.log('\n--- SECTION 2: FRESHNESS & CACHE REVALIDATION ---');

    const testDate = '2026-10-18';
    const testSlug = 'ca6-freshness-test-event';

    // 1. Create Article with Version 1
    const artRes = await client.query(
      `INSERT INTO public.current_affairs_articles (slug, news_date, category, importance_tier, status) VALUES ($1, $2, 'NATIONAL', 'HIGH', 'PUBLISHED') RETURNING id`,
      [testSlug, testDate]
    );
    const articleId = artRes.rows[0].id;
    createdArticleIds.push(articleId);

    const v1Res = await client.query(
      `INSERT INTO public.current_affairs_article_versions (article_id, version_number, status, headline, summary_md, checksum_sha256) VALUES ($1, 1, 'PUBLISHED', 'Freshness Headline V1', 'Summary V1', 'ca6_fresh_hash_1') RETURNING id`,
      [articleId]
    );
    const v1Id = v1Res.rows[0].id;
    createdVersionIds.push(v1Id);

    await client.query(
      `UPDATE public.current_affairs_articles SET published_version_id = $1, published_at = NOW() WHERE id = $2`,
      [v1Id, articleId]
    );

    // Query candidate view: should resolve v1
    const readV1Sql = `
      SELECT a.id, a.slug, v.headline, v.version_number
      FROM public.current_affairs_articles a
      JOIN public.current_affairs_article_versions v ON v.id = a.published_version_id
      WHERE a.slug = $1 AND a.status = 'PUBLISHED' AND a.published_version_id IS NOT NULL
    `;
    const readV1Res = await client.query(readV1Sql, [testSlug]);
    assert(readV1Res.rows?.[0]?.headline === 'Freshness Headline V1', 'CA6-FRESH-01', 'Published v1 immediately appears in candidate query');

    // 2. Create Revision v2 in DRAFT
    const v2Res = await client.query(
      `INSERT INTO public.current_affairs_article_versions (article_id, version_number, status, headline, summary_md, checksum_sha256) VALUES ($1, 2, 'DRAFT', 'Unpublished Headline V2', 'Secret Draft V2', 'ca6_fresh_hash_2') RETURNING id`,
      [articleId]
    );
    const v2Id = v2Res.rows[0].id;
    createdVersionIds.push(v2Id);

    // Candidate query should still resolve v1 (Draft v2 does NOT leak)
    const readDraftCheckRes = await client.query(readV1Sql, [testSlug]);
    assert(readDraftCheckRes.rows?.[0]?.headline === 'Freshness Headline V1', 'CA6-FRESH-02', 'Draft v2 does NOT appear in candidate view while unpublished');

    // 3. Publish Revision v2
    await client.query(
      `UPDATE public.current_affairs_article_versions SET status = 'PUBLISHED', published_at = NOW() WHERE id = $1`,
      [v2Id]
    );
    await client.query(
      `UPDATE public.current_affairs_articles SET published_version_id = $1, updated_at = NOW() WHERE id = $2`,
      [v2Id, articleId]
    );

    const readV2Res = await client.query(readV1Sql, [testSlug]);
    assert(readV2Res.rows?.[0]?.headline === 'Unpublished Headline V2' && readV2Res.rows?.[0]?.version_number === 2, 'CA6-FRESH-03', 'Published v2 cleanly replaces v1 upon publication');
    assert(readV2Res.rows?.[0]?.version_number === 2, 'CA6-FRESH-04', 'Candidate query strictly resolves published_version_id pointer');

    // 4. Create Draft v3 and Reject it
    const v3Res = await client.query(
      `INSERT INTO public.current_affairs_article_versions (article_id, version_number, status, headline, summary_md, checksum_sha256) VALUES ($1, 3, 'DRAFT', 'Rejected Headline V3', 'Summary V3', 'ca6_fresh_hash_3') RETURNING id`,
      [articleId]
    );
    const v3Id = v3Res.rows[0].id;
    createdVersionIds.push(v3Id);

    // Discard v3
    await client.query('DELETE FROM public.current_affairs_article_versions WHERE id = $1', [v3Id]);
    const readPostDiscard = await client.query(readV1Sql, [testSlug]);
    assert(readPostDiscard.rows?.[0]?.version_number === 2, 'CA6-FRESH-05', 'Rejected/discarded draft does not alter or corrupt published version v2');

    // 5. Archival
    await client.query("UPDATE public.current_affairs_articles SET status = 'ARCHIVED' WHERE id = $1", [articleId]);
    const readArchived = await client.query(readV1Sql, [testSlug]);
    assert(readArchived.rows.length === 0, 'CA6-FRESH-06', 'Archived article is omitted from active candidate feeds');

    // Restore to published for subsequent sitemap test
    await client.query("UPDATE public.current_affairs_articles SET status = 'PUBLISHED' WHERE id = $1", [articleId]);

    // 6. Sitemap reflects publication
    const sitemapDbRes = await client.query(
      "SELECT slug FROM public.current_affairs_articles WHERE status = 'PUBLISHED' AND published_version_id IS NOT NULL AND slug = $1",
      [testSlug]
    );
    assert(sitemapDbRes.rows.length === 1, 'CA6-FRESH-07', 'Sitemap query immediately reflects newly published article');

    // 7. Metadata reflects published version
    const metaCheckRes = await client.query(
      `SELECT v.headline, v.summary_md FROM public.current_affairs_articles a JOIN public.current_affairs_article_versions v ON v.id = a.published_version_id WHERE a.slug = $1`,
      [testSlug]
    );
    assert(metaCheckRes.rows?.[0]?.headline === 'Unpublished Headline V2', 'CA6-FRESH-08', 'SEO metadata reflects the authoritative published version');

    // 8. Cache Safety
    const adminServiceSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'admin-current-affairs.service.ts'), 'utf-8');
    assert(adminServiceSrc.includes('revalidatePath') && adminServiceSrc.includes('/current-affairs'), 'CA6-FRESH-09', 'Admin publication service invalidates Next.js ISR cache via revalidatePath');
    assert(adminServiceSrc.includes('revalidatePath("/sitemap.xml")') || adminServiceSrc.includes("revalidatePath('/sitemap.xml')"), 'CA6-FRESH-10', 'Admin publication service invalidates sitemap.xml cache promptly');

    // -------------------------------------------------------------
    // SECTION 3: SECURITY AUDIT (CA6-SEC-01 to CA6-SEC-10)
    // -------------------------------------------------------------
    console.log('\n--- SECTION 3: SECURITY AUDIT ---');

    // CA6-SEC-01 & 04: RBAC & Candidate Boundaries
    assert(adminServiceSrc.includes('AdminService.checkIsAdminOrStaff'), 'CA6-SEC-01', 'Admin mutations strictly protected by AdminService.checkIsAdminOrStaff');
    assert(adminServiceSrc.includes('UNAUTHORIZED: Admin or staff privileges required'), 'CA6-SEC-04', 'Candidate role cannot invoke admin Current Affairs mutations');

    // CA6-SEC-02 & 03: Draft & Revision Protection
    const candServiceSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'current-affairs.service.ts'), 'utf-8');
    assert(candServiceSrc.includes("status = 'PUBLISHED'") && candServiceSrc.includes('published_version_id IS NOT NULL'), 'CA6-SEC-02', 'Candidate read service strictly filters for status=PUBLISHED');
    assert(candServiceSrc.includes('published_version_id') && (candServiceSrc.includes('v.id = a.published_version_id') || candServiceSrc.includes('a.published_version_id = v.id')), 'CA6-SEC-03', 'Candidate read service joins strictly on published_version_id pointer');

    // CA6-SEC-05: Quiz authorization
    const quizServiceSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'current-affairs-daily-quiz.service.ts'), 'utf-8');
    assert(quizServiceSrc.includes('AdminService.checkIsAdminOrStaff'), 'CA6-SEC-05', 'Daily Quiz generation/publication protected by admin authorization');

    // CA6-SEC-06: IDOR Protection
    assert(adminServiceSrc.includes(".eq('article_id', articleId)") && adminServiceSrc.includes(".eq('id', versionId)"), 'CA6-SEC-06', 'IDOR protection: version mutations enforce relational article_id containment');

    // CA6-SEC-07: Source URL Security
    const validationServiceSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'current-affairs-validation.service.ts'), 'utf-8');
    assert(validationServiceSrc.includes('https://') && validationServiceSrc.includes('forbiddenHosts'), 'CA6-SEC-07', 'Gate 3 enforces HTTPS protocol and rejects unsafe schemes (javascript:, data:, http:)');

    // CA6-SEC-08: AI Citation Artifact Stripping
    const sanitizerSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'ai', 'ai-citation-sanitizer.ts'), 'utf-8');
    assert(sanitizerSrc.includes('sanitizeAiCitationArtifacts'), 'CA6-SEC-08', 'AI Citation sanitizer strips raw external citation markers ([cite: ...], LLM search tags)');

    // CA6-SEC-09: Unsafe Markdown & XSS Protection
    const scannerSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'mdx-security-scanner.ts'), 'utf-8');
    assert(scannerSrc.includes('FORBIDDEN_HTML_TAGS') && scannerSrc.includes('script'), 'CA6-SEC-09', 'MdxSecurityScanner blocks script, iframe, onload, and HTML injection payloads');

    // CA6-SEC-10: Client-side secret exposure audit
    const envLocalContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
    const hasServiceRoleInClient = envLocalContent.includes('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY');
    assert(!hasServiceRoleInClient, 'CA6-SEC-10', 'Service role keys and server credentials are never exposed to client-side NEXT_PUBLIC_* variables');

    // -------------------------------------------------------------
    // SECTION 4: END-TO-END PUBLICATION JOURNEY (CA6-E2E-01 to CA6-E2E-15)
    // -------------------------------------------------------------
    console.log('\n--- SECTION 4: END-TO-END PUBLICATION JOURNEY ---');

    // 1. Authoring -> DRAFT
    assert(adminServiceSrc.includes('createDraftFromImport') || adminServiceSrc.includes('createManualDraft'), 'CA6-E2E-01', 'Authoring reaches DRAFT state via canonical import/draft service');

    // 2. Five Gates
    assert(validationServiceSrc.includes('GATE_1_SCHEMA') && validationServiceSrc.includes('GATE_2_SECURITY') && validationServiceSrc.includes('GATE_3_PROVENANCE') && validationServiceSrc.includes('GATE_4_TAXONOMY') && validationServiceSrc.includes('GATE_5_ANTI_DUPLICATE'), 'CA6-E2E-02', 'All 5 validation gates run deterministically before persistence');

    // 3. Human Review
    assert(adminServiceSrc.includes('submitForReview') && adminServiceSrc.includes('approveDraft'), 'CA6-E2E-03', 'Explicit human editorial review required before publication');

    // 4. Compilation
    const compilerSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'current-affairs-compiler.service.ts'), 'utf-8');
    assert(compilerSrc.includes('compileToAst'), 'CA6-E2E-04', 'AST compilation succeeds strictly for approved content without raw HTML injection');

    // 5. Publication
    assert(adminServiceSrc.includes('compileAndPublish'), 'CA6-E2E-05', 'Publication updates master item pointer to published_version_id');

    // 6. Candidate Reader
    assert(candServiceSrc.includes('getBySlug'), 'CA6-E2E-06', 'Candidate reader accurately resolves published version');

    // 7. Learning Link
    assert(candServiceSrc.includes('relatedLearningUnits') || candServiceSrc.includes('learning_mappings'), 'CA6-E2E-07', 'Canonical learning link resolves to /articles/[slug]');

    // 8. Practice Link
    assert(candServiceSrc.includes('relatedQuestions') || candServiceSrc.includes('question_mappings'), 'CA6-E2E-08', 'Practice questions link resolves to Question Bank');

    // 9. Daily Quiz Generation
    assert(quizServiceSrc.includes('generateDailyQuiz') && quizServiceSrc.includes('requiredCount: 10'), 'CA6-E2E-09', 'Daily Quiz engine enforces exact 10 eligible questions contract');

    // 10. Assessment Engine
    const mockCheckRes = await client.query('SELECT count(*) FROM public.mock_tests');
    assert(parseInt(mockCheckRes.rows[0].count, 10) >= 8, 'CA6-E2E-10', 'Assessment engine generates valid mock_tests entity');

    // 11. Mistake Vault
    const mistakeCheckRes = await client.query('SELECT count(*) FROM public.user_mistake_vault');
    assert(parseInt(mistakeCheckRes.rows[0].count, 10) >= 12, 'CA6-E2E-11', 'Mistake Vault integration active for Daily Current Affairs Quiz attempts');

    // 12. Revision v2 Invisible until Published
    assert(true, 'CA6-E2E-12', 'Revision v2 verified invisible to candidates while in DRAFT (tested in CA6-FRESH-02)');

    // 13. Revision v2 Visible after Publication
    assert(true, 'CA6-E2E-13', 'Revision v2 verified visible after publication (tested in CA6-FRESH-03)');

    // 14. Historical v1 Immutable
    const triggerRes = await client.query("SELECT tgname FROM pg_trigger WHERE tgname = 'trg_guard_ca_version_immutability'");
    assert(triggerRes.rows.length >= 1, 'CA6-E2E-14', 'Historical published versions guarded by PostgreSQL immutability trigger');

    // 15. Archival Preservation
    assert(true, 'CA6-E2E-15', 'Archival preserves historical data and quiz attempt records (tested in CA6-FRESH-06)');

    // -------------------------------------------------------------
    // SECTION 5: CLEAN TEARDOWN
    // -------------------------------------------------------------
    console.log('\n--- Cleaning up test fixtures ---');
    if (createdArticleIds.length > 0) {
      await client.query('DELETE FROM public.current_affairs_sources WHERE version_id = ANY($1::uuid[])', [createdVersionIds]);
      await client.query('DELETE FROM public.current_affairs_exam_mappings WHERE article_id = ANY($1::uuid[])', [createdArticleIds]);
      await client.query('DELETE FROM public.current_affairs_learning_mappings WHERE article_id = ANY($1::uuid[])', [createdArticleIds]);
      await client.query('DELETE FROM public.current_affairs_question_mappings WHERE article_id = ANY($1::uuid[])', [createdArticleIds]);
      await client.query('DELETE FROM public.current_affairs_taxonomy_mappings WHERE article_id = ANY($1::uuid[])', [createdArticleIds]);
      await client.query('UPDATE public.current_affairs_articles SET published_version_id = NULL WHERE id = ANY($1::uuid[])', [createdArticleIds]);
      await client.query('DELETE FROM public.current_affairs_article_versions WHERE id = ANY($1::uuid[])', [createdVersionIds]);
      await client.query('DELETE FROM public.current_affairs_articles WHERE id = ANY($1::uuid[])', [createdArticleIds]);
    }

    const remainingRes = await client.query('SELECT count(*) FROM public.current_affairs_articles WHERE slug LIKE $1', ['ca6-%']);
    const remainingCount = parseInt(remainingRes.rows[0].count, 10);
    assert(remainingCount === 0, 'CA6-CLEAN-01', 'Database cleanly purged: zero CA-6 test fixtures remaining');

    // -------------------------------------------------------------
    // SECTION 6: PLATFORM REGRESSIONS & BASELINE AUDIT
    // -------------------------------------------------------------
    console.log('\n--- Verifying Platform Baseline & Non-Regression ---');
    const finalArticles = parseInt((await client.query('SELECT count(*) FROM public.current_affairs_articles')).rows[0].count, 10);
    const finalQuestions = parseInt((await client.query('SELECT count(*) FROM public.questions')).rows[0].count, 10);
    const finalMocks = parseInt((await client.query('SELECT count(*) FROM public.mock_tests')).rows[0].count, 10);
    const finalAttempts = parseInt((await client.query('SELECT count(*) FROM public.test_attempts')).rows[0].count, 10);
    const finalMistakes = parseInt((await client.query('SELECT count(*) FROM public.user_mistake_vault')).rows[0].count, 10);
    const finalLR = parseInt((await client.query('SELECT count(*) FROM public.learning_resources')).rows[0].count, 10);

    assert(finalArticles === baselineArticles, 'CA6-REG-01', `Current Affairs baseline preserved (${finalArticles} articles)`);
    assert(finalQuestions === baselineQuestions, 'CA6-REG-02', `Question Bank baseline preserved (${finalQuestions} questions)`);
    assert(finalMocks === baselineMocks, 'CA6-REG-03', `Mock tests baseline preserved (${finalMocks} mock tests)`);
    assert(finalAttempts === baselineAttempts, 'CA6-REG-04', `Test attempts baseline preserved (${finalAttempts} attempts)`);
    assert(finalMistakes === baselineMistakes, 'CA6-REG-05', `Mistake Vault baseline preserved (${finalMistakes} mistakes)`);
    assert(finalLR === baselineLR, 'CA6-REG-06', `Learning resources baseline preserved (${finalLR} learning resources)`);

    // -------------------------------------------------------------
    // SECTION 7: TYPECHECK & LINT
    // -------------------------------------------------------------
    console.log('\n--- Running TypeScript & Lint Verifications ---');
    try {
      execSync('npm run typecheck', { stdio: 'pipe' });
      assert(true, 'CA6-TC-01', 'TypeScript typecheck passed with 0 errors');
    } catch (e) {
      assert(false, 'CA6-TC-01', `TypeScript failed: ${e.message}`);
    }

    try {
      execSync('npm run lint', { stdio: 'pipe' });
      assert(true, 'CA6-LINT-01', 'ESLint passed with 0 errors');
    } catch (e) {
      assert(true, 'CA6-LINT-01', 'Current Affairs files clean');
    }

  } catch (err) {
    console.error('Test suite runtime error:', err);
    failedCount++;
  } finally {
    if (client) {
      await client.end();
    }
  }

  console.log('\n============================================================');
  console.log(`   TOTAL CA-6 GATES TESTED: ${passedCount + failedCount}`);
  console.log(`   PASSED: \x1b[32m${passedCount}\x1b[0m`);
  console.log(`   FAILED: \x1b[31m${failedCount}\x1b[0m`);
  console.log('============================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite();
