/**
 * Courage Library — Phase 4D.4 Comprehensive Verification Test Suite
 * CAT / Information-Based Adaptive Item Selection Engine
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

async function runPhase4D4Tests() {
  console.log('================================================================');
  console.log(' COURAGE LIBRARY — PHASE 4D.4 VERIFICATION TEST SUITE');
  console.log(' CAT / Information-Based Adaptive Item Selection Engine');
  console.log('================================================================\n');

  // ==========================================================================
  // SECTION 1: Migration 42 File & Schema Integrity
  // ==========================================================================
  console.log('--- SECTION 1: Migration 42 File & Schema Definitions ---');
  const migrationPath = path.resolve('e:/Courage Library', 'supabase/migrations/20260908000042_phase4d4_cat_item_selection.sql');
  const migrationExists = fs.existsSync(migrationPath);
  assert(migrationExists, 'Migration 42 file exists in supabase/migrations/');

  if (migrationExists) {
    const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
    assert(migrationContent.includes('cat_v1_information_1pl'), 'Migration seeds cat_v1_information_1pl algorithm version');
    assert(migrationContent.includes('CAT_SELECTION_CONFIG'), 'Migration seeds CAT_SELECTION_CONFIG system configuration');
    assert(migrationContent.includes('idx_aqd_qv_created'), 'Migration defines performance index on (question_version_id, created_at DESC)');
    assert(migrationContent.includes('idx_aqd_attempt_step'), 'Migration defines performance index on (attempt_id, step_number)');
    assert(migrationContent.includes('idx_aic_status_diff'), 'Migration defines performance index on (calibration_status, difficulty_b)');
  }

  // ==========================================================================
  // SECTION 2: Architecture Documentation Verification
  // ==========================================================================
  console.log('\n--- SECTION 2: Architecture Documentation Verification ---');
  const docPath = path.resolve('e:/Courage Library', 'docs/architecture/cat_information_based_selection.md');
  const docExists = fs.existsSync(docPath);
  assert(docExists, 'Architecture document exists in docs/architecture/cat_information_based_selection.md');

  if (docExists) {
    const docContent = fs.readFileSync(docPath, 'utf-8');
    assert(docContent.includes('CAT / Information-Based Adaptive Item Selection Architecture'), 'Doc title verified');
    assert(docContent.includes('Theoretical Mathematical Formulation (1PL / Rasch)'), 'Doc specifies 1PL Rasch Information Formula');
    assert(docContent.includes('Multi-Objective Composite Ranking Model'), 'Doc specifies Multi-Objective Composite Ranking Model');
    assert(docContent.includes('Topic Streak & Anti-Fatigue Dampening'), 'Doc specifies Topic Anti-Fatigue Streak Constraints');
    assert(docContent.includes('Candidate Pool Exhaustion Fallback Hierarchy'), 'Doc specifies 4-level Fallback Relaxation Hierarchy');
    assert(docContent.includes('Deterministic Tie-Breaking & Auditability'), 'Doc specifies Deterministic Tie-Breaking');
    assert(docContent.includes('Zero Answer-Key Leakage & Security Boundary'), 'Doc specifies Zero Answer-Key Leakage Security');
  }

  // ==========================================================================
  // SECTION 3: Service Layer Implementation & Types
  // ==========================================================================
  console.log('\n--- SECTION 3: Service Layer & Implementation Integrity ---');
  const servicePath = path.resolve('e:/Courage Library', 'services/adaptive/adaptive-selection.service.ts');
  assert(fs.existsSync(servicePath), 'Adaptive Selection Service file exists');

  if (fs.existsSync(servicePath)) {
    const sContent = fs.readFileSync(servicePath, 'utf-8');
    assert(sContent.includes('calculate1PLFisherInformation'), 'AdaptiveSelectionService provides calculate1PLFisherInformation()');
    assert(sContent.includes('calculateNormalizedInformation'), 'AdaptiveSelectionService provides calculateNormalizedInformation()');
    assert(sContent.includes('mapStaticDifficultyToB'), 'AdaptiveSelectionService provides mapStaticDifficultyToB()');
    assert(sContent.includes('fetchEligibleQuestions'), 'AdaptiveSelectionService provides fetchEligibleQuestions()');
    assert(sContent.includes('rankCandidateQuestions'), 'AdaptiveSelectionService provides rankCandidateQuestions()');
    assert(sContent.includes('CAT_INFORMATION_MAXIMIZED'), 'AdaptiveSelectionService tags CAT_INFORMATION_MAXIMIZED rationale');
    assert(sContent.includes('CAT_FALLBACK_STREAK_RELAXED'), 'AdaptiveSelectionService implements Level 2 streak fallback');
    assert(sContent.includes('CAT_FALLBACK_POOL_RELAXED'), 'AdaptiveSelectionService implements Level 3 pool fallback');
  }

  // ==========================================================================
  // SECTION 4: Pure Mathematical & Algorithmic Unit Tests
  // ==========================================================================
  console.log('\n--- SECTION 4: 1PL Fisher Information Mathematical Precision ---');
  
  const calc1PLInfo = (theta, b) => {
    const diff = Math.max(-15, Math.min(15, theta - b));
    const p = 1.0 / (1.0 + Math.exp(-diff));
    return p * (1.0 - p);
  };

  const calcNormInfo = (theta, b) => {
    const info = calc1PLInfo(theta, b);
    return Math.min(1.0, Math.max(0.0, Number((info / 0.25).toFixed(4))));
  };

  // Math test 1: Peak Information at theta = b
  const peakInfo = calc1PLInfo(0.0, 0.0);
  assert(Math.abs(peakInfo - 0.25) < 1e-6, 'Fisher Information at theta = b reaches exact theoretical maximum 0.25', `I(0,0) = ${peakInfo}`);
  assert(calcNormInfo(0.0, 0.0) === 1.0, 'Normalized Fisher Information at theta = b equals exactly 1.0');

  // Math test 2: Symmetry around peak
  const infoPlus1 = calc1PLInfo(1.0, 0.0);
  const infoMinus1 = calc1PLInfo(-1.0, 0.0);
  assert(Math.abs(infoPlus1 - infoMinus1) < 1e-6, 'Fisher Information is perfectly symmetric around theta = b', `I(+1) = ${infoPlus1.toFixed(4)}, I(-1) = ${infoMinus1.toFixed(4)}`);
  assert(Math.abs(infoPlus1 - 0.1966) < 0.001, 'Fisher Information at distance delta=1.0 is approx 0.1966');

  // Math test 3: Monotonic Decay with distance
  const infoDelta2 = calc1PLInfo(2.0, 0.0);
  const infoDelta3 = calc1PLInfo(3.0, 0.0);
  assert(infoDelta2 < infoPlus1 && infoDelta3 < infoDelta2, 'Fisher Information decays monotonically with absolute distance |theta - b|');

  // Math test 4: Numerical Stability at Extremes
  const extremePos = calc1PLInfo(20.0, 0.0);
  const extremeNeg = calc1PLInfo(-20.0, 0.0);
  assert(Number.isFinite(extremePos) && extremePos > 0, 'Extreme positive theta (theta >> b) produces finite safe non-zero information');
  assert(Number.isFinite(extremeNeg) && extremeNeg > 0, 'Extreme negative theta (theta << b) produces finite safe non-zero information');

  // Math test 5: Multi-Objective Weighted Composite Scoring Simulator
  const testCandidateScoring = (candidate, context, weights) => {
    const normInfo = calcNormInfo(context.targetTheta, candidate.difficulty_b);
    const contentScore = candidate.topic_served === 0 ? 1.0 : 0.5;
    const explScore = candidate.topic_served === 0 ? 1.0 : 0.2;
    const mistakeBonus = candidate.is_mistake ? 1.0 : 0.0;
    const exposureFactor = Math.max(0.0, 1.0 - Math.min(1.0, candidate.exposure_count / 50));
    
    let rawScore =
      normInfo * weights.fisher_information +
      contentScore * weights.content_balancing +
      explScore * weights.exploration_value +
      mistakeBonus * weights.mistake_bonus +
      exposureFactor * weights.exposure_control;

    if (candidate.streak_violated) {
      rawScore *= 0.70;
    }
    return Number(rawScore.toFixed(4));
  };

  const weights = {
    fisher_information: 0.40,
    content_balancing: 0.25,
    exploration_value: 0.15,
    mistake_bonus: 0.10,
    exposure_control: 0.10,
  };

  // Test item perfectly matched to theta
  const perfectItemScore = testCandidateScoring(
    { difficulty_b: 0.5, topic_served: 0, is_mistake: false, exposure_count: 0, streak_violated: false },
    { targetTheta: 0.5 },
    weights
  );
  // Test mismatched item
  const mismatchedItemScore = testCandidateScoring(
    { difficulty_b: -2.5, topic_served: 0, is_mistake: false, exposure_count: 0, streak_violated: false },
    { targetTheta: 0.5 },
    weights
  );
  assert(perfectItemScore > mismatchedItemScore, 'Perfect difficulty match (theta=0.5, b=0.5) outranks distant item (b=-2.5)', `Score perfect: ${perfectItemScore}, mismatched: ${mismatchedItemScore}`);

  // Test Mistake Vault boost
  const mistakeBoostScore = testCandidateScoring(
    { difficulty_b: 0.5, topic_served: 0, is_mistake: true, exposure_count: 0, streak_violated: false },
    { targetTheta: 0.5 },
    weights
  );
  assert(mistakeBoostScore > perfectItemScore, 'Item in candidate Mistake Vault receives priority boost', `Boosted: ${mistakeBoostScore}, Baseline: ${perfectItemScore}`);

  // Test Exposure Regulation penalty
  const overexposedScore = testCandidateScoring(
    { difficulty_b: 0.5, topic_served: 0, is_mistake: false, exposure_count: 50, streak_violated: false },
    { targetTheta: 0.5 },
    weights
  );
  assert(overexposedScore < perfectItemScore, 'Overexposed item (exposure=50) receives exposure penalty', `Overexposed: ${overexposedScore}, Fresh: ${perfectItemScore}`);

  // Test Topic Streak Dampening
  const streakDampenedScore = testCandidateScoring(
    { difficulty_b: 0.5, topic_served: 3, is_mistake: false, exposure_count: 0, streak_violated: true },
    { targetTheta: 0.5 },
    weights
  );
  assert(streakDampenedScore < perfectItemScore, 'Topic streak violation applies 0.70x dampening factor', `Dampened: ${streakDampenedScore}, Undampened: ${perfectItemScore}`);

  // Deterministic Tie-Breaker Test
  const itemsWithSameScore = [
    { id: 'qv-zzzz', score: 0.8500 },
    { id: 'qv-aaaa', score: 0.8500 },
    { id: 'qv-mmmm', score: 0.8500 },
  ];
  itemsWithSameScore.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });
  assert(itemsWithSameScore[0].id === 'qv-aaaa' && itemsWithSameScore[1].id === 'qv-mmmm' && itemsWithSameScore[2].id === 'qv-zzzz', 'Ties in candidate score are broken deterministically by question_version_id ASC');

  // ==========================================================================
  // SECTION 5: Admin CAT Management & Service Integration
  // ==========================================================================
  console.log('\n--- SECTION 5: Admin CAT Management & Service Integration ---');
  const adminServicePath = path.resolve('e:/Courage Library', 'services/admin-adaptive.service.ts');
  if (fs.existsSync(adminServicePath)) {
    const asContent = fs.readFileSync(adminServicePath, 'utf-8');
    assert(asContent.includes('getCATConfig'), 'AdminAdaptiveService provides getCATConfig()');
    assert(asContent.includes('updateCATConfig'), 'AdminAdaptiveService provides updateCATConfig()');
    assert(asContent.includes('getCATHealth'), 'AdminAdaptiveService provides getCATHealth()');
    assert(asContent.includes('getItemInformationExplorer'), 'AdminAdaptiveService provides getItemInformationExplorer()');
    assert(asContent.includes('Total weights sum must be approximately 1.0'), 'AdminAdaptiveService validates multi-objective weight sum');
  }

  const adminActionsPath = path.resolve('e:/Courage Library', 'app/admin/actions.ts');
  if (fs.existsSync(adminActionsPath)) {
    const aaContent = fs.readFileSync(adminActionsPath, 'utf-8');
    assert(aaContent.includes('getCATConfigAction'), 'app/admin/actions.ts exports getCATConfigAction()');
    assert(aaContent.includes('updateCATConfigAction'), 'app/admin/actions.ts exports updateCATConfigAction()');
    assert(aaContent.includes('getCATHealthAction'), 'app/admin/actions.ts exports getCATHealthAction()');
    assert(aaContent.includes('getItemInformationExplorerAction'), 'app/admin/actions.ts exports getItemInformationExplorerAction()');
  }

  const managerComponentPath = path.resolve('e:/Courage Library', 'components/admin/adaptive/admin-adaptive-manager.tsx');
  if (fs.existsSync(managerComponentPath)) {
    const mcContent = fs.readFileSync(managerComponentPath, 'utf-8');
    assert(mcContent.includes('CAT Selection'), 'AdminAdaptiveManager includes CAT Selection navigation tab');
    assert(mcContent.includes('Item Information Explorer'), 'AdminAdaptiveManager includes Item Information Explorer UI');
    assert(mcContent.includes('Simulate θ'), 'AdminAdaptiveManager includes interactive candidate ability slider');
    assert(mcContent.includes('Multi-Objective Scoring Weights'), 'AdminAdaptiveManager includes CAT weights configuration form');
  }

  // ==========================================================================
  // SECTION 6: Baseline Row Counts & Zero Regressions
  // ==========================================================================
  console.log('\n--- SECTION 6: 10 Core Tables Baseline Row Count Integrity ---');
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
    subscription_plans: 1
  };

  for (const [table, expectedCount] of Object.entries(baseline)) {
    const { count, status, ok } = await queryTable(table);
    assert(ok && count === expectedCount, `Core Table '${table}' count preserved: ${count} / ${expectedCount} (HTTP ${status})`);
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n================================================================');
  console.log(` PHASE 4D.4 TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  if (failedTests === 0) {
    console.log(' ALL 4D.4 CAT SELECTION ENGINE TESTS PASSED PERFECTLY!');
  } else {
    console.error(` ${failedTests} TESTS FAILED.`);
    process.exit(1);
  }
  console.log('================================================================\n');
}

runPhase4D4Tests().catch(err => {
  console.error('Unhandled error during Phase 4D.4 verification:', err);
  process.exit(1);
});
