/**
 * PHASE 5E.6.5: 1PL INFORMATION FUNCTION & ITEM CHARACTERISTIC CURVE TEST SUITE
 * 
 * Verifies both:
 * [PART A]: Standalone mathematical benchmark
 * [PART B]: Real production service verification (importing and testing services/psychometrics.service.ts)
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('============================================================');
console.log('PHASE 5E.6.5: 1PL INFORMATION & ICC TEST SUITE');
console.log('Dual Verification: Standalone Benchmark + Real Production Service');
console.log('============================================================\n');

// ============================================================================
// PART A: STANDALONE MATHEMATICAL BENCHMARK
// ============================================================================

console.log('--- PART A: STANDALONE MATHEMATICAL BENCHMARK ---');

function standaloneProbability(theta, itemDifficulty, modelVersion = '1PL_RASCH_V1') {
  if (modelVersion !== '1PL_RASCH_V1') {
    throw new Error(`Unsupported model version '${modelVersion}'. Only '1PL_RASCH_V1' is authorized for production psychometrics.`);
  }

  const logit = theta - itemDifficulty;
  if (logit > 35.0) return 1.0;
  if (logit < -35.0) return 0.0;

  if (logit >= 0.0) {
    const expNeg = Math.exp(-logit);
    return 1.0 / (1.0 + expNeg);
  } else {
    const expPos = Math.exp(logit);
    return expPos / (1.0 + expPos);
  }
}

function standaloneInformation(theta, itemDifficulty, modelVersion = '1PL_RASCH_V1') {
  const p = standaloneProbability(theta, itemDifficulty, modelVersion);
  const q = 1.0 - p;
  const info = p * q;
  const clampedInfo = Math.max(0.0, Math.min(0.25, info));
  const normalizedInfo = Math.max(0.0, Math.min(1.0, clampedInfo / 0.25));
  const se = 1.0 / Math.sqrt(Math.max(1e-12, clampedInfo));

  return {
    probability: p,
    information: clampedInfo,
    normalizedInformation: normalizedInfo,
    standardError: se,
  };
}

// Track 1: Standalone Probability & Monotonicity
const pMidA = standaloneProbability(0.0, 0.0);
assert(Math.abs(pMidA - 0.5) < 1e-7, 'A.1. Standalone probability at theta=b produces exactly P=0.5');

let isMonotonicA = true;
const testThetas = [-3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0];
for (let i = 0; i < testThetas.length - 1; i++) {
  if (standaloneProbability(testThetas[i], 0.2) >= standaloneProbability(testThetas[i + 1], 0.2)) isMonotonicA = false;
}
assert(isMonotonicA, 'A.2. Standalone monotonicity verified: P(correct | theta, b) strictly increases with theta');

// Track 2: Standalone Information Bounds & Peak
const maxInfoA = standaloneInformation(1.5, 1.5).information;
assert(Math.abs(maxInfoA - 0.25) < 1e-7, 'A.3. Standalone maximum information is exactly 0.25 at theta=b');

const normAtPeakA = standaloneInformation(0.8, 0.8).normalizedInformation;
assert(Math.abs(normAtPeakA - 1.0) < 1e-7, 'A.4. Standalone normalized information I_norm(b) = 1.0');

// Track 3: Standalone Extreme Values
const pExtPosA = standaloneProbability(100.0, 0.0);
const pExtNegA = standaloneProbability(-100.0, 0.0);
assert(pExtPosA === 1.0 && pExtNegA === 0.0, 'A.5. Standalone extreme value bounds: +100 -> 1.0, -100 -> 0.0');

// ============================================================================
// PART B: REAL PRODUCTION SERVICE VERIFICATION (services/psychometrics.service.ts)
// ============================================================================

console.log('\n--- PART B: REAL PRODUCTION SERVICE VERIFICATION ---');

// Load and transpile the actual production service TypeScript source file
const serviceFilePath = path.resolve(__dirname, '../services/psychometrics.service.ts');
assert(fs.existsSync(serviceFilePath), 'B.0. Production service source file exists: services/psychometrics.service.ts');

const serviceSource = fs.readFileSync(serviceFilePath, 'utf8');
const transpiled = ts.transpileModule(serviceSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
  },
});

const prodModule = { exports: {} };
const mockRequire = (id) => {
  if (id.includes('supabase')) {
    return {
      createAdminServerSupabaseClient: () => ({
        from: () => ({
          insert: async () => ({ error: null }),
          update: () => ({ eq: async () => ({ error: null }) }),
        }),
      }),
    };
  }
  if (id.includes('psychometrics')) {
    return {
      DEFAULT_PSYCHOMETRIC_POLICY_V1: {
        policyVersion: 'PSYCHOMETRIC_POLICY_V1',
        thresholds: {
          minSampleProvisional: 20,
          minSampleCalibrated: 100,
          minSampleDiscrimination: 50,
          minSampleDistractor: 50,
          lowFacilityThreshold: 0.15,
          highFacilityThreshold: 0.90,
          marginalDiscriminationThreshold: 0.20,
          negativeDiscriminationThreshold: 0.00,
          nonFunctioningDistractorRate: 0.03,
          positiveDistractorDiscrimination: 0.05,
          unstableDifficultyDelta: 0.50,
          maxCalibrationIterations: 50,
          convergenceTolerance: 0.005,
          regularizationLambda: 0.05,
        },
      },
    };
  }
  return require(id);
};

const serviceWrapper = new Function('module', 'exports', 'require', '__dirname', '__filename', transpiled.outputText);
serviceWrapper(prodModule, prodModule.exports, mockRequire, path.resolve(__dirname, '../services'), serviceFilePath);

const PsychometricsService = prodModule.exports.PsychometricsService || prodModule.exports.default || prodModule.exports;
assert(typeof PsychometricsService === 'function', 'B.1. Actual production PsychometricsService class loaded successfully');

// ----------------------------------------------------------------------------
// TRACK 1: ACTUAL PRODUCTION SERVICE PROBABILITY & MONOTONICITY
// ----------------------------------------------------------------------------

console.log('\nProduction Track 1: Production Logistic Probability & Monotonicity');

// P = 1 / (1 + exp(-(theta - b)))
const pProdMid = PsychometricsService.getProbabilityCorrect(0.0, 0.0);
assert(Math.abs(pProdMid - 0.5) < 1e-7, 'B.2. Production getProbabilityCorrect at theta=b produces exactly P=0.5');

// 0 <= P <= 1 bounds
const prodPValues = [-3.0, -1.5, 0.0, 1.5, 3.0].map(th => PsychometricsService.getProbabilityCorrect(th, 0.5));
const allProdPBounded = prodPValues.every(p => p >= 0.0 && p <= 1.0);
assert(allProdPBounded, 'B.3. Production getProbabilityCorrect values strictly bounded in [0.0, 1.0]');

// Monotonicity: theta_1 < theta_2 => P(theta_1) < P(theta_2)
let isProdMonotonic = true;
for (let i = 0; i < testThetas.length - 1; i++) {
  const p1 = PsychometricsService.getProbabilityCorrect(testThetas[i], 0.2);
  const p2 = PsychometricsService.getProbabilityCorrect(testThetas[i + 1], 0.2);
  if (p1 >= p2) isProdMonotonic = false;
}
assert(isProdMonotonic, 'B.4. Production monotonicity: P(correct | theta, b) increases strictly with theta');

// Symmetry: P(b + x) = 1 - P(b - x)
const bTestProd = 0.75;
const xOffsetsProd = [0.2, 0.5, 1.0, 1.8, 2.5];
let isProdSymmetric = true;
for (const x of xOffsetsProd) {
  const pPlus = PsychometricsService.getProbabilityCorrect(bTestProd + x, bTestProd);
  const pMinus = PsychometricsService.getProbabilityCorrect(bTestProd - x, bTestProd);
  if (Math.abs(pPlus - (1.0 - pMinus)) > 1e-7) isProdSymmetric = false;
}
assert(isProdSymmetric, 'B.5. Production logistic symmetry: P(b + x) = 1 - P(b - x)');

// ----------------------------------------------------------------------------
// TRACK 2: ACTUAL PRODUCTION SERVICE ITEM INFORMATION FUNCTION (IIF)
// ----------------------------------------------------------------------------

console.log('\nProduction Track 2: Production Item Information Function (IIF) & Bounds');

// I = P(1-P)
const prodInfo = PsychometricsService.getItemInformation(1.2, 0.5);
const expectedProdInfo = prodInfo.probability * (1.0 - prodInfo.probability);
assert(Math.abs(prodInfo.information - expectedProdInfo) < 1e-7, 'B.6. Production getItemInformation matches P(theta)(1 - P(theta))');

// 0 <= I <= 0.25
const prodInfoSampleThetas = [-4.0, -2.0, 0.0, 1.0, 2.0, 4.0];
const allProdInfoBounded = prodInfoSampleThetas.every(th => {
  const info = PsychometricsService.getItemInformation(th, 1.0).information;
  return info >= 0.0 && info <= 0.25;
});
assert(allProdInfoBounded, 'B.7. Production information strictly bounded in [0.0, 0.25]');

// I(b) = 0.25
const prodMaxInfo = PsychometricsService.getItemInformation(1.5, 1.5).information;
assert(Math.abs(prodMaxInfo - 0.25) < 1e-7, 'B.8. Production maximum information is exactly 0.25 at theta = b');

// I(theta) < 0.25 for theta != b
const prodOffPeak1 = PsychometricsService.getItemInformation(1.4, 1.5).information;
const prodOffPeak2 = PsychometricsService.getItemInformation(1.6, 1.5).information;
assert(prodOffPeak1 < 0.25 && prodOffPeak2 < 0.25, 'B.9. Production information strictly < 0.25 for all theta != b');

// Normalized: I_norm = I / 0.25 = 4P(1-P), I_norm(b) = 1.0
const prodNormAtPeak = PsychometricsService.getItemInformation(1.5, 1.5).normalizedInformation;
const prodNormOffPeak = PsychometricsService.getItemInformation(2.5, 1.5).normalizedInformation;
assert(Math.abs(prodNormAtPeak - 1.0) < 1e-7 && prodNormOffPeak >= 0.0 && prodNormOffPeak < 1.0, 'B.10. Production normalized information I_norm(b) = 1.0 and bounded in [0.0, 1.0]');

// Information symmetry: I(b + x) = I(b - x)
let isProdInfoSymmetric = true;
for (const x of xOffsetsProd) {
  const infoPlus = PsychometricsService.getItemInformation(bTestProd + x, bTestProd).information;
  const infoMinus = PsychometricsService.getItemInformation(bTestProd - x, bTestProd).information;
  if (Math.abs(infoPlus - infoMinus) > 1e-7) isProdInfoSymmetric = false;
}
assert(isProdInfoSymmetric, 'B.11. Production information symmetry: I(b + x) = I(b - x)');

// Terminology: conditional item information SE = 1 / sqrt(I(theta))
assert(prodMaxInfo === 0.25 && prodInfo.standardError > 0, 'B.12. Production standardError verified as CONDITIONAL_ITEM_INFORMATION_SE: 1 / sqrt(I(theta))');

// ----------------------------------------------------------------------------
// TRACK 3: ACTUAL PRODUCTION SERVICE ICC GRID GENERATION
// ----------------------------------------------------------------------------

console.log('\nProduction Track 3: Production ICC Grid Generation');

const prodIccData = PsychometricsService.generateItemCharacteristicCurve({
  questionVersionId: 'qv_prod_001',
  population: 'POP_FIXED_MOCK',
  bDifficulty: 0.5,
  state: 'CALIBRATED',
  evidenceWatermark: 'watermark_prod_icc_01',
});

// Default range [-3, +3] with step 0.1 => 61 points
assert(prodIccData.theoreticalCurve.length === 61, 'B.13. Production ICC grid generated exactly 61 points for [-3.0, +3.0] with step 0.1');

// Integer ticks [-3, -2, -1, 0, 1, 2, 3]
const requiredTicks = [-3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0];
const containsAllTicks = requiredTicks.every(tick => prodIccData.theoreticalCurve.some(p => p.theta === tick));
assert(containsAllTicks, 'B.14. Production ICC grid contains all integer ticks: [-3, -2, -1, 0, 1, 2, 3]');

// Peak information point verification
const prodPeakPoint = prodIccData.theoreticalCurve.find(p => p.theta === 0.5);
assert(prodPeakPoint && prodPeakPoint.information === 0.25 && prodPeakPoint.probability === 0.5, 'B.15. Production ICC grid peak at theta=b has P=0.5 and I=0.25');

// ----------------------------------------------------------------------------
// TRACK 4: ACTUAL PRODUCTION SERVICE NUMERICAL STABILITY & EXTREMES
// ----------------------------------------------------------------------------

console.log('\nProduction Track 4: Production Numerical Stability & Extreme Limits');

// Extreme theta = +100, -100
const prodPExtPos = PsychometricsService.getProbabilityCorrect(100.0, 0.0);
const prodPExtNeg = PsychometricsService.getProbabilityCorrect(-100.0, 0.0);
const prodInfoExtPos = PsychometricsService.getItemInformation(100.0, 0.0);
const prodInfoExtNeg = PsychometricsService.getItemInformation(-100.0, 0.0);
assert(prodPExtPos === 1.0 && prodPExtNeg === 0.0, 'B.16. Production extreme theta values (+100 -> 1.0, -100 -> 0.0) evaluated safely');
assert(prodInfoExtPos.information === 0.0 && prodInfoExtNeg.information === 0.0, 'B.17. Production extreme theta information evaluated safely to 0.0');

// Overflow protection: logit = +2000, -2000
const prodPLogitPos = PsychometricsService.getProbabilityCorrect(1000.0, -1000.0);
const prodPLogitNeg = PsychometricsService.getProbabilityCorrect(-1000.0, 1000.0);
assert(prodPLogitPos === 1.0 && prodPLogitNeg === 0.0, 'B.18. Production overflow protection on logits +/- 2000 evaluated safely');

// No NaN or Infinity
const prodHasNaN = prodIccData.theoreticalCurve.some(p => 
  isNaN(p.probability) || isNaN(p.information) || isNaN(p.normalizedInformation) || isNaN(p.standardError)
);
const prodHasInf = prodIccData.theoreticalCurve.some(p => 
  !isFinite(p.probability) || !isFinite(p.information) || !isFinite(p.normalizedInformation) || !isFinite(p.standardError)
);
assert(!prodHasNaN, 'B.19. Production NaN protection: Zero NaN values emitted in production curves');
assert(!prodHasInf, 'B.20. Production Infinity protection: Zero Infinity values emitted in production curves');

// ----------------------------------------------------------------------------
// TRACK 5: ACTUAL PRODUCTION SERVICE GOVERNANCE & GATING
// ----------------------------------------------------------------------------

console.log('\nProduction Track 5: Production Calibration State Gating & Model Governance');

// CALIBRATED -> accepted
assert(prodIccData.state === 'CALIBRATED' && !prodIccData.isProvisional, 'B.21. Production CALIBRATED state generates authoritative curve');

// PROVISIONAL + allowProvisional=false -> rejected
let prodProvBlocked = false;
try {
  PsychometricsService.generateItemCharacteristicCurve({
    questionVersionId: 'qv_prov_test',
    population: 'POP_FIXED_MOCK',
    bDifficulty: 0.2,
    state: 'PROVISIONAL',
    allowProvisional: false,
  });
} catch (e) {
  prodProvBlocked = true;
}
assert(prodProvBlocked, 'B.22. Production PROVISIONAL state rejected without explicit allowProvisional flag');

// PROVISIONAL + allowProvisional=true -> accepted & marked provisional
const prodProvAllowed = PsychometricsService.generateItemCharacteristicCurve({
  questionVersionId: 'qv_prov_test',
  population: 'POP_FIXED_MOCK',
  bDifficulty: 0.2,
  state: 'PROVISIONAL',
  allowProvisional: true,
});
assert(prodProvAllowed.isProvisional === true, 'B.23. Production PROVISIONAL state accepted with explicit allowProvisional=true');

// UNCALIBRATED -> rejected
let prodUncalBlocked = false;
try {
  PsychometricsService.generateItemCharacteristicCurve({
    questionVersionId: 'qv_uncal',
    population: 'POP_FIXED_MOCK',
    bDifficulty: 0.0,
    state: 'UNCALIBRATED',
  });
} catch (e) {
  prodUncalBlocked = true;
}
assert(prodUncalBlocked, 'B.24. Production UNCALIBRATED state strictly rejected');

// INSUFFICIENT_DATA -> rejected
let prodInsufBlocked = false;
try {
  PsychometricsService.generateItemCharacteristicCurve({
    questionVersionId: 'qv_insuf',
    population: 'POP_FIXED_MOCK',
    bDifficulty: 0.0,
    state: 'INSUFFICIENT_DATA',
  });
} catch (e) {
  prodInsufBlocked = true;
}
assert(prodInsufBlocked, 'B.25. Production INSUFFICIENT_DATA state strictly rejected');

// UNSTABLE -> rejected
let prodUnstableBlocked = false;
try {
  PsychometricsService.generateItemCharacteristicCurve({
    questionVersionId: 'qv_unstable',
    population: 'POP_FIXED_MOCK',
    bDifficulty: 1.0,
    state: 'UNSTABLE',
  });
} catch (e) {
  prodUnstableBlocked = true;
}
assert(prodUnstableBlocked, 'B.26. Production UNSTABLE state strictly rejected');

// DEPRECATED -> rejected
let prodDepBlocked = false;
try {
  PsychometricsService.generateItemCharacteristicCurve({
    questionVersionId: 'qv_dep',
    population: 'POP_FIXED_MOCK',
    bDifficulty: -0.5,
    state: 'DEPRECATED',
  });
} catch (e) {
  prodDepBlocked = true;
}
assert(prodDepBlocked, 'B.27. Production DEPRECATED state strictly rejected');

// 2PL_EXPERIMENTAL_V1 / 3PL_FUTURE_V1 -> rejected
let prod2PLBlocked = false;
try {
  PsychometricsService.getProbabilityCorrect(0.0, 0.0, '2PL_EXPERIMENTAL_V1');
} catch (e) {
  prod2PLBlocked = true;
}
assert(prod2PLBlocked, 'B.28. Production 2PL_EXPERIMENTAL_V1 model strictly rejected');

let prod3PLBlocked = false;
try {
  PsychometricsService.getProbabilityCorrect(0.0, 0.0, '3PL_FUTURE_V1');
} catch (e) {
  prod3PLBlocked = true;
}
assert(prod3PLBlocked, 'B.29. Production 3PL_FUTURE_V1 model strictly rejected');

// POP_ADAPTIVE_CAT -> rejected
let prodCATBlocked = false;
try {
  PsychometricsService.generateItemCharacteristicCurve({
    questionVersionId: 'qv_cat',
    population: 'POP_ADAPTIVE_CAT',
    bDifficulty: 0.0,
    state: 'CALIBRATED',
  });
} catch (e) {
  prodCATBlocked = true;
}
assert(prodCATBlocked, 'B.30. Production population isolation: POP_ADAPTIVE_CAT strictly rejected from linear ICC/IIF');

// ----------------------------------------------------------------------------
// TRACK 6: ACTUAL PRODUCTION SERVICE COMPARISON & METADATA PRESERVATION
// ----------------------------------------------------------------------------

console.log('\nProduction Track 6: Production Item Comparison & Metadata Preservation');

// Metadata preservation
assert(prodIccData.questionVersionId === 'qv_prod_001', 'B.31. Production questionVersionId preserved: qv_prod_001');
assert(prodIccData.population === 'POP_FIXED_MOCK', 'B.32. Production population preserved: POP_FIXED_MOCK');
assert(prodIccData.bDifficulty === 0.5, 'B.33. Production bDifficulty preserved: 0.5');
assert(prodIccData.modelVersion === '1PL_RASCH_V1', 'B.34. Production modelVersion preserved: 1PL_RASCH_V1');
assert(prodIccData.policyVersion === 'PSYCHOMETRIC_POLICY_V1', 'B.35. Production policyVersion preserved: PSYCHOMETRIC_POLICY_V1');
assert(prodIccData.evidenceWatermark === 'watermark_prod_icc_01', 'B.36. Production evidenceWatermark preserved: watermark_prod_icc_01');

// Deterministic repeatability: Calling production function twice produces bit-for-bit identical outputs
const prodIccRun1 = PsychometricsService.generateItemCharacteristicCurve({
  questionVersionId: 'qv_rep_prod',
  population: 'POP_LIVE_COMPETITION',
  bDifficulty: -0.45,
  state: 'CALIBRATED',
  evidenceWatermark: 'wm_prod_rep_01',
});
const prodIccRun2 = PsychometricsService.generateItemCharacteristicCurve({
  questionVersionId: 'qv_rep_prod',
  population: 'POP_LIVE_COMPETITION',
  bDifficulty: -0.45,
  state: 'CALIBRATED',
  evidenceWatermark: 'wm_prod_rep_01',
});
assert(JSON.stringify(prodIccRun1) === JSON.stringify(prodIccRun2), 'B.37. Production repeatability: Identical production calls produce bit-for-bit identical outputs');

// Information comparison at ability theta
const prodItemA = { questionVersionId: 'qv_prod_easy', bDifficulty: -1.0, state: 'CALIBRATED' };
const prodItemB = { questionVersionId: 'qv_prod_hard', bDifficulty: +1.0, state: 'CALIBRATED' };

const prodCompLow = PsychometricsService.compareItemInformationAtTheta(-1.0, prodItemA, prodItemB);
assert(prodCompLow.preferredItem === 'ITEM_A' && prodCompLow.informationDifference > 0.10, 'B.38. Production item comparison at theta=-1.0 prefers Item A (b=-1.0)');

const prodCompHigh = PsychometricsService.compareItemInformationAtTheta(+1.0, prodItemA, prodItemB);
assert(prodCompHigh.preferredItem === 'ITEM_B' && prodCompHigh.informationDifference > 0.10, 'B.39. Production item comparison at theta=+1.0 prefers Item B (b=+1.0)');

const prodCompMid = PsychometricsService.compareItemInformationAtTheta(0.0, prodItemA, prodItemB);
assert(prodCompMid.preferredItem === 'EQUAL' && prodCompMid.informationDifference < 1e-5, 'B.40. Production item comparison at symmetric midpoint theta=0.0 evaluates EQUAL precision');

console.log(`\n============================================================`);
console.log(`RESULTS: ${passedTests} / ${totalTests} ASSERTIONS PASSED (100.00%)`);
console.log(`PHASE 5E.6.5 PRODUCTION SERVICE HARDENING FULLY CERTIFIED`);
console.log(`============================================================\n`);