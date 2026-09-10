/**
 * Courage Library — Phase 5: Live Test Infrastructure Type Definitions
 * Phases 5A, 5B, 5C
 */

import { ActiveAttemptSession, ActiveTestQuestion } from "@/services/assessment.service";

export type LiveEventStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'READY'
  | 'LIVE'
  | 'GRACE_PERIOD'
  | 'PROCESSING'
  | 'RESULTS_READY'
  | 'PUBLISHED'
  | 'ARCHIVED'
  | 'CANCELLED';

export type LiveRegistrationStatus = 'REGISTERED' | 'ATTENDED' | 'CANCELLED';

export type LiveInstanceStatus = 'FROZEN' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

export interface LiveTestEvent {
  id: string;
  exam_id: string;
  mock_test_id: string;
  title: string;
  slug: string;
  description: string | null;
  banner_url: string | null;
  status: LiveEventStatus;
  registration_start_at: string;
  registration_end_at: string;
  event_start_at: string;
  event_end_at: string;
  late_join_cutoff_minutes: number;
  grace_period_seconds: number;
  result_publish_at: string | null;
  duration_minutes: number;
  max_participants: number | null;
  is_premium_only: boolean;
  cl_coin_entry_fee: number;
  cl_coin_reward_pool: number;
  current_registered_count: number;
  current_started_count: number;
  current_submitted_count: number;
  created_at: string;
  updated_at: string;
}

export interface LiveTestRegistration {
  id: string;
  live_test_event_id: string;
  user_id: string;
  registered_at: string;
  status: LiveRegistrationStatus;
  created_at: string;
  updated_at: string;
}

export interface LiveTestQuestionSnapshot {
  mock_question_id: string;
  question_version_id: string;
  section_id: string;
  sequence_order: number;
  marks: number;
  negative_marks: number;
}

export interface LiveTestSectionSnapshot {
  section_id: string;
  name: string;
  sequence_order: number;
  total_questions: number;
  total_marks: number;
}

export interface LiveTestInstance {
  id: string;
  live_test_event_id: string;
  mock_test_id: string;
  frozen_paper_hash: string;
  total_questions: number;
  total_marks: number;
  duration_minutes: number;
  question_snapshots: LiveTestQuestionSnapshot[];
  section_snapshots: LiveTestSectionSnapshot[];
  status: LiveInstanceStatus;
  frozen_at: string;
  created_at: string;
  updated_at: string;
}

export interface LiveTestAuditLog {
  id: string;
  live_test_event_id: string | null;
  action: string;
  actor_id: string;
  old_state: Record<string, any> | null;
  new_state: Record<string, any> | null;
  reason: string;
  created_at: string;
}

export interface CreateLiveEventDTO {
  exam_id: string;
  mock_test_id: string;
  title: string;
  slug: string;
  description?: string;
  banner_url?: string;
  registration_start_at: string;
  registration_end_at: string;
  event_start_at: string;
  event_end_at: string;
  late_join_cutoff_minutes?: number;
  grace_period_seconds?: number;
  result_publish_at?: string;
  duration_minutes: number;
  max_participants?: number;
  is_premium_only?: boolean;
  cl_coin_entry_fee?: number;
  cl_coin_reward_pool?: number;
}

// ============================================================================
// PHASE 5C: LIVE TEST RUNNER TYPES
// ============================================================================

export interface ActiveLiveTestSession extends ActiveAttemptSession {
  isLive: true;
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  eventStartAt: string;
  eventEndAt: string;
  effectiveEndAt: string;
  gracePeriodSeconds: number;
  isLateJoined: boolean;
  paperHash: string;
}

export interface LiveAnswerPayload {
  attemptId: string;
  mockQuestionId: string;
  questionVersionId: string;
  selectedOption: string | null;
  isMarkedForReview: boolean;
  timeSpentSeconds: number;
  clientSequence: number;
}

export interface LiveAnswerSaveResult {
  success: boolean;
  syncedAt?: string;
  clientSequence?: number;
  autoSubmitted?: boolean;
  code?: string;
  error?: string;
}

export interface LiveTestSubmitResult {
  success: boolean;
  alreadySubmitted?: boolean;
  submittedAt?: string;
  timeTakenSeconds?: number;
  status?: string;
  message?: string;
  error?: string;
}

// ============================================================================
// PHASE 5D: RESULT ENGINE & NATIONAL RANKING TYPES
// ============================================================================

export interface LiveTestRankingSnapshot {
  id: string;
  live_test_event_id: string;
  snapshot_version: number;
  total_participants: number;
  highest_score: number;
  average_score: number;
  lowest_score: number;
  is_finalized: boolean;
  is_active: boolean;
  computed_at: string;
  created_at: string;
}

export interface LiveTestLeaderboardEntry {
  id: string;
  snapshot_id: string;
  live_test_event_id: string;
  user_id: string;
  attempt_id: string;
  rank: number;
  dense_rank: number;
  percentile: number;
  total_score: number;
  max_score: number;
  accuracy_percentage: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  time_spent_seconds: number;
  is_public: boolean;
  userName?: string;
  userAvatar?: string | null;
  maskedName?: string;
  isCurrentUser?: boolean;
  created_at: string;
}

export interface LiveTestEvaluationResult {
  success: boolean;
  eventId?: string;
  status?: string;
  snapshotId?: string;
  snapshotVersion?: number;
  evaluatedCount?: number;
  highestScore?: number;
  averageScore?: number;
  code?: string;
  message?: string;
  error?: string;
}

export interface LiveTestPublicationResult {
  success: boolean;
  eventId?: string;
  status?: string;
  activeSnapshotVersion?: number;
  snapshotId?: string;
  totalParticipants?: number;
  code?: string;
  message?: string;
  error?: string;
}

export interface LiveTestCandidateScorecard {
  isPublished: boolean;
  statusMessage: string;
  resultPublishAt: string | null;
  event: {
    id: string;
    title: string;
    slug: string;
    status: LiveEventStatus;
    totalQuestions: number;
    totalMarks: number;
    durationMinutes: number;
  };
  scorecard?: {
    attemptId: string;
    totalScore: number;
    maxScore: number;
    accuracyPercentage: number;
    correctCount: number;
    incorrectCount: number;
    unansweredCount: number;
    timeSpentSeconds: number;
    rank: number;
    percentile: number;
    rankedCandidates: number;
    submittedAt: string;
  };
  reward?: {
    completionCoins: number;
    rankCoins: number;
    totalCoins: number;
    rewardTier: string | null;
    status: string | null;
  };
  certificate?: {
    id: string;
    certificateNumber: string;
    verificationCode: string;
    certificateType: LiveCertificateType;
    status: LiveCertificateStatus;
    issuedAt: string;
  } | null;
  achievements?: LiveAchievementAward[];
  sections?: Array<{
    id: string;
    sectionName: string;
    totalQuestions: number;
    attemptedCount: number;
    correctCount: number;
    incorrectCount: number;
    unansweredCount: number;
    sectionScore: number;
    maxSectionScore: number;
    accuracyPercentage: number;
    timeSpentSeconds?: number;
  }>;
  reviewQuestions?: Array<{
    mockQuestionId: string;
    questionOrder: number;
    sectionName: string;
    questionText: string;
    questionImageUrl: string | null;
    optionsType: string;
    options: Array<{
      key: string;
      text: string;
      imageUrl: string | null;
    }>;
    selectedOption: string | null;
    correctOption: string;
    isCorrect: boolean;
  marksAwarded: number;
    explanation: string | null;
    topicName: string | null;
    timeSpentSeconds?: number;
  }>;
    securityWatermark?: {
    maskedId: string;
    attemptIdShort: string;
    timestamp: string;
  };
}

// ============================================================================
// PHASE 5E.1: REWARDS & CL SETTLEMENT TYPES
// ============================================================================

export type LiveRewardSettlementStatus =
  | "SETTLED"
  | "TOPPED_UP"
  | "PROTECTED_DROP"
  | "VOIDED"
  | "NO_REWARD"
  | "UNCHANGED";

export interface LiveTestRewardPolicy {
  id: string;
  live_test_event_id: string | null;
  policy_code: string;
  tier_name: string;
  min_rank: number | null;
  max_rank: number | null;
  min_percentile: number | null;
  max_percentile: number | null;
  coin_reward: number;
  policy_version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LiveTestRewardSettlement {
  id: string;
  live_test_event_id: string;
  snapshot_id: string;
  user_id: string;
  attempt_id?: string | null;
  reward_tier: string;
  coins_awarded: number;
  settlement_version: number;
  settlement_status: LiveRewardSettlementStatus;
  ledger_id?: string | null;
  idempotency_key: string;
  metadata: Record<string, any>;
  settled_at: string;
  created_at: string;
}

export interface LiveTestRewardDistributionResult {
  success: boolean;
  eventId?: string;
  snapshotId?: string;
  snapshotVersion?: number;
  processedCount?: number;
  settledCount?: number;
  topupCount?: number;
  protectedCount?: number;
  unchangedCount?: number;
  skippedCount?: number;
  totalCoinsDistributed?: number;
  executionMs?: number;
  error?: string;
}

export interface CandidateEventRewardSummary {
  eventId: string;
  userId: string;
  completionCoins: number;
  rankCoins: number;
  totalCoinsEarned: number;
  latestSettlementStatus: LiveRewardSettlementStatus | null;
  rewardTier: string | null;
  rank: number | null;
  percentile: number | null;
  isSettled: boolean;
  settlements: LiveTestRewardSettlement[];
}

// ============================================================================
// PHASE 5E.2: CERTIFICATES & SECURE VERIFICATION TYPES
// ============================================================================

export type LiveCertificateType =
  | "PARTICIPATION"
  | "COMPLETION"
  | "MERIT"
  | "PODIUM";

export type LiveCertificateStatus =
  | "ELIGIBLE"
  | "ISSUED"
  | "REVOKED"
  | "SUPERSEDED";

export interface LiveTestCertificatePolicy {
  id: string;
  live_test_event_id: string | null;
  policy_code: string;
  certificate_type: LiveCertificateType;
  min_rank: number | null;
  max_rank: number | null;
  min_percentile: number | null;
  max_percentile: number | null;
  min_score_percentage: number | null;
  title_template: string;
  subtitle_template: string;
  badge_code?: string | null;
  priority: number;
  policy_version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LiveTestCertificate {
  id: string;
  live_test_event_id: string;
  snapshot_id: string;
  policy_id: string;
  user_id: string;
  attempt_id?: string | null;
  certificate_number: string;
  verification_code: string;
  certificate_type: LiveCertificateType;
  candidate_display_name: string;
  event_title: string;
  final_score: number;
  max_score: number;
  final_rank?: number | null;
  final_percentile?: number | null;
  total_participants: number;
  status: LiveCertificateStatus;
  reissue_version: number;
  superseded_by_id?: string | null;
  revocation_reason?: string | null;
  revoked_at?: string | null;
  revoked_by?: string | null;
  signature_key_id: string;
  cryptographic_signature: string;
  canonical_payload_hash: string;
  template_version: string;
  issued_at: string;
  created_at: string;
  updated_at: string;
}

export interface LiveTestCertificatePublicVerification {
  valid: boolean;
  status: LiveCertificateStatus | "NOT_FOUND";
  certificate_number?: string;
  verification_code?: string;
  certificate_type?: LiveCertificateType;
  candidate_display_name?: string;
  event_title?: string;
  event_date?: string;
  score?: number;
  max_score?: number;
  rank?: number | null;
  percentile?: number | null;
  total_participants?: number;
  issued_at?: string;
  authenticity_seal?: string;
  superseded_notice?: string;
  replacement_certificate_number?: string;
  replacement_verification_code?: string;
  revocation_reason?: string;
  revoked_at?: string;
  error?: string;
}

export interface LiveTestCertificateGenerationResult {
  success: boolean;
  eventId?: string;
  snapshotId?: string;
  generatedCount?: number;
  supersededCount?: number;
  skippedCount?: number;
  error?: string;
}

// ============================================================================
// PHASE 5E.3: ACHIEVEMENTS & BADGES ENGINE TYPES
// ============================================================================

export type LiveAchievementCategory =
  | "MILESTONE"
  | "NATIONAL"
  | "PODIUM"
  | "PERSONAL_BEST"
  | "IMPROVEMENT"
  | "CONSISTENCY";

export type LiveAchievementConditionType =
  | "COMPLETION_COUNT"
  | "RANK_THRESHOLD"
  | "PERCENTILE_THRESHOLD"
  | "PERSONAL_BEST"
  | "IMPROVEMENT"
  | "CONSECUTIVE_COMPLETIONS";

export type LiveAchievementScope = "GLOBAL" | "EXAM" | "EVENT";

export type LiveAchievementAwardStatus = "AWARDED" | "SUPERSEDED" | "REVOKED";

export interface LiveAchievementDefinition {
  id: string;
  badge_code: string;
  category: LiveAchievementCategory;
  condition_type: LiveAchievementConditionType;
  condition_config: Record<string, any>;
  is_repeatable: boolean;
  scope: LiveAchievementScope;
  priority: number;
  policy_version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Join fields
  badge_title?: string;
  badge_description?: string;
  badge_tier?: string;
  badge_icon?: string;
}

export interface LiveAchievementAward {
  id: string;
  user_id: string;
  badge_code: string;
  definition_id: string;
  live_test_event_id?: string | null;
  snapshot_id?: string | null;
  attempt_id?: string | null;
  evidence_json: Record<string, any>;
  achieved_rank?: number | null;
  achieved_percentile?: number | null;
  achieved_score?: number | null;
  status: LiveAchievementAwardStatus;
  superseded_by_id?: string | null;
  revocation_reason?: string | null;
  revoked_at?: string | null;
  revoked_by?: string | null;
  idempotency_key: string;
  awarded_at: string;
  created_at: string;
  updated_at: string;
  // Join fields
  badge_title?: string;
  badge_description?: string;
  badge_tier?: string;
  badge_icon?: string;
  event_title?: string;
}

export interface CandidateAchievementSummary {
  userId: string;
  totalBadgesEarned: number;
  totalAwardsCount: number;
  podiumCount: number;
  nationalMeritCount: number;
  personalBestCount: number;
  consistencyStreakCount: number;
  milestoneCount: number;
  recentAwards: LiveAchievementAward[];
  ownedBadges: {
    badgeId: string;
    code: string;
    title: string;
    description: string;
    category: string;
    tier: string;
    iconUrl: string | null;
    earnedAt: string;
    awardOccurrencesCount: number;
  }[];
}

export interface LiveTestAchievementEvaluationResult {
  success: boolean;
  eventId?: string;
  snapshotId?: string;
  evaluatedCandidates?: number;
  newAwardsCount?: number;
  supersededAwardsCount?: number;
  executionMs?: number;
  error?: string;
}

export interface LiveTestAchievementRevokeResult {
  success: boolean;
  awardId?: string;
  badgeCode?: string;
  userId?: string;
  status?: string;
  badgeRemovedFromUserCollection?: boolean;
  error?: string;
}

export interface LiveEventCardData {
  id: string;
  title: string;
  slug: string;
  examTitle: string;
  description: string | null;
  bannerUrl: string | null;
  status: string;
  durationMinutes: number;
  totalQuestions: number;
  totalMarks: number;
  registrationStartAt: string;
  registrationEndAt: string;
  eventStartAt: string;
  eventEndAt: string;
  resultPublishAt: string | null;
  formattedStartAt: string;
  formattedEndAt: string;
  formattedRegEndAt: string;
  isPremiumOnly: boolean;
  maxParticipants: number | null;
  registeredCount: number;
  isRegistered: boolean;
  registrationStatus: string | null;
  timeRemainingSeconds: number;
  canRegister: boolean;
}


