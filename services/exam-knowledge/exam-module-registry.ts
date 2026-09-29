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
    researchDirectives: [
      'Investigate the official statutory mandate, governing acts, and administrative structure of the conducting authority.',
      'Trace historical evolution, recruitment scope, participating departments/cadres, and national/state jurisdiction.',
      'Outline high-level recruitment stages, tier progression, and overall career entry points without duplicating detailed sub-modules.',
      'Locate and verify the primary official portal URL, official recruitment notification archives, and helpdesk endpoints.',
    ],
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
    researchDirectives: [
      'Research official gazette notifications, recruitment advertisements, and commission calendars for the active cycle.',
      'Verify exact start and cutoff dates/times for online registration, fee payment, and application correction windows.',
      'Cross-check tentative vs. confirmed dates for Tier/Stage examinations, admit card availability, and result schedules.',
      'Track all official corrigenda, addenda, or postponement notices issued by the commission to ensure timeline freshness.',
    ],
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
    researchDirectives: [
      'Identify statutory nationality, citizenship, and domicile requirements specified in official recruitment rules.',
      'Determine baseline and post-specific educational qualifications, required degrees/disciplines, and recognition standards.',
      'Verify crucial cutoff reference dates for age and educational qualification attainment for the target cycle.',
      'Research permissible category relaxations (OBC, SC, ST, EWS, PwBD, Ex-Servicemen, departmental candidates) and proof certificate norms.',
    ],
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
    researchDirectives: [
      'Determine exact post-wise minimum and maximum age brackets defined in the official notification.',
      'Identify the crucial reference cutoff date used to calculate candidate age for the specific cycle.',
      'Detail statutory age relaxations across all reserved categories, widows/divorced women, departmental candidates, and defense personnel.',
      'Highlight post-specific age variations (e.g. specialized enforcement or technical cadres with distinct age ceilings).',
    ],
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
    researchDirectives: [
      'Detail essential and desirable educational qualifications for all advertised posts.',
      'Clarify candidate eligibility for final-year / appearing students, including the mandatory documentary proof cutoff date.',
      'Verify professional, technical, or licensing prerequisites (e.g., typing speed, computer proficiency certifications, driver licenses).',
      'Document rules governing degree equivalence, distance education recognition, and university accreditation.',
    ],
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
    researchDirectives: [
      'Identify specific uniformed, enforcement, or field posts that enforce mandatory physical criteria.',
      'Document exact physical measurement requirements (height, chest expansion, weight) separately for male and female candidates.',
      'Detail Physical Endurance Test (PET) / Physical Standard Test (PST) events, passing benchmarks, and qualifying protocols.',
      'State official medical fitness standards (visual acuity, color blindness restrictions, hearing, physical deformity exclusions).',
    ],
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
    researchDirectives: [
      'Document step-by-step instructions for One-Time Registration (OTR) and online application submission on the official portal.',
      'Detail strict photograph (live capture/dimensions), signature, and document upload technical specifications.',
      'Research application fee structure across categories, fee exemptions, payment gateways, and offline payment options if any.',
      'Outline application correction window rules, editable fields, correction fee schedule, and rejection grounds.',
    ],
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
    researchDirectives: [
      'Map complete sequential recruitment progression across all qualifying and merit-ranking stages.',
      'Clarify which tiers/stages contribute to final merit ranking versus those that are qualifying/screening in nature.',
      'Document minimum qualifying marks per category in each stage, normalization formulas, and tie-breaking algorithms.',
      'Detail Document Verification (DV), medical evaluation, and final post-allocation/cadre allocation protocols.',
    ],
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
    researchDirectives: [
      'Research tier-by-tier and paper-by-paper structure, test mode (CBT, OMR, Descriptive), and session timings.',
      'Tabulate sections/subjects, question counts, maximum marks, and duration including compensatory scribe time.',
      'Explicitly detail the exact negative marking penalty per incorrect answer, unattempted question scoring, and sectional timing/cutoffs.',
      'Specify bilingual/multilingual medium options and language restrictions for specific papers.',
    ],
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
    researchDirectives: [
      'Map official curriculum topics strictly to Courage canonical subject and topic taxonomy.',
      'Research comprehensive topic boundaries for each subject, delineating standard depth vs advanced subtopics.',
      'Highlight high-yield topics, recurring core concepts, and distribution of theoretical vs computational questions.',
      'Delineate differences in syllabus scope between preliminary/Tier 1 and advanced/Tier 2 stages where applicable.',
    ],
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
    researchDirectives: [
      'Provide an executive structural synthesis of the overall curriculum across all examination stages.',
      'Summarize subject-wise weightage, pedagogical scope, and core competencies evaluated by the commission.',
      'Guide candidates on the interdisciplinary balance between quantitative, analytical, linguistic, and domain knowledge.',
    ],
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
    researchDirectives: [
      'Catalog all participating ministries, government departments, and statutory bodies offering vacancies in the examination.',
      'Document cadre classifications (Group A, Group B Gazetted, Group B Non-Gazetted, Group C) and post descriptions.',
      'Outline nature of duties (policy administration, desk analysis, field investigation, technical operations).',
      'Note initial posting locations, regional cadre allocations, and transfer liability conditions.',
    ],
  },
  SALARY: {
    key: 'SALARY',
    displayName: 'Salary Structure, Pay Levels & In-Hand Pay',
    purpose: 'Comprehensive compensation analysis covering the applicable official pay framework, basic pay scale or pay level, allowances, deductions, and net in-hand salary calculations across recruitment posts.',
    isCycleSpecific: false,
    requiresSources: true,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['PAY_LEVEL_MIN', 'PAY_LEVEL_MAX', 'BASIC_PAY_RANGE'],
    freshnessRule: 'Periodic update following official allowance and pay framework revisions',
    outputGuidance: 'Research and break down compensation by the applicable pay framework or pay bands, detail relevant allowances, describe typical statutory deductions, and provide realistic net in-hand salary ranges based on authoritative sources.',
    researchDirectives: [
      'Research the official compensation and pay structure applicable to the target organization, recruitment, post, and cycle.',
      'Identify the governing pay framework, basic pay scale / pay level, Grade Pay, or pay band from authoritative sources.',
      'Detail statutory allowances (such as housing, dearness/cost-of-living, transport where applicable) and location-specific provisions.',
      'Itemize standard statutory deductions (pension/provident fund, insurance, tax) to present realistic gross and net in-hand salary calculations.',
    ],
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
    researchDirectives: [
      'Analyze strategic trade-offs among posts considering compensation levels, desk vs field powers, and promotional avenues.',
      'Evaluate home-state posting probabilities, cadre control authorities, and transfer flexibility for candidate decision-making.',
      'Detail post-specific perks, allowances, uniform/risk allowances, and career growth trajectories.',
    ],
  },
  CAREER: {
    key: 'CAREER',
    displayName: 'Job Profiles & Career Progression',
    purpose: 'Detailed day-to-day job duties, organizational hierarchy, departmental examination rules, and long-term promotion ladders for top posts.',
    isCycleSpecific: false,
    requiresSources: false,
    allowedSectionTypes: ['SUMMARY', 'DETAILED_GUIDE', 'IMPORTANT_INSTRUCTIONS', 'FAQS'],
    requiredClaimTypes: ['CAREER_LADDER_STAGES'],
    freshnessRule: 'Periodic review against civil services recruitment and service rules',
    outputGuidance: 'Detail career progression timeline for major posts from entry cadre to senior supervisory and administrative grades.',
    researchDirectives: [
      'Outline career progression ladders, departmental promotion exams, and time-bound promotion policies for major posts.',
      'Map hierarchy from entry-level cadres through gazetted ranks, supervisory levels, and executive/administrative grades.',
      'Detail deputation opportunities to investigative agencies, foreign postings, or premier central/state organizations.',
    ],
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
    researchDirectives: [
      'Research the official cycle vacancy notification and all subsequent revised/corrigendum vacancy distribution notices.',
      'Tabulate post-wise and department-wise vacancy counts segregated by vertical reservation categories (UR, EWS, OBC, SC, ST).',
      'Detail horizontal reservation quotas (PwBD sub-categories, Ex-Servicemen, Meritorious Sports Persons) where officially declared.',
      'Explicitly distinguish between tentative vacancy estimates and finalized state-wise/zone-wise allocations.',
    ],
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
    researchDirectives: [
      'Compile previous-year official cutoff marks across tiers, stages, and categories from official result write-ups.',
      'Tabulate normalized vs raw score cutoffs where commission normalization applies.',
      'Explain factors influencing cutoff fluctuations (vacancy volume, applicant density, difficulty index).',
      'Document sectional cutoffs, module qualifying benchmarks, and final merit closing scores.',
    ],
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
    researchDirectives: [
      'Perform longitudinal cutoff analysis over multi-year cycles to establish historical benchmark ranges.',
      'Correlate cutoff shifts with structural changes in exam pattern, vacancy totals, and applicant turnout.',
      'Provide data-driven score targeting benchmarks for prospective candidates across reservation categories.',
    ],
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
    researchDirectives: [
      'Detail official release schedule, regional commission download portals, and application status check links.',
      'Document step-by-step download procedure using registration credentials and date of birth.',
      'List mandatory documents required at the exam venue (printed admit card, original valid photo ID proofs, photographs).',
      'Specify strict exam hall protocols, reporting windows, biometric registration, dress code, and prohibited electronic items.',
    ],
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
    researchDirectives: [
      'Detail result declaration timeline, official merit list PDF publications, and individual scorecard/marks download processes.',
      'Explain the commission score normalization formula and percentile ranking methodology.',
      'Document tie-breaking criteria applied when two or more candidates obtain identical aggregate marks.',
      'Outline post-result stages including answer key objection windows, final answer keys, and document verification schedules.',
    ],
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
    researchDirectives: [
      'Formulate evidence-based study schedules and phase-wise preparation roadmaps (Foundation -> Practice -> Mock Drills -> Revision).',
      'Provide subject-wise daily/weekly time allocation models tailored to full-time aspirants vs working professionals.',
      'Emphasize authentic Previous Year Questions (PYQ) analysis, high-yield topic prioritization, and speed-accuracy optimization.',
      'Detail mock test simulation strategies, error log maintenance, mistake analysis, and score plateau overcoming techniques.',
    ],
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
    researchDirectives: [
      'Provide deep pedagogical masterplans for each examination subject and section.',
      'Recommend standard authoritative reference literature, statutory sources, and analytical practice frameworks.',
      'Formulate revision cycles, spaced repetition methods, and formula/concept retention protocols.',
    ],
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
    researchDirectives: [
      'Curate high-frequency, authentic candidate inquiries spanning eligibility ambiguities, certificate validity, and exam protocols.',
      'Formulate unambiguous, policy-backed answers citing official notification paragraphs and commission rules.',
      'Address edge cases (e.g. surname changes, CGPA to percentage conversion, reserved certificate validity norms).',
    ],
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
    researchDirectives: [
      'Chronologically catalog all official recruitment advertisements, notices, corrigenda, and gazette orders for the exam.',
      'Provide direct, verified official source URLs and publication dates for each regulatory notice.',
      'Summarize key amendments, date extensions, vacancy revisions, or rule adjustments introduced in each notification.',
    ],
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
