/**
 * Courage Library — Phase 5D: Result Engine & National Rank Computation Test Suite
 * Covers: Authoritative Scoring, Accuracy, Merit Ordering, Standard Competition Ranking,
 * Percentile Calculation, Population Semantics, Snapshot Immutability, and Unpublished Isolation.
 */

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, testName, detail = "") {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${String(totalTests).padStart(2, "0")}: ${testName} ${detail ? "(" + detail + ")" : ""}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] Test ${String(totalTests).padStart(2, "0")}: ${testName} — ${detail}`);
    failures.push({ test: totalTests, testName, detail });
  }
}

console.log("\n============================================================");
console.log("COURAGE LIBRARY — PHASE 5D RESULT ENGINE & RANKING TEST SUITE");
console.log("============================================================\n");

// ============================================================================
// DOMAIN 1: AUTHORITATIVE SCORING & MATHEMATICAL PRECISION
// ============================================================================
console.log("--- DOMAIN 1: AUTHORITATIVE SCORING & PRECISION ---");

function calculateScore(questions, answers) {
  let totalScore = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let attemptedCount = 0;

  const answersMap = new Map();
  answers.forEach((a) => answersMap.set(a.mock_question_id, a));

  questions.forEach((q) => {
    const ans = answersMap.get(q.id);
    if (ans && ans.selected_option_key) {
      attemptedCount++;
      if (ans.selected_option_key === q.correct_option_key) {
        correctCount++;
        totalScore += q.marks;
      } else {
        incorrectCount++;
        totalScore -= q.negative_mark;
      }
    }
  });

  const unansweredCount = questions.length - attemptedCount;
  const accuracy = attemptedCount > 0 ? (correctCount / attemptedCount) * 100 : 0;

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    correctCount,
    incorrectCount,
    unansweredCount,
    attemptedCount,
    accuracy: Math.round(accuracy * 100) / 100,
  };
}

const standardPaper = [
  { id: "q1", marks: 2.0, negative_mark: 0.5, correct_option_key: "A" },
  { id: "q2", marks: 2.0, negative_mark: 0.5, correct_option_key: "B" },
  { id: "q3", marks: 2.0, negative_mark: 0.5, correct_option_key: "C" },
  { id: "q4", marks: 2.0, negative_mark: 0.5, correct_option_key: "D" },
  { id: "q5", marks: 2.0, negative_mark: 0.5, correct_option_key: "A" },
];

// Test 1: All Correct
const resAllCorrect = calculateScore(standardPaper, [
  { mock_question_id: "q1", selected_option_key: "A" },
  { mock_question_id: "q2", selected_option_key: "B" },
  { mock_question_id: "q3", selected_option_key: "C" },
  { mock_question_id: "q4", selected_option_key: "D" },
  { mock_question_id: "q5", selected_option_key: "A" },
]);
assert(resAllCorrect.totalScore === 10.0 && resAllCorrect.correctCount === 5, "All correct answers yields maximum score (10.00)");
assert(resAllCorrect.accuracy === 100.0 && resAllCorrect.unansweredCount === 0, "All correct yields 100.00% accuracy and 0 unanswered");

// Test 3: All Incorrect
const resAllWrong = calculateScore(standardPaper, [
  { mock_question_id: "q1", selected_option_key: "B" },
  { mock_question_id: "q2", selected_option_key: "C" },
  { mock_question_id: "q3", selected_option_key: "D" },
  { mock_question_id: "q4", selected_option_key: "A" },
  { mock_question_id: "q5", selected_option_key: "B" },
]);
assert(resAllWrong.totalScore === -2.5 && resAllWrong.incorrectCount === 5, "All wrong answers deducts full negative marks (-2.50)");
assert(resAllWrong.accuracy === 0.0 && resAllWrong.correctCount === 0, "All wrong answers yields 0.00% accuracy");

// Test 5: All Unattempted
const resAllUnanswered = calculateScore(standardPaper, []);
assert(resAllUnanswered.totalScore === 0.0 && resAllUnanswered.unansweredCount === 5, "All unattempted yields 0.00 score and 5 unanswered");
assert(resAllUnanswered.accuracy === 0.0 && resAllUnanswered.attemptedCount === 0, "All unattempted yields 0.00% accuracy without division by zero");

// Test 7: Mixed Attempt
const resMixed = calculateScore(standardPaper, [
  { mock_question_id: "q1", selected_option_key: "A" }, // +2
  { mock_question_id: "q2", selected_option_key: "B" }, // +2
  { mock_question_id: "q3", selected_option_key: "A" }, // -0.5 (Wrong)
  // q4, q5 unattempted
]);
assert(resMixed.totalScore === 3.5 && resMixed.correctCount === 2 && resMixed.incorrectCount === 1, "Mixed attempt calculates net score accurately (3.50)");
assert(resMixed.unansweredCount === 2 && resMixed.attemptedCount === 3, "Mixed attempt counts unanswered accurately (2)");
assert(resMixed.accuracy === 66.67, "Mixed attempt accuracy rounded to 2 decimal places (66.67%)");

// Test 10: Section-specific Custom Marking Scheme
const customSectionPaper = [
  { id: "q1", marks: 3.0, negative_mark: 1.0, correct_option_key: "A" },
  { id: "q2", marks: 1.5, negative_mark: 0.25, correct_option_key: "B" },
];
const resCustom = calculateScore(customSectionPaper, [
  { mock_question_id: "q1", selected_option_key: "A" }, // +3.0
  { mock_question_id: "q2", selected_option_key: "C" }, // -0.25
]);
assert(resCustom.totalScore === 2.75, "Custom sectional marks and penalties computed with exact precision (2.75)");

// ============================================================================
// DOMAIN 2: ACCURACY FORMULATION & UNATTEMPTED ISOLATION
// ============================================================================
console.log("\n--- DOMAIN 2: ACCURACY FORMULATION ---");

function computeAccuracy(correct, wrong, unattempted) {
  const attempted = correct + wrong;
  if (attempted === 0) return 0.0;
  return Math.round((correct / attempted) * 10000) / 100;
}

assert(computeAccuracy(0, 0, 100) === 0.0, "Zero attempted questions yields 0.00% accuracy");
assert(computeAccuracy(1, 0, 99) === 100.0, "1 correct out of 1 attempted (99 unattempted) yields 100.00% accuracy");
assert(computeAccuracy(0, 1, 99) === 0.0, "1 wrong out of 1 attempted (99 unattempted) yields 0.00% accuracy");
assert(computeAccuracy(75, 25, 0) === 75.0, "75 correct, 25 wrong yields 75.00% accuracy");
assert(computeAccuracy(75, 25, 50) === 75.0, "Unattempted questions (50) do not reduce accuracy percentage (75.00%)");
assert(computeAccuracy(1, 2, 0) === 33.33, "1 correct, 2 wrong yields precisely 33.33% accuracy");

// ============================================================================
// DOMAIN 3: MERIT ORDERING & STANDARD COMPETITION RANKING
// ============================================================================
console.log("\n--- DOMAIN 3: MERIT ORDERING & COMPETITION RANKING ---");

function compareMerit(a, b) {
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
  if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
  if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
  if (a.timeSpent !== b.timeSpent) return a.timeSpent - b.timeSpent;
  return 0; // Exactly equal on all merit criteria
}

function computeCompetitionRanks(candidates) {
  // Sort with Candidate UUID as deterministic pagination sort key
  const sorted = [...candidates].sort((a, b) => {
    const meritDiff = compareMerit(a, b);
    if (meritDiff !== 0) return meritDiff;
    return a.userId.localeCompare(b.userId);
  });

  const ranked = [];
  let currentRank = 1;

  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && compareMerit(sorted[i - 1], sorted[i]) !== 0) {
      currentRank = i + 1; // Standard 1224 competition rank jump
    }
    ranked.push({
      ...sorted[i],
      rank: currentRank,
      ordinalPosition: i + 1,
    });
  }

  return ranked;
}

// Test 17: Unique Scores
const cohortUnique = [
  { userId: "u1", totalScore: 90, accuracy: 90, correctCount: 45, timeSpent: 3000 },
  { userId: "u2", totalScore: 85, accuracy: 85, correctCount: 43, timeSpent: 3100 },
  { userId: "u3", totalScore: 80, accuracy: 80, correctCount: 40, timeSpent: 3200 },
];
const rankedUnique = computeCompetitionRanks(cohortUnique);
assert(rankedUnique[0].rank === 1 && rankedUnique[1].rank === 2 && rankedUnique[2].rank === 3, "Unique scores produce sequential ranks 1, 2, 3");

// Test 18: Score Tie Broken by Accuracy
const cohortScoreTie = [
  { userId: "u1", totalScore: 80, accuracy: 85, correctCount: 40, timeSpent: 3000 },
  { userId: "u2", totalScore: 80, accuracy: 90, correctCount: 40, timeSpent: 3000 },
];
const rankedScoreTie = computeCompetitionRanks(cohortScoreTie);
assert(rankedScoreTie[0].userId === "u2" && rankedScoreTie[0].rank === 1, "Equal score tie broken by higher accuracy (Rank 1 for u2)");
assert(rankedScoreTie[1].userId === "u1" && rankedScoreTie[1].rank === 2, "Lower accuracy receives Rank 2");

// Test 20: Score + Accuracy Tie Broken by Correct Count
const cohortAccTie = [
  { userId: "u1", totalScore: 50, accuracy: 80, correctCount: 28, timeSpent: 3000 },
  { userId: "u2", totalScore: 50, accuracy: 80, correctCount: 30, timeSpent: 3000 },
];
const rankedAccTie = computeCompetitionRanks(cohortAccTie);
assert(rankedAccTie[0].userId === "u2" && rankedAccTie[0].rank === 1, "Equal score and accuracy broken by higher correct count");

// Test 21: Score + Accuracy + Correct Count Tie Broken by Time Taken
const cohortTimeTie = [
  { userId: "u1", totalScore: 50, accuracy: 80, correctCount: 30, timeSpent: 2800 },
  { userId: "u2", totalScore: 50, accuracy: 80, correctCount: 30, timeSpent: 2500 },
];
const rankedTimeTie = computeCompetitionRanks(cohortTimeTie);
assert(rankedTimeTie[0].userId === "u2" && rankedTimeTie[0].rank === 1, "Equal score, accuracy, and correct count broken by faster time (u2 wins)");

// Test 22: Complete Merit Tie — Both Receive Exact Same Rank
const cohortCompleteTie = [
  { userId: "uA", totalScore: 80, accuracy: 90, correctCount: 40, timeSpent: 3000 },
  { userId: "uB", totalScore: 80, accuracy: 90, correctCount: 40, timeSpent: 3000 },
  { userId: "uC", totalScore: 70, accuracy: 80, correctCount: 35, timeSpent: 3200 },
];
const rankedCompleteTie = computeCompetitionRanks(cohortCompleteTie);
assert(rankedCompleteTie[0].rank === 1 && rankedCompleteTie[1].rank === 1, "Complete merit tie results in identical Rank 1 for both candidates");
assert(rankedCompleteTie[2].rank === 3, "Next candidate after 2-way tie for Rank 1 correctly receives Rank 3 (1224 Standard)");
assert(rankedCompleteTie[0].userId === "uA" && rankedCompleteTie[1].userId === "uB", "Candidate UUID ASC stably sorts table pagination without modifying display rank");

// ============================================================================
// DOMAIN 4: STANDARD COMPETITION PERCENTILE FORMULATION
// ============================================================================
console.log("\n--- DOMAIN 4: COMPETITION PERCENTILE MATHEMATICS ---");

function computePercentiles(candidates) {
  const nTotal = candidates.length;
  if (nTotal === 0) return [];

  return candidates.map((curr) => {
    let nBelow = 0;
    let nEqual = 0;

    candidates.forEach((other) => {
      const diff = compareMerit(curr, other);
      if (diff < 0) {
        nBelow++; // other has strictly lower merit than curr
      } else if (diff === 0) {
        nEqual++; // exactly equal merit
      }
    });

    const percentile = ((nBelow + 0.5 * nEqual) / nTotal) * 100;
    return {
      userId: curr.userId,
      nBelow,
      nEqual,
      nTotal,
      percentile: Math.round(percentile * 1000) / 1000,
      percentileRounded: Math.round(percentile * 100) / 100,
    };
  });
}

// Test 26: 10,000 Candidates — Rank #1 (No ties)
const cohort10k = [
  { userId: "u1", totalScore: 100, accuracy: 100, correctCount: 50, timeSpent: 1000 },
  { userId: "u2", totalScore: 99, accuracy: 99, correctCount: 49, timeSpent: 1100 },
];
// Fill remaining 9,998 candidates with lower scores
for (let i = 3; i <= 10000; i++) {
  cohort10k.push({ userId: `u${i}`, totalScore: 50 - (i * 0.001), accuracy: 50, correctCount: 25, timeSpent: 2000 + i });
}

const pct10k = computePercentiles(cohort10k);
assert(pct10k[0].nBelow === 9999 && pct10k[0].nEqual === 1, "Rank #1 among 10,000 has N_below = 9,999 and N_equal = 1");
assert(pct10k[0].percentile === 99.995 && pct10k[0].percentileRounded === 100.0, "Rank #1 among 10,000 receives highest percentile (99.995% -> 100.00%)");

// Test 28: 10,000 Candidates — Rank #2 (No ties)
assert(pct10k[1].nBelow === 9998 && pct10k[1].nEqual === 1, "Rank #2 among 10,000 has N_below = 9,998 and N_equal = 1");
assert(pct10k[1].percentile === 99.985, "Rank #2 among 10,000 receives 99.985% percentile");

// Test 30: 10,000 Candidates — Bottom Candidate (No ties)
const bottom10k = pct10k[pct10k.length - 1];
assert(bottom10k.nBelow === 0 && bottom10k.nEqual === 1, "Bottom candidate among 10,000 has N_below = 0 and N_equal = 1");
assert(bottom10k.percentile === 0.005 && bottom10k.percentileRounded === 0.01, "Bottom candidate among 10,000 receives 0.005% -> 0.01%");

// Test 32: Two Candidates Tied for First Place among 10,000
const cohortTied10k = [
  { userId: "u1", totalScore: 100, accuracy: 100, correctCount: 50, timeSpent: 1000 },
  { userId: "u2", totalScore: 100, accuracy: 100, correctCount: 50, timeSpent: 1000 },
];
for (let i = 3; i <= 10000; i++) {
  cohortTied10k.push({ userId: `u${i}`, totalScore: 50 - (i * 0.001), accuracy: 50, correctCount: 25, timeSpent: 2000 + i });
}
const pctTied10k = computePercentiles(cohortTied10k);
assert(pctTied10k[0].nBelow === 9998 && pctTied10k[0].nEqual === 2, "Two tied candidates for first place have N_below = 9,998 and N_equal = 2");
assert(pctTied10k[0].percentile === 99.99 && pctTied10k[1].percentile === 99.99, "Both tied candidates for first place receive identical 99.99% percentile");

// Test 34: Single Candidate (N = 1)
const pctSingle = computePercentiles([{ userId: "solo", totalScore: 80, accuracy: 80, correctCount: 40, timeSpent: 3000 }]);
assert(pctSingle[0].nBelow === 0 && pctSingle[0].nEqual === 1 && pctSingle[0].percentile === 50.0, "Single candidate receives 50.00% percentile");

// Test 35: All Candidates Tied (N = 4)
const cohortAllTied = [
  { userId: "u1", totalScore: 50, accuracy: 50, correctCount: 25, timeSpent: 2000 },
  { userId: "u2", totalScore: 50, accuracy: 50, correctCount: 25, timeSpent: 2000 },
  { userId: "u3", totalScore: 50, accuracy: 50, correctCount: 25, timeSpent: 2000 },
  { userId: "u4", totalScore: 50, accuracy: 50, correctCount: 25, timeSpent: 2000 },
];
const pctAllTied = computePercentiles(cohortAllTied);
assert(pctAllTied.every((p) => p.percentile === 50.0), "All tied candidates in a 4-person cohort receive exactly 50.00% percentile");

// ============================================================================
// DOMAIN 5: ELIGIBLE POPULATION SEMANTICS
// ============================================================================
console.log("\n--- DOMAIN 5: POPULATION SEMANTICS ---");

function filterEligibleCandidates(attempts) {
  return attempts.filter((a) => {
    if (a.isVoided || a.status === "invalidated") return false;
    if (a.status === "in_progress" || a.status === "abandoned") return false;
    return a.status === "submitted" || a.status === "auto_submitted" || a.status === "completed" || a.status === "evaluated";
  });
}

const mixedAttempts = [
  { id: "a1", userId: "u1", status: "submitted", isVoided: false },
  { id: "a2", userId: "u2", status: "auto_submitted", isVoided: false },
  { id: "a3", userId: "u3", status: "in_progress", isVoided: false }, // not submitted
  { id: "a4", userId: "u4", status: "submitted", isVoided: true }, // voided
  { id: "a5", userId: "u5", status: "invalidated", isVoided: false }, // invalidated
];
const eligible = filterEligibleCandidates(mixedAttempts);
assert(eligible.length === 2, "Only submitted & auto-submitted non-voided attempts enter eligible ranking population (2 of 5)");
assert(eligible.map((e) => e.id).includes("a1") && eligible.map((e) => e.id).includes("a2"), "Both submitted and auto-submitted are preserved in eligible population");
assert(!eligible.map((e) => e.id).includes("a4") && !eligible.map((e) => e.id).includes("a5"), "Voided and invalidated attempts are excluded from ranking population");

// ============================================================================
// DOMAIN 6: LEADERBOARD SNAPSHOT VERSIONING & PUBLICATION ATOMICITY
// ============================================================================
console.log("\n--- DOMAIN 6: SNAPSHOT VERSIONING & PUBLICATION ATOMICITY ---");

class MockSnapshotManager {
  constructor() {
    this.snapshots = [];
    this.eventStatus = "RESULTS_READY";
  }

  createSnapshot(version, participants, highScore, avgScore) {
    const s = {
      id: `snap_v${version}`,
      snapshot_version: version,
      total_participants: participants,
      highest_score: highScore,
      average_score: avgScore,
      is_active: false,
      is_finalized: true,
    };
    this.snapshots.push(s);
    return s;
  }

  publishSnapshot(version) {
    this.snapshots.forEach((s) => (s.is_active = false));
    const target = this.snapshots.find((s) => s.snapshot_version === version);
    if (target) {
      target.is_active = true;
      this.eventStatus = "PUBLISHED";
      return true;
    }
    return false;
  }
}

const snapMgr = new MockSnapshotManager();
const s1 = snapMgr.createSnapshot(1, 500, 95.0, 62.4);
assert(s1.snapshot_version === 1 && s1.is_active === false, "Generated snapshot v1 starts staged (is_active = false)");
assert(snapMgr.eventStatus === "RESULTS_READY", "Event status remains RESULTS_READY before publication");

snapMgr.publishSnapshot(1);
assert(snapMgr.snapshots[0].is_active === true && snapMgr.eventStatus === "PUBLISHED", "Publication atomically activates snapshot v1 and transitions event to PUBLISHED");

// Errata Recalculation: Create Snapshot v2
const s2 = snapMgr.createSnapshot(2, 500, 96.0, 63.1);
assert(s2.snapshot_version === 2 && s2.is_active === false, "Errata recalculation creates staged snapshot v2 without altering active v1");
assert(snapMgr.snapshots.find((s) => s.snapshot_version === 1).is_active === true, "Snapshot v1 remains actively published during v2 staging");

// Publish Snapshot v2
snapMgr.publishSnapshot(2);
assert(snapMgr.snapshots.find((s) => s.snapshot_version === 1).is_active === false, "Old snapshot v1 deactivated upon v2 publication");
assert(snapMgr.snapshots.find((s) => s.snapshot_version === 2).is_active === true, "New snapshot v2 actively published (exactly one snapshot active)");

// ============================================================================
// DOMAIN 7: UNPUBLISHED RESULT SECURITY ISOLATION
// ============================================================================
console.log("\n--- DOMAIN 7: UNPUBLISHED RESULT SECURITY ISOLATION ---");

function sanitizeCandidatePayload(eventStatus, candidateAttempt, testResult, questions) {
  const isPublished = eventStatus === "PUBLISHED";
  if (!isPublished) {
    return {
      isPublished: false,
      statusMessage: "Your submission has been securely recorded. Results will be available after official publication.",
      scorecard: null,
      reviewQuestions: null,
    };
  }

  return {
    isPublished: true,
    statusMessage: "Official All-India Results Published",
    scorecard: {
      totalScore: testResult.total_score,
      rank: testResult.rank,
      percentile: testResult.percentile,
    },
    reviewQuestions: questions.map((q) => ({
      id: q.id,
      correctOption: q.correct_option_key,
      explanation: q.explanation_md,
    })),
  };
}

const draftEventPayload = sanitizeCandidatePayload(
  "RESULTS_READY",
  { id: "att_1" },
  { total_score: 92.5, rank: 4, percentile: 99.2 },
  [{ id: "q1", correct_option_key: "B", explanation_md: "Key explanation" }]
);
assert(draftEventPayload.isPublished === false, "Unpublished event returns isPublished = false");
assert(draftEventPayload.scorecard === null, "Candidate scorecard is completely null prior to PUBLISHED status");
assert(draftEventPayload.reviewQuestions === null, "Question solutions and answer keys are completely masked prior to PUBLISHED status");

const publishedEventPayload = sanitizeCandidatePayload(
  "PUBLISHED",
  { id: "att_1" },
  { total_score: 92.5, rank: 4, percentile: 99.2 },
  [{ id: "q1", correct_option_key: "B", explanation_md: "Key explanation" }]
);
assert(publishedEventPayload.isPublished === true, "Published event returns isPublished = true");
assert(publishedEventPayload.scorecard.totalScore === 92.5 && publishedEventPayload.scorecard.rank === 4, "Scorecard delivered accurately post-publication");
assert(publishedEventPayload.reviewQuestions[0].correctOption === "B", "Solutions and explanations delivered post-publication");

// ============================================================================
// SUMMARY & VERIFICATION
// ============================================================================
console.log("\n============================================================");
console.log(`PHASE 5D AUTOMATED TEST SUITE SUMMARY: ${passedTests}/${totalTests} PASSED`);
if (failedTests > 0) {
  console.error(`FAILURES DETECTED: ${failedTests}`);
  process.exit(1);
} else {
  console.log("ALL PHASE 5D AUTOMATED INVARIANT TESTS PASSED (100.0%)");
  console.log("============================================================\n");
}
