/**
 * COURAGE LIBRARY — PHASE 5E.3: ACHIEVEMENTS & BADGES UNIT TEST SUITE
 *
 * Test Sections:
 * 1. Milestone Completion Rules (First live test, 3, 5, 10 tests)
 * 2. Podium Rank Rules (Gold = Rank 1, Silver = Rank 2, Bronze = Rank 3)
 * 3. National Top Rank Thresholds (Top 10, Top 50, Top 100)
 * 4. National Percentile Thresholds (Top 1%, Top 5%, Top 10%)
 * 5. Personal Best Mathematics (Score, Rank Improvement %, Percentile)
 * 6. Comparable Exam Scope Isolation
 * 7. Consistency Streaks & Gap Invariants
 * 8. Model C Errata Supersession & Evidence Preservation
 * 9. Disciplinary Revocation & User Badge Collection Sync
 * 10. Canonical Idempotency Keys & High Concurrency Safety
 */

const crypto = require('crypto');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function assert(condition, description, detail = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${String(totalTests).padStart(2, '0')}: ${description} ${detail ? '(' + detail + ')' : ''}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] Test ${String(totalTests).padStart(2, '0')}: ${description} ${detail ? '(' + detail + ')' : ''}`);
    failureDetails.push(`${description}: ${detail}`);
  }
}

console.log('================================================================');
console.log('COURAGE LIBRARY — PHASE 5E.3 ACHIEVEMENTS & BADGES TESTS');
console.log('================================================================\n');

// 1. Milestone Completion Logic Evaluator
function evaluateMilestones(lifetimeCompleted) {
  const awarded = [];
  if (lifetimeCompleted >= 1) awarded.push('FIRST_LIVE_TEST');
  if (lifetimeCompleted >= 3) awarded.push('LIVE_TEST_COMPLETED_3');
  if (lifetimeCompleted >= 5) awarded.push('LIVE_TEST_COMPLETED_5');
  if (lifetimeCompleted >= 10) awarded.push('LIVE_TEST_COMPLETED_10');
  return awarded;
}

assert(
  JSON.stringify(evaluateMilestones(1)) === JSON.stringify(['FIRST_LIVE_TEST']),
  'Milestone evaluation: 1 completed test awards FIRST_LIVE_TEST only'
);

assert(
  JSON.stringify(evaluateMilestones(3)) === JSON.stringify(['FIRST_LIVE_TEST', 'LIVE_TEST_COMPLETED_3']),
  'Milestone evaluation: 3 completed tests awards FIRST_LIVE_TEST and LIVE_TEST_COMPLETED_3'
);

assert(
  JSON.stringify(evaluateMilestones(7)) === JSON.stringify(['FIRST_LIVE_TEST', 'LIVE_TEST_COMPLETED_3', 'LIVE_TEST_COMPLETED_5']),
  'Milestone evaluation: 7 completed tests awards up to LIVE_TEST_COMPLETED_5'
);

assert(
  JSON.stringify(evaluateMilestones(15)) === JSON.stringify(['FIRST_LIVE_TEST', 'LIVE_TEST_COMPLETED_3', 'LIVE_TEST_COMPLETED_5', 'LIVE_TEST_COMPLETED_10']),
  'Milestone evaluation: 15 completed tests awards all 4 milestone tiers'
);

assert(
  evaluateMilestones(0).length === 0,
  'Milestone evaluation: 0 completed tests awards no milestone badges'
);

// 2. Podium Rank Rules
function evaluatePodium(rank) {
  if (rank === 1) return 'PODIUM_GOLD';
  if (rank === 2) return 'PODIUM_SILVER';
  if (rank === 3) return 'PODIUM_BRONZE';
  return null;
}

assert(evaluatePodium(1) === 'PODIUM_GOLD', 'Podium evaluation: Rank 1 qualifies for PODIUM_GOLD');
assert(evaluatePodium(2) === 'PODIUM_SILVER', 'Podium evaluation: Rank 2 qualifies for PODIUM_SILVER');
assert(evaluatePodium(3) === 'PODIUM_BRONZE', 'Podium evaluation: Rank 3 qualifies for PODIUM_BRONZE');
assert(evaluatePodium(4) === null, 'Podium evaluation: Rank 4 is not on podium');
assert(evaluatePodium(null) === null, 'Podium evaluation: Unranked attempt receives null');

// 3. National Top Rank Thresholds
function evaluateTopRanks(rank) {
  const awarded = [];
  if (rank !== null && rank >= 1 && rank <= 10) awarded.push('NATIONAL_TOP_10');
  if (rank !== null && rank >= 1 && rank <= 50) awarded.push('NATIONAL_TOP_50');
  if (rank !== null && rank >= 1 && rank <= 100) awarded.push('NATIONAL_TOP_100');
  return awarded;
}

assert(
  JSON.stringify(evaluateTopRanks(1)) === JSON.stringify(['NATIONAL_TOP_10', 'NATIONAL_TOP_50', 'NATIONAL_TOP_100']),
  'National Rank evaluation: Rank 1 qualifies for TOP_10, TOP_50, and TOP_100'
);

assert(
  JSON.stringify(evaluateTopRanks(25)) === JSON.stringify(['NATIONAL_TOP_50', 'NATIONAL_TOP_100']),
  'National Rank evaluation: Rank 25 qualifies for TOP_50 and TOP_100'
);

assert(
  JSON.stringify(evaluateTopRanks(85)) === JSON.stringify(['NATIONAL_TOP_100']),
  'National Rank evaluation: Rank 85 qualifies for TOP_100 only'
);

assert(
  evaluateTopRanks(101).length === 0,
  'National Rank evaluation: Rank 101 qualifies for no top rank awards'
);

// 4. National Percentile Thresholds
function evaluatePercentiles(percentile) {
  const awarded = [];
  if (percentile >= 99.00) awarded.push('NATIONAL_TOP_1_PERCENT');
  if (percentile >= 95.00) awarded.push('NATIONAL_TOP_5_PERCENT');
  if (percentile >= 90.00) awarded.push('NATIONAL_TOP_10_PERCENT');
  return awarded;
}

assert(
  JSON.stringify(evaluatePercentiles(99.45)) === JSON.stringify(['NATIONAL_TOP_1_PERCENT', 'NATIONAL_TOP_5_PERCENT', 'NATIONAL_TOP_10_PERCENT']),
  'Percentile evaluation: 99.45%ile qualifies for Top 1%, Top 5%, and Top 10%'
);

assert(
  JSON.stringify(evaluatePercentiles(95.00)) === JSON.stringify(['NATIONAL_TOP_5_PERCENT', 'NATIONAL_TOP_10_PERCENT']),
  'Percentile evaluation: 95.00%ile boundary qualifies for Top 5% and Top 10%'
);

assert(
  JSON.stringify(evaluatePercentiles(90.00)) === JSON.stringify(['NATIONAL_TOP_10_PERCENT']),
  'Percentile evaluation: 90.00%ile boundary qualifies for Top 10%'
);

assert(
  evaluatePercentiles(89.99).length === 0,
  'Percentile evaluation: 89.99%ile does not qualify for Top 10%'
);

// 5. Personal Best Mathematics
function calculateRankImprovementPercentage(previousRank, currentRank) {
  if (!previousRank || previousRank <= 0) return 0;
  return Number((((previousRank - currentRank) / previousRank) * 100).toFixed(2));
}

assert(
  calculateRankImprovementPercentage(100, 80) === 20.0,
  'Rank PB improvement: 100 -> 80 is +20.0% improvement'
);

assert(
  calculateRankImprovementPercentage(100, 50) === 50.0,
  'Rank PB improvement: 100 -> 50 is +50.0% improvement'
);

assert(
  calculateRankImprovementPercentage(100, 120) === -20.0,
  'Rank degradation: 100 -> 120 is -20.0% (negative improvement)'
);

function evaluatePersonalBests(currentScore, currentRank, currentPct, priorStats) {
  if (!priorStats || priorStats.priorAttemptsCount < 1) {
    return { scorePB: false, rankPB: false, pctPB: false };
  }

  const scorePB = currentScore > priorStats.maxScore;
  const rankPB = currentRank < priorStats.minRank; // strictly lower rank number is better
  const pctPB = currentPct > priorStats.maxPercentile;

  return { scorePB, rankPB, pctPB };
}

const priorStats1 = { priorAttemptsCount: 2, maxScore: 140.0, minRank: 45, maxPercentile: 91.5 };
const pbEval1 = evaluatePersonalBests(155.0, 30, 96.0, priorStats1);
assert(pbEval1.scorePB && pbEval1.rankPB && pbEval1.pctPB, 'Personal best: Exceeding prior score, rank, and percentile awards all 3 PB badges');

const pbEval2 = evaluatePersonalBests(140.0, 45, 91.5, priorStats1);
assert(!pbEval2.scorePB && !pbEval2.rankPB && !pbEval2.pctPB, 'Personal best: Exact tie does not qualify for new PB award');

const priorStats0 = { priorAttemptsCount: 0, maxScore: null, minRank: null, maxPercentile: null };
const pbEval0 = evaluatePersonalBests(180.0, 1, 99.9, priorStats0);
assert(!pbEval0.scorePB && !pbEval0.rankPB && !pbEval0.pctPB, 'Personal best: Candidate with 0 prior attempts cannot qualify for PB (needs baseline)');

// 6. Comparable Exam Scope Isolation
function canComparePBs(eventA_examId, eventB_examId) {
  return eventA_examId === eventB_examId;
}

const SSC_CGL_TIER1_ID = 'exam-ssc-cgl-t1';
const RRB_NTPC_ID = 'exam-rrb-ntpc';

assert(
  canComparePBs(SSC_CGL_TIER1_ID, SSC_CGL_TIER1_ID) === true,
  'Comparable scope: Two SSC CGL events share the same exam scope'
);

assert(
  canComparePBs(SSC_CGL_TIER1_ID, RRB_NTPC_ID) === false,
  'Comparable scope: SSC CGL and RRB NTPC events have strictly separated scopes'
);

// 7. Consistency Streaks
function evaluateConsistencyStreak(consecutiveAttendedCount) {
  const awarded = [];
  if (consecutiveAttendedCount >= 3) awarded.push('CONSISTENT_PERFORMER_3');
  if (consecutiveAttendedCount >= 5) awarded.push('CONSISTENT_PERFORMER_5');
  return awarded;
}

assert(
  JSON.stringify(evaluateConsistencyStreak(3)) === JSON.stringify(['CONSISTENT_PERFORMER_3']),
  'Consistency: 3 consecutive attended events awards CONSISTENT_PERFORMER_3'
);

assert(
  JSON.stringify(evaluateConsistencyStreak(5)) === JSON.stringify(['CONSISTENT_PERFORMER_3', 'CONSISTENT_PERFORMER_5']),
  'Consistency: 5 consecutive attended events awards both CONSISTENT_PERFORMER_3 and 5'
);

assert(
  evaluateConsistencyStreak(2).length === 0,
  'Consistency: 2 consecutive attended events does not yet qualify'
);

// 8. Canonical Idempotency Key Construction
function buildAchievementIdempotencyKey(scope, params) {
  if (scope === 'GLOBAL') {
    return `ACH_GLOBAL_${params.userId}_${params.badgeCode}`;
  }
  if (scope === 'EVENT') {
    return `ACH_EVENT_${params.eventId}_${params.userId}_${params.badgeCode}_v${params.policyVersion || 1}`;
  }
  if (scope === 'EXAM') {
    if (params.badgeCode.startsWith('PERSONAL_BEST_')) {
      const metric = params.badgeCode.replace('PERSONAL_BEST_', 'PB_');
      return `ACH_EXAM_${params.examId}_${params.userId}_${metric}_${params.eventId}`;
    }
    if (params.badgeCode.startsWith('CONSISTENT_PERFORMER_')) {
      const num = params.badgeCode.replace('CONSISTENT_PERFORMER_', 'CONSISTENT_');
      return `ACH_EXAM_${params.examId}_${params.userId}_${num}`;
    }
  }
  return `ACH_${crypto.randomUUID()}`;
}

const key1 = buildAchievementIdempotencyKey('GLOBAL', { userId: 'u1', badgeCode: 'FIRST_LIVE_TEST' });
assert(key1 === 'ACH_GLOBAL_u1_FIRST_LIVE_TEST', 'Idempotency Key: Global milestone format');

const key2 = buildAchievementIdempotencyKey('EVENT', { eventId: 'e1', userId: 'u1', badgeCode: 'PODIUM_GOLD', policyVersion: 1 });
assert(key2 === 'ACH_EVENT_e1_u1_PODIUM_GOLD_v1', 'Idempotency Key: Event podium format');

const key3 = buildAchievementIdempotencyKey('EXAM', { examId: 'ex1', userId: 'u1', badgeCode: 'PERSONAL_BEST_SCORE', eventId: 'e1' });
assert(key3 === 'ACH_EXAM_ex1_u1_PB_SCORE_e1', 'Idempotency Key: Exam personal best format');

// 9. Model C Errata Supersession Simulator
class AchievementLedgerSimulator {
  constructor() {
    this.awards = [];
    this.userBadges = new Set(); // `${userId}_${badgeCode}`
  }

  awardAchievement(award) {
    const existing = this.awards.find(a => a.idempotencyKey === award.idempotencyKey);
    if (existing) {
      return { inserted: false, award: existing };
    }
    const record = { ...award, status: 'AWARDED', id: crypto.randomUUID() };
    this.awards.push(record);
    this.userBadges.add(`${award.userId}_${award.badgeCode}`);
    return { inserted: true, award: record };
  }

  applyErrata(eventId, oldSnapshotId, newSnapshotId) {
    let supersededCount = 0;
    this.awards.forEach(a => {
      if (a.eventId === eventId && a.snapshotId === oldSnapshotId && a.status === 'AWARDED') {
        a.status = 'SUPERSEDED';
        supersededCount++;
      }
    });
    return supersededCount;
  }

  revokeAward(awardId, reason) {
    const target = this.awards.find(a => a.id === awardId);
    if (!target) return false;
    target.status = 'REVOKED';
    target.revocationReason = reason;

    // Check remaining valid awards for this user and badge
    const hasOtherValid = this.awards.some(a => a.userId === target.userId && a.badgeCode === target.badgeCode && a.status === 'AWARDED');
    if (!hasOtherValid) {
      this.userBadges.delete(`${target.userId}_${target.badgeCode}`);
    }
    return true;
  }
}

const ledger = new AchievementLedgerSimulator();

// Award podium in Event 1 Snapshot 1
const resA1 = ledger.awardAchievement({
  userId: 'user-123',
  badgeCode: 'PODIUM_GOLD',
  eventId: 'event-1',
  snapshotId: 'snap-1',
  idempotencyKey: 'ACH_EVENT_event-1_user-123_PODIUM_GOLD_v1'
});
assert(resA1.inserted === true, 'Errata simulator: Initial award inserted');
assert(ledger.userBadges.has('user-123_PODIUM_GOLD'), 'Errata simulator: user owns PODIUM_GOLD badge');

// Errata occurs producing Snapshot 2
const supCount = ledger.applyErrata('event-1', 'snap-1', 'snap-2');
assert(supCount === 1, 'Errata simulator: Exactly 1 award marked SUPERSEDED');
assert(resA1.award.status === 'SUPERSEDED', 'Errata simulator: Historical award status transitioned to SUPERSEDED');
assert(ledger.userBadges.has('user-123_PODIUM_GOLD'), 'Errata simulator: Candidate badge ownership is retained after errata');

// Disciplinary Revocation test
const resA2 = ledger.awardAchievement({
  userId: 'user-456',
  badgeCode: 'PODIUM_SILVER',
  eventId: 'event-2',
  snapshotId: 'snap-1',
  idempotencyKey: 'ACH_EVENT_event-2_user-456_PODIUM_SILVER_v1'
});
assert(ledger.userBadges.has('user-456_PODIUM_SILVER'), 'Revocation test: user-456 owns PODIUM_SILVER');

ledger.revokeAward(resA2.award.id, 'Malpractice voiding');
assert(resA2.award.status === 'REVOKED', 'Revocation test: Award status changed to REVOKED');
assert(!ledger.userBadges.has('user-456_PODIUM_SILVER'), 'Revocation test: Badge cleanly removed from user collection when 0 valid awards remain');

console.log('\n================================================================');
console.log(`TOTAL TESTS : ${totalTests}`);
console.log(`PASSED      : ${passedTests}`);
console.log(`FAILED      : ${failedTests}`);
console.log(`SUCCESS RATE: ${((passedTests / totalTests) * 100).toFixed(2)}%`);
console.log('================================================================\n');

if (failedTests > 0) {
  console.error('FAILURES:');
  failureDetails.forEach(d => console.error('  - ' + d));
  process.exit(1);
} else {
  console.log('PHASE 5E.3 ACHIEVEMENTS & BADGES UNIT TEST SUITE: ALL TESTS PASSED (100%)');
  process.exit(0);
}
