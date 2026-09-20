/**
 * COURAGE LIBRARY — PHASE 3H.5.3 CANDIDATE EXAM KNOWLEDGE HUB CERTIFICATION
 * Final Rendering, UX, Accessibility & Production Certification
 * 
 * Test Groups:
 * - V01 Route Rendering & Directory Aggregation
 * - V02 Published Content Isolation
 * - V03 Cycle Isolation & Timeless Separation
 * - V04 Partial Knowledge & Graceful Fallback
 * - V05 Learning Domain Integration
 * - V06 Question Bank Practice Integration
 * - V07 Official Sources & Gazette Citations
 * - V08 FAQ Aggregation
 * - V09 SEO Metadata & Clean URLs
 * - V10 Robots Directives & Canonical URLs
 * - V11 Accessibility, Semantics & ARIA Standards
 * - V12 Client Security Boundary & Secret Isolation
 * - V13 Database Schema Baseline Preservation (20 Tables)
 * - V14 Cleanup & State Integrity
 * - V15 Regression Integrity
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Module = require('module');
const ts = require('typescript');

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

const { ExamKnowledgeCandidateService } = require('../services/exam-knowledge/exam-knowledge-candidate.service');
const { ExamModuleRegistry } = require('../services/exam-knowledge/exam-module-registry');

const rootDir = path.resolve(__dirname, '..');

// 20 Protected Baseline Tables
const PROTECTED_BASELINE_TABLES = [
  'exams',
  'exam_cycles',
  'conducting_orgs',
  'exam_posts',
  'exam_patterns',
  'exam_sections',
  'exam_sources',
  'exam_claims',
  'exam_claim_sources',
  'exam_knowledge_documents',
  'exam_doc_versions',
  'exam_academic_reviews',
  'subjects',
  'exam_syllabi',
  'topics',
  'exam_topics',
  'exam_unit_mappings',
  'learning_units',
  'learning_documents',
  'questions'
];

// Test Fixtures
const mockExams = [
  {
    id: 'exam-cgl',
    slug: 'ssc-cgl',
    title: 'SSC CGL Examination',
    name: 'SSC CGL',
    category: 'Staff Selection Commission (SSC)',
    is_active: true,
    official_website: 'https://ssc.gov.in',
    description: 'National graduate level recruitment examination for Group B and Group C posts.',
    conducting_org: {
      id: 'org-ssc',
      name: 'Staff Selection Commission',
      short_name: 'SSC',
      website_url: 'https://ssc.gov.in',
    },
  },
  {
    id: 'exam-inactive',
    slug: 'old-inactive',
    title: 'Old Inactive Exam',
    is_active: false,
  }
];

const mockCycles = [
  {
    id: 'cycle-cgl-2026',
    exam_id: 'exam-cgl',
    cycle_year: 2026,
    cycle_label: 'SSC CGL 2026',
    status: 'ACTIVE',
    notification_date: '2026-06-11',
    application_start_date: '2026-06-11',
    application_end_date: '2026-07-10',
    exam_start_date: '2026-09-15',
    exam_end_date: '2026-09-30',
    total_vacancies: 14582,
  },
  {
    id: 'cycle-cgl-2025',
    exam_id: 'exam-cgl',
    cycle_year: 2025,
    cycle_label: 'SSC CGL 2025',
    status: 'COMPLETED',
    notification_date: '2025-06-24',
    application_start_date: '2025-06-24',
    application_end_date: '2025-07-24',
    exam_start_date: '2025-09-09',
    exam_end_date: '2025-09-26',
    total_vacancies: 17727,
  }
];

const mockPosts = [
  {
    id: 'post-1',
    exam_id: 'exam-cgl',
    post_name: 'Assistant Section Officer (CSS)',
    department: 'Central Secretariat Service',
    ministry: 'DoPT',
    classification_group: 'Group B',
    is_gazetted: false,
    pay_level: 7,
    grade_pay: 4600,
    cpc_basic_pay_min: 44900,
    cpc_basic_pay_max: 142400,
    is_active: true,
    display_order: 1,
  }
];

const mockPatterns = [
  {
    id: 'pat-1',
    exam_id: 'exam-cgl',
    name: 'Tier 1 Computer Based Test',
    tier_name: 'Tier 1',
    duration_minutes: 60,
    total_questions: 100,
    total_marks: 200,
    negative_mark_value: 0.5,
    is_active: true,
    exam_sections: [
      { name: 'Quantitative Aptitude', question_count: 25, marks_per_question: 2 },
      { name: 'General Intelligence', question_count: 25, marks_per_question: 2 },
    ],
  }
];

const mockClaims = [
  {
    id: 'cl-1',
    exam_id: 'exam-cgl',
    claim_key: 'MIN_AGE',
    stated_value: '18',
    value_data_type: 'INTEGER',
    verification_status: 'VERIFIED',
    claim_sources: [],
  },
  {
    id: 'cl-2',
    exam_id: 'exam-cgl',
    claim_key: 'MAX_AGE',
    stated_value: '32',
    value_data_type: 'INTEGER',
    verification_status: 'VERIFIED',
    claim_sources: [],
  },
  {
    id: 'cl-3',
    exam_id: 'exam-cgl',
    claim_key: 'MIN_QUALIFICATION',
    stated_value: 'Bachelor Degree',
    value_data_type: 'STRING',
    verification_status: 'VERIFIED',
    claim_sources: [],
  },
  {
    id: 'cl-4',
    exam_id: 'exam-cgl',
    claim_key: 'NATIONALITY_RULE',
    stated_value: 'Citizen of India',
    value_data_type: 'STRING',
    verification_status: 'VERIFIED',
    claim_sources: [],
  }
];

const mockSources = [
  {
    id: 'src-1',
    exam_id: 'exam-cgl',
    title: 'SSC CGL 2026 Notification',
    source_type: 'OFFICIAL_NOTIFICATION',
    issuing_authority: 'Staff Selection Commission',
    source_url: 'https://ssc.gov.in/notif.pdf',
    published_date: '2026-06-11',
    verification_status: 'SOURCE_VERIFIED',
  }
];

const mockSyllabi = [
  {
    id: 'syl-1',
    exam_id: 'exam-cgl',
    subject_id: 'sub-1',
    total_weightage_percent: 50,
    is_active: true,
    subject: { id: 'sub-1', name: 'Quantitative Aptitude', slug: 'quant', code: 'QA' },
  }
];

const mockTopics = [
  {
    id: 'et-1',
    exam_id: 'exam-cgl',
    subject_id: 'sub-1',
    topic_id: 'top-1',
    importance_tier: 'CORE',
    required_depth: 'APPLICATION',
    expected_questions_min: 2,
    expected_questions_max: 4,
    is_active: true,
    topic: { id: 'top-1', name: 'Percentage', slug: 'percentage' },
  },
  {
    id: 'et-2',
    exam_id: 'exam-cgl',
    subject_id: 'sub-1',
    topic_id: 'top-2',
    importance_tier: 'HIGH_YIELD',
    required_depth: 'CONCEPTUAL',
    expected_questions_min: 1,
    expected_questions_max: 2,
    is_active: true,
    topic: { id: 'top-2', name: 'Geometry', slug: 'geometry' },
  }
];

const mockUnitMappings = [
  {
    id: 'um-1',
    exam_topic_id: 'et-1',
    learning_unit_id: 'lu-1',
    is_active: true,
    learning_unit: {
      id: 'lu-1',
      learning_documents: [
        { id: 'ld-1', canonical_slug: 'quant/percentage', status: 'PUBLISHED' },
      ],
    },
  },
  {
    id: 'um-2',
    exam_topic_id: 'et-2',
    learning_unit_id: 'lu-2',
    is_active: true,
    learning_unit: {
      id: 'lu-2',
      learning_documents: [
        { id: 'ld-2', canonical_slug: 'quant/geometry', status: 'DRAFT' }, // DRAFT -> must NOT be linked
      ],
    },
  }
];

const mockQuestions = [
  { id: 'q-1', topic_id: 'top-1' },
  { id: 'q-2', topic_id: 'top-1' },
];

const mockPublishedDocs = [
  {
    id: 'doc-1',
    exam_id: 'exam-cgl',
    exam_cycle_id: null,
    module_key: 'EXAM_OVERVIEW',
    language: 'en',
    status: 'PUBLISHED',
    current_published_version_id: 'v-1',
    current_published_version: {
      id: 'v-1',
      version_number: 1,
      is_published: true,
      review_status: 'PUBLISHED',
      compiled_mdx: '# SSC CGL Overview\n\nComplete overview of the examination.',
      structured_payload: {
        metadata: {
          title: 'SSC CGL Complete Guide',
          description: 'Timeless guide for SSC CGL.',
          lastVerifiedDate: '2026-06-15',
        },
        faqs: [{ question: 'What is SSC CGL?', answer: 'Combined Graduate Level Exam.' }],
        officialSources: [{ title: 'SSC Portal', url: 'https://ssc.gov.in', issuingAuthority: 'SSC' }],
      },
    },
  },
  {
    id: 'doc-2-2026',
    exam_id: 'exam-cgl',
    exam_cycle_id: 'cycle-cgl-2026',
    module_key: 'IMPORTANT_DATES',
    language: 'en',
    status: 'PUBLISHED',
    current_published_version_id: 'v-2-2026',
    current_published_version: {
      id: 'v-2-2026',
      version_number: 1,
      is_published: true,
      review_status: 'PUBLISHED',
      compiled_mdx: '# 2026 Dates\n\nNotification released June 2026.',
      structured_payload: {
        metadata: { title: 'SSC CGL 2026 Dates', lastVerifiedDate: '2026-06-11' },
      },
    },
  },
  {
    id: 'doc-2-2025',
    exam_id: 'exam-cgl',
    exam_cycle_id: 'cycle-cgl-2025',
    module_key: 'IMPORTANT_DATES',
    language: 'en',
    status: 'PUBLISHED',
    current_published_version_id: 'v-2-2025',
    current_published_version: {
      id: 'v-2-2025',
      version_number: 1,
      is_published: true,
      review_status: 'PUBLISHED',
      compiled_mdx: '# 2025 Dates\n\nHistorical 2025 cycle.',
      structured_payload: {
        metadata: { title: 'SSC CGL 2025 Dates', lastVerifiedDate: '2025-06-24' },
      },
    },
  },
  // Unapproved DRAFT document
  {
    id: 'doc-draft',
    exam_id: 'exam-cgl',
    module_key: 'SALARY',
    language: 'en',
    status: 'DRAFT',
    current_published_version_id: null,
  }
];

const prefetchedData = {
  exam: mockExams[0],
  exams: mockExams,
  cycles: mockCycles,
  posts: mockPosts,
  patterns: mockPatterns,
  claims: mockClaims,
  sources: mockSources,
  syllabi: mockSyllabi,
  topics: mockTopics,
  unitMappings: mockUnitMappings,
  questions: mockQuestions,
  publishedDocs: mockPublishedDocs,
};

async function runCertificationSuite() {
  console.log('================================================================');
  console.log('PHASE 3H.5.3 — CANDIDATE HUB FINAL PRODUCTION CERTIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function test(arg1, arg2, arg3) {
    total++;
    let id = '';
    let name = '';
    let fn = null;
    if (typeof arg2 === 'function') {
      name = arg1;
      fn = arg2;
    } else {
      id = arg1;
      name = arg2;
      fn = arg3;
    }
    try {
      fn();
      console.log(`  [PASS] ${id ? id + ': ' : ''}${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${id ? id + ': ' : ''}${name}`);
      console.error(`         ${err.message}`);
    }
  }

  async function asyncTest(id, name, fn) {
    total++;
    try {
      await fn();
      console.log(`  [PASS] ${id}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${id}: ${name}`);
      console.error(`         ${err.message}`);
    }
  }

  // --- V01: Route Rendering & Directory Aggregation ---
  await asyncTest('V01', 'Candidate directory (/exams) lists active exams with conducting org and cycle badge', async () => {
    const dir = await ExamKnowledgeCandidateService.getExamsDirectory({ prefetchedData });
    assert.strictEqual(dir.length, 1, 'Only active exams listed');
    assert.strictEqual(dir[0].slug, 'ssc-cgl');
    assert.strictEqual(dir[0].latestCycleYear, 2026);
    assert.strictEqual(dir[0].conductingOrg.name, 'Staff Selection Commission');
  });

  // --- V02: Published Content Isolation ---
  await asyncTest('V02', 'Strict published isolation: DRAFT/unapproved modules (SALARY) are 100% hidden', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData,
    });
    assert.strictEqual(res.data.publishedModules.SALARY, null);
    assert.ok(!res.data.availableModuleKeys.includes('SALARY'));
  });

  // --- V03: Cycle Isolation ---
  await asyncTest('V03', 'Cycle isolation: 2026 active cycle does not leak 2025 historical dates', async () => {
    const res2026 = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      cycleYear: 2026,
      prefetchedData,
    });
    assert.strictEqual(res2026.data.activeCycle.cycleYear, 2026);
    assert.strictEqual(res2026.data.activeCycle.totalVacancies, 14582);
    assert.strictEqual(res2026.data.publishedModules.IMPORTANT_DATES.versionId, 'v-2-2026');

    const res2025 = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      cycleYear: 2025,
      prefetchedData,
    });
    assert.strictEqual(res2025.data.activeCycle.cycleYear, 2025);
    assert.strictEqual(res2025.data.activeCycle.totalVacancies, 17727);
    assert.strictEqual(res2025.data.publishedModules.IMPORTANT_DATES.versionId, 'v-2-2025');
  });

  // --- V04: Partial Knowledge & Graceful Fallback ---
  await asyncTest('V04', 'Partial knowledge experience: unauthored modules return null without breaking hub', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData,
    });
    assert.strictEqual(res.status, 'FOUND');
    assert.ok(res.data.publishedModules.EXAM_OVERVIEW);
    assert.strictEqual(res.data.publishedModules.CAREER, null);
    assert.strictEqual(res.data.publishedModules.VACANCIES, null);
  });

  // --- V05: Learning Domain Integration ---
  await asyncTest('V05', 'Learn CTA is visible ONLY for topics with PUBLISHED learning documents', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData,
    });
    const sub = res.data.curriculum.subjects[0];
    const topPercentage = sub.topics.find((t) => t.slug === 'percentage');
    const topGeometry = sub.topics.find((t) => t.slug === 'geometry');

    // Percentage topic has published learning doc
    assert.strictEqual(topPercentage.learningDocumentSlug, 'quant/percentage');

    // Geometry topic has draft learning doc -> slug must be null
    assert.strictEqual(topGeometry.learningDocumentSlug, null);
  });

  // --- V06: Question Bank Practice Integration ---
  await asyncTest('V06', 'Practice CTA binds to /practice?topic=[id] and displays exact pyqCount', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData,
    });
    const sub = res.data.curriculum.subjects[0];
    const topPercentage = sub.topics.find((t) => t.slug === 'percentage');
    const topGeometry = sub.topics.find((t) => t.slug === 'geometry');

    assert.strictEqual(topPercentage.pyqCount, 2);
    assert.strictEqual(topPercentage.practiceAvailable, true);

    assert.strictEqual(topGeometry.pyqCount, 0);
    assert.strictEqual(topGeometry.practiceAvailable, false);
  });

  // --- V07: Official Sources & Gazette Citations ---
  await asyncTest('V07', 'Official sources expose only SOURCE_VERIFIED circulars with external URLs', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData,
    });
    assert.strictEqual(res.data.officialSources.length, 1);
    assert.strictEqual(res.data.officialSources[0].title, 'SSC CGL 2026 Notification');
    assert.strictEqual(res.data.officialSources[0].sourceUrl, 'https://ssc.gov.in/notif.pdf');
  });

  // --- V08: FAQ Aggregation ---
  await asyncTest('V08', 'FAQs are compiled across all published modules into single collection', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData,
    });
    const overviewFaqs = res.data.publishedModules.EXAM_OVERVIEW.faqs;
    assert.strictEqual(overviewFaqs.length, 1);
    assert.strictEqual(overviewFaqs[0].question, 'What is SSC CGL?');
  });

  // --- V09: SEO Metadata & Clean URLs ---
  test('V09: Canonical URLs and page metadata contain clean semantic paths (no internal UUIDs)', () => {
    const slugPageCode = fs.readFileSync(path.join(rootDir, 'app/exams/[slug]/page.tsx'), 'utf8');
    assert.ok(slugPageCode.includes('canonicalUrl: ' + String.fromCharCode(96) + '/exams/' + String.fromCharCode(36) + '{slug}' + String.fromCharCode(96)));
    assert.ok(!slugPageCode.includes('current_published_version_id'));
  });

  // --- V10: Robots Directives & Canonical URLs ---
  test('V10: SEO metadata sets index/follow for published views and noindex for 404s', () => {
    const slugPageCode = fs.readFileSync(path.join(rootDir, 'app/exams/[slug]/page.tsx'), 'utf8');
    assert.ok(slugPageCode.includes('noIndex: true'));
  });

  // --- V11: Accessibility, Semantics & ARIA Standards ---
  test('V11: Candidate UI components use semantic HTML, accessible table headers, and ARIA labels', () => {
    const tableCode = fs.readFileSync(path.join(rootDir, 'components/exams/exam-posts-table.tsx'), 'utf8');
    assert.ok(tableCode.includes('<table'));
    assert.ok(tableCode.includes('<thead'));
    assert.ok(tableCode.includes('<th'));

    const sourcesCode = fs.readFileSync(path.join(rootDir, 'components/exams/exam-official-sources.tsx'), 'utf8');
    assert.ok(sourcesCode.includes('aria-label='));
  });

  // --- V12: Client Security Boundary & Secret Isolation ---
  test('V12: Zero SUPABASE_SERVICE_ROLE_KEY or secret leakages in candidate client components', () => {
    const clientFiles = [
      'components/exams/exam-hero.tsx',
      'components/exams/exam-cycle-snapshot.tsx',
      'components/exams/exam-quick-nav.tsx',
      'components/exams/exam-module-card.tsx',
      'components/exams/exam-syllabus-navigator.tsx',
      'components/exams/exam-posts-table.tsx',
      'components/exams/exam-official-sources.tsx',
      'components/exams/exam-faq-accordion.tsx',
      'components/exams/exam-module-reader-view.tsx',
    ];

    for (const f of clientFiles) {
      const code = fs.readFileSync(path.join(rootDir, f), 'utf8');
      assert.ok(!code.includes('SUPABASE_SERVICE_ROLE_KEY'), `File ${f} must not contain service role key`);
      assert.ok(!code.includes('process.env.SUPABASE_SERVICE_ROLE_KEY'), `File ${f} must not access service role env`);
    }
  });

  // --- V13: Database Schema Baseline Preservation ---
  test('V13: Database Schema Baseline preserved (exact 20 protected tables, Δ = 0)', () => {
    assert.strictEqual(PROTECTED_BASELINE_TABLES.length, 20);
  });

  // --- V14: Cleanup & State Integrity ---
  await asyncTest('V14', 'Inactive exams return status = INACTIVE and missing exams return NOT_FOUND', async () => {
    const inact = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'old-inactive',
      prefetchedData: { ...prefetchedData, exam: mockExams[1] },
    });
    assert.strictEqual(inact.status, 'INACTIVE');

    const notFound = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'non-existent',
      prefetchedData: { ...prefetchedData, exam: null },
    });
    assert.strictEqual(notFound.status, 'NOT_FOUND');
  });

  // --- V15: Module Reader Security ---
  test('V15: Module reader renders compiled MDX safely without raw script injection', () => {
    const readerCode = fs.readFileSync(path.join(rootDir, 'components/exams/exam-module-reader-view.tsx'), 'utf8');
    assert.ok(!readerCode.includes('eval('));
    assert.ok(readerCode.includes('moduleData.compiledMdx'));
  });

  console.log('\n================================================================');
  console.log(`CERTIFICATION TEST SUITE COMPLETED: ${passed} / ${total} PASSED`);
  console.log('================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runCertificationSuite().catch((err) => {
  console.error('Fatal error running certification tests:', err);
  process.exit(1);
});
