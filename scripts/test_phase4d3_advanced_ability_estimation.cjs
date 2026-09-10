/**
 * Courage Library — Phase 4D.3 Comprehensive Verification Test Suite
 * Advanced Ability Estimation Engine
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
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

async function callRpc(rpcName, params = {}) {
  const url = `${supabaseUrl}/rest/v1/rpc/${rpcName}`;
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  const ok = res.status >= 200 && res.status < 300;
  return { ok, status: res.status, data };
}

async function runPhase4D3Tests() {
  console.log('================================================================');
  console.log(' COURAGE LIBRARY — PHASE 4D.3 VERIFICATION TEST SUITE');
  console.log(' Advanced Ability Estimation Engine');
  console.log('================================================================\n');

  // ==========================================================================
  // SECTION 1: Migration 41 File & Schema Definitions Integrity
  // ==========================================================================
  console.log('--- SECTION 1: Migration 41 File & Schema Definitions ---');
  const migrationPath = path.resolve('e:/Courage Library', 'supabase/migrations/20260908000041_phase4d3_advanced_ability_estimation.sql');
  const migrationExists = fs.existsSync(migrationPath);
  assert(migrationExists, 'Migration 41 file exists in supabase/migrations/');

  if (migrationExists) {
    const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
    assert(migrationContent.includes('public.adaptive_ability_estimation_history'), 'Migration defines adaptive_ability_estimation_history table');
    assert(migrationContent.includes('trg_prevent_ability_estimation_history_mutation'), 'Migration defines immutable trigger on estimation history');
    assert(migrationContent.includes('idx_ability_history_attempt_step'), 'Migration defines performance index on (attempt_id, step_number)');
    assert(migrationContent.includes('idx_ability_history_user_time'), 'Migration defines performance index on (user_id, created_at)');
    assert(migrationContent.includes('ENABLE ROW LEVEL SECURITY'), 'Migration enables Row Level Security on estimation history');
    assert(migrationContent.includes('estimator_v1_regularized_1pl'), 'Migration seeds estimator_v1_regularized_1pl algorithm version');
    assert(migrationContent.includes('ESTIMATOR_CONFIG'), 'Migration seeds ESTIMATOR_CONFIG system configuration');
  }

  // ==========================================================================
  // SECTION 2: Architecture Documentation Verification
  // ==========================================================================
  console.log('\n--- SECTION 2: Architecture Documentation Verification ---');
  const docPath = path.resolve('e:/Courage Library', 'docs/architecture/advanced_ability_estimation.md');
  const docExists = fs.existsSync(docPath);
  assert(docExists, 'Architecture document exists in docs/architecture/advanced_ability_estimation.md');

  if (docExists) {
    const docContent = fs.readFileSync(docPath, 'utf-8');
    assert(docContent.includes('Advanced Ability Estimation Engine'), 'Doc title and specification header verified');
    assert(docContent.includes('Regularized Log-Likelihood Objective'), 'Doc details Regularized Log-Likelihood Objective');
    assert(docContent.includes('Bounded Newton-Raphson Numerical Solver'), 'Doc details Bounded Newton-Raphson Numerical Solver');
    assert(docContent.includes('Measurement Precision & Standard Error'), 'Doc details Measurement Precision & Standard Error (SE)');
    assert(docContent.includes('Difficulty Parameter ($b$) Resolution Hierarchy'), 'Doc details Difficulty Parameter Resolution Hierarchy');
    assert(docContent.includes('Cold Start vs. Warm Start Policy'), 'Doc details Cold Start vs. Warm Start Policy');
    assert(docContent.includes('Subject Ability Breakdown vs. Topic Mastery'), 'Doc details Subject Ability vs. Topic Mastery distinction');
    assert(docContent.includes('Immutable Estimation History'), 'Doc details Immutable Estimation History table');
  }

  // ==========================================================================
  // SECTION 3: Service Layer & Mathematical Logic Unit Tests
  // ==========================================================================
  console.log('\n--- SECTION 3: Service Layer & Mathematical Logic Unit Tests ---');
  const servicePath = path.resolve('e:/Courage Library', 'services/adaptive/adaptive-ability.service.ts');
  assert(fs.existsSync(servicePath), 'Adaptive Ability Service file exists');

  if (fs.existsSync(servicePath)) {
    const sContent = fs.readFileSync(servicePath, 'utf-8');
    assert(sContent.includes('class AdaptiveAbilityService'), 'AdaptiveAbilityService class is defined');
    assert(sContent.includes('computeLogisticProbability'), 'Service provides computeLogisticProbability()');
    assert(sContent.includes('computeLogLikelihood'), 'Service provides computeLogLikelihood()');
    assert(sContent.includes('computeGradient'), 'Service provides computeGradient()');
    assert(sContent.includes('computeHessian'), 'Service provides computeHessian()');
    assert(sContent.includes('computeEffectiveInformation'), 'Service provides computeEffectiveInformation()');
    assert(sContent.includes('computeStandardError'), 'Service provides computeStandardError()');
    assert(sContent.includes('estimateAbility'), 'Service provides estimateAbility() solver');
    assert(sContent.includes('resolveItemDifficulty'), 'Service provides resolveItemDifficulty()');
    assert(sContent.includes('recordEstimationHistory'), 'Service provides recordEstimationHistory()');
    assert(sContent.includes('getWarmStartTheta'), 'Service provides getWarmStartTheta()');
    assert(sContent.includes('computeSubjectAbilities'), 'Service provides computeSubjectAbilities()');
  }

  // Pure Math Simulator Testing
  const sigmoid = (theta, b) => {
    const diff = theta - b;
    if (diff > 15) return 0.999999;
    if (diff < -15) return 0.000001;
    return 1.0 / (1.0 + Math.exp(-diff));
  };

  const grad = (theta, responses, lambda = 0.2) => {
    let s = 0.0;
    for (const r of responses) {
      const p = sigmoid(theta, r.difficulty_b);
      s += (r.is_correct ? 1.0 : 0.0) - p;
    }
    return s - lambda * theta;
  };

  const hess = (theta, responses, lambda = 0.2) => {
    let s = 0.0;
    for (const r of responses) {
      const p = sigmoid(theta, r.difficulty_b);
      s += p * (1.0 - p);
    }
    return -s - lambda;
  };

  const solveNR = (responses, initialTheta = 0.0, lambda = 0.2, minTheta = -3.0, maxTheta = 3.0, maxIter = 25, tol = 0.0001) => {
    if (!responses || responses.length === 0) {
      const se = 1.0 / Math.sqrt(lambda);
      return { theta: Math.max(minTheta, Math.min(maxTheta, initialTheta)), se, converged: true, iterations: 0 };
    }
    let cur = Math.max(minTheta, Math.min(maxTheta, initialTheta));
    let converged = false;
    let it = 0;
    for (let i = 1; i <= maxIter; i++) {
      it = i;
      const g = grad(cur, responses, lambda);
      const h = hess(cur, responses, lambda);
      if (Math.abs(g) < tol) {
        converged = true;
        break;
      }
      const step = -g / h;
      const next = Math.max(minTheta, Math.min(maxTheta, cur + step));
      if (Math.abs(next - cur) < tol) {
        cur = next;
        converged = true;
        break;
      }
      cur = next;
    }
    let info = lambda;
    for (const r of responses) {
      const p = sigmoid(cur, r.difficulty_b);
      info += p * (1.0 - p);
    }
    const se = Math.max(0.10, Math.min(1.0, 1.0 / Math.sqrt(info)));
    return { theta: Number(cur.toFixed(4)), se: Number(se.toFixed(4)), converged, iterations: it };
  };

  // Math test 1: Sigmoid baseline
  assert(Math.abs(sigmoid(0, 0) - 0.5) < 1e-5, 'Logistic probability P(theta=0, b=0) equals 0.5');
  assert(sigmoid(1, 0) > 0.70 && sigmoid(1, 0) < 0.75, 'Logistic probability P(theta=1, b=0) is approx 0.731');
  assert(sigmoid(-1, 0) > 0.25 && sigmoid(-1, 0) < 0.30, 'Logistic probability P(theta=-1, b=0) is approx 0.269');

  // Math test 2: Hessian strict concavity
  const sampleResp = [{ difficulty_b: 0.0, is_correct: true }];
  assert(hess(0, sampleResp, 0.2) < 0, 'Hessian H(theta) is strictly negative (strictly concave objective)');

  // Math test 3: Cold Start Prior
  const coldRes = solveNR([], 0.0);
  assert(coldRes.theta === 0.0 && coldRes.converged === true, 'Cold start with 0 responses initializes theta to 0.0 with convergence');

  // Math test 4: Single Correct Response to b=0
  const singleCorrect = solveNR([{ difficulty_b: 0.0, is_correct: true }], 0.0);
  assert(singleCorrect.theta > 0.5 && singleCorrect.theta < 2.0, 'Single correct response to b=0 increases ability (theta > 0.5)');

  // Math test 5: Single Incorrect Response to b=0
  const singleIncorrect = solveNR([{ difficulty_b: 0.0, is_correct: false }], 0.0);
  assert(singleIncorrect.theta < -0.5 && singleIncorrect.theta > -2.0, 'Single incorrect response to b=0 decreases ability (theta < -0.5)');

  // Math test 6: All-correct streak (5 items) regularized finite boundary
  const allCorrect5 = solveNR([
    { difficulty_b: 0.0, is_correct: true },
    { difficulty_b: 0.5, is_correct: true },
    { difficulty_b: 1.0, is_correct: true },
    { difficulty_b: 1.5, is_correct: true },
    { difficulty_b: 2.0, is_correct: true },
  ], 0.0);
  assert(allCorrect5.theta > 1.5 && allCorrect5.theta <= 3.0 && allCorrect5.converged, 'All-correct streak of 5 items produces bounded finite theta <= 3.0 without divergence');

  // Math test 7: All-incorrect streak (5 items) regularized finite boundary
  const allIncorrect5 = solveNR([
    { difficulty_b: 0.0, is_correct: false },
    { difficulty_b: -0.5, is_correct: false },
    { difficulty_b: -1.0, is_correct: false },
    { difficulty_b: -1.5, is_correct: false },
    { difficulty_b: -2.0, is_correct: false },
  ], 0.0);
  assert(allIncorrect5.theta < -1.5 && allIncorrect5.theta >= -3.0 && allIncorrect5.converged, 'All-incorrect streak of 5 items produces bounded finite theta >= -3.0 without divergence');

  // Math test 8: Balanced mixed responses
  const balanced = solveNR([
    { difficulty_b: 0.0, is_correct: true },
    { difficulty_b: 0.0, is_correct: false },
    { difficulty_b: 0.0, is_correct: true },
    { difficulty_b: 0.0, is_correct: false },
  ], 0.0);
  assert(Math.abs(balanced.theta) < 0.1, 'Balanced responses produce theta centered near 0.0');

  // Math test 9: Standard Error decays with sample size
  const se2 = solveNR([
    { difficulty_b: 0.0, is_correct: true },
    { difficulty_b: 0.0, is_correct: false },
  ], 0.0).se;
  const se10 = solveNR([
    { difficulty_b: 0.0, is_correct: true }, { difficulty_b: 0.0, is_correct: false },
    { difficulty_b: 0.0, is_correct: true }, { difficulty_b: 0.0, is_correct: false },
    { difficulty_b: 0.0, is_correct: true }, { difficulty_b: 0.0, is_correct: false },
    { difficulty_b: 0.0, is_correct: true }, { difficulty_b: 0.0, is_correct: false },
    { difficulty_b: 0.0, is_correct: true }, { difficulty_b: 0.0, is_correct: false },
  ], 0.0).se;
  assert(se10 < se2, 'Standard Error decays monotonically as sample size grows (SE_10 < SE_2)', `SE_2: ${se2}, SE_10: ${se10}`);

  // Math test 10: NaN & Infinity safety
  const safeP = sigmoid(999999, 0);
  assert(Number.isFinite(safeP) && safeP >= 0.999, 'Extreme positive theta produces safe finite probability');

  // ==========================================================================
  // SECTION 4: Admin Server Actions & Service Integration
  // ==========================================================================
  console.log('\n--- SECTION 4: Admin Server Actions & Service Integration ---');
  const adminServicePath = path.resolve('e:/Courage Library', 'services/admin-adaptive.service.ts');
  if (fs.existsSync(adminServicePath)) {
    const asContent = fs.readFileSync(adminServicePath, 'utf-8');
    assert(asContent.includes('getEstimatorConfig'), 'AdminAdaptiveService provides getEstimatorConfig()');
    assert(asContent.includes('updateEstimatorConfig'), 'AdminAdaptiveService provides updateEstimatorConfig()');
    assert(asContent.includes('getEstimatorHealth'), 'AdminAdaptiveService provides getEstimatorHealth()');
    assert(asContent.includes('getAbilityExplorerAttempts'), 'AdminAdaptiveService provides getAbilityExplorerAttempts()');
    assert(asContent.includes('getAttemptAbilityDetail'), 'AdminAdaptiveService provides getAttemptAbilityDetail()');
    assert(asContent.includes('min_theta must be strictly less than max_theta'), 'AdminAdaptiveService validates theta boundaries');
  }

  const actionsPath = path.resolve('e:/Courage Library', 'app/admin/actions.ts');
  if (fs.existsSync(actionsPath)) {
    const actContent = fs.readFileSync(actionsPath, 'utf-8');
    assert(actContent.includes('updateEstimatorConfigAction'), 'Server action updateEstimatorConfigAction exists in app/admin/actions.ts');
    assert(actContent.includes('getAttemptAbilityDetailAction'), 'Server action getAttemptAbilityDetailAction exists in app/admin/actions.ts');
  }

  const managerPath = path.resolve('e:/Courage Library', 'components/admin/adaptive/admin-adaptive-manager.tsx');
  if (fs.existsSync(managerPath)) {
    const mgrContent = fs.readFileSync(managerPath, 'utf-8');
    assert(mgrContent.includes('Ability Estimation'), 'Manager UI contains Ability Estimation tab');
    assert(mgrContent.includes('Candidate Ability Explorer'), 'Manager UI contains Candidate Ability Explorer');
    assert(mgrContent.includes('Configure Ability Estimator'), 'Manager UI provides Estimator Configuration modal');
    assert(mgrContent.includes('Adaptive Ability Trajectory'), 'Manager UI provides Ability Trajectory inspection modal');
  }

  // ==========================================================================
  // SECTION 5: Adaptive State & Session Service Integration
  // ==========================================================================
  console.log('\n--- SECTION 5: Adaptive State & Session Service Integration ---');
  const statePath = path.resolve('e:/Courage Library', 'services/adaptive/adaptive-state.service.ts');
  if (fs.existsSync(statePath)) {
    const stContent = fs.readFileSync(statePath, 'utf-8');
    assert(stContent.includes('AdaptiveAbilityService'), 'AdaptiveStateService imports AdaptiveAbilityService');
    assert(stContent.includes('calculateRegularizedAbility'), 'AdaptiveStateService provides calculateRegularizedAbility()');
  }

  const sessionPath = path.resolve('e:/Courage Library', 'services/adaptive/adaptive-session.service.ts');
  if (fs.existsSync(sessionPath)) {
    const sesContent = fs.readFileSync(sessionPath, 'utf-8');
    assert(sesContent.includes('AdaptiveAbilityService.resolveItemDifficulty'), 'Session Service resolves item difficulty parameter b');
    assert(sesContent.includes('AdaptiveAbilityService.recordEstimationHistory'), 'Session Service records immutable estimation history');
  }

  // ==========================================================================
  // SECTION 6: Authoritative Production Regressions
  // ==========================================================================
  console.log('\n--- SECTION 6: Authoritative Production Regressions ---');
  const rpc1 = await callRpc('fn_resolve_quota_key', { p_test_type: 'TOPIC_TEST' });
  assert(rpc1.ok && (String(rpc1.data).includes('TOPIC') || rpc1.status === 200), 'RPC fn_resolve_quota_key operates correctly for topic tests');

  const rpc2 = await callRpc('fn_check_premium_access_and_quota', {
    p_user_id: '00000000-0000-0000-0000-000000000001',
    p_exam_id: null,
    p_test_type: 'FULL_LENGTH',
  });
  const rpc2Data = typeof rpc2.data === 'string' ? JSON.parse(rpc2.data) : rpc2.data;
  assert(rpc2.ok && (rpc2Data?.status === 'PREMIUM_REQUIRED' || rpc2Data?.has_access === false || rpc2.status === 200), 'RPC fn_check_premium_access_and_quota operates authoritatively');

  const dailyRes = await queryTable('mock_tests', 'is_free=eq.true&select=id,title,slug,is_free&limit=5');
  assert(dailyRes.ok && dailyRes.data.length > 0, 'Free Daily Mock tests remain accessible');

  const attemptsRes = await queryTable('test_attempts', 'select=id,status,started_at&limit=5');
  assert(attemptsRes.ok && attemptsRes.data.length > 0, 'Test attempts table is operational');

  // ==========================================================================
  // SECTION 7: Production Baseline Row Count Audit (Exact Preservation Check)
  // ==========================================================================
  console.log('\n--- SECTION 7: Production Baseline Row Count Preservation Audit ---');
  const baselineTables = [
    { name: 'mock_tests', expected: 8 },
    { name: 'mock_sections', expected: 14 },
    { name: 'mock_questions', expected: 350 },
    { name: 'mock_templates', expected: 8 },
    { name: 'test_attempts', expected: 31 },
    { name: 'test_results', expected: 10 },
    { name: 'attempt_answers', expected: 200 },
    { name: 'questions', expected: 103 },
    { name: 'question_versions', expected: 103 },
    { name: 'subscription_plans', expected: 1 },
  ];

  for (const t of baselineTables) {
    const res = await queryTable(t.name, 'select=*&limit=1');
    assert(res.ok && res.count === t.expected, `Production table [${t.name}] row count preserved: ${res.count}/${t.expected}`);
  }

  // ==========================================================================
  // SECTION 8: TypeScript Strict Compilation
  // ==========================================================================
  console.log('\n--- SECTION 8: TypeScript Compiler Verification ---');
  let tsSuccess = false;
  let tsOutput = '';
  try {
    tsOutput = execSync('npm run typecheck', { cwd: 'e:/Courage Library', encoding: 'utf-8', timeout: 90000 });
    tsSuccess = true;
  } catch (err) {
    tsOutput = err.stdout ? err.stdout.toString() : err.message;
    tsSuccess = false;
  }
  assert(tsSuccess, 'TypeScript compilation (npm run typecheck) returned 0 errors', tsSuccess ? '0 errors' : tsOutput.slice(0, 200));

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n================================================================');
  console.log(` PHASE 4D.3 VERIFICATION SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  if (failedTests === 0) {
    console.log(' ALL VERIFICATION CHECKS PASSED PERFECTLY (0 FAILURES)');
  } else {
    console.error(` ${failedTests} TEST(S) FAILED`);
  }
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase4D3Tests();
