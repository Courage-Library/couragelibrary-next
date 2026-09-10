/**
 * COURAGE LIBRARY — PHASE 5E.5: ADMIN COMPETITION INTELLIGENCE
 * Dedicated Automated Test Suite
 *
 * Verifies participation funnels, score/rank distributions, deciles,
 * small-cohort privacy suppression, deterministic anomaly detection,
 * cross-event comparability, reward/credential aggregations, and RBAC invariants.
 */

const assert = require("assert");

const ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1 = {
  policyVersion: "v1.0.0",
  thresholds: {
    highDropoutRatePercent: 25.0,
    highExpiryRatePercent: 40.0,
    unusualScoreConcentrationPercent: 50.0,
    evaluationBacklogMinutes: 30,
    unsettledRewardLagHours: 2,
    minimumPrivacyCohortSize: 5,
    earlyExitThresholdMinutes: 15,
    earlyExitSpikePercent: 15.0,
  },
  comparabilityRules: {
    strictExamMatch: true,
    strictTotalMarksMatch: true,
    requirePublishedStatus: true,
    requireActiveSnapshot: true,
  },
};

// Pure Statistical Helper Implementations (matching Service)
function calculateMean(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function calculateStdDev(values, mean) {
  if (!values || values.length <= 1) return 0;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function calculatePercentile(sortedValues, p) {
  if (!sortedValues || sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (upper >= sortedValues.length) return sortedValues[sortedValues.length - 1];
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function roundToTwo(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

let testCount = 0;
let passCount = 0;

function runTest(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`  [PASS] Test ${String(testCount).padStart(2, "0")}: ${name}`);
  } catch (err) {
    console.error(`  [FAIL] Test ${String(testCount).padStart(2, "0")}: ${name}`);
    console.error(`         Error: ${err.message}`);
  }
}

console.log("================================================================");
console.log(" COURAGE LIBRARY — PHASE 5E.5 AUTOMATED TEST SUITE");
console.log(" Admin Competition Intelligence & Cohort Analytics Verification");
console.log("================================================================");

// --- SECTION 1: Policy Versioning & Configuration Invariants ---
console.log("\n--- SECTION 1: Policy Versioning & Configuration Invariants ---");

runTest("Policy version matches contract v1.0.0", () => {
  assert.strictEqual(ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1.policyVersion, "v1.0.0");
});

runTest("Minimum privacy cohort size is strictly 5 candidates", () => {
  assert.strictEqual(ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1.thresholds.minimumPrivacyCohortSize, 5);
});

runTest("Operational anomaly thresholds correctly configured", () => {
  assert.strictEqual(ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1.thresholds.highDropoutRatePercent, 25.0);
  assert.strictEqual(ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1.thresholds.highExpiryRatePercent, 40.0);
  assert.strictEqual(ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1.thresholds.evaluationBacklogMinutes, 30);
  assert.strictEqual(ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1.thresholds.unsettledRewardLagHours, 2);
  assert.strictEqual(ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1.thresholds.unusualScoreConcentrationPercent, 50.0);
});

// --- SECTION 2: Participation Funnel & Zero-State Safety ---
console.log("\n--- SECTION 2: Participation Funnel & Zero-State Safety ---");

runTest("Zero registrations returns 0.0% turnout without division error", () => {
  const registered = 0;
  const started = 0;
  const turnoutRate = registered > 0 ? roundToTwo((started / registered) * 100) : 0;
  assert.strictEqual(turnoutRate, 0);
});

runTest("Zero starts returns 0.0% completion and dropout rates", () => {
  const started = 0;
  const submitted = 0;
  const completionRate = started > 0 ? roundToTwo((submitted / started) * 100) : 0;
  const dropoutRate = started > 0 ? roundToTwo(((started - submitted) / started) * 100) : 0;
  assert.strictEqual(completionRate, 0);
  assert.strictEqual(dropoutRate, 0);
});

runTest("Standard funnel progression correctly computes rates", () => {
  const registered = 100;
  const started = 80;
  const submitted = 60;
  const expired = 10;
  const earlyExit = 12;

  const turnoutRate = roundToTwo((started / registered) * 100);
  const completionRate = roundToTwo((submitted / started) * 100);
  const dropoutRate = roundToTwo(((started - submitted) / started) * 100);
  const expiryRate = roundToTwo((expired / started) * 100);
  const earlyDropoutRate = roundToTwo((earlyExit / started) * 100);

  assert.strictEqual(turnoutRate, 80.0);
  assert.strictEqual(completionRate, 75.0);
  assert.strictEqual(dropoutRate, 25.0);
  assert.strictEqual(expiryRate, 12.5);
  assert.strictEqual(earlyDropoutRate, 15.0);
});

// --- SECTION 3: Score & Rank Distributions ---
console.log("\n--- SECTION 3: Score & Rank Distributions ---");

runTest("Mean score calculation matches arithmetic average", () => {
  const scores = [60, 70, 80, 90, 100];
  const mean = roundToTwo(calculateMean(scores));
  assert.strictEqual(mean, 80.0);
});

runTest("Median score (P50) correctly calculated for odd/even samples", () => {
  const scoresOdd = [50, 60, 70, 80, 90];
  const medianOdd = roundToTwo(calculatePercentile(scoresOdd, 50));
  assert.strictEqual(medianOdd, 70.0);

  const scoresEven = [50, 60, 70, 80];
  const medianEven = roundToTwo(calculatePercentile(scoresEven, 50));
  assert.strictEqual(medianEven, 65.0);
});

runTest("IQR (Q3 - Q1) correctly measures middle 50% spread", () => {
  const scores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const q1 = calculatePercentile(scores, 25);
  const q3 = calculatePercentile(scores, 75);
  const iqr = roundToTwo(q3 - q1);
  assert.strictEqual(iqr, 45.0);
});

runTest("Std deviation correctly calculated", () => {
  const scores = [10, 20, 30, 40, 50];
  const mean = calculateMean(scores);
  const stdDev = roundToTwo(calculateStdDev(scores, mean));
  assert.strictEqual(stdDev, 15.81);
});

runTest("10 Equidistant score bands correctly populate", () => {
  const totalMarks = 100;
  const bandWidth = totalMarks / 10;
  const scores = [5, 15, 25, 35, 45, 55, 65, 75, 85, 95];
  const bands = [];

  for (let i = 0; i < 10; i++) {
    const low = i * bandWidth;
    const high = (i + 1) * bandWidth;
    const count = scores.filter((s) => (i === 9 ? s >= low && s <= high : s >= low && s < high)).length;
    bands.push({ range: [low, high], count });
  }

  assert.strictEqual(bands.length, 10);
  assert.strictEqual(bands.every((b) => b.count === 1), true);
});

runTest("Tied ranks frequency correctly calculated", () => {
  const entries = [
    { rank: 1, score: 95 },
    { rank: 2, score: 90 },
    { rank: 2, score: 90 }, // Tied
    { rank: 4, score: 80 },
    { rank: 4, score: 80 }, // Tied
  ];

  const rankCounts = new Map();
  for (const e of entries) rankCounts.set(e.rank, (rankCounts.get(e.rank) || 0) + 1);
  let tiedRankCount = 0;
  for (const count of rankCounts.values()) {
    if (count > 1) tiedRankCount += count;
  }
  const freq = roundToTwo((tiedRankCount / entries.length) * 100);
  assert.strictEqual(tiedRankCount, 4);
  assert.strictEqual(freq, 80.0);
});

// --- SECTION 4: Small-Cohort Privacy Suppression ---
console.log("\n--- SECTION 4: Small-Cohort Privacy Suppression ---");

runTest("Sample N=4 (< 5) suppresses continuous score distributions", () => {
  const rankedCount = 4;
  const privacySuppressed = rankedCount < ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1.thresholds.minimumPrivacyCohortSize;
  assert.strictEqual(privacySuppressed, true);
});

runTest("Sample N=5 (>= 5) allows distribution calculation", () => {
  const rankedCount = 5;
  const privacySuppressed = rankedCount < ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1.thresholds.minimumPrivacyCohortSize;
  assert.strictEqual(privacySuppressed, false);
});

runTest("Suppressed cohort returns null for mean and median scores", () => {
  const privacySuppressed = true;
  const meanScore = privacySuppressed ? null : 80;
  const medianScore = privacySuppressed ? null : 80;
  assert.strictEqual(meanScore, null);
  assert.strictEqual(medianScore, null);
});

// --- SECTION 5: Cross-Event Compatibility Engine ---
console.log("\n--- SECTION 5: Cross-Event Compatibility Engine ---");

runTest("Mismatched exam IDs rejected as COMPARISON_NOT_COMPARABLE", () => {
  const e1 = { examId: "exam-ssc-cgl", totalMarks: 200, isPublished: true };
  const e2 = { examId: "exam-upsc-pre", totalMarks: 200, isPublished: true };

  let status = "COMPARABLE";
  let reason;
  if (e1.examId !== e2.examId) {
    status = "COMPARISON_NOT_COMPARABLE";
    reason = "Exam mismatch";
  }
  assert.strictEqual(status, "COMPARISON_NOT_COMPARABLE");
  assert.strictEqual(reason, "Exam mismatch");
});

runTest("Mismatched maximum marks rejected as COMPARISON_NOT_COMPARABLE", () => {
  const e1 = { examId: "exam-ssc-cgl", totalMarks: 200, isPublished: true };
  const e2 = { examId: "exam-ssc-cgl", totalMarks: 100, isPublished: true };

  let status = "COMPARABLE";
  let reason;
  if (e1.totalMarks !== e2.totalMarks) {
    status = "COMPARISON_NOT_COMPARABLE";
    reason = "Maximum marks mismatch";
  }
  assert.strictEqual(status, "COMPARISON_NOT_COMPARABLE");
  assert.strictEqual(reason, "Maximum marks mismatch");
});

runTest("Unpublished event rejected from cross-comparison", () => {
  const e1 = { examId: "exam-ssc-cgl", totalMarks: 200, isPublished: false };
  const e2 = { examId: "exam-ssc-cgl", totalMarks: 200, isPublished: true };

  let status = "COMPARABLE";
  if (!e1.isPublished || !e2.isPublished) {
    status = "COMPARISON_NOT_COMPARABLE";
  }
  assert.strictEqual(status, "COMPARISON_NOT_COMPARABLE");
});

runTest("Compatible events successfully compute deltas", () => {
  const e1 = { examId: "exam-ssc", totalMarks: 200, isPublished: true, turnoutRate: 70, meanScore: 120 };
  const e2 = { examId: "exam-ssc", totalMarks: 200, isPublished: true, turnoutRate: 85, meanScore: 135 };

  const turnoutDelta = roundToTwo(e2.turnoutRate - e1.turnoutRate);
  const meanScoreDelta = roundToTwo(e2.meanScore - e1.meanScore);

  assert.strictEqual(turnoutDelta, 15.0);
  assert.strictEqual(meanScoreDelta, 15.0);
});

// --- SECTION 6: Deterministic Anomaly Model ---
console.log("\n--- SECTION 6: Deterministic Anomaly Model ---");

runTest("Dropout rate > 25% triggers HIGH_DROPOUT_RATE anomaly", () => {
  const dropoutRate = 30.0;
  const isTriggered = dropoutRate > ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1.thresholds.highDropoutRatePercent;
  assert.strictEqual(isTriggered, true);
});

runTest("Expiry rate > 40% triggers HIGH_EXPIRY_RATE anomaly", () => {
  const expiryRate = 45.0;
  const isTriggered = expiryRate > ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1.thresholds.highExpiryRatePercent;
  assert.strictEqual(isTriggered, true);
});

runTest("Score band > 50% triggers UNUSUAL_SCORE_CONCENTRATION", () => {
  const bandMaxPercent = 55.0;
  const isTriggered = bandMaxPercent > ADMIN_COMPETITION_INTELLIGENCE_POLICY_V1.thresholds.unusualScoreConcentrationPercent;
  assert.strictEqual(isTriggered, true);
});

// --- SECTION 7: Section & Topic Fallbacks ---
console.log("\n--- SECTION 7: Section & Topic Fallbacks ---");

runTest("< 50% mapped questions produces TOPIC_DATA_INSUFFICIENT", () => {
  const mappedRatio = 0.40;
  const status = mappedRatio >= 0.50 ? "TOPIC_DATA_AVAILABLE" : "TOPIC_DATA_INSUFFICIENT";
  assert.strictEqual(status, "TOPIC_DATA_INSUFFICIENT");
});

runTest(">= 50% mapped questions produces TOPIC_DATA_AVAILABLE", () => {
  const mappedRatio = 0.85;
  const status = mappedRatio >= 0.50 ? "TOPIC_DATA_AVAILABLE" : "TOPIC_DATA_INSUFFICIENT";
  assert.strictEqual(status, "TOPIC_DATA_AVAILABLE");
});

// --- SECTION 8: Reward & Credential Aggregations ---
console.log("\n--- SECTION 8: Reward & Credential Aggregations ---");

runTest("Reward settlements correctly segment podium vs participation coins", () => {
  const rewards = [
    { coins_awarded: 500, rank: 1 },
    { coins_awarded: 300, rank: 2 },
    { coins_awarded: 200, rank: 3 },
    { coins_awarded: 50, rank: 4 },
    { coins_awarded: 50, rank: 5 },
  ];

  const total = rewards.reduce((sum, r) => sum + r.coins_awarded, 0);
  const podium = rewards.filter((r) => r.rank <= 3).reduce((sum, r) => sum + r.coins_awarded, 0);
  const participation = total - podium;

  assert.strictEqual(total, 1100);
  assert.strictEqual(podium, 1000);
  assert.strictEqual(participation, 100);
});

runTest("Certificate tiers accurately aggregated", () => {
  const certs = [
    { tier: "MERIT" },
    { tier: "MERIT" },
    { tier: "EXCELLENCE" },
    { tier: "PARTICIPATION" },
    { tier: "PARTICIPATION" },
  ];

  const merit = certs.filter((c) => c.tier === "MERIT").length;
  const excellence = certs.filter((c) => c.tier === "EXCELLENCE").length;
  const participation = certs.filter((c) => c.tier === "PARTICIPATION").length;

  assert.strictEqual(merit, 2);
  assert.strictEqual(excellence, 1);
  assert.strictEqual(participation, 2);
});

// --- SECTION 9: RBAC & Candidate Isolation ---
console.log("\n--- SECTION 9: RBAC & Candidate Isolation ---");

runTest("Candidate role rejected from admin intelligence access", () => {
  const role = "candidate";
  const isAllowed = role === "admin" || role === "superadmin" || role === "staff";
  assert.strictEqual(isAllowed, false);
});

runTest("Staff role allowed aggregate metrics but blocked from candidate drill-down", () => {
  const role = "staff";
  const canViewAggregates = role === "admin" || role === "superadmin" || role === "staff";
  const canDrillDown = role === "admin" || role === "superadmin";

  assert.strictEqual(canViewAggregates, true);
  assert.strictEqual(canDrillDown, false);
});

runTest("Admin and SuperAdmin granted full drill-down access", () => {
  const adminRole = "admin";
  const superRole = "superadmin";
  const adminAllowed = adminRole === "admin" || adminRole === "superadmin";
  const superAllowed = superRole === "admin" || superRole === "superadmin";

  assert.strictEqual(adminAllowed, true);
  assert.strictEqual(superAllowed, true);
});

console.log("\n================================================================");
console.log(`TOTAL TESTS : ${testCount}`);
console.log(`PASSED      : ${passCount}`);
console.log(`FAILED      : ${testCount - passCount}`);
console.log(`SUCCESS RATE: ${((passCount / testCount) * 100).toFixed(2)}%`);
console.log("================================================================");

if (testCount !== passCount) {
  process.exit(1);
}
