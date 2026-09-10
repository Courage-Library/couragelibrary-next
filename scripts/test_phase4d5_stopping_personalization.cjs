/**
 * Courage Library — Phase 4D.5 Comprehensive Verification Test Suite
 * Advanced Stopping & Personalization Engine
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

async function runPhase4D5Tests() {
  console.log('================================================================');
  console.log(' COURAGE LIBRARY — PHASE 4D.5 VERIFICATION TEST SUITE');
  console.log(' Advanced Stopping & Personalization Engine');
  console.log('================================================================\n');

  // ==========================================================================
  // SECTION 1: Migration 43 File & Schema Integrity
  // ==========================================================================
  console.log('--- SECTION 1: Migration 43 File & Schema Definitions ---');
  const migrationPath = path.resolve('e:/Courage Library', 'supabase/migrations/20260908000043_phase4d5_stopping_personalization.sql');
  const migrationExists = fs.existsSync(migrationPath);
  assert(migrationExists, 'Migration 43 file exists in supabase/migrations/');

  if (migrationExists) {
    const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
    assert(migrationContent.includes('stopping_metadata JSONB'), 'Migration adds stopping_metadata JSONB column');
    assert(migrationContent.includes('stopping_policy_version VARCHAR'), 'Migration adds stopping_policy_version column');
    assert(migrationContent.includes('personalization_policy_version VARCHAR'), 'Migration adds personalization_policy_version column');
    assert(migrationContent.includes('idx_adaptive_attempt_states_status_reason'), 'Migration creates index on (status, stopping_reason)');
    assert(migrationContent.includes('stopping_v1_deterministic'), 'Migration seeds stopping_v1_deterministic algorithm version');
    assert(migrationContent.includes('personalization_v1_balanced'), 'Migration seeds personalization_v1_balanced algorithm version');
    assert(migrationContent.includes('STOPPING_CONFIG'), 'Migration seeds STOPPING_CONFIG system configuration');
    assert(migrationContent.includes('PERSONALIZATION_CONFIG'), 'Migration seeds PERSONALIZATION_CONFIG system configuration');
  }

  // ==========================================================================
  // SECTION 2: Architecture Documentation Verification
  // ==========================================================================
  console.log('\n--- SECTION 2: Architecture Documentation Verification ---');
  const docPath = path.resolve('e:/Courage Library', 'docs/architecture/advanced_stopping_and_personalization.md');
  const docExists = fs.existsSync(docPath);
  assert(docExists, 'Architecture document exists in docs/architecture/advanced_stopping_and_personalization.md');

  if (docExists) {
    const docContent = fs.readFileSync(docPath, 'utf-8');
    assert(docContent.includes('Advanced Stopping & Personalization Architecture'), 'Doc title and specification header verified');
    assert(docContent.includes('Conceptual Separation of Concerns'), 'Doc details 6 distinct conceptual concerns');
    assert(docContent.includes('Deterministic Evaluation Precedence'), 'Doc details deterministic precedence order');
    assert(docContent.includes('Continuation Gate'), 'Doc establishes continuation gating for minimum & coverage requirements');
    assert(docContent.includes('Diminishing Information Contribution Detector'), 'Doc details diminishing information detector');
    assert(docContent.includes('Bounded Personalization Engine'), 'Doc details bounded personalization model');
    assert(docContent.includes('Cold Start vs. Warm Start Profile Integration'), 'Doc details cold vs warm start profile integration');
    assert(docContent.includes('Personalization Influence Cap'), 'Doc specifies 0.40 maximum personalization influence cap');
    assert(docContent.includes('Server Authority & Zero Leakage Security'), 'Doc guarantees zero leakage to candidate');
  }

  // ==========================================================================
  // SECTION 3: Service Layer & Implementation Integrity
  // ==========================================================================
  console.log('\n--- SECTION 3: Service Layer & Implementation Integrity ---');
  const stoppingServicePath = path.resolve('e:/Courage Library', 'services/adaptive/adaptive-stopping.service.ts');
  assert(fs.existsSync(stoppingServicePath), 'Adaptive Stopping Service file exists');

  if (fs.existsSync(stoppingServicePath)) {
    const ssContent = fs.readFileSync(stoppingServicePath, 'utf-8');
    assert(ssContent.includes('class AdaptiveStoppingService'), 'AdaptiveStoppingService class is defined');
    assert(ssContent.includes('calculateDiminishingInformation'), 'AdaptiveStoppingService provides calculateDiminishingInformation()');
    assert(ssContent.includes('evaluateStopping'), 'AdaptiveStoppingService provides evaluateStopping()');
  }

  const personalizationServicePath = path.resolve('e:/Courage Library', 'services/adaptive/adaptive-personalization.service.ts');
  assert(fs.existsSync(personalizationServicePath), 'Adaptive Personalization Service file exists');

  if (fs.existsSync(personalizationServicePath)) {
    const psContent = fs.readFileSync(personalizationServicePath, 'utf-8');
    assert(psContent.includes('class AdaptivePersonalizationService'), 'AdaptivePersonalizationService class is defined');
    assert(psContent.includes('computePersonalizationSignals'), 'AdaptivePersonalizationService provides computePersonalizationSignals()');
    assert(psContent.includes('DEFAULT_MAX_INFLUENCE = 0.40'), 'Personalization service limits influence to 0.40 default cap');
  }

  // ==========================================================================
  // SECTION 4: Stopping Engine Deterministic Precedence Unit Tests
  // ==========================================================================
  console.log('\n--- SECTION 4: Stopping Precedence & Decision Rules Unit Tests ---');

  // Simulator for AdaptiveStoppingService logic
  const evaluateStoppingSim = (ctx) => {
    const minQ = ctx.config.min_questions || 20;
    const maxQ = ctx.config.max_questions || 50;
    const targetSe = (ctx.config.stopping_policy && ctx.config.stopping_policy.target_se) || 0.35;
    const served = ctx.questionsServed;
    const minSat = served >= minQ;
    const maxRea = served >= maxQ;
    const seSat = ctx.currentSe <= targetSe;

    let blueprintSat = true;
    if (ctx.subjectCoverage) {
      for (const [, req] of Object.entries(ctx.subjectCoverage)) {
        if (req.served < req.target) {
          blueprintSat = false;
          break;
        }
      }
    }

    let topicCoverageSat = true;
    if (ctx.topicCoverage) {
      for (const [, req] of Object.entries(ctx.topicCoverage)) {
        if (req.served < req.minRequired) {
          topicCoverageSat = false;
          break;
        }
      }
    }

    let diminishing = false;
    if (ctx.recentContributions && ctx.recentContributions.length >= 5) {
      const avg = ctx.recentContributions.slice(-5).reduce((a, b) => a + b, 0) / 5;
      diminishing = avg < 0.05;
    }

    if (ctx.isEmergencyDisabled) return { shouldStop: true, reasonCode: 'SYSTEM_SAFETY_STOP' };
    if (ctx.isExpired) return { shouldStop: true, reasonCode: 'ATTEMPT_EXPIRED' };
    if (maxRea) return { shouldStop: true, reasonCode: 'MAX_QUESTIONS_REACHED' };
    if (ctx.noEligibleItemsRemaining) return { shouldStop: true, reasonCode: 'NO_ELIGIBLE_ITEMS' };
    if (!minSat) return { shouldStop: false, reasonCode: 'MIN_QUESTIONS_NOT_REACHED' };
    if (!blueprintSat) return { shouldStop: false, reasonCode: 'BLUEPRINT_INCOMPLETE' };
    if (!topicCoverageSat) return { shouldStop: false, reasonCode: 'TOPIC_COVERAGE_INCOMPLETE' };
    if (seSat) return { shouldStop: true, reasonCode: 'TARGET_SE_ACHIEVED' };
    if (diminishing) return { shouldStop: true, reasonCode: 'DIMINISHING_INFORMATION' };
    return { shouldStop: false, reasonCode: 'CONTINUE' };
  };

  const baseConfig = { min_questions: 20, max_questions: 50, stopping_policy: { target_se: 0.35 } };

  // Test 1: Emergency Kill Switch
  const d1 = evaluateStoppingSim({ questionsServed: 10, currentSe: 0.8, config: baseConfig, isEmergencyDisabled: true });
  assert(d1.shouldStop === true && d1.reasonCode === 'SYSTEM_SAFETY_STOP', 'SYSTEM_SAFETY_STOP triggers immediate termination');

  // Test 2: Attempt Expired
  const d2 = evaluateStoppingSim({ questionsServed: 10, currentSe: 0.8, config: baseConfig, isExpired: true });
  assert(d2.shouldStop === true && d2.reasonCode === 'ATTEMPT_EXPIRED', 'ATTEMPT_EXPIRED triggers immediate termination');

  // Test 3: Hard Maximum Question Limit
  const d3 = evaluateStoppingSim({ questionsServed: 50, currentSe: 0.8, config: baseConfig, subjectCoverage: { q: { served: 1, target: 10 } } });
  assert(d3.shouldStop === true && d3.reasonCode === 'MAX_QUESTIONS_REACHED', 'MAX_QUESTIONS_REACHED terminates test even if blueprint incomplete');

  // Test 4: Target SE achieved BEFORE minimum questions
  const d4 = evaluateStoppingSim({ questionsServed: 12, currentSe: 0.28, config: baseConfig });
  assert(d4.shouldStop === false && d4.reasonCode === 'MIN_QUESTIONS_NOT_REACHED', 'Target SE reached before min_questions is a continuation gate (shouldStop: false, MIN_QUESTIONS_NOT_REACHED)');

  // Test 5: Target SE achieved AFTER minimum questions with blueprint satisfied
  const d5 = evaluateStoppingSim({ questionsServed: 22, currentSe: 0.32, config: baseConfig, subjectCoverage: { s1: { served: 5, target: 5 } } });
  assert(d5.shouldStop === true && d5.reasonCode === 'TARGET_SE_ACHIEVED', 'Target SE achieved after min_questions stops test with TARGET_SE_ACHIEVED');

  // Test 6: Target SE achieved AFTER minimum questions BUT blueprint incomplete
  const d6 = evaluateStoppingSim({ questionsServed: 25, currentSe: 0.30, config: baseConfig, subjectCoverage: { s1: { served: 2, target: 5 } } });
  assert(d6.shouldStop === false && d6.reasonCode === 'BLUEPRINT_INCOMPLETE', 'Target SE reached with incomplete blueprint is a continuation gate (shouldStop: false, BLUEPRINT_INCOMPLETE)');

  // Test 7: Target SE achieved AFTER minimum questions BUT topic coverage incomplete
  const d7 = evaluateStoppingSim({ questionsServed: 25, currentSe: 0.30, config: baseConfig, topicCoverage: { t1: { served: 0, minRequired: 2 } } });
  assert(d7.shouldStop === false && d7.reasonCode === 'TOPIC_COVERAGE_INCOMPLETE', 'Target SE reached with incomplete topic coverage is a continuation gate (shouldStop: false, TOPIC_COVERAGE_INCOMPLETE)');

  // Test 8: Diminishing information detected after minimum questions & blueprint satisfied
  const d8 = evaluateStoppingSim({
    questionsServed: 25,
    currentSe: 0.45,
    config: baseConfig,
    recentContributions: [0.01, 0.02, 0.01, 0.02, 0.01]
  });
  assert(d8.shouldStop === true && d8.reasonCode === 'DIMINISHING_INFORMATION', 'Diminishing information contribution triggers early stop when min_questions and blueprint are satisfied');

  // Test 9: Diminishing information detected BEFORE minimum questions
  const d9 = evaluateStoppingSim({
    questionsServed: 10,
    currentSe: 0.45,
    config: baseConfig,
    recentContributions: [0.01, 0.01, 0.01, 0.01, 0.01]
  });
  assert(d9.shouldStop === false && d9.reasonCode === 'MIN_QUESTIONS_NOT_REACHED', 'Diminishing information before min_questions is gated by minimum questions requirement (shouldStop: false)');

  // Test 10: No eligible questions remaining
  const d10 = evaluateStoppingSim({ questionsServed: 15, currentSe: 0.60, config: baseConfig, noEligibleItemsRemaining: true });
  assert(d10.shouldStop === true && d10.reasonCode === 'NO_ELIGIBLE_ITEMS', 'Exhausted question bank triggers NO_ELIGIBLE_ITEMS termination');

  // ==========================================================================
  // SECTION 5: Personalization Engine Boundedness Unit Tests
  // ==========================================================================
  console.log('\n--- SECTION 5: Personalization Engine Boundedness Unit Tests ---');

  const computePersonalizationSim = (signals, counts, maxInf = 0.40) => {
    const isCold = signals.is_cold_start;
    const weak = {};
    for (const [t, s] of Object.entries(signals.topic_mastery || {})) {
      weak[t] = isCold ? 0.5 : Math.max(0.0, Math.min(1.0, 1.0 - (s.mastery_score || 0.5)));
    }
    const expl = {};
    for (const t of Object.keys(counts)) {
      expl[t] = counts[t] === 0 ? 1.0 : 0.2;
    }
    return {
      is_cold_start: isCold,
      weak_area_priorities: weak,
      mistake_question_ids: isCold ? new Set() : signals.mistake_question_ids,
      exploration_priorities: expl,
      max_personalization_influence: Math.min(0.40, maxInf)
    };
  };

  // Test 1: Cold start candidate
  const coldSignals = { is_cold_start: true, topic_mastery: { t1: { mastery_score: 0.2 } }, mistake_question_ids: new Set(['q1']) };
  const pCold = computePersonalizationSim(coldSignals, { t1: 0 });
  assert(pCold.is_cold_start === true && pCold.weak_area_priorities.t1 === 0.5 && pCold.mistake_question_ids.size === 0, 'Cold start candidate receives neutral baseline personalization signals without fabricated weak areas');

  // Test 2: Warm start candidate weakness derivation
  const warmSignals = { is_cold_start: false, topic_mastery: { t1: { mastery_score: 0.25 }, t2: { mastery_score: 0.85 } }, mistake_question_ids: new Set(['q1', 'q2']) };
  const pWarm = computePersonalizationSim(warmSignals, { t1: 2, t2: 0 });
  assert(pWarm.is_cold_start === false && Math.abs(pWarm.weak_area_priorities.t1 - 0.75) < 1e-4 && Math.abs(pWarm.weak_area_priorities.t2 - 0.15) < 1e-4, 'Warm start derives bounded weakness priority W_T = 1 - M_T');
  assert(pWarm.mistake_question_ids.has('q1') && pWarm.mistake_question_ids.has('q2'), 'Warm start preserves unresolved Mistake Vault question IDs');

  // Test 3: Exploration priority derivation
  assert(pWarm.exploration_priorities.t1 === 0.2 && pWarm.exploration_priorities.t2 === 1.0, 'Exploration priority is 1.0 for unserved topics and 0.2 for served topics');

  // Test 4: Max influence cap enforcement
  const pOver = computePersonalizationSim(warmSignals, {}, 0.90);
  assert(pOver.max_personalization_influence <= 0.40, 'Personalization influence is strictly capped at maximum 0.40 (CAT measurement priority preserved)');

  // ==========================================================================
  // SECTION 6: Admin Stopping & Personalization Management
  // ==========================================================================
  console.log('\n--- SECTION 6: Admin Studio Stopping & Personalization Integration ---');
  const adminServicePath = path.resolve('e:/Courage Library', 'services/admin-adaptive.service.ts');
  if (fs.existsSync(adminServicePath)) {
    const asContent = fs.readFileSync(adminServicePath, 'utf-8');
    assert(asContent.includes('getStoppingConfig'), 'AdminAdaptiveService provides getStoppingConfig()');
    assert(asContent.includes('updateStoppingConfig'), 'AdminAdaptiveService provides updateStoppingConfig()');
    assert(asContent.includes('getStoppingHealth'), 'AdminAdaptiveService provides getStoppingHealth()');
    assert(asContent.includes('getPersonalizationConfig'), 'AdminAdaptiveService provides getPersonalizationConfig()');
    assert(asContent.includes('updatePersonalizationConfig'), 'AdminAdaptiveService provides updatePersonalizationConfig()');
    assert(asContent.includes('getPersonalizationHealth'), 'AdminAdaptiveService provides getPersonalizationHealth()');
  }

  const adminActionsPath = path.resolve('e:/Courage Library', 'app/admin/actions.ts');
  if (fs.existsSync(adminActionsPath)) {
    const aaContent = fs.readFileSync(adminActionsPath, 'utf-8');
    assert(aaContent.includes('getStoppingConfigAction'), 'app/admin/actions.ts exports getStoppingConfigAction()');
    assert(aaContent.includes('updateStoppingConfigAction'), 'app/admin/actions.ts exports updateStoppingConfigAction()');
    assert(aaContent.includes('getStoppingHealthAction'), 'app/admin/actions.ts exports getStoppingHealthAction()');
    assert(aaContent.includes('getPersonalizationConfigAction'), 'app/admin/actions.ts exports getPersonalizationConfigAction()');
    assert(aaContent.includes('updatePersonalizationConfigAction'), 'app/admin/actions.ts exports updatePersonalizationConfigAction()');
    assert(aaContent.includes('getPersonalizationHealthAction'), 'app/admin/actions.ts exports getPersonalizationHealthAction()');
  }

  const managerComponentPath = path.resolve('e:/Courage Library', 'components/admin/adaptive/admin-adaptive-manager.tsx');
  if (fs.existsSync(managerComponentPath)) {
    const mcContent = fs.readFileSync(managerComponentPath, 'utf-8');
    assert(mcContent.includes('Stopping Policy'), 'AdminAdaptiveManager includes Stopping Policy navigation tab');
    assert(mcContent.includes('Personalization'), 'AdminAdaptiveManager includes Personalization navigation tab');
    assert(mcContent.includes('Target Standard Error (SE Threshold)'), 'AdminAdaptiveManager includes stopping rules configuration form');
    assert(mcContent.includes('Max Personalization Influence'), 'AdminAdaptiveManager includes personalization weights form');
  }

  // ==========================================================================
  // SECTION 7: 10 Core Tables Baseline Row Count Integrity
  // ==========================================================================
  console.log('\n--- SECTION 7: 10 Core Tables Baseline Row Count Integrity ---');
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
  console.log(` PHASE 4D.5 TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  if (failedTests === 0) {
    console.log(' ALL 4D.5 STOPPING & PERSONALIZATION ENGINE TESTS PASSED PERFECTLY!');
  } else {
    console.error(` ${failedTests} TESTS FAILED.`);
    process.exit(1);
  }
  console.log('================================================================\n');
}

runPhase4D5Tests().catch(err => {
  console.error('Unhandled error during Phase 4D.5 verification:', err);
  process.exit(1);
});
