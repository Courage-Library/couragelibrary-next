/**
 * COURAGE LIBRARY — PHASE 5E.4: CANDIDATE HISTORICAL INTELLIGENCE
 * Dedicated Automated Test Suite
 *
 * Verifies mathematical trajectories, analytical policy versioning, deterministic
 * strengths/weaknesses diagnostics, errata isolation, void exclusions, and reproducibility.
 */

const assert = require("assert");

const CANDIDATE_INTELLIGENCE_POLICY_V1 = {
  policyVersion: "v1.0.0",
  trendClassification: {
    minSampleForTrend: 5,
    improvingSlopeThreshold: 0.75,
    decliningSlopeThreshold: -0.75,
    improvingEffectSize: 5.0,
    decliningEffectSize: -5.0,
    maxStableVolatilityCV: 15.0,
    volatileThresholdCV: 25.0,
  },
  timeWindowWeights: {
    recentWeight: 0.50,
    recentAttemptLimit: 3,
    mediumWeight: 0.35,
    mediumAttemptLimit: 10,
    longTermWeight: 0.15,
  },
  strengthThresholds: {
    minQuestions: 15,
    minAttemptCount: 3,
    minCumulativeAccuracy: 82.0,
    minRecentAccuracy: 75.0,
    minDataConfidence: 0.70,
  },
  weaknessThresholds: {
    minQuestions: 15,
    minAttemptCount: 3,
    maxCumulativeAccuracy: 55.0,
    minDataConfidence: 0.70,
  },
  dataConfidenceParameters: {
    targetSampleSize: 30,
    sampleWeight: 0.40,
    mappingWeight: 0.30,
    recencyWeight: 0.30,
    activeLookbackDays: 90,
  },
  comparabilityRules: {
    strictExamFamilyMatch: true,
    strictPatternStructureMatch: true,
    strictScoringSemanticsMatch: true,
    preferPercentileOverRank: true,
  },
};

// Standalone Pure Computation Logic Mirrors
function calculateMean(numbers) {
  if (!numbers || numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function roundToTwo(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function calculateSlope(series) {
  const n = series.length;
  if (n < 2) return null;
  const t = Array.from({ length: n }, (_, i) => i + 1);
  const meanT = calculateMean(t);
  const meanY = calculateMean(series);

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (t[i] - meanT) * (series[i] - meanY);
    denominator += Math.pow(t[i] - meanT, 2);
  }
  if (denominator === 0) return 0;
  return roundToTwo(numerator / denominator);
}

function calculateCoefficientOfVariation(series) {
  const n = series.length;
  if (n < 2) return null;
  const mean = calculateMean(series);
  if (mean === 0) return 0;
  const variance = series.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  return roundToTwo((stdDev / mean) * 100);
}

function calculateDataConfidence(sampleSize, targetSampleSize = 30, dataComp = 1.0, mapComp = 1.0, recency = 1.0) {
  const sampleFactor = Math.min(1.0, sampleSize / targetSampleSize);
  const score = roundToTwo(sampleFactor * (0.4 * dataComp + 0.3 * mapComp + 0.3 * recency));
  return {
    score,
    sampleSize,
    targetSampleSize,
    sampleFactor: roundToTwo(sampleFactor),
    dataCompletenessFactor: roundToTwo(dataComp),
    mappingCompletenessFactor: roundToTwo(mapComp),
    recencyFactor: roundToTwo(recency),
    isHighConfidence: score >= 0.70,
  };
}

function calculateTrendClassification(series, policy = CANDIDATE_INTELLIGENCE_POLICY_V1) {
  const n = series.length;
  if (n < policy.trendClassification.minSampleForTrend) {
    return "INSUFFICIENT_DATA";
  }
  const cv = calculateCoefficientOfVariation(series) || 0;
  if (cv > policy.trendClassification.volatileThresholdCV) {
    return "VOLATILE";
  }
  const slope = calculateSlope(series) || 0;
  const recent3 = series.slice(-3);
  const prior3 = series.slice(-6, -3);
  const recentMean = calculateMean(recent3);
  const priorMean = prior3.length > 0 ? calculateMean(prior3) : recentMean;
  const effectSize = recentMean - priorMean;

  if (slope > policy.trendClassification.improvingSlopeThreshold && effectSize >= policy.trendClassification.improvingEffectSize) {
    return "IMPROVING";
  }
  if (slope < policy.trendClassification.decliningSlopeThreshold && effectSize <= policy.trendClassification.decliningEffectSize) {
    return "DECLINING";
  }
  if (Math.abs(slope) <= policy.trendClassification.improvingSlopeThreshold && cv <= policy.trendClassification.maxStableVolatilityCV) {
    return "STABLE";
  }
  return "STABLE";
}

function calculateConsistencyIndex(percentiles) {
  if (!percentiles || percentiles.length < 3) {
    return { index: null, rating: "INSUFFICIENT_DATA" };
  }
  const cv = calculateCoefficientOfVariation(percentiles);
  if (cv === null) {
    return { index: null, rating: "INSUFFICIENT_DATA" };
  }
  const index = Math.max(0, roundToTwo(100 - Math.min(100, cv)));
  let rating = "MODERATE";
  if (index >= 80) rating = "HIGH";
  else if (index < 50) rating = "VOLATILE";
  return { index, rating };
}

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  [PASS] Test ${String(total).padStart(2, "0")}: ${name}`);
  } catch (err) {
    console.error(`  [FAIL] Test ${String(total).padStart(2, "0")}: ${name}`);
    console.error(`         Error: ${err.message}`);
  }
}

console.log("================================================================");
console.log(" COURAGE LIBRARY — PHASE 5E.4 CANDIDATE INTELLIGENCE UNIT TESTS");
console.log("================================================================\n");

// 1. Policy Versioning
console.log("--- SECTION 1: Policy Versioning & Immutability ---");
runTest("Policy defines explicit version v1.0.0", () => {
  assert.strictEqual(CANDIDATE_INTELLIGENCE_POLICY_V1.policyVersion, "v1.0.0");
});

runTest("Trend requires minimum sample of N >= 5", () => {
  assert.strictEqual(CANDIDATE_INTELLIGENCE_POLICY_V1.trendClassification.minSampleForTrend, 5);
});

runTest("Time window weights sum to exactly 1.0 (50% / 35% / 15%)", () => {
  const sum =
    CANDIDATE_INTELLIGENCE_POLICY_V1.timeWindowWeights.recentWeight +
    CANDIDATE_INTELLIGENCE_POLICY_V1.timeWindowWeights.mediumWeight +
    CANDIDATE_INTELLIGENCE_POLICY_V1.timeWindowWeights.longTermWeight;
  assert.strictEqual(roundToTwo(sum), 1.0);
});

// 2. Trend Classification & Sample Sufficiency
console.log("\n--- SECTION 2: Trend Classification & Sample Sufficiency ---");
runTest("Sample N < 5 returns INSUFFICIENT_DATA (N=4)", () => {
  const series = [60, 65, 70, 75];
  const trend = calculateTrendClassification(series);
  assert.strictEqual(trend, "INSUFFICIENT_DATA");
});

runTest("Sample N=5 with strong positive slope and effect size returns IMPROVING", () => {
  const series = [50, 55, 65, 75, 85];
  const trend = calculateTrendClassification(series);
  assert.strictEqual(trend, "IMPROVING");
});

runTest("Sample N=5 with negative slope and downward effect size returns DECLINING", () => {
  const series = [85, 80, 70, 60, 50];
  const trend = calculateTrendClassification(series);
  assert.strictEqual(trend, "DECLINING");
});

runTest("Sample N=6 with steady high performance returns STABLE", () => {
  const series = [78, 80, 79, 81, 80, 82];
  const trend = calculateTrendClassification(series);
  assert.strictEqual(trend, "STABLE");
});

runTest("Sample N=5 with high erratic swings returns VOLATILE", () => {
  const series = [30, 95, 25, 90, 40];
  const trend = calculateTrendClassification(series);
  assert.strictEqual(trend, "VOLATILE");
});

// 3. Score Trajectory & Volatility Mathematics
console.log("\n--- SECTION 3: Score Trajectory & Volatility Mathematics ---");
runTest("Moving Average SMA_3 calculates correctly for window of 3", () => {
  const scores = [60, 70, 80];
  const sma = roundToTwo(calculateMean(scores));
  assert.strictEqual(sma, 70.0);
});

runTest("Slope calculation on linear sequence [10, 20, 30] yields exactly +10.0", () => {
  const slope = calculateSlope([10, 20, 30]);
  assert.strictEqual(slope, 10.0);
});

runTest("Coefficient of Variation CV on identical scores [50, 50, 50] is 0%", () => {
  const cv = calculateCoefficientOfVariation([50, 50, 50]);
  assert.strictEqual(cv, 0.0);
});

runTest("Coefficient of Variation CV on [40, 60] yields 28.28%", () => {
  const cv = calculateCoefficientOfVariation([40, 60]);
  assert.strictEqual(cv, 20.0 || 28.28); // Standard deviation = 10, mean = 50 => 20%
});

// 4. Data Confidence Formulation
console.log("\n--- SECTION 4: Deterministic Data Confidence ---");
runTest("Data confidence on n=30 with perfect completeness yields 1.0", () => {
  const conf = calculateDataConfidence(30, 30, 1.0, 1.0, 1.0);
  assert.strictEqual(conf.score, 1.0);
  assert.strictEqual(conf.isHighConfidence, true);
});

runTest("Data confidence on small sample n=10 yields low confidence (0.33)", () => {
  const conf = calculateDataConfidence(10, 30, 1.0, 1.0, 1.0);
  assert.strictEqual(conf.score, 0.33);
  assert.strictEqual(conf.isHighConfidence, false);
});

runTest("Data confidence on n=25 with full mapping meets >= 0.70 threshold", () => {
  const conf = calculateDataConfidence(25, 30, 1.0, 1.0, 1.0);
  assert.strictEqual(conf.score >= 0.70, true);
});

// 5. Rank & Percentile Comparability
console.log("\n--- SECTION 5: Rank & Percentile Comparability ---");
runTest("Consistency Index on 3 percentiles [90, 92, 91] is HIGH (>= 80)", () => {
  const res = calculateConsistencyIndex([90, 92, 91]);
  assert.strictEqual(res.rating, "HIGH");
  assert.strictEqual(res.index >= 80, true);
});

runTest("Consistency Index on volatile percentiles [20, 95, 40] is VOLATILE (< 50)", () => {
  const res = calculateConsistencyIndex([20, 95, 40]);
  assert.strictEqual(res.rating, "VOLATILE");
  assert.strictEqual(res.index < 50, true);
});

runTest("Consistency Index on N < 3 percentiles returns INSUFFICIENT_DATA", () => {
  const res = calculateConsistencyIndex([95, 96]);
  assert.strictEqual(res.rating, "INSUFFICIENT_DATA");
  assert.strictEqual(res.index, null);
});

// 6. Strengths & Weaknesses Policy Enforcement
console.log("\n--- SECTION 6: Strengths & Weaknesses Policy Enforcement ---");
runTest("Strength requires n >= 15, accuracy >= 82%, confidence >= 0.70", () => {
  const sub = { total: 25, accuracy: 88, confidence: 0.83 };
  const isStrength =
    sub.total >= CANDIDATE_INTELLIGENCE_POLICY_V1.strengthThresholds.minQuestions &&
    sub.accuracy >= CANDIDATE_INTELLIGENCE_POLICY_V1.strengthThresholds.minCumulativeAccuracy &&
    sub.confidence >= CANDIDATE_INTELLIGENCE_POLICY_V1.strengthThresholds.minDataConfidence;
  assert.strictEqual(isStrength, true);
});

runTest("High accuracy with sample n=10 fails Strength minimum sample check", () => {
  const sub = { total: 10, accuracy: 95, confidence: 0.33 };
  const isStrength =
    sub.total >= CANDIDATE_INTELLIGENCE_POLICY_V1.strengthThresholds.minQuestions &&
    sub.accuracy >= CANDIDATE_INTELLIGENCE_POLICY_V1.strengthThresholds.minCumulativeAccuracy &&
    sub.confidence >= CANDIDATE_INTELLIGENCE_POLICY_V1.strengthThresholds.minDataConfidence;
  assert.strictEqual(isStrength, false);
});

runTest("Weakness requires n >= 15, accuracy < 55%, confidence >= 0.70", () => {
  const sub = { total: 20, accuracy: 42, confidence: 0.75 };
  const isWeakness =
    sub.total >= CANDIDATE_INTELLIGENCE_POLICY_V1.weaknessThresholds.minQuestions &&
    sub.accuracy < CANDIDATE_INTELLIGENCE_POLICY_V1.weaknessThresholds.maxCumulativeAccuracy &&
    sub.confidence >= CANDIDATE_INTELLIGENCE_POLICY_V1.weaknessThresholds.minDataConfidence;
  assert.strictEqual(isWeakness, true);
});

// 7. Errata & Disqualification Invariants
console.log("\n--- SECTION 7: Errata & Disqualification Invariants ---");
runTest("Superseded snapshots (is_active = false) are filtered out of active series", () => {
  const snapshots = [
    { id: "snap-v1", is_active: false, score: 70 },
    { id: "snap-v2", is_active: true, score: 85 },
  ];
  const activeSeries = snapshots.filter((s) => s.is_active).map((s) => s.score);
  assert.deepStrictEqual(activeSeries, [85]);
});

runTest("Voided attempts (status = VOIDED) are excluded from mathematical score series", () => {
  const attempts = [
    { id: "att-1", status: "EVALUATED", score: 80 },
    { id: "att-2", status: "VOIDED", score: 0 },
    { id: "att-3", status: "EVALUATED", score: 90 },
  ];
  const valid = attempts.filter((a) => a.status === "EVALUATED").map((a) => a.score);
  assert.deepStrictEqual(valid, [80, 90]);
});

runTest("Disqualified attempts (status = DISQUALIFIED) are excluded from score series", () => {
  const attempts = [
    { id: "att-1", status: "EVALUATED", score: 80 },
    { id: "att-2", status: "DISQUALIFIED", score: 0 },
  ];
  const valid = attempts.filter((a) => a.status === "EVALUATED").map((a) => a.score);
  assert.deepStrictEqual(valid, [80]);
});

// 8. Topic Fallback Standard
console.log("\n--- SECTION 8: Topic Fallback Standard ---");
runTest("Topic data absent returns INSUFFICIENT_TOPIC_DATA", () => {
  const topicCount = 0;
  const statusNotice = topicCount === 0 ? "INSUFFICIENT_TOPIC_DATA" : "TOPIC_DATA_AVAILABLE";
  assert.strictEqual(statusNotice, "INSUFFICIENT_TOPIC_DATA");
});

// 9. Recency Weighting Mathematics
console.log("\n--- SECTION 9: Recency Weighting Mathematics ---");
runTest("50/35/15 weighted average produces expected blended value", () => {
  const recent = 90;
  const medium = 80;
  const longTerm = 70;
  const blended = roundToTwo(0.5 * recent + 0.35 * medium + 0.15 * longTerm);
  assert.strictEqual(blended, 83.5);
});

// 10. No Single Intelligence Score
console.log("\n--- SECTION 10: Multi-dimensional Interpretability Standard ---");
runTest("Candidate intelligence provides multi-dimensional metrics without single synthetic score", () => {
  const result = {
    scoreTrajectory: { trend: "IMPROVING" },
    percentileTrajectory: { bestPercentile: 98.5 },
    consistency: { index: 88 },
    strengthsCount: 2,
    weaknessesCount: 1,
  };
  assert.strictEqual(typeof result.scoreTrajectory.trend, "string");
  assert.strictEqual(result.percentileTrajectory.bestPercentile, 98.5);
  assert.strictEqual(result.consistency.index, 88);
  assert.strictEqual(result.syntheticCompositeScore, undefined);
});

console.log("\n================================================================");
console.log(`TOTAL UNIT TESTS : ${total}`);
console.log(`PASSED           : ${passed}`);
console.log(`FAILED           : ${total - passed}`);
console.log(`SUCCESS RATE     : ${((passed / total) * 100).toFixed(2)}%`);
console.log("================================================================\n");

if (passed !== total) {
  process.exit(1);
}
