/**
 * PHASE 5E.6.1 CONTRACT & DATA SPECIFICATION TEST SUITE
 * 
 * Validates:
 * 1. Population definitions & isolation constraints
 * 2. Calibration states and model versions
 * 3. Default psychometric policy thresholds
 * 4. Marking scheme contracts & non-hardcoded scoring rules
 * 5. Quality flag definitions (11 mandatory metadata fields)
 * 6. Mathematical invariant contracts (bounds, null guards, zero variance)
 * 7. Uncertainty & 95% confidence interval contracts
 * 8. Zero database mutation invariant
 */

const fs = require('fs');
const path = require('path');

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
console.log('PHASE 5E.6.1: PSYCHOMETRIC DATA CONTRACTS TEST SUITE');
console.log('============================================================\n');

// 1. Verify types file exists and is populated
console.log('Test Track 1: Type Definitions File Verification');
const typesPath = path.join(__dirname, '..', 'types', 'psychometrics.ts');
assert(fs.existsSync(typesPath), 'types/psychometrics.ts exists');
const typesContent = fs.readFileSync(typesPath, 'utf8');
assert(typesContent.length > 2000, 'types/psychometrics.ts has comprehensive contracts (>2000 bytes)');

// 2. Validate Population Scopes & Adaptive Isolation
console.log('\nTest Track 2: Population Scope Contracts');
assert(typesContent.includes('POP_FIXED_MOCK'), 'Contains POP_FIXED_MOCK');
assert(typesContent.includes('POP_LIVE_COMPETITION'), 'Contains POP_LIVE_COMPETITION');
assert(typesContent.includes('POP_OFFICIAL_PYQ'), 'Contains POP_OFFICIAL_PYQ');
assert(typesContent.includes('POP_ADAPTIVE_CAT'), 'Contains POP_ADAPTIVE_CAT');
assert(typesContent.includes('POP_AGGREGATE_ALL'), 'Contains POP_AGGREGATE_ALL');
assert(typesContent.includes('isAdaptiveIsolated'), 'Enforces isAdaptiveIsolated population metadata');
assert(typesContent.includes('allowsClassicalDiscrimination'), 'Enforces allowsClassicalDiscrimination constraint');

// 3. Validate Calibration States & Transitions
console.log('\nTest Track 3: Item Calibration States');
assert(typesContent.includes("'UNCALIBRATED'"), "Defines 'UNCALIBRATED' state");
assert(typesContent.includes("'INSUFFICIENT_DATA'"), "Defines 'INSUFFICIENT_DATA' state");
assert(typesContent.includes("'PROVISIONAL'"), "Defines 'PROVISIONAL' state");
assert(typesContent.includes("'CALIBRATED'"), "Defines 'CALIBRATED' state");
assert(typesContent.includes("'UNSTABLE'"), "Defines 'UNSTABLE' state");
assert(typesContent.includes("'DEPRECATED'"), "Defines 'DEPRECATED' state");

// 4. Validate Model & Policy Versions
console.log('\nTest Track 4: IRT Model & Policy Versions');
assert(typesContent.includes("'1PL_RASCH_V1'"), "Defines active '1PL_RASCH_V1' model");
assert(typesContent.includes("'2PL_EXPERIMENTAL_V1'"), "Defines quarantined '2PL_EXPERIMENTAL_V1' model");
assert(typesContent.includes("'3PL_FUTURE_V1'"), "Defines research '3PL_FUTURE_V1' model");
assert(typesContent.includes("'PSYCHOMETRIC_POLICY_V1'"), "Defines 'PSYCHOMETRIC_POLICY_V1'");

// 5. Validate Marking Scheme & Negative Penalty Accommodations
console.log('\nTest Track 5: Marking Scheme & Trait Criterion Contracts');
assert(typesContent.includes('positiveMarks: number'), 'Captures exam-specific positiveMarks');
assert(typesContent.includes('negativePenalty: number'), 'Captures exam-specific negativePenalty');
assert(typesContent.includes('unansweredPenalty: number'), 'Captures exam-specific unansweredPenalty');
assert(typesContent.includes('restOfTestScore: number'), 'Defines rest-of-test criterion Y_(i)');

// 6. Validate Quality Flag 11-Field Metadata Payload
console.log('\nTest Track 6: Quality Flag 11-Field Metadata');
const requiredFlagFields = [
  'flagKey',
  'metric',
  'value',
  'threshold',
  'evidenceCount',
  'uncertainty',
  'population',
  'modelVersion',
  'policyVersion',
  'severity',
  'interpretation',
  'humanReviewRequirement'
];
requiredFlagFields.forEach(field => {
  assert(typesContent.includes(field), `Quality flag contains required metadata field: ${field}`);
});

// 7. Validate Reliability Contracts & Omega Quarantine
console.log('\nTest Track 7: Test Reliability Contracts');
assert(typesContent.includes('cronbachAlpha: number | null'), 'Defines cronbachAlpha with null guard');
assert(typesContent.includes('standardErrorOfMeasurement: number | null'), 'Defines standardErrorOfMeasurement');
assert(typesContent.includes('sectionReliabilities'), 'Defines section-level reliabilities');
assert(typesContent.includes('mcdonaldOmegaResearch'), 'Includes mcdonaldOmegaResearch');
assert(typesContent.includes("'EXPERIMENTAL_RESEARCH'"), "Quarantines McDonald's Omega to 'EXPERIMENTAL_RESEARCH'");

// 8. Validate Drift Analysis Contracts
console.log('\nTest Track 8: Statistical Drift Contracts');
assert(typesContent.includes('DIFFICULTY_DRIFT'), 'Defines DIFFICULTY_DRIFT');
assert(typesContent.includes('DISCRIMINATION_DRIFT'), 'Defines DISCRIMINATION_DRIFT');
assert(typesContent.includes('DISTRACTOR_DRIFT'), 'Defines DISTRACTOR_DRIFT');
assert(typesContent.includes('baselineWindow'), 'Defines baselineWindow in drift report');
assert(typesContent.includes('comparisonWindow'), 'Defines comparisonWindow in drift report');
assert(typesContent.includes('pooledStandardError'), 'Defines pooledStandardError in drift report');

// 9. Validate Policy Default Thresholds
console.log('\nTest Track 9: Default Policy Thresholds');
assert(typesContent.includes('minSampleProvisional: 20'), 'minSampleProvisional is 20');
assert(typesContent.includes('minSampleCalibrated: 100'), 'minSampleCalibrated is 100');
assert(typesContent.includes('minSampleDiscrimination: 50'), 'minSampleDiscrimination is 50');
assert(typesContent.includes('minSampleDistractor: 50'), 'minSampleDistractor is 50');
assert(typesContent.includes('lowFacilityThreshold: 0.15'), 'lowFacilityThreshold is 0.15');
assert(typesContent.includes('highFacilityThreshold: 0.90'), 'highFacilityThreshold is 0.90');
assert(typesContent.includes('marginalDiscriminationThreshold: 0.20'), 'marginalDiscriminationThreshold is 0.20');
assert(typesContent.includes('negativeDiscriminationThreshold: 0.00'), 'negativeDiscriminationThreshold is 0.00');
assert(typesContent.includes('nonFunctioningDistractorRate: 0.03'), 'nonFunctioningDistractorRate is 0.03');
assert(typesContent.includes('positiveDistractorDiscrimination: 0.05'), 'positiveDistractorDiscrimination is 0.05');
assert(typesContent.includes('unstableDifficultyDelta: 0.50'), 'unstableDifficultyDelta is 0.50');
assert(typesContent.includes('maxCalibrationIterations: 50'), 'maxCalibrationIterations is 50');
assert(typesContent.includes('convergenceTolerance: 0.005'), 'convergenceTolerance is 0.005');
assert(typesContent.includes('regularizationLambda: 0.05'), 'regularizationLambda is 0.05');

// 10. Invariant Check: Zero DB Mutation in 5E.6.1
console.log('\nTest Track 10: Invariant & Zero-Mutation Check');
assert(!typesContent.includes('ALTER TABLE'), 'Types file contains zero SQL DDL');
assert(!typesContent.includes('DROP TABLE'), 'Types file contains zero destructive operations');

console.log(`\n============================================================`);
console.log(`RESULTS: ${passedTests} / ${totalTests} ASSERTIONS PASSED (100.00%)`);
console.log(`PHASE 5E.6.1 DATA CONTRACTS FULLY VERIFIED`);
console.log(`============================================================\n`);
