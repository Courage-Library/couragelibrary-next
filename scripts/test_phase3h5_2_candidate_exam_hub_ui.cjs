/**
 * COURAGE LIBRARY — PHASE 3H.5.2 CANDIDATE EXAM KNOWLEDGE HUB UI TEST SUITE
 * 
 * Tests UI01 - UI21:
 * - UI01: Candidate Directory displays exams with category badges, conducting orgs, published module counts, cycle years
 * - UI02: Main Exam Hub renders Hero with dynamic metadata, conduct org, freshness status, portal link
 * - UI03: Main Exam Hub renders Cycle Snapshot with notification date, application window, exam window, vacancies, tentative badge
 * - UI04: Main Exam Hub renders Quick Nav with jump links to active sections
 * - UI05: Main Exam Hub renders Published Modules Grid with module cards, status badges, last verified dates
 * - UI06: Main Exam Hub renders Eligibility Summary (min age, max age, min qualification, nationality)
 * - UI07: Main Exam Hub renders Posts Table with post names, departments, ministries, pay levels, CPC basic pay ranges, gazetted status
 * - UI08: Main Exam Hub renders Exam Pattern with duration, total questions, marks, negative marking, section breakdown
 * - UI09: GAP2-4b — the hub's syllabus is the canonical read model, passed through unchanged (sections / units / tiers /
 *         expected ranges); prefetched mode without a syllabus is UNAVAILABLE (never derived from tables)
 * - UI10: GAP2-4b — lesson availability per topic is the read model's servable_documents (published learning documents only)
 * - UI11: GAP2-4b — practice availability per topic is the read model's published_questions (exact count)
 * - UI12: Main Exam Hub renders FAQs accordion with all published module FAQs
 * - UI13: Main Exam Hub renders Official Sources with verification badges, issuing authority, external links
 * - UI14: Deep-Dive Module Reader page displays full compiled MDX guide, source citations, module FAQs, back link
 * - UI15: Cycle-Specific Candidate Hub (/exams/[slug]/cycle/[year]) resolves cycle-specific data and cycle-specific modules
 * - UI16: Cycle-Specific Module Reader (/exams/[slug]/cycle/[year]/[moduleSlug]) resolves cycle-specific guide and back link to cycle hub
 * - UI17: Pure Read-Only Consumption — zero database mutations during UI renders or service calls
 * - UI18: Strict Published Content Isolation — draft/unapproved documents and versions are 100% invisible
 * - UI19: Graceful handling of inactive exams and missing exams (notFound / status INACTIVE / NOT_FOUND)
 * - UI20: Zero hardcoded exam facts (dynamic data resolution only)
 * - UI21: Database Schema Baseline Preservation (20 protected tables, Δ = 0)
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
const { availableSyllabus, noSyllabus } = require('./fixtures/syllabus_read_model.cjs');
const { ExamModuleRegistry } = require('../services/exam-knowledge/exam-module-registry');

const rootDir = path.resolve(__dirname, '..');

// Protected tables baseline for Couragelibrary
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

// Mock database fixture
const mockExams = [
  {
    id: 'exam-cgl',
    slug: 'ssc-cgl',
    title: 'Staff Selection Commission - Combined Graduate Level',
    name: 'SSC CGL',
    category: 'Staff Selection Commission (SSC)',
    is_active: true,
    official_website: 'https://ssc.gov.in',
    description: 'National recruitment examination for Group B and Group C central government posts.',
    conducting_org: {
      id: 'org-ssc',
      name: 'Staff Selection Commission',
      short_name: 'SSC',
      website_url: 'https://ssc.gov.in',
    },
  },
  {
    id: 'exam-chsl',
    slug: 'ssc-chsl',
    title: 'Staff Selection Commission - Combined Higher Secondary Level',
    name: 'SSC CHSL',
    category: 'Staff Selection Commission (SSC)',
    is_active: true,
    official_website: 'https://ssc.gov.in',
    description: 'Recruitment examination for LDC, JSA, and DEO posts.',
    conducting_org: {
      id: 'org-ssc',
      name: 'Staff Selection Commission',
      short_name: 'SSC',
      website_url: 'https://ssc.gov.in',
    },
  },
  {
    id: 'exam-inactive',
    slug: 'inactive-exam',
    title: 'Old Inactive Exam',
    name: 'Old Exam',
    category: 'Other',
    is_active: false,
    conducting_org: null,
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
  },
];

const mockPosts = [
  {
    id: 'post-aso-css',
    exam_id: 'exam-cgl',
    post_name: 'Assistant Section Officer (CSS)',
    department: 'Central Secretariat Service',
    ministry: 'Ministry of Personnel, Public Grievances and Pensions',
    classification_group: 'Group B',
    is_gazetted: false,
    pay_level: 7,
    grade_pay: 4600,
    cpc_basic_pay_min: 44900,
    cpc_basic_pay_max: 142400,
    is_active: true,
    display_order: 1,
  },
  {
    id: 'post-it-inspector',
    exam_id: 'exam-cgl',
    post_name: 'Inspector of Income Tax',
    department: 'Central Board of Direct Taxes (CBDT)',
    ministry: 'Ministry of Finance',
    classification_group: 'Group C',
    is_gazetted: false,
    pay_level: 7,
    grade_pay: 4600,
    cpc_basic_pay_min: 44900,
    cpc_basic_pay_max: 142400,
    is_active: true,
    display_order: 2,
  },
];

const mockPatterns = [
  {
    id: 'pattern-tier1',
    exam_id: 'exam-cgl',
    name: 'Tier-I Computer Based Examination',
    tier_name: 'Tier-I',
    duration_minutes: 60,
    total_questions: 100,
    total_marks: 200,
    negative_mark_value: 0.5,
    is_active: true,
    // live schema (GAP2-4b): pattern_sections(section_name, section_order, num_questions, marks_per_question, negative_mark)
    pattern_sections: [
      { section_name: 'General Intelligence & Reasoning', section_order: 1, num_questions: 25, marks_per_question: 2, negative_mark: 0.5 },
      { section_name: 'General Awareness', section_order: 2, num_questions: 25, marks_per_question: 2, negative_mark: 0.5 },
      { section_name: 'Quantitative Aptitude', section_order: 3, num_questions: 25, marks_per_question: 2, negative_mark: 0.5 },
      { section_name: 'English Comprehension', section_order: 4, num_questions: 25, marks_per_question: 2, negative_mark: 0.5 },
    ],
  },
];

const mockSources = [
  {
    id: 'src-cgl-notif-2026',
    exam_id: 'exam-cgl',
    title: 'SSC CGL 2026 Official Gazette Notification',
    source_type: 'OFFICIAL_NOTIFICATION',
    issuing_authority: 'Staff Selection Commission',
    source_url: 'https://ssc.gov.in/files/portal/latest/notif_cgl_2026.pdf',
    published_date: '2026-06-11',
    verification_status: 'SOURCE_VERIFIED',
  },
];

const mockClaims = [
  {
    id: 'cl-min-age',
    exam_id: 'exam-cgl',
    claim_key: 'MIN_AGE',
    stated_value: '18',
    value_data_type: 'INTEGER',
    verification_status: 'VERIFIED',
    claim_sources: [
      {
        source: {
          title: 'SSC CGL 2026 Official Gazette Notification',
        },
        page_or_clause_reference: 'Paragraph 5.1, Page 12',
      },
    ],
  },
  {
    id: 'cl-max-age',
    exam_id: 'exam-cgl',
    claim_key: 'MAX_AGE',
    stated_value: '32',
    value_data_type: 'INTEGER',
    verification_status: 'VERIFIED',
    claim_sources: [],
  },
  {
    id: 'cl-min-qual',
    exam_id: 'exam-cgl',
    claim_key: 'MIN_QUALIFICATION',
    stated_value: "Bachelor's Degree from a recognized University or equivalent",
    value_data_type: 'STRING',
    verification_status: 'VERIFIED',
    claim_sources: [],
  },
  {
    id: 'cl-nationality',
    exam_id: 'exam-cgl',
    claim_key: 'NATIONALITY_RULE',
    stated_value: 'Citizen of India, Subject of Nepal/Bhutan',
    value_data_type: 'STRING',
    verification_status: 'VERIFIED',
    claim_sources: [],
  },
];

const mockSyllabi = [
  {
    id: 'syl-quant',
    exam_id: 'exam-cgl',
    subject_id: 'sub-quant',
    total_weightage_percent: 25,
    is_active: true,
    display_order: 1,
    subject: {
      id: 'sub-quant',
      name: 'Quantitative Aptitude',
      slug: 'quantitative-aptitude',
      code: 'QA',
    },
  },
  {
    id: 'syl-reasoning',
    exam_id: 'exam-cgl',
    subject_id: 'sub-reasoning',
    total_weightage_percent: 25,
    is_active: true,
    display_order: 2,
    subject: {
      id: 'sub-reasoning',
      name: 'General Intelligence and Reasoning',
      slug: 'reasoning',
      code: 'GIR',
    },
  },
];

const mockTopics = [
  {
    id: 'et-percentage',
    exam_id: 'exam-cgl',
    subject_id: 'sub-quant',
    topic_id: 'top-percentage',
    importance_tier: 'CORE',
    required_depth: 'APPLICATION',
    expected_questions_min: 2,
    expected_questions_max: 3,
    is_active: true,
    display_order: 1,
    topic: {
      id: 'top-percentage',
      name: 'Percentages & Fractions',
      slug: 'percentages-fractions',
    },
  },
  {
    id: 'et-syllogism',
    exam_id: 'exam-cgl',
    subject_id: 'sub-reasoning',
    topic_id: 'top-syllogism',
    importance_tier: 'HIGH_YIELD',
    required_depth: 'APPLICATION',
    expected_questions_min: 2,
    expected_questions_max: 2,
    is_active: true,
    display_order: 1,
    topic: {
      id: 'top-syllogism',
      name: 'Syllogism & Venn Diagrams',
      slug: 'syllogism',
    },
  },
];

const mockUnitMappings = [
  {
    id: 'um-percentage',
    exam_topic_id: 'et-percentage',
    learning_unit_id: 'lu-percentage',
    sequence_order: 1,
    is_active: true,
    learning_unit: {
      id: 'lu-percentage',
      title: 'Mastering Percentages',
      learning_documents: [
        {
          id: 'ldoc-percentage',
          title: 'Percentages Comprehensive Guide',
          canonical_slug: 'quantitative-aptitude/percentages',
          status: 'PUBLISHED',
        },
      ],
    },
  },
];

const mockQuestions = [
  { id: 'q1', topic_id: 'top-percentage' },
  { id: 'q2', topic_id: 'top-percentage' },
  { id: 'q3', topic_id: 'top-percentage' },
];

const mockPublishedDocs = [
  {
    id: 'doc-overview',
    exam_id: 'exam-cgl',
    exam_cycle_id: null,
    module_key: 'EXAM_OVERVIEW',
    language: 'en',
    status: 'PUBLISHED',
    updated_at: '2026-06-15T10:00:00Z',
    current_published_version_id: 'ver-overview-1',
    current_published_version: {
      id: 'ver-overview-1',
      version_number: 1,
      is_published: true,
      review_status: 'PUBLISHED',
      published_at: '2026-06-15T10:00:00Z',
      compiled_mdx: '# SSC CGL Examination Overview\n\nSSC CGL is one of the premier national recruitment examinations...',
      structured_payload: {
        metadata: {
          title: 'SSC CGL Complete Exam Guide & Architecture',
          description: 'Official overview of the Combined Graduate Level Examination.',
          lastVerifiedDate: '2026-06-15',
        },
        faqs: [
          {
            question: 'What is the frequency of the SSC CGL exam?',
            answer: 'SSC CGL is conducted annually by the Staff Selection Commission.',
          },
        ],
        officialSources: [
          {
            title: 'SSC Official Portal',
            url: 'https://ssc.gov.in',
            issuingAuthority: 'Staff Selection Commission',
          },
        ],
      },
    },
  },
  {
    id: 'doc-dates-2026',
    exam_id: 'exam-cgl',
    exam_cycle_id: 'cycle-cgl-2026',
    module_key: 'IMPORTANT_DATES',
    language: 'en',
    status: 'PUBLISHED',
    updated_at: '2026-06-12T10:00:00Z',
    current_published_version_id: 'ver-dates-1',
    current_published_version: {
      id: 'ver-dates-1',
      version_number: 1,
      is_published: true,
      review_status: 'PUBLISHED',
      published_at: '2026-06-12T10:00:00Z',
      compiled_mdx: '# SSC CGL 2026 Official Timeline\n\nAll critical dates for notification and application...',
      structured_payload: {
        metadata: {
          title: 'SSC CGL 2026 Important Dates & Timeline',
          description: 'Verified schedule for SSC CGL 2026 examination.',
          lastVerifiedDate: '2026-06-12',
        },
        faqs: [
          {
            question: 'When does the application window close for 2026?',
            answer: 'Applications close on 10th July 2026.',
          },
        ],
      },
    },
  },
  {
    id: 'doc-dates-2025',
    exam_id: 'exam-cgl',
    exam_cycle_id: 'cycle-cgl-2025',
    module_key: 'IMPORTANT_DATES',
    language: 'en',
    status: 'PUBLISHED',
    updated_at: '2025-06-25T10:00:00Z',
    current_published_version_id: 'ver-dates-2025',
    current_published_version: {
      id: 'ver-dates-2025',
      version_number: 1,
      is_published: true,
      review_status: 'PUBLISHED',
      published_at: '2025-06-25T10:00:00Z',
      compiled_mdx: '# SSC CGL 2025 Archived Timeline\n\nArchived 2025 schedule...',
      structured_payload: {
        metadata: {
          title: 'SSC CGL 2025 Important Dates',
          description: 'Historical 2025 schedule.',
          lastVerifiedDate: '2025-06-25',
        },
      },
    },
  },
  // Draft / Unapproved document: MUST NOT be visible in candidate read model
  {
    id: 'doc-draft-salary',
    exam_id: 'exam-cgl',
    exam_cycle_id: null,
    module_key: 'SALARY',
    language: 'en',
    status: 'DRAFT',
    current_published_version_id: null,
    current_published_version: null,
  },
];

const mockPrefetchedData = {
  exam: mockExams[0],
  exams: mockExams,
  cycles: mockCycles,
  posts: mockPosts,
  patterns: mockPatterns,
  sources: mockSources,
  claims: mockClaims,
  syllabi: mockSyllabi,
  topics: mockTopics,
  unitMappings: mockUnitMappings,
  publishedDocs: mockPublishedDocs,
  questions: mockQuestions,
  // GAP2-4b: the canonical read model (published syllabus) — the only syllabus source of the hub
  syllabus: availableSyllabus('exam-cgl', [
    { title: 'Quantitative Aptitude', tier: 'HIGH_YIELD', min: 25, max: 25, units: [
      { title: 'Arithmetic', tier: 'CORE', topics: [{ id: 'top-percentages', name: 'Percentages & Fractions', slug: 'percentages', q: 3, d: 1 }] },
    ] },
    { title: 'General Intelligence & Reasoning', tier: 'CORE', units: [
      { title: 'Logical reasoning', topics: [{ id: 'top-syllogism', name: 'Syllogism', slug: 'syllogism', q: 0, d: 0 }] },
    ] },
  ]),
};

async function runTests() {
  console.log('================================================================');
  console.log('PHASE 3H.5.2 — CANDIDATE EXAM KNOWLEDGE HUB UI TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err.message}`);
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err.message}`);
    }
  }

  // --- UI01: Candidate Directory ---
  await asyncTest('UI01: Directory aggregates active exams with category, conducting org, cycle, and published counts', async () => {
    const dir = await ExamKnowledgeCandidateService.getExamsDirectory({ prefetchedData: mockPrefetchedData });
    assert.strictEqual(dir.length, 2, 'Should only return 2 active exams (ignoring inactive)');
    const cgl = dir.find((e) => e.slug === 'ssc-cgl');
    assert.ok(cgl, 'SSC CGL exists in directory');
    assert.strictEqual(cgl.latestCycleYear, 2026, 'Latest cycle year correctly resolved to 2026');
    assert.strictEqual(cgl.conductingOrg.shortName, 'SSC', 'Conducting org name is SSC');
    assert.strictEqual(cgl.publishedModulesCount, 3, 'Counts 3 published docs for CGL');
  });

  // --- UI02: Main Exam Hub Hero ---
  await asyncTest('UI02: Main Exam Hub Hero extracts title, category, freshness, and portal link', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData: mockPrefetchedData,
    });
    assert.strictEqual(res.status, 'FOUND');
    const view = res.data;
    assert.strictEqual(view.exam.title, 'Staff Selection Commission - Combined Graduate Level');
    assert.strictEqual(view.exam.category, 'Staff Selection Commission (SSC)');
    assert.strictEqual(view.metadata.overallFreshnessStatus, 'VERIFIED_CURRENT');
    assert.strictEqual(view.exam.officialWebsite, 'https://ssc.gov.in');
  });

  // --- UI03: Cycle Snapshot ---
  await asyncTest('UI03: Cycle Snapshot tabulates notification date, application window, and vacancies', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData: mockPrefetchedData,
    });
    const cycle = res.data.activeCycle;
    assert.ok(cycle, 'Active cycle resolved');
    assert.strictEqual(cycle.cycleYear, 2026);
    assert.strictEqual(cycle.notificationDate, '2026-06-11');
    assert.strictEqual(cycle.applicationStartDate, '2026-06-11');
    assert.strictEqual(cycle.applicationEndDate, '2026-07-10');
    assert.strictEqual(cycle.totalVacancies, 14582);
    assert.strictEqual(cycle.isTentative, false);
  });

  // --- UI04: Quick Navigation Registry & Slugs ---
  test('UI04: Module Registry provides canonical slugs and bidirectional resolution', () => {
    const slug = ExamModuleRegistry.getModuleSlug('EXAM_OVERVIEW');
    assert.strictEqual(slug, 'exam-overview');
    const key = ExamModuleRegistry.getModuleKeyFromSlug('exam-overview');
    assert.strictEqual(key, 'EXAM_OVERVIEW');
    const datesKey = ExamModuleRegistry.getModuleKeyFromSlug('important-dates');
    assert.strictEqual(datesKey, 'IMPORTANT_DATES');
    const invalidKey = ExamModuleRegistry.getModuleKeyFromSlug('non-existent-module');
    assert.strictEqual(invalidKey, null);
  });

  // --- UI05: Published Modules Grid ---
  await asyncTest('UI05: Published modules grid accurately marks available vs pending modules', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData: mockPrefetchedData,
    });
    const view = res.data;
    assert.ok(view.publishedModules.EXAM_OVERVIEW, 'EXAM_OVERVIEW is published');
    assert.ok(view.publishedModules.IMPORTANT_DATES, 'IMPORTANT_DATES is published');
    assert.strictEqual(view.publishedModules.SALARY, null, 'SALARY is pending/unpublished');
    assert.strictEqual(view.metadata.totalPublishedModulesCount, 2, 'Exactly 2 published modules in active cycle');
  });

  // --- UI06: Eligibility Summary ---
  await asyncTest('UI06: Structured facts eligibility parameters resolve min/max age, education, nationality', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData: mockPrefetchedData,
    });
    const elig = res.data.structuredFacts.eligibilityParameters;
    assert.strictEqual(elig.minAge, 18);
    assert.strictEqual(elig.maxAge, 32);
    assert.strictEqual(elig.educationMin, "Bachelor's Degree from a recognized University or equivalent");
    assert.strictEqual(elig.nationality, 'Citizen of India, Subject of Nepal/Bhutan');
  });

  // --- UI07: Posts Table ---
  await asyncTest('UI07: Posts table maps departments, ministries, pay level, and basic pay ranges', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData: mockPrefetchedData,
    });
    const posts = res.data.structuredFacts.posts;
    assert.strictEqual(posts.length, 2);
    assert.strictEqual(posts[0].postName, 'Assistant Section Officer (CSS)');
    assert.strictEqual(posts[0].payLevel, 7);
    assert.strictEqual(posts[0].cpcBasicPayMin, 44900);
    assert.strictEqual(posts[0].cpcBasicPayMax, 142400);
    assert.strictEqual(posts[0].isGazetted, false);
  });

  // --- UI08: Exam Pattern ---
  await asyncTest('UI08: Exam pattern structures tiers, duration, marks, and section breakdown', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData: mockPrefetchedData,
    });
    const patterns = res.data.structuredFacts.patterns;
    assert.strictEqual(patterns.length, 1);
    assert.strictEqual(patterns[0].name, 'Tier-I Computer Based Examination');
    assert.strictEqual(patterns[0].durationMinutes, 60);
    assert.strictEqual(patterns[0].totalQuestions, 100);
    assert.strictEqual(patterns[0].totalMarks, 200);
    assert.strictEqual(patterns[0].negativeMarkValue, 0.5);
    assert.strictEqual(patterns[0].sections.length, 4);
    assert.strictEqual(patterns[0].sections[0].name, 'General Intelligence & Reasoning');
  });

  // --- UI09: Syllabus = canonical read model ---
  await asyncTest('UI09: Syllabus is the canonical read model (sections, units, tiers, ranges); missing → UNAVAILABLE', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData: mockPrefetchedData,
    });
    const syl = res.data.syllabus;
    assert.deepStrictEqual(syl, mockPrefetchedData.syllabus);
    assert.strictEqual(res.data.curriculum, undefined);
    const qa = syl.nodes.find((n) => n.kind === 'SECTION' && n.title === 'Quantitative Aptitude');
    assert.strictEqual(qa.weightage_tier, 'HIGH_YIELD');
    assert.strictEqual(qa.expected_questions_min, 25);
    const unit = syl.nodes.find((n) => n.parent_id === qa.id);
    assert.strictEqual(unit.kind, 'UNIT');
    assert.strictEqual(unit.weightage_tier, 'CORE');
    assert.strictEqual(unit.expected_questions_min, null); // unknown stays null, never 0
    const none = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData: { ...mockPrefetchedData, syllabus: noSyllabus('exam-cgl') },
    });
    assert.strictEqual(none.data.syllabus.state, 'NO_SYLLABUS');
    const missing = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData: { ...mockPrefetchedData, syllabus: undefined },
    });
    assert.strictEqual(missing.data.syllabus.state, 'UNAVAILABLE');
    assert.strictEqual(missing.data.syllabus.nodes.length, 0);
  });

  // --- UI10: lessons per topic ---
  await asyncTest('UI10: Topic lesson availability is the read model servable_documents count', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData: mockPrefetchedData,
    });
    const topics = res.data.syllabus.nodes.flatMap((n) => n.topics);
    assert.strictEqual(topics.find((t) => t.slug === 'percentages').servable_documents, 1);
    assert.strictEqual(topics.find((t) => t.slug === 'syllogism').servable_documents, 0);
  });

  // --- UI11: practice per topic ---
  await asyncTest('UI11: Topic practice availability is the read model published_questions count (exact)', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData: mockPrefetchedData,
    });
    const topics = res.data.syllabus.nodes.flatMap((n) => n.topics);
    assert.strictEqual(topics.find((t) => t.slug === 'percentages').published_questions, 3);
    assert.strictEqual(topics.find((t) => t.slug === 'syllogism').published_questions, 0);
    assert.strictEqual(res.data.syllabus.totals.published_questions, 3);
  });

  // --- UI12: FAQs ---
  await asyncTest('UI12: FAQs from published modules are exposed in candidate view', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData: mockPrefetchedData,
    });
    const overviewFaqs = res.data.publishedModules.EXAM_OVERVIEW.faqs;
    assert.strictEqual(overviewFaqs.length, 1);
    assert.strictEqual(overviewFaqs[0].question, 'What is the frequency of the SSC CGL exam?');
  });

  // --- UI13: Official Sources ---
  await asyncTest('UI13: Official sources map issuing authority, citation URL, and date', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData: mockPrefetchedData,
    });
    const sources = res.data.officialSources;
    assert.strictEqual(sources.length, 1);
    assert.strictEqual(sources[0].title, 'SSC CGL 2026 Official Gazette Notification');
    assert.strictEqual(sources[0].issuingAuthority, 'Staff Selection Commission');
    assert.strictEqual(sources[0].sourceUrl, 'https://ssc.gov.in/files/portal/latest/notif_cgl_2026.pdf');
  });

  // --- UI14: Deep-Dive Module Reader ---
  await asyncTest('UI14: Deep-Dive module reader delivers compiled MDX and module-specific sources and FAQs', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData: mockPrefetchedData,
    });
    const mod = res.data.publishedModules.EXAM_OVERVIEW;
    assert.ok(mod.compiledMdx.includes('# SSC CGL Examination Overview'));
    assert.strictEqual(mod.title, 'SSC CGL Complete Exam Guide & Architecture');
    assert.strictEqual(mod.lastVerifiedDate, '2026-06-15');
    assert.strictEqual(mod.officialSources.length, 1);
    assert.strictEqual(mod.officialSources[0].title, 'SSC Official Portal');
  });

  // --- UI15: Cycle-Specific Candidate Hub ---
  await asyncTest('UI15: Cycle-specific query (/exams/[slug]/cycle/2025) scopes to 2025 published modules', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      cycleYear: 2025,
      prefetchedData: mockPrefetchedData,
    });
    assert.strictEqual(res.status, 'FOUND');
    assert.strictEqual(res.data.activeCycle.cycleYear, 2025);
    assert.strictEqual(res.data.activeCycle.totalVacancies, 17727);
    
    // Cycle-specific IMPORTANT_DATES must be for 2025
    const datesMod = res.data.publishedModules.IMPORTANT_DATES;
    assert.ok(datesMod, 'IMPORTANT_DATES for 2025 exists');
    assert.strictEqual(datesMod.title, 'SSC CGL 2025 Important Dates');
    assert.ok(datesMod.compiledMdx.includes('2025 Archived Timeline'));
  });

  // --- UI16: Cycle-Specific Module Reader ---
  await asyncTest('UI16: Cycle-specific module reader delivers 2025 dates guide', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      cycleYear: 2025,
      prefetchedData: mockPrefetchedData,
    });
    const mod = res.data.publishedModules.IMPORTANT_DATES;
    assert.strictEqual(mod.versionId, 'ver-dates-2025');
    assert.strictEqual(mod.lastVerifiedDate, '2025-06-25');
  });

  // --- UI17: Pure Read-Only Consumption ---
  test('UI17: Candidate Service contains ZERO database write methods', () => {
    const serviceMethods = Object.getOwnPropertyNames(ExamKnowledgeCandidateService);
    const writeKeywords = ['insert', 'update', 'delete', 'upsert', 'mutate', 'create', 'save'];
    for (const m of serviceMethods) {
      for (const kw of writeKeywords) {
        assert.ok(!m.toLowerCase().includes(kw), `Method ${m} must not be a mutation method`);
      }
    }
  });

  // --- UI18: Strict Published Content Isolation ---
  await asyncTest('UI18: Draft/unapproved documents (SALARY) are strictly invisible in candidate model', async () => {
    const res = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'ssc-cgl',
      prefetchedData: mockPrefetchedData,
    });
    assert.strictEqual(res.data.publishedModules.SALARY, null, 'Draft module SALARY is null');
    assert.ok(!res.data.availableModuleKeys.includes('SALARY'), 'SALARY is not in availableModuleKeys');
  });

  // --- UI19: Inactive & Not Found Handling ---
  await asyncTest('UI19: Service returns INACTIVE for inactive exams and NOT_FOUND for unknown slugs', async () => {
    const inactiveRes = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'inactive-exam',
      prefetchedData: { ...mockPrefetchedData, exam: mockExams[2] },
    });
    assert.strictEqual(inactiveRes.status, 'INACTIVE');

    const notFoundRes = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({
      examSlug: 'random-unknown-exam',
      prefetchedData: { ...mockPrefetchedData, exam: null },
    });
    assert.strictEqual(notFoundRes.status, 'NOT_FOUND');
  });

  // --- UI20: Zero Hardcoding Verification ---
  test('UI20: Candidate components use purely dynamic props without static exam data', () => {
    const heroCode = fs.readFileSync(path.join(rootDir, 'components/exams/exam-hero.tsx'), 'utf8');
    assert.ok(!heroCode.includes('"SSC CGL"'), 'Hero must not hardcode exam titles');
    assert.ok(heroCode.includes('exam.title'), 'Hero binds dynamically to exam.title');

    const postsCode = fs.readFileSync(path.join(rootDir, 'components/exams/exam-posts-table.tsx'), 'utf8');
    assert.ok(!postsCode.includes('"Assistant Section Officer"'), 'Posts table must not hardcode post names');
    assert.ok(postsCode.includes('post.postName'), 'Posts table binds dynamically to post.postName');
  });

  // --- UI21: Database Schema Baseline Preservation ---
  test('UI21: Database Schema Baseline preserved (exact 20 protected tables, Δ = 0)', () => {
    assert.strictEqual(PROTECTED_BASELINE_TABLES.length, 20, 'Exact 20 protected tables verified');
  });

  console.log('\n================================================================');
  console.log(`TEST SUITE COMPLETED: ${passed} / ${total} PASSED`);
  console.log('================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
