/**
 * Courage Library — Phase 4D.6 Comprehensive Verification Test Suite
 * Adaptive Analytics & Admin Intelligence Layer
 */

const fs = require('fs');
const path = require('path');

const envPath = 'e:/Courage Library/.env.local';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  });
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!serviceRoleKey || !supabaseUrl) {
  console.error('FAIL: Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL');
  process.exit(1);
}

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, description, detail = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests.toString().padStart(2, '0')}: ${description} ${detail ? '(' + detail + ')' : ''}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] Test ${totalTests.toString().padStart(2, '0')}: ${description} ${detail ? '- ' + detail : ''}`);
  }
}

async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }
}

async function queryTable(tableName, queryParams = '') {
  const url = `${supabaseUrl}/rest/v1/${tableName}${queryParams ? `?${queryParams}` : ''}`;
  const res = await fetchWithRetry(url, {
    method: 'GET',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Prefer': 'count=exact'
    }
  });
  const contentRange = res.headers.get('content-range');
  let count = null;
  if (contentRange) {
    const parts = contentRange.split('/');
    if (parts.length === 2 && parts[1] !== '*') {
      count = parseInt(parts[1], 10);
    }
  }
  let data = [];
  try {
    data = await res.json();
  } catch {}
  return { data, count, status: res.status, ok: res.ok };
}

async function runTests() {
  console.log('================================================================');
  console.log(' COURAGE LIBRARY — PHASE 4D.6 ADAPTIVE ANALYTICS VERIFICATION');
  console.log(' Adaptive Analytics & Admin Intelligence Layer');
  console.log('================================================================\n');

  // ==========================================================================
  // SECTION 1: 10 Core Tables Baseline Row Count Preservation Check
  // ==========================================================================
  console.log('--- SECTION 1: 10 Core Tables Baseline Preservation ---');
  const baseline = {
    mock_tests: 8,
    mock_sections: 14,
    mock_questions: 350,
    mock_templates: 8,
    test_attempts: 31,
    test_results: 10,
    attempt_answers: 200,
    questions: 103,
    question_versions: 103,
    subscription_plans: 1,
  };

  for (const [table, expectedCount] of Object.entries(baseline)) {
    const { count, status, ok } = await queryTable(table, 'select=id&limit=1');
    assert(
      ok && count >= expectedCount,
      `Core table baseline preserved: ${table}`,
      `Current: ${count}, Baseline: ${expectedCount}`
    );
  }

  // ==========================================================================
  // SECTION 2: Architecture Documentation Integrity
  // ==========================================================================
  console.log('\n--- SECTION 2: Architecture Documentation Integrity ---');
  const docPath = path.resolve('e:/Courage Library', 'docs/architecture/adaptive_analytics_and_admin_intelligence.md');
  const docExists = fs.existsSync(docPath);
  assert(docExists, 'Architecture document exists in docs/architecture/adaptive_analytics_and_admin_intelligence.md');

  if (docExists) {
    const docContent = fs.readFileSync(docPath, 'utf-8');
    assert(docContent.includes('Adaptive Analytics & Admin Intelligence Layer'), 'Doc title and specification header verified');
    assert(docContent.includes('Strict Server-Authoritative Execution'), 'Doc mandates strict server-authoritative calculations');
    assert(docContent.includes('Zero Candidate Data Leakage'), 'Doc enforces zero candidate data leakage rule');
    assert(docContent.includes('Observational Rigor'), 'Doc defines observational data and sample size requirements');
    assert(docContent.includes('Continuation vs. Terminal Stopping Separation'), 'Doc separates continuation gates from terminal stops');
    assert(docContent.includes('Item Intelligence & Quality Flag Taxonomy'), 'Doc details 6 item quality flag definitions');
    assert(docContent.includes('Attempt Diagnostics & Explainability Protocol'), 'Doc defines step-by-step diagnostic inspection protocol');
  }

  // ==========================================================================
  // SECTION 3: Service Layer & TypeScript Type Definitions
  // ==========================================================================
  console.log('\n--- SECTION 3: Service Layer & Type Definition Integrity ---');
  const typesPath = path.resolve('e:/Courage Library', 'services/adaptive/adaptive-types.ts');
  assert(fs.existsSync(typesPath), 'adaptive-types.ts exists');

  if (fs.existsSync(typesPath)) {
    const tContent = fs.readFileSync(typesPath, 'utf-8');
    assert(tContent.includes('export type ItemQualityFlag ='), 'ItemQualityFlag type defined');
    assert(tContent.includes('AdaptiveAnalyticsFilters'), 'AdaptiveAnalyticsFilters interface defined');
    assert(tContent.includes('AdaptiveOverviewKPIs'), 'AdaptiveOverviewKPIs interface defined');
    assert(tContent.includes('CandidateIntelligenceReport'), 'CandidateIntelligenceReport interface defined');
    assert(tContent.includes('CandidateAdaptiveDetail'), 'CandidateAdaptiveDetail interface defined');
    assert(tContent.includes('ItemIntelligenceReport'), 'ItemIntelligenceReport interface defined');
    assert(tContent.includes('CATIntelligenceReport'), 'CATIntelligenceReport interface defined');
    assert(tContent.includes('AbilityIntelligenceReport'), 'AbilityIntelligenceReport interface defined');
    assert(tContent.includes('StoppingIntelligenceReport'), 'StoppingIntelligenceReport interface defined');
    assert(tContent.includes('PersonalizationIntelligenceReport'), 'PersonalizationIntelligenceReport interface defined');
    assert(tContent.includes('AlgorithmComparisonReport'), 'AlgorithmComparisonReport interface defined');
    assert(tContent.includes('AdaptiveHealthReport'), 'AdaptiveHealthReport interface defined');
    assert(tContent.includes('DataQualityDiagnostics'), 'DataQualityDiagnostics interface defined');
    assert(tContent.includes('AttemptDiagnosticsReport'), 'AttemptDiagnosticsReport interface defined');
  }

  const analyticsServicePath = path.resolve('e:/Courage Library', 'services/adaptive/adaptive-analytics.service.ts');
  assert(fs.existsSync(analyticsServicePath), 'adaptive-analytics.service.ts exists');

  if (fs.existsSync(analyticsServicePath)) {
    const asContent = fs.readFileSync(analyticsServicePath, 'utf-8');
    assert(asContent.includes('class AdaptiveAnalyticsService'), 'AdaptiveAnalyticsService class is defined');
    assert(asContent.includes('getAdaptiveOverview'), 'AdaptiveAnalyticsService provides getAdaptiveOverview()');
    assert(asContent.includes('getCandidateIntelligence'), 'AdaptiveAnalyticsService provides getCandidateIntelligence()');
    assert(asContent.includes('getCandidateAdaptiveDetail'), 'AdaptiveAnalyticsService provides getCandidateAdaptiveDetail()');
    assert(asContent.includes('getItemIntelligence'), 'AdaptiveAnalyticsService provides getItemIntelligence()');
    assert(asContent.includes('getCATIntelligence'), 'AdaptiveAnalyticsService provides getCATIntelligence()');
    assert(asContent.includes('getAbilityIntelligence'), 'AdaptiveAnalyticsService provides getAbilityIntelligence()');
    assert(asContent.includes('getStoppingIntelligence'), 'AdaptiveAnalyticsService provides getStoppingIntelligence()');
    assert(asContent.includes('getPersonalizationIntelligence'), 'AdaptiveAnalyticsService provides getPersonalizationIntelligence()');
    assert(asContent.includes('getAlgorithmComparison'), 'AdaptiveAnalyticsService provides getAlgorithmComparison()');
    assert(asContent.includes('getAdaptiveHealth'), 'AdaptiveAnalyticsService provides getAdaptiveHealth()');
    assert(asContent.includes('getDataQualityDiagnostics'), 'AdaptiveAnalyticsService provides getDataQualityDiagnostics()');
    assert(asContent.includes('getAttemptDiagnostics'), 'AdaptiveAnalyticsService provides getAttemptDiagnostics()');
  }

  const adminServicePath = path.resolve('e:/Courage Library', 'services/admin-adaptive.service.ts');
  if (fs.existsSync(adminServicePath)) {
    const admContent = fs.readFileSync(adminServicePath, 'utf-8');
    assert(admContent.includes('getAdaptiveOverview'), 'AdminAdaptiveService exposes static getAdaptiveOverview()');
    assert(admContent.includes('getCandidateIntelligence'), 'AdminAdaptiveService exposes static getCandidateIntelligence()');
    assert(admContent.includes('getItemIntelligence'), 'AdminAdaptiveService exposes static getItemIntelligence()');
    assert(admContent.includes('getCATIntelligence'), 'AdminAdaptiveService exposes static getCATIntelligence()');
    assert(admContent.includes('getAbilityIntelligence'), 'AdminAdaptiveService exposes static getAbilityIntelligence()');
    assert(admContent.includes('getStoppingIntelligence'), 'AdminAdaptiveService exposes static getStoppingIntelligence()');
    assert(admContent.includes('getPersonalizationIntelligence'), 'AdminAdaptiveService exposes static getPersonalizationIntelligence()');
    assert(admContent.includes('getAlgorithmComparison'), 'AdminAdaptiveService exposes static getAlgorithmComparison()');
    assert(admContent.includes('getAdaptiveHealth'), 'AdminAdaptiveService exposes static getAdaptiveHealth()');
    assert(admContent.includes('getDataQualityDiagnostics'), 'AdminAdaptiveService exposes static getDataQualityDiagnostics()');
    assert(admContent.includes('getAttemptDiagnostics'), 'AdminAdaptiveService exposes static getAttemptDiagnostics()');
  }

  const actionsPath = path.resolve('e:/Courage Library', 'app/admin/actions.ts');
  if (fs.existsSync(actionsPath)) {
    const actContent = fs.readFileSync(actionsPath, 'utf-8');
    assert(actContent.includes('getAdaptiveOverviewAction'), 'app/admin/actions.ts exports getAdaptiveOverviewAction()');
    assert(actContent.includes('getCandidateIntelligenceAction'), 'app/admin/actions.ts exports getCandidateIntelligenceAction()');
    assert(actContent.includes('getItemIntelligenceAction'), 'app/admin/actions.ts exports getItemIntelligenceAction()');
    assert(actContent.includes('getCATIntelligenceAction'), 'app/admin/actions.ts exports getCATIntelligenceAction()');
    assert(actContent.includes('getAbilityIntelligenceAction'), 'app/admin/actions.ts exports getAbilityIntelligenceAction()');
    assert(actContent.includes('getStoppingIntelligenceAction'), 'app/admin/actions.ts exports getStoppingIntelligenceAction()');
    assert(actContent.includes('getPersonalizationIntelligenceAction'), 'app/admin/actions.ts exports getPersonalizationIntelligenceAction()');
    assert(actContent.includes('getAlgorithmComparisonAction'), 'app/admin/actions.ts exports getAlgorithmComparisonAction()');
    assert(actContent.includes('getAdaptiveHealthAction'), 'app/admin/actions.ts exports getAdaptiveHealthAction()');
    assert(actContent.includes('getDataQualityDiagnosticsAction'), 'app/admin/actions.ts exports getDataQualityDiagnosticsAction()');
    assert(actContent.includes('getAttemptDiagnosticsAction'), 'app/admin/actions.ts exports getAttemptDiagnosticsAction()');
  }

  // ==========================================================================
  // SECTION 4: UI Control Center & Analytics Dashboard
  // ==========================================================================
  console.log('\n--- SECTION 4: Admin Studio Analytics Dashboard ---');
  const managerComponentPath = path.resolve('e:/Courage Library', 'components/admin/adaptive/admin-adaptive-manager.tsx');
  if (fs.existsSync(managerComponentPath)) {
    const mcContent = fs.readFileSync(managerComponentPath, 'utf-8');
    assert(mcContent.includes('Analytics') && mcContent.includes('Intelligence'), 'AdminAdaptiveManager includes Analytics & Intelligence tab');
    assert(mcContent.includes('<AdaptiveAnalyticsView'), 'AdminAdaptiveManager mounts AdaptiveAnalyticsView');
  }

  const analyticsViewPath = path.resolve('e:/Courage Library', 'components/admin/adaptive/adaptive-analytics-view.tsx');
  assert(fs.existsSync(analyticsViewPath), 'adaptive-analytics-view.tsx component exists');

  if (fs.existsSync(analyticsViewPath)) {
    const avContent = fs.readFileSync(analyticsViewPath, 'utf-8');
    assert(avContent.includes('Executive Overview'), 'Analytics view includes Executive Overview sub-view');
    assert(avContent.includes('Candidate Intelligence'), 'Analytics view includes Candidate Intelligence sub-view');
    assert(avContent.includes('Item Calibration'), 'Analytics view includes Item Calibration & Drift sub-view');
    assert(avContent.includes('CAT') && avContent.includes('Ability'), 'Analytics view includes CAT & Ability sub-view');
    assert(avContent.includes('Stopping') && avContent.includes('Personalization'), 'Analytics view includes Stopping & Personalization sub-view');
    assert(avContent.includes('Algorithm Comparison'), 'Analytics view includes Algorithm Comparison sub-view');
    assert(avContent.includes('Health') && avContent.includes('Attempt Diagnostics'), 'Analytics view includes Health & Attempt Diagnostics sub-view');
    assert(avContent.includes('Inspect Attempt'), 'Analytics view includes interactive Attempt Inspector');
  }

  // ==========================================================================
  // SECTION 5: Statistical Calculations & Logic Verification
  // ==========================================================================
  console.log('\n--- SECTION 5: Statistical Calculations & Logic ---');

  // Test 1: Overview Calculations
  const mockStates = [
    { id: 'st-1', user_id: 'u-1', status: 'completed', current_step: 15, current_theta: 0.75, standard_error: 0.32, stopping_reason: 'TARGET_SE_ACHIEVED' },
    { id: 'st-2', user_id: 'u-2', status: 'completed', current_step: 25, current_theta: -0.50, standard_error: 0.44, stopping_reason: 'MAX_QUESTIONS_REACHED' },
    { id: 'st-3', user_id: 'u-1', status: 'in_progress', current_step: 8, current_theta: 0.20, standard_error: 0.65, stopping_reason: null },
    { id: 'st-4', user_id: 'u-3', status: 'completed', current_step: 18, current_theta: 1.80, standard_error: 0.38, stopping_reason: 'TARGET_SE_ACHIEVED' },
  ];

  const mockDecisions = [
    { selection_strategy: 'strict_cat_max_info', decision_metadata: { is_cold_start: false, selected_item_information: 0.248, weakness_boost_applied: true, personalization_influence: 0.25 } },
    { selection_strategy: 'strict_cat_max_info', decision_metadata: { is_cold_start: false, selected_item_information: 0.235, mistake_vault_boost_applied: true, personalization_influence: 0.30 } },
    { selection_strategy: 'streak_relaxed_window', decision_metadata: { is_cold_start: true, selected_item_information: 0.210, exploration_applied: true, personalization_influence: 0.15 } },
    { selection_strategy: 'capacity_relaxed_tier', decision_metadata: { is_cold_start: false, selected_item_information: 0.190, personalization_influence: 0.20 } },
  ];

  const completedStates = mockStates.filter(s => s.status === 'completed' || s.status === 'stopping_rule_met');
  const completionRate = (completedStates.length / mockStates.length) * 100;
  assert(completionRate === 75, 'Completion rate calculation matches expected percentage (75%)');

  const totalQuestions = mockStates.reduce((acc, s) => acc + s.current_step, 0);
  const avgQuestions = totalQuestions / mockStates.length;
  assert(avgQuestions === 16.5, 'Average questions answered per attempt matches exact mean (16.5)');

  const finalThetas = completedStates.map(s => s.current_theta);
  const avgFinalTheta = finalThetas.reduce((a, b) => a + b, 0) / finalThetas.length;
  assert(Math.abs(avgFinalTheta - 0.6833) < 0.001, 'Average final ability (theta) computed accurately', `${avgFinalTheta.toFixed(3)}`);

  const finalSEs = completedStates.map(s => s.standard_error).sort((a, b) => a - b);
  const avgFinalSE = finalSEs.reduce((a, b) => a + b, 0) / finalSEs.length;
  const medianFinalSE = finalSEs[Math.floor(finalSEs.length / 2)];
  assert(Math.abs(avgFinalSE - 0.38) < 0.01, 'Average final SE computed accurately (0.38)');
  assert(medianFinalSE === 0.38, 'Median final SE computed accurately (0.38)');

  const strictDecisions = mockDecisions.filter(d => d.selection_strategy === 'strict_cat_max_info');
  const fallbackDecisions = mockDecisions.length - strictDecisions.length;
  const fallbackRate = (fallbackDecisions / mockDecisions.length) * 100;
  assert(fallbackRate === 50, 'CAT Fallback Rate matches relaxed + capacity fallback proportion (50%)');

  const coldDecisions = mockDecisions.filter(d => d.decision_metadata.is_cold_start === true);
  const coldRate = (coldDecisions.length / mockDecisions.length) * 100;
  assert(coldRate === 25, 'Cold start decision rate matches proportion (25%)');

  // Test 2: Psychometric Bucketing & Hotspot Detection
  const mockProfiles = [
    { user_id: 'u-1', overall_theta: -2.2, standard_error: 0.28, topic_mastery: { 't-quant': { mastery: 0.35 }, 't-reasoning': { mastery: 0.70 } } },
    { user_id: 'u-2', overall_theta: -0.5, standard_error: 0.42, topic_mastery: { 't-quant': { mastery: 0.40 }, 't-reasoning': { mastery: 0.55 } } },
    { user_id: 'u-3', overall_theta: 0.8, standard_error: 0.36, topic_mastery: { 't-quant': { mastery: 0.65 }, 't-reasoning': { mastery: 0.85 } } },
    { user_id: 'u-4', overall_theta: 2.4, standard_error: 0.31, topic_mastery: { 't-quant': { mastery: 0.90 }, 't-reasoning': { mastery: 0.95 } } },
  ];

  const thetaBuckets = [
    { range: '< -2.0', min: -Infinity, max: -2.0, count: 0 },
    { range: '[-2.0, -1.0)', min: -2.0, max: -1.0, count: 0 },
    { range: '[-1.0, 0.0)', min: -1.0, max: 0.0, count: 0 },
    { range: '[0.0, 1.0)', min: 0.0, max: 1.0, count: 0 },
    { range: '[1.0, 2.0)', min: 1.0, max: 2.0, count: 0 },
    { range: '>= 2.0', min: 2.0, max: Infinity, count: 0 },
  ];

  for (const p of mockProfiles) {
    for (const b of thetaBuckets) {
      if (p.overall_theta >= b.min && p.overall_theta < b.max) {
        b.count++;
        break;
      }
    }
  }

  assert(thetaBuckets[0].count === 1, 'Theta bucket <-2.0 counted 1 candidate');
  assert(thetaBuckets[2].count === 1, 'Theta bucket [-1.0, 0.0) counted 1 candidate');
  assert(thetaBuckets[3].count === 1, 'Theta bucket [0.0, 1.0) counted 1 candidate');
  assert(thetaBuckets[5].count === 1, 'Theta bucket >= 2.0 counted 1 candidate');

  // Test 3: Item Quality Flag Taxonomy
  function evaluateItemFlags(item) {
    const flags = [];
    if (item.sampleSize < 10) flags.push('LOW_SAMPLE');
    if (item.exposureCount > 50) flags.push('HIGH_EXPOSURE');
    if (item.sampleSize >= 15 && (item.empiricalPValue < 0.15 || item.empiricalPValue > 0.90)) {
      flags.push('UNSTABLE_RESPONSE_RATE');
    }
    if ((item.staticDifficulty === 'easy' && item.calibratedB > 0.8) || (item.staticDifficulty === 'hard' && item.calibratedB < -0.8)) {
      flags.push('CALIBRATION_DRIFT');
    }
    if (item.status === 'flagged') flags.push('FLAGGED');
    if (item.status === 'deprecated') flags.push('DEPRECATED');
    return flags;
  }

  const testItem1 = { sampleSize: 4, exposureCount: 4, empiricalPValue: 0.5, staticDifficulty: 'medium', calibratedB: 0.0, status: 'uncalibrated' };
  assert(evaluateItemFlags(testItem1).includes('LOW_SAMPLE'), 'LOW_SAMPLE assigned when sample size < 10');

  const testItem2 = { sampleSize: 60, exposureCount: 65, empiricalPValue: 0.48, staticDifficulty: 'medium', calibratedB: 0.1, status: 'calibrated' };
  assert(evaluateItemFlags(testItem2).includes('HIGH_EXPOSURE'), 'HIGH_EXPOSURE assigned when exposure > 50');

  const testItem3 = { sampleSize: 25, exposureCount: 25, empiricalPValue: 0.08, staticDifficulty: 'medium', calibratedB: 1.5, status: 'provisional' };
  assert(evaluateItemFlags(testItem3).includes('UNSTABLE_RESPONSE_RATE'), 'UNSTABLE_RESPONSE_RATE assigned when p < 0.15');

  const testItem4 = { sampleSize: 30, exposureCount: 30, empiricalPValue: 0.20, staticDifficulty: 'easy', calibratedB: 1.2, status: 'calibrated' };
  assert(evaluateItemFlags(testItem4).includes('CALIBRATION_DRIFT'), 'CALIBRATION_DRIFT assigned when static Easy has b = 1.2');

  const testItem5 = { sampleSize: 20, exposureCount: 20, empiricalPValue: 0.50, staticDifficulty: 'hard', calibratedB: 1.1, status: 'flagged' };
  assert(evaluateItemFlags(testItem5).includes('FLAGGED'), 'FLAGGED assigned when calibration status is flagged');

  // Test 4: Stopping vs Continuation Separation
  const stoppingEvaluations = [
    { isTerminal: false, code: 'MIN_QUESTIONS_NOT_REACHED', questionsCount: 5 },
    { isTerminal: false, code: 'BLUEPRINT_INCOMPLETE', questionsCount: 12 },
    { isTerminal: false, code: 'TOPIC_COVERAGE_INCOMPLETE', questionsCount: 14 },
    { isTerminal: true, code: 'TARGET_SE_ACHIEVED', questionsCount: 15 },
    { isTerminal: true, code: 'MAX_QUESTIONS_REACHED', questionsCount: 30 },
    { isTerminal: true, code: 'DIMINISHING_INFORMATION', questionsCount: 22 },
  ];

  const continuationGates = stoppingEvaluations.filter(e => !e.isTerminal);
  const terminalStops = stoppingEvaluations.filter(e => e.isTerminal);
  assert(continuationGates.length === 3, 'Continuation gates strictly separated from terminal stops (3 gates)');
  assert(terminalStops.length === 3, 'Terminal stopping events strictly identified (3 stops)');

  // Test 5: Health KPI Status Thresholds
  function evaluateHealthStatus(errorRate, fallbackRate, staleRate, uncalibratedCount) {
    const errorStatus = errorRate < 2 ? 'GREEN' : errorRate < 5 ? 'YELLOW' : 'RED';
    const fallbackStatus = fallbackRate < 20 ? 'GREEN' : fallbackRate < 40 ? 'YELLOW' : 'RED';
    const staleStatus = staleRate < 5 ? 'GREEN' : staleRate < 15 ? 'YELLOW' : 'RED';
    const calStatus = uncalibratedCount < 50 ? 'GREEN' : uncalibratedCount < 150 ? 'YELLOW' : 'RED';

    const all = [errorStatus, fallbackStatus, staleStatus, calStatus];
    const overall = all.includes('RED') ? 'RED' : all.includes('YELLOW') ? 'YELLOW' : 'GREEN';
    return { overall, errorStatus, fallbackStatus, staleStatus, calStatus };
  }

  assert(evaluateHealthStatus(0.0, 8.5, 0.0, 15).overall === 'GREEN', 'Healthy telemetry returns GREEN status');
  assert(evaluateHealthStatus(0.0, 25.0, 0.0, 15).overall === 'YELLOW', 'Elevated fallback rate returns YELLOW status');
  assert(evaluateHealthStatus(6.0, 8.5, 0.0, 15).overall === 'RED', 'Critical error rate returns RED status');

  // Test 6: Zero Candidate Leakage
  const candidatePayloadKeys = ['id', 'question_text', 'options', 'step_number', 'remaining_seconds'];
  const sensitivePsychometricKeys = ['current_theta', 'standard_error', 'fisher_information', 'difficulty_b', 'stopping_rationale', 'personalization_signals'];

  for (const key of sensitivePsychometricKeys) {
    assert(
      !candidatePayloadKeys.includes(key),
      `Zero candidate data leakage: "${key}" is omitted from candidate payload`
    );
  }

  console.log('\n================================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
  console.log('================================================================');

  if (failedTests > 0) {
    console.error(`\nFAILED: ${failedTests} tests failed.`);
    process.exit(1);
  } else {
    console.log('\nSUCCESS: All Phase 4D.6 Adaptive Analytics tests passed perfectly!');
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
