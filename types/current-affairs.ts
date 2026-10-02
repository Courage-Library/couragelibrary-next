/**
 * COURAGE LIBRARY — CURRENT AFFAIRS DOMAIN CONTRACTS & DTOS
 * Phase CA-2: Domain Services, Validation Gates & Import Boundary
 * Architecture Contract: Frozen v1.1.0
 */

export type CurrentAffairsCategory =
  | 'NATIONAL'
  | 'INTERNATIONAL'
  | 'ECONOMY'
  | 'DEFENCE'
  | 'SCIENCE_TECH'
  | 'ENVIRONMENT'
  | 'GOVT_SCHEMES'
  | 'SPORTS'
  | 'AWARDS_HONOURS'
  | 'PERSONS_IN_NEWS'
  | 'IMPORTANT_DAYS'
  | 'STATE_SPECIFIC';

export const ALL_CURRENT_AFFAIRS_CATEGORIES: CurrentAffairsCategory[] = [
  'NATIONAL',
  'INTERNATIONAL',
  'ECONOMY',
  'DEFENCE',
  'SCIENCE_TECH',
  'ENVIRONMENT',
  'GOVT_SCHEMES',
  'SPORTS',
  'AWARDS_HONOURS',
  'PERSONS_IN_NEWS',
  'IMPORTANT_DAYS',
  'STATE_SPECIFIC',
];

export type CurrentAffairsImportanceTier = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type CurrentAffairsStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'COMPILED'
  | 'PUBLISHED'
  | 'ARCHIVED';

export type CurrentAffairsSourceTier = 'TIER_1' | 'TIER_2' | 'TIER_3' | 'TIER_4';

export interface ProvenanceSourceInput {
  title: string;
  publisher: string;
  url: string;
  tier: CurrentAffairsSourceTier;
  citationContext?: string;
  retrievedAt?: string;
}

export interface TaxonomyMappingInput {
  taxonomyNodeId: string;
  isPrimary?: boolean;
  relevanceScore?: number;
}

export interface ExamMappingInput {
  examId: string;
  relevanceWeight?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  isHighYield?: boolean;
  displayPriority?: number;
}

export interface QuestionMappingInput {
  questionId: string;
  displayOrder?: number;
}

export interface LearningMappingInput {
  learningResourceId: string;
  displayOrder?: number;
}

/**
 * Authoritative Single Canonical Import Schema for External AI / Staff Drafts
 */
export interface CurrentAffairsImportPayload {
  // Identity & Master Event
  headline: string;
  slug?: string;
  newsDate: string; // YYYY-MM-DD
  category: CurrentAffairsCategory;
  importanceTier?: CurrentAffairsImportanceTier;

  // Content & Educational Body
  summaryMd: string;
  keyTakeaways: string[];
  importantFacts?: string[];
  examRelevanceNotes?: Record<string, { focus?: string; weight?: string }>;

  // Structured Provenance
  sources: ProvenanceSourceInput[];

  // Relational Mappings
  taxonomyMappings: TaxonomyMappingInput[];
  examMappings?: ExamMappingInput[];
  questionMappings?: QuestionMappingInput[];
  learningMappings?: LearningMappingInput[];
}

export interface GateValidationReport {
  gateId: 'GATE_1_SCHEMA' | 'GATE_2_SECURITY' | 'GATE_3_PROVENANCE' | 'GATE_4_TAXONOMY' | 'GATE_5_ANTI_DUPLICATE';
  gateName: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
  details?: Record<string, unknown>;
}

export interface ComprehensiveGateReport {
  passed: boolean;
  checksumSha256: string;
  normalizedPayload: CurrentAffairsImportPayload;
  gates: Record<string, GateValidationReport>;
  errors: string[];
  warnings: string[];
}

export interface CurrentAffairsFeedItem {
  id: string;
  slug: string;
  newsDate: string;
  category: CurrentAffairsCategory;
  importanceTier: CurrentAffairsImportanceTier;
  headline: string;
  summaryMd: string;
  keyTakeaways: string[];
  publishedAt: string | null;
  primaryTopicName?: string;
  sourcesCount: number;
  mappedQuestionsCount: number;
  mappedLearningUnitsCount: number;
}

export interface DailyCurrentAffairsFeed {
  date: string;
  totalArticles: number;
  articles: CurrentAffairsFeedItem[];
  hasDailyQuiz: boolean;
  dailyQuizMockId?: string | null;
}

export interface CurrentAffairsDetail {
  id: string;
  slug: string;
  newsDate: string;
  category: CurrentAffairsCategory;
  importanceTier: CurrentAffairsImportanceTier;
  status: CurrentAffairsStatus;
  publishedAt: string | null;
  versionNumber: number;
  headline: string;
  summaryMd: string;
  keyTakeaways: string[];
  importantFacts: string[];
  examRelevanceNotes: Record<string, { focus?: string; weight?: string }>;
  compiledAstJson: Record<string, unknown> | null;
  checksumSha256: string;
  sources: Array<{
    id: string;
    title: string;
    publisher: string;
    url: string;
    tier: CurrentAffairsSourceTier;
    citationContext?: string | null;
  }>;
  taxonomyMappings: Array<{
    taxonomyNodeId: string;
    nodeName: string;
    nodeSlug: string;
    isPrimary: boolean;
    relevanceScore: number;
  }>;
  examMappings: Array<{
    examId: string;
    examTitle: string;
    examSlug: string;
    relevanceWeight: string;
    isHighYield: boolean;
  }>;
  relatedLearningUnits: Array<{
    learningResourceId: string;
    title: string;
    slug: string;
  }>;
  relatedQuestions: Array<{
    questionId: string;
    questionText: string;
    displayOrder: number;
  }>;
  relatedArticles?: Array<{
    id: string;
    slug: string;
    headline: string;
    newsDate: string;
    category: CurrentAffairsCategory;
    importanceTier: CurrentAffairsImportanceTier;
  }>;
}

export interface CurrentAffairsHubData {
  todayDate: string;
  todayFeed: DailyCurrentAffairsFeed;
  recentArticles: CurrentAffairsFeedItem[];
  categoryCounts: Record<CurrentAffairsCategory, number>;
  dailyQuiz: {
    status: DailyQuizEligibilityStatus;
    totalEligibleCount: number;
    requiredCount: number;
    shortageCount: number;
    mockTestSlug: string;
    mockTestId?: string | null;
  };
}

export interface DraftCreationResult {
  success: boolean;
  articleId: string;
  versionId: string;
  versionNumber: number;
  slug: string;
  status: CurrentAffairsStatus;
  checksumSha256: string;
  gateReport: ComprehensiveGateReport;
  error?: string;
}

export interface AdminCurrentAffairsDashboardStats {
  total: number;
  draft: number;
  inReview: number;
  approved: number;
  compiled: number;
  published: number;
  archived: number;
  needsChanges: number;
}

export interface AdminCurrentAffairsListItem {
  id: string;
  slug: string;
  newsDate: string;
  category: CurrentAffairsCategory;
  importanceTier: CurrentAffairsImportanceTier;
  status: CurrentAffairsStatus;
  publishedAt: string | null;
  latestVersionNumber: number;
  latestVersionId: string;
  latestVersionStatus: CurrentAffairsStatus;
  headline: string;
  summaryPreview: string;
  updatedAt: string;
  examCount: number;
  sourceCount: number;
  reviewFeedback?: string | null;
}

export interface AdminCurrentAffairsListResponse {
  items: AdminCurrentAffairsListItem[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminCurrentAffairsVersionDetail {
  id: string;
  versionNumber: number;
  status: CurrentAffairsStatus;
  headline: string;
  summaryMd: string;
  keyTakeaways: string[];
  importantFacts: string[];
  examRelevanceNotes: Record<string, { focus?: string; weight?: string }>;
  compiledAstJson: Record<string, unknown> | null;
  checksumSha256: string;
  createdBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  sources: Array<{
    id: string;
    title: string;
    publisher: string;
    url: string;
    tier: CurrentAffairsSourceTier;
    citationContext?: string | null;
  }>;
}

export interface AdminCurrentAffairsFullArticle {
  id: string;
  slug: string;
  newsDate: string;
  category: CurrentAffairsCategory;
  importanceTier: CurrentAffairsImportanceTier;
  status: CurrentAffairsStatus;
  publishedVersionId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  versions: AdminCurrentAffairsVersionDetail[];
  activeVersion: AdminCurrentAffairsVersionDetail;
  taxonomyMappings: Array<{
    taxonomyNodeId: string;
    nodeName: string;
    nodeSlug: string;
    isPrimary: boolean;
    relevanceScore: number;
  }>;
  examMappings: Array<{
    examId: string;
    examTitle: string;
    examSlug: string;
    relevanceWeight: string;
    isHighYield: boolean;
  }>;
  learningMappings: Array<{
    learningResourceId: string;
    title: string;
    slug: string;
  }>;
  questionMappings: Array<{
    questionId: string;
    questionText: string;
    displayOrder: number;
  }>;
}

export interface VersionDiffResult {
  v1Number: number;
  v2Number: number;
  headlineChanged: boolean;
  headline: { from: string; to: string };
  summaryChanged: boolean;
  summary: { from: string; to: string };
  keyTakeawaysDiff: { added: string[]; removed: string[]; unchanged: string[] };
  importantFactsDiff: { added: string[]; removed: string[]; unchanged: string[] };
  sourcesDiff: {
    added: Array<{ title: string; url: string }>;
    removed: Array<{ title: string; url: string }>;
  };
}

// ============================================================================
// CA-4: QUESTION BANK INTEGRATION & DAILY CURRENT AFFAIRS QUIZ TYPES
// ============================================================================

export type DailyQuizEligibilityStatus =
  | 'READY'
  | 'SHORTAGE_BLOCKED'
  | 'ALREADY_PUBLISHED'
  | 'DRAFT_EXISTS';

export interface DailyQuizQuestionPreview {
  questionId: string;
  questionVersionId: string;
  questionText: string;
  optionsCount: number;
  correctOptionKey: string;
  articleId: string;
  articleHeadline: string;
  newsDate: string;
  category: CurrentAffairsCategory;
  isSameDay: boolean;
  displayOrder: number;
  topicName?: string | null;
  topicSlug?: string | null;
  learningResourceId?: string | null;
}

export interface DailyQuizEligibilityReport {
  date: string;
  weekStartDate: string;
  weekEndDate: string;
  status: DailyQuizEligibilityStatus;
  requiredCount: number;
  totalEligibleCount: number;
  sameDayCount: number;
  sameWeekCount: number;
  shortageCount: number;
  questions: DailyQuizQuestionPreview[];
  existingMockTestId?: string | null;
  existingMockStatus?: string | null;
}

export interface DailyQuizGenerationResult {
  success: boolean;
  mockTestId?: string;
  slug?: string;
  title?: string;
  totalQuestions?: number;
  status?: string;
  isExisting?: boolean;
  error?: string;
  shortageReport?: DailyQuizEligibilityReport;
}

// ============================================================================
// CA-7: EXTERNAL NEWS FEED ADAPTER DTOs & CONTRACTS
// ============================================================================

export interface ExternalNewsFeedItem {
  id?: string;
  title: string;
  summary: string[];
  image?: string;
  link: string;
  primaryCategory: string;
  secondaryCategories?: string[];
  importance?: number;
  examTags?: string[];
  source: string;
  feedName?: string;
  date: string;
}

export interface FeedAdapterTransformResult {
  success: boolean;
  payload?: CurrentAffairsImportPayload;
  externalId?: string;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// CA-7.4 & CA-7.5: CONTROLLED PRODUCTION SYNCHRONIZATION & OPERATIONAL RESILIENCE
// ============================================================================

export type ProductionSyncErrorCategory =
  | 'TRANSIENT'
  | 'PERMANENT_VALIDATION'
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'DATABASE'
  | 'CONFIGURATION'
  | 'SOURCE_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'SYSTEMIC'
  | 'DUPLICATE';

export type ProductionSyncRunStatus =
  | 'STARTED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIAL_FAILURE'
  | 'FAILED'
  | 'ABORTED'
  | 'STALE';

export type ProductionSyncArticleOutcome =
  | 'DRAFT_CREATED'
  | 'DUPLICATE_SKIPPED'
  | 'VALIDATION_REJECTED'
  | 'FAILED'
  | 'SKIPPED';

export type ProductionSyncAuditEvent =
  | 'SYNC_STARTED'
  | 'SYNC_COMPLETED'
  | 'SYNC_PARTIAL_FAILURE'
  | 'SYNC_FAILED'
  | 'ARTICLE_IMPORTED'
  | 'ARTICLE_DUPLICATE'
  | 'ARTICLE_REJECTED'
  | 'ARTICLE_RETRY'
  | 'ARTICLE_FAILED'
  | 'SYSTEMIC_ABORT';

export interface ProductionSyncAuditLog {
  eventId: string;
  runId: string;
  event: ProductionSyncAuditEvent;
  timestamp: string;
  articleId?: string;
  externalId?: string;
  headline?: string;
  outcome?: ProductionSyncArticleOutcome;
  errorCategory?: ProductionSyncErrorCategory;
  message?: string;
  details?: Record<string, unknown>;
}

export interface ProductionSyncMetrics {
  runsStarted: number;
  runsCompleted: number;
  runsPartialFailure: number;
  runsFailed: number;
  runsAborted: number;
  inspectedCount: number;
  importedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  failedCount: number;
  retryCount: number;
  recoveredCount: number;
  gate1Failures: number;
  gate2Failures: number;
  gate3Failures: number;
  gate4Failures: number;
  gate5Duplicates: number;
  authFailures: number;
  dbFailures: number;
  rateLimits: number;
  timeouts: number;
}

export interface ProductionSyncHealthStatus {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  database: 'CONNECTED' | 'UNREACHABLE' | 'DEGRADED';
  ingestionGateway: 'AVAILABLE' | 'UNAVAILABLE';
  validationEngine: 'OPERATIONAL' | 'FAILED';
  targetEnvironment: string;
  timestamp: string;
  recentSyncSummary?: {
    lastRunId?: string;
    lastRunStatus?: ProductionSyncRunStatus;
    lastRunTime?: string;
    lastRunImported?: number;
    lastRunDurationMs?: number;
  };
}

export interface ProductionSyncOptions {
  dryRun?: boolean;
  maxArticles?: number; // Bounded to <= 5
  concurrency?: number; // Bounded to 1
  authorUserId?: string | null;
  taxonomyNodeMap?: Record<string, string>;
  examIdMap?: Record<string, string>;
  defaultTaxonomyNodeId?: string;
  systemicFailureThreshold?: number; // Max consecutive systemic failures before abort (default: 3)
  simulateAmbiguousTimeout?: boolean; // Testing fixture hook
  isHistoricalMigration?: boolean;
  maxBatchCap?: number;
}

export interface ProductionSyncArticleResult {
  externalId?: string;
  sourcePath?: string;
  headline: string;
  source: string;
  date: string;
  category: string;
  normalizedCategory?: CurrentAffairsCategory;
  outcome: ProductionSyncArticleOutcome;
  errorCategory?: ProductionSyncErrorCategory;
  error?: string;
  checksumSha256?: string;
  createdArticleId?: string;
  createdVersionId?: string;
  retryAttempts?: number;
  isRecovered?: boolean;
  gateReport?: ComprehensiveGateReport;
}

export interface ProductionSyncReport {
  runId: string;
  status: ProductionSyncRunStatus;
  startTime: string;
  endTime: string;
  durationMs: number;
  dryRun: boolean;
  requestedLimit: number;
  concurrency: number;
  targetEnvironment: {
    isIdentified: boolean;
    provider: string;
    databaseName: string;
    sslEnabled: boolean;
  };
  inspectedCount: number;
  importedDraftCount: number;
  duplicateCount: number;
  rejectedCount: number;
  failedCount: number;
  publishedCount: number;
  candidateVisibleCount: number;
  metrics: ProductionSyncMetrics;
  auditLogs: ProductionSyncAuditLog[];
  results: ProductionSyncArticleResult[];
}

// ============================================================================
// CA-7.6: HISTORICAL CURRENT AFFAIRS MIGRATION DTOs
// ============================================================================

export interface HistoricalMigrationInventory {
  totalArticles: number;
  earliestDate: string;
  latestDate: string;
  byYear: Record<string, number>;
  byMonth: Record<string, number>;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  byExam: Record<string, number>;
  validHttpsCount: number;
  missingSourceCount: number;
  missingDateCount: number;
  missingSummaryCount: number;
  unknownCategoryCount: number;
  duplicateHeadlineCount: number;
  sourceTierDistribution: {
    TIER_1: number;
    TIER_2: number;
    TIER_3: number;
    TIER_4: number;
  };
  assessmentVerdict:
    | 'APPROVED_FOR_BOUNDED_MIGRATION'
    | 'NO_MIGRATION_REQUIRED'
    | 'REQUIRES_PRODUCT_DECISION';
  justification: string;
}

export interface HistoricalMigrationOptions {
  fromDate?: string; // YYYY-MM-DD
  toDate?: string; // YYYY-MM-DD
  maxArticlesPerBatch?: number; // Default: 25, bounded
  dryRun?: boolean; // Default: true for safety
  authorUserId?: string | null;
  taxonomyNodeMap?: Record<string, string>;
  examIdMap?: Record<string, string>;
  defaultTaxonomyNodeId?: string;
}

export interface HistoricalMigrationReport {
  migrationRunId: string;
  timestamp: string;
  dryRun: boolean;
  dateWindow: {
    from: string;
    to: string;
  };
  totalCorpusSize: number;
  eligibleCount: number;
  importedDraftCount: number;
  duplicateCount: number;
  rejectedCount: number;
  failedCount: number;
  publishedCount: 0; // Strictly 0
  candidateVisibleCount: 0; // Strictly 0
  batchesProcessed: number;
  batchReports: ProductionSyncReport[];
  durationMs: number;
  inventory: HistoricalMigrationInventory;
}




