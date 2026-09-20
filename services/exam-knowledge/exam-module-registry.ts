/**
 * COURAGE LIBRARY — EXAM KNOWLEDGE MODULE REGISTRY
 * Phase 3H.2: Exam Knowledge Context Builder & External AI Prompt Generator
 * 
 * Central registry for all 16+ canonical Exam Knowledge modules,
 * defining module metadata, cycle-specificity, source requirements,
 * freshness rules, and runtime applicability evaluators.
 */

import {
  ExamModuleKey,
  ExamModuleDefinition,
  ModuleApplicabilityReport,
} from '@/types/exam-knowledge';

export const EXAM_MODULE_REGISTRY: Record<ExamModuleKey, ExamModuleDefinition> = {
  EXAM_OVERVIEW: {
    key: 'EXAM_OVERVIEW',
    displayName: 'Exam Overview & Conducting Authority',
    purpose: 'Comprehensive timeless summary of the examination, conducting organization, historical scope, and high-level structure.',
    isCycleSpecific: false,
    requiresSources: false,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['ORGANISATION_NAME', 'OFFICIAL_PORTAL', 'EXAM_CATEGORY'],
    freshnessRule: 'Annual verification against commission mandates',
    outputGuidance: 'Provide clear, authoritative overview without generic marketing fluff. Focus on conducting authority, national scope, and official resources.',
  },
  IMPORTANT_DATES: {
    key: 'IMPORTANT_DATES',
    displayName: 'Important Dates & Cycle Timeline',
    purpose: 'Authoritative schedule of notification, application window, admit card releases, exam windows, and result declarations for the active cycle.',
    isCycleSpecific: true,
    requiresSources: true,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['NOTIFICATION_DATE', 'APPLICATION_START', 'APPLICATION_END', 'EXAM_WINDOW_TIER1'],
    freshnessRule: 'Immediate update upon issuance of official corrigendum or commission notices',
    outputGuidance: 'Tabulate all milestone dates with distinction between confirmed official dates and tentative commission calendars. Mark unknown dates as TO_BE_ANNOUNCED.',
  },
  ELIGIBILITY: {
    key: 'ELIGIBILITY',
    displayName: 'Eligibility Criteria (Age, Education & Category)',
    purpose: 'Detailed, precise criteria covering nationality, minimum/maximum age limits, educational qualifications, and category-wise age relaxations.',
    isCycleSpecific: false,
    requiresSources: true,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['MIN_AGE', 'MAX_AGE', 'MIN_QUALIFICATION', 'NATIONALITY_RULE'],
    freshnessRule: 'Verify against active cycle notification for crucial cutoff dates',
    outputGuidance: 'Structure eligibility strictly by nationality, educational qualification (degree/discipline), age limits (with cutoff reference date), and reserved category relaxations.',
  },
  AGE_LIMIT: {
    key: 'AGE_LIMIT',
    displayName: 'Age Limits & Relaxation Rules',
    purpose: 'In-depth breakdown of post-wise minimum and maximum age criteria, crucial cutoff dates, and statutory category relaxations (OBC, SC, ST, PwBD, Ex-Servicemen).',
    isCycleSpecific: false,
    requiresSources: true,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['MIN_AGE', 'MAX_AGE', 'AGE_RELAXATION_OBC', 'AGE_RELAXATION_SC_ST'],
    freshnessRule: 'Verify crucial cutoff date per cycle notification',
    outputGuidance: 'Present exact post-wise age brackets and clear mathematical relaxation formulas for reserved categories.',
  },
  QUALIFICATION: {
    key: 'QUALIFICATION',
    displayName: 'Educational & Technical Qualifications',
    purpose: 'Essential and desirable educational qualifications, degree requirements, final-year appearing candidate eligibility rules, and technical prerequisites.',
    isCycleSpecific: false,
    requiresSources: true,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['MIN_QUALIFICATION', 'FINAL_YEAR_ELIGIBILITY_RULE'],
    freshnessRule: 'Verify educational cutoff date per notification',
    outputGuidance: 'Detail required degree streams, minimum marks criteria (if any), and state clearly whether final year appearing students can apply.',
  },
  PHYSICAL_STANDARDS: {
    key: 'PHYSICAL_STANDARDS',
    displayName: 'Physical Standards & Medical Requirements',
    purpose: 'Mandatory physical measurement (height, chest, weight) and physical endurance test (walking, cycling, running) standards for specific enforcement/uniformed posts.',
    isCycleSpecific: false,
    requiresSources: true,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['PHYSICAL_HEIGHT_MALE', 'PHYSICAL_HEIGHT_FEMALE', 'CHEST_MALE'],
    freshnessRule: 'Periodic review against commission service rules',
    outputGuidance: 'Isolate uniformed posts requiring physical standards (e.g. CBI, Excise, Preventive Officer) and list exact height/chest/PET requirements for male and female candidates.',
  },
  APPLICATION_PROCESS: {
    key: 'APPLICATION_PROCESS',
    displayName: 'Application Process & Fee Structure',
    purpose: 'Step-by-step candidate application instructions, portal registration, photo/signature specifications, fee amounts, payment modes, and application correction window.',
    isCycleSpecific: false,
    requiresSources: true,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['APPLICATION_FEE_GEN', 'APPLICATION_FEE_RESERVED', 'FEE_EXEMPTION_FEMALE'],
    freshnessRule: 'Verify against latest portal application guidelines',
    outputGuidance: 'Detail one-time registration (OTR), live photo capture rules, document dimensions, category fee exemptions, and correction window protocols.',
  },
  SELECTION_PROCESS: {
    key: 'SELECTION_PROCESS',
    displayName: 'Selection Process & Recruitment Stages',
    purpose: 'Comprehensive roadmap of all stages (e.g., Computer Based Examination Tier 1, Tier 2, Typing/Data Entry, Document Verification, Medical Examination) and merit calculation.',
    isCycleSpecific: false,
    requiresSources: true,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['TOTAL_STAGES', 'MERIT_BASIS', 'QUALIFYING_STAGES'],
    freshnessRule: 'Update when commission modifies scheme of examination',
    outputGuidance: 'Provide sequential progression flowchart, qualifying vs merit stages, minimum qualifying marks per category, and tie-breaking criteria.',
  },
  EXAM_PATTERN: {
    key: 'EXAM_PATTERN',
    displayName: 'Exam Pattern & Marking Scheme',
    purpose: 'Tier-by-tier and section-by-section breakdown of subjects, number of questions, maximum marks, negative marking, duration, and compensatory time for scribe candidates.',
    isCycleSpecific: false,
    requiresSources: true,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['TIER1_DURATION', 'TIER1_QUESTIONS', 'TIER1_MARKS', 'TIER1_NEGATIVE_MARK'],
    freshnessRule: 'Verify against official examination scheme',
    outputGuidance: 'Tabulate subjects, questions, marks, and time allocations per tier. Explicitly state the exact negative marking penalty per incorrect question.',
  },
  SYLLABUS: {
    key: 'SYLLABUS',
    displayName: 'Detailed Syllabus & Topic Weightage',
    purpose: 'In-depth subject-by-subject curriculum aligned with Courage Library canonical taxonomy, highlighting foundational concepts, expected questions, and depth.',
    isCycleSpecific: false,
    requiresSources: false,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['SUBJECTS_COUNT', 'CORE_MODULES'],
    freshnessRule: 'Annual sync with canonical academic taxonomy',
    outputGuidance: 'Map syllabus topics strictly to canonical subjects (Quantitative Aptitude, Reasoning, English, General Awareness). Highlight high-yield topics.',
  },
  SYLLABUS_OVERVIEW: {
    key: 'SYLLABUS_OVERVIEW',
    displayName: 'Syllabus Overview & Subject Breakdown',
    purpose: 'Executive overview of the full exam syllabus structure, tier-wise coverage, and pedagogical scope.',
    isCycleSpecific: false,
    requiresSources: false,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['SUBJECTS_COUNT'],
    freshnessRule: 'Annual sync with canonical academic taxonomy',
    outputGuidance: 'Provide concise breakdown of each subject and tier scope.',
  },
  POSTS: {
    key: 'POSTS',
    displayName: 'Posts, Ministries & Cadre Profiles',
    purpose: 'Catalog of all recruitment posts, participating ministries/departments, cadre classification (Group A, B Gazetted, B Non-Gazetted, C), and initial postings.',
    isCycleSpecific: false,
    requiresSources: true,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['TOTAL_POSTS_OFFERED', 'CADRE_GROUPS'],
    freshnessRule: 'Update when new cadres or departments are incorporated',
    outputGuidance: 'List all posts with exact department names, Group classification, and whether the post is Gazetted or Non-Gazetted.',
  },
  SALARY: {
    key: 'SALARY',
    displayName: 'Salary Structure, Pay Levels & In-Hand Pay',
    purpose: 'Comprehensive 7th CPC Pay Matrix analysis across Pay Levels (e.g. Level 4 to 8), Grade Pay, Basic Pay, DA, HRA (X, Y, Z cities), deductions (NPS, CGEGIS), and in-hand salary calculations.',
    isCycleSpecific: false,
    requiresSources: true,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['PAY_LEVEL_MIN', 'PAY_LEVEL_MAX', 'BASIC_PAY_RANGE'],
    freshnessRule: 'Biannual update following official Dearness Allowance (DA) revisions',
    outputGuidance: 'Break down salary by Pay Level 4 through 8, detail X/Y/Z city HRA percentages, show typical deductions, and provide realistic net in-hand salary ranges.',
  },
  POST_PREFERENCE_SALARY: {
    key: 'POST_PREFERENCE_SALARY',
    displayName: 'Post Preference, Pay Levels & Career Perks',
    purpose: 'Strategic guide for filling post preferences based on pay levels, desk vs field roles, home state posting probability, and career growth.',
    isCycleSpecific: false,
    requiresSources: true,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['PAY_LEVEL_MIN', 'PAY_LEVEL_MAX'],
    freshnessRule: 'Annual review before post preference window',
    outputGuidance: 'Provide objective factors for post selection (work-life balance, field powers, promotion speed, transfer policy).',
  },
  CAREER: {
    key: 'CAREER',
    displayName: 'Job Profiles & Career Progression',
    purpose: 'Detailed day-to-day job duties, organizational hierarchy, departmental examination rules, and long-term promotion ladders for top posts.',
    isCycleSpecific: false,
    requiresSources: false,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['CAREER_LADDER_STAGES'],
    freshnessRule: 'Periodic review against central civil services recruitment rules',
    outputGuidance: 'Detail career progression timeline for major posts (e.g. ASO -> SO -> Under Secretary -> Deputy Secretary).',
  },
  VACANCIES: {
    key: 'VACANCIES',
    displayName: 'Vacancy Breakdown & Reservation Matrix',
    purpose: 'Cycle-specific distribution of vacancies across posts, departments, and reservation categories (UR, EWS, OBC, SC, ST, ESM, PwBD).',
    isCycleSpecific: true,
    requiresSources: true,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['TOTAL_VACANCIES', 'UR_VACANCIES', 'OBC_VACANCIES', 'SC_VACANCIES', 'ST_VACANCIES', 'EWS_VACANCIES'],
    freshnessRule: 'Immediate update upon revised vacancy circulars issued by the commission',
    outputGuidance: 'Present exact official vacancy figures by category and post. Mark as TENTATIVE if final state-wise allocation is pending.',
  },
  CUTOFF: {
    key: 'CUTOFF',
    displayName: 'Cutoff Trends & Qualifying Benchmarks',
    purpose: 'Historical previous-year cutoff benchmarks, category-wise qualifying thresholds, post-wise final cutoffs, and normalized score trends.',
    isCycleSpecific: false,
    requiresSources: true,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['TIER1_CUTOFF_UR', 'TIER1_CUTOFF_OBC'],
    freshnessRule: 'Annual update upon release of tier results and cutoff write-ups',
    outputGuidance: 'Tabulate historical cutoffs over recent cycles. Explain normalization impact and sectional/tier qualifying score rules.',
  },
  CUTOFF_TRENDS: {
    key: 'CUTOFF_TRENDS',
    displayName: 'Historical Cutoff Trends & Analysis',
    purpose: 'Longitudinal cutoff trend analysis across previous cycles to assist candidate goal setting.',
    isCycleSpecific: false,
    requiresSources: true,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['TIER1_CUTOFF_UR'],
    freshnessRule: 'Annual update',
    outputGuidance: 'Analyze cutoff trajectory across years with context on vacancy numbers and paper difficulty.',
  },
  ADMIT_CARD: {
    key: 'ADMIT_CARD',
    displayName: 'Admit Card & Exam Day Protocol',
    purpose: 'Cycle-specific admit card download procedures, regional portal links, application status check dates, required photo IDs, and prohibited items.',
    isCycleSpecific: true,
    requiresSources: true,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['ADMIT_CARD_RELEASE_WINDOW'],
    freshnessRule: 'Active during cycle admit card release window',
    outputGuidance: 'List regional websites, mandatory documents (Original ID, Photographs), dress code, and strict exam hall protocols.',
  },
  RESULT: {
    key: 'RESULT',
    displayName: 'Result Declaration & Merit Ranking',
    purpose: 'Cycle-specific result notices, merit list PDF access, normalization method, marks release schedule, and post allocation process.',
    isCycleSpecific: true,
    requiresSources: true,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['RESULT_DATE_TIER1'],
    freshnessRule: 'Active upon result declaration',
    outputGuidance: 'Detail result check process, tie-breaking rules, final merit compilation formula, and document verification call letters.',
  },
  PREPARATION: {
    key: 'PREPARATION',
    displayName: 'Preparation Strategy & Study Protocol',
    purpose: 'Evidence-based study schedules, subject-wise time allocation, PYQ analysis, high-yield topic priorities, and mock test benchmarking protocol.',
    isCycleSpecific: false,
    requiresSources: false,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['RECOMMENDED_STUDY_HOURS', 'CORE_PHASES'],
    freshnessRule: 'Annual pedagogical review',
    outputGuidance: 'Provide structured study phases (Foundation -> Application -> Revision -> Mock Drills). Highlight cognitive error reduction and mistake analysis.',
  },
  PREPARATION_STRATEGY: {
    key: 'PREPARATION_STRATEGY',
    displayName: 'Subject-Wise Preparation & Study Protocol',
    purpose: 'Structured pedagogical roadmap and test strategy for mastering the exam.',
    isCycleSpecific: false,
    requiresSources: false,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['RECOMMENDED_STUDY_HOURS'],
    freshnessRule: 'Annual review',
    outputGuidance: 'Provide comprehensive, step-by-step guidance for each subject.',
  },
  FAQ: {
    key: 'FAQ',
    displayName: 'Frequently Asked Questions (Candidate Queries)',
    purpose: 'Official, authoritative answers to recurring candidate doubts regarding eligibility, exam pattern, language medium, reservation, and post postings.',
    isCycleSpecific: false,
    requiresSources: false,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['FAQ_COUNT'],
    freshnessRule: 'Continuous curation from candidate queries',
    outputGuidance: 'Structure as clear Question and Answer pairs addressing high-frequency candidate queries with official policy citations.',
  },
  NOTIFICATIONS: {
    key: 'NOTIFICATIONS',
    displayName: 'Official Notifications & Gazette Archives',
    purpose: 'Chronological repository of official commission notifications, corrigenda, exam calendar updates, and gazette orders.',
    isCycleSpecific: false,
    requiresSources: true,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['LATEST_NOTIFICATION_NUMBER'],
    freshnessRule: 'Continuous sync with commission circulars',
    outputGuidance: 'Catalog all official notices with direct official links, issuance dates, and summary of changes.',
  },
};

export class ExamModuleRegistry {
  /**
   * Retrieves definition for a module key.
   */
  static getModuleDefinition(key: ExamModuleKey): ExamModuleDefinition {
    const def = EXAM_MODULE_REGISTRY[key];
    if (!def) {
      return {
        key,
        displayName: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        purpose: 'Authoritative examination intelligence module.',
        isCycleSpecific: false,
        requiresSources: true,
        allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
        requiredClaimTypes: [],
        freshnessRule: 'Periodic review',
        outputGuidance: 'Provide accurate, evidence-backed exam information without speculation.',
      };
    }
    return def;
  }

  /**
   * Returns all canonical module definitions.
   */
  static getAllModuleDefinitions(): ExamModuleDefinition[] {
    return Object.values(EXAM_MODULE_REGISTRY);
  }

  /**
   * Returns all registered canonical module keys.
   */
  static getAllModuleKeys(): ExamModuleKey[] {
    return Object.keys(EXAM_MODULE_REGISTRY) as ExamModuleKey[];
  }

  /**
   * Converts a module key to URL slug.
   */
  static getModuleSlug(key: ExamModuleKey): string {
    return key.toLowerCase().replace(/_/g, '-');
  }

  /**
   * Resolves module key from URL slug.
   */
  static getModuleKeyFromSlug(slug: string): ExamModuleKey | null {
    if (!slug) return null;
    const normalized = slug.toUpperCase().replace(/-/g, '_') as ExamModuleKey;
    if (normalized in EXAM_MODULE_REGISTRY) {
      return normalized;
    }
    return null;
  }

  /**
   * Checks if a module is cycle specific.
   */
  static isCycleSpecific(key: ExamModuleKey): boolean {
    return this.getModuleDefinition(key).isCycleSpecific;
  }


  /**
   * Evaluates applicability of a module to an exam and optional cycle.
   */
  static evaluateApplicability(
    exam: { id: string; title: string; isActive: boolean },
    cycle: { id: string; cycleYear: number } | null | undefined,
    moduleKey: ExamModuleKey,
    sourcesCount: number,
    claimsCount: number
  ): ModuleApplicabilityReport {
    const def = this.getModuleDefinition(moduleKey);

    if (!exam.isActive) {
      return {
        status: 'NOT_APPLICABLE',
        reason: `Exam "${exam.title}" is currently inactive in the system.`,
        isApplicable: false,
        warnings: ['Exam is inactive.'],
      };
    }

    if (def.isCycleSpecific && !cycle) {
      return {
        status: 'REQUIRES_CYCLE',
        reason: `Module "${def.displayName}" is cycle-specific and requires an active or target Exam Cycle (e.g. 2026).`,
        isApplicable: false,
        warnings: ['Select an Exam Cycle to author cycle-specific dates, vacancies, or notifications.'],
      };
    }

    const warnings: string[] = [];
    if (def.requiresSources && sourcesCount === 0) {
      warnings.push(`Module "${def.displayName}" expects official source citations, but 0 verified sources are currently registered.`);
    }

    if (claimsCount === 0 && def.requiredClaimTypes.length > 0) {
      warnings.push(`No pre-existing structured claims found. AI assistant must reference official source documents.`);
    }

    return {
      status: 'APPLICABLE',
      reason: `Module "${def.displayName}" is applicable for ${exam.title}${cycle ? ` (Cycle ${cycle.cycleYear})` : ' (Timeless)'}.`,
      isApplicable: true,
      warnings,
    };
  }
}
