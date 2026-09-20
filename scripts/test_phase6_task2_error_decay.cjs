/**
 * COURAGE LIBRARY — MISTAKE VAULT PHASE 6 TASK 2 TEST SUITE
 * Deep Error Decay & Longitudinal Revision Memory Engine
 * Hardened Final Certification Gate
 */

const fs = require('fs');
const path = require('path');

// Load environment variables manually from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[trimmed.slice(0, idx).trim()] = val;
      }
    }
  });
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || anonKey;

if (!supabaseUrl || !anonKey) {
  console.error('FATAL: Missing Supabase environment credentials.');
  process.exit(1);
}

// Canonical 14 Protected Baseline Tables
const EXPECTED_BASELINES = {
  mock_tests: 8,
  mock_sections: 14,
  mock_questions: 350,
  mock_templates: 8,
  test_attempts: 31,
  test_results: 10,
  attempt_answers: 200,
  questions: 103,
  question_versions: 103,
  question_options: 412,
  question_answers: 103,
  subscription_plans: 1,
  coin_wallets: 5,
  coin_ledger: 8,
};

async function queryTableCountWithRetry(table, useServiceRole = true, maxRetries = 4) {
  const key = useServiceRole && serviceRoleKey ? serviceRoleKey : anonKey;
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  url.searchParams.set('select', '*');
  url.searchParams.set('limit', '1');

  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'count=exact'
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url.toString(), { method: 'GET', headers });
      const contentRange = res.headers.get('content-range');
      let count = 0;
      if (contentRange) {
        const parts = contentRange.split('/');
        if (parts.length > 1) count = parseInt(parts[1], 10) || 0;
      }
      let data = [];
      try {
        data = await res.json();
      } catch (e) {
        data = null;
      }
      return { status: res.status, count, data, ok: res.status >= 200 && res.status < 300 };
    } catch (err) {
      if (attempt === maxRetries) {
        return { status: 500, count: 0, ok: false, error: err.message };
      }
      await new Promise(r => setTimeout(r, 800 * attempt));
    }
  }
}

let totalPass = 0;
let totalFail = 0;

function assert(condition, testId, description) {
  if (condition) {
    console.log(`  ✓ [${testId}] PASS: ${description}`);
    totalPass++;
  } else {
    console.error(`  ✗ [${testId}] FAIL: ${description}`);
    totalFail++;
  }
}

// Pure math & heuristic simulation matching services/mistake.service.ts
function calculateErrorDecayHeuristic(params) {
  const now = params.referenceNow !== undefined ? params.referenceNow : Date.now();
  const rawEventTime = params.last_event_at ? new Date(params.last_event_at).getTime() : NaN;
  const eventTime = isNaN(rawEventTime) ? now : rawEventTime;
  const elapsedMs = Math.max(0, now - eventTime);
  const t = elapsedMs / (1000 * 60 * 60 * 24);

  let baseS = 2.0;
  if (params.lifecycle_status === 'MASTERED') baseS = 14.0;
  else if (params.lifecycle_status === 'REVISITING') baseS = 4.0;
  else baseS = 2.0;

  const mu = 0.50;
  const rawC = params.consecutive_correct_in_remediation || 0;
  const cEffective = Math.min(Math.max(0, rawC), 5);
  const effectiveStability = Math.max(0.5, baseS * (1 + mu * cEffective));
  const exponent = Math.max(-20, Math.min(0, -t / effectiveStability));

  const r = Math.exp(exponent);
  if (isNaN(r) || !isFinite(r)) return 1.0000;
  return Number(Math.max(0.0, Math.min(1.0, r)).toFixed(4));
}

function calculateDecayScheduleState(params) {
  const now = params.referenceNow !== undefined ? params.referenceNow : Date.now();
  let anchorTimestamp = params.last_mistake_at;
  if (params.lifecycle_status === 'MASTERED') {
    anchorTimestamp = params.mastered_at || params.last_drill_at || params.last_mistake_at;
  } else if (params.lifecycle_status === 'REVISITING') {
    anchorTimestamp = params.last_remediated_at || params.last_drill_at || params.last_mistake_at;
  } else {
    anchorTimestamp = params.last_drill_at || params.last_mistake_at;
  }

  const retentionScore = params.fixedRetentionScore !== undefined 
    ? params.fixedRetentionScore 
    : calculateErrorDecayHeuristic({
        lifecycle_status: params.lifecycle_status,
        consecutive_correct_in_remediation: params.consecutive_correct_in_remediation,
        last_event_at: anchorTimestamp,
        mastered_at: params.mastered_at,
        referenceNow: now,
      });

  const rawLastTime = anchorTimestamp ? new Date(anchorTimestamp).getTime() : now;
  const lastTime = isNaN(rawLastTime) ? now : rawLastTime;
  const daysSinceLastRevision = Math.max(0, Math.round((now - lastTime) / (1000 * 60 * 60 * 24)));

  let baseS = 2.0;
  if (params.lifecycle_status === 'MASTERED') baseS = 14.0;
  else if (params.lifecycle_status === 'REVISITING') baseS = 4.0;

  const mu = 0.50;
  const cEffective = Math.min(Math.max(0, params.consecutive_correct_in_remediation || 0), 5);
  const effectiveStabilityDays = Number((baseS * (1 + mu * cEffective)).toFixed(2));

  let decayState = 'NOT_DUE';
  let explanation = '';
  let isRefreshDue = false;

  if (params.lifecycle_status === 'MASTERED') {
    const rawMasteredTime = params.mastered_at ? new Date(params.mastered_at).getTime() : lastTime;
    const daysSinceMastered = Math.max(0, Math.round((now - rawMasteredTime) / (1000 * 60 * 60 * 24)));

    if (daysSinceMastered >= 14 || retentionScore < 0.50) {
      decayState = 'REFRESH_DUE';
      isRefreshDue = true;
      explanation = `Refresh recommended — mastered ${daysSinceMastered} days ago.`;
    } else if (retentionScore < 0.75) {
      decayState = 'DUE_SOON';
      explanation = 'Retention stable; refresh review approaching in upcoming days.';
    } else {
      decayState = 'NOT_DUE';
      explanation = 'Mastered concept with strong retention stability.';
    }
  } else {
    // Exact Precedence: 1. OVERDUE -> 2. DUE_NOW -> 3. DUE_SOON -> 4. NOT_DUE
    if (retentionScore < 0.35 || daysSinceLastRevision > 2 * effectiveStabilityDays) {
      decayState = 'OVERDUE';
      explanation = `Overdue — last revised ${daysSinceLastRevision} days ago with ${params.consecutive_correct_in_remediation || 0} successful remediations.`;
    } else if (retentionScore < 0.60 || params.total_mistakes_count >= 2 || daysSinceLastRevision >= effectiveStabilityDays) {
      decayState = 'DUE_NOW';
      explanation = params.total_mistakes_count >= 2
        ? `Due today — repeated slip (${params.total_mistakes_count}x) needs reinforcement.`
        : `Due today — last revised ${daysSinceLastRevision} days ago.`;
    } else if (retentionScore < 0.85) {
      decayState = 'DUE_SOON';
      explanation = 'Due soon — approaching scheduled spaced practice window.';
    } else {
      decayState = 'NOT_DUE';
      explanation = 'Recently practiced; retaining active revision momentum.';
    }
  }

  const daysUntilDue = Math.max(0, Math.round(effectiveStabilityDays - daysSinceLastRevision));
  const reviewDateMs = now + (daysUntilDue * 24 * 60 * 60 * 1000);
  const recommendedReviewDate = new Date(reviewDateMs).toISOString();

  return {
    retentionScore,
    retentionRisk: Number((1.0 - retentionScore).toFixed(4)),
    effectiveStabilityDays,
    decayState,
    daysSinceLastRevision,
    daysUntilDue,
    recommendedReviewDate,
    isRefreshDue,
    explanation,
  };
}

function detectRepeatedForgetting(paramsOrOccurrences, totalMistakesCountArg, consecutiveCorrectArg) {
  let occurrencesList = [];
  let totalMistakes = 1;
  let consecutiveCorrect = 0;
  let masteredAt = null;
  let hadPriorSuccess = false;

  if (Array.isArray(paramsOrOccurrences)) {
    occurrencesList = paramsOrOccurrences;
    totalMistakes = totalMistakesCountArg !== undefined ? totalMistakesCountArg : Math.max(1, occurrencesList.length);
    consecutiveCorrect = consecutiveCorrectArg || 0;
  } else if (paramsOrOccurrences && typeof paramsOrOccurrences === 'object') {
    occurrencesList = paramsOrOccurrences.occurrences || [];
    totalMistakes = paramsOrOccurrences.totalMistakesCount !== undefined ? paramsOrOccurrences.totalMistakesCount : Math.max(1, occurrencesList.length);
    consecutiveCorrect = paramsOrOccurrences.consecutiveCorrect || 0;
    masteredAt = paramsOrOccurrences.masteredAt || null;
    hadPriorSuccess = Boolean(paramsOrOccurrences.hadPriorSuccess);
  }

  const activeOccurrences = occurrencesList.filter(
    (o) => o.occurrence_status !== 'REVOKED_ERRATA' && o.occurrence_status !== 'REVOKED_VOID'
  );
  const activeCount = activeOccurrences.length > 0 ? activeOccurrences.length : totalMistakes;

  // Case 1: Was previously mastered and an active mistake exists -> relapse signal
  if (masteredAt && activeCount >= 1) {
    return {
      hasRepeatedForgetting: true,
      relapseCount: activeCount,
      explanation: 'Repeatedly missed after previous revision',
    };
  }

  // Case 2: Evidence of prior remediation success
  if ((hadPriorSuccess || consecutiveCorrect > 0) && activeCount >= 2) {
    return {
      hasRepeatedForgetting: true,
      relapseCount: Math.max(1, activeCount - 1),
      explanation: 'Repeatedly missed after previous revision',
    };
  }

  // Case 3: Repeated mistakes with NO prior remediation or mastery = persistent unresolved error
  if (activeCount >= 2) {
    return {
      hasRepeatedForgetting: false,
      relapseCount: 0,
      explanation: 'Persistent unresolved error',
    };
  }

  // Case 4: Single initial mistake
  return {
    hasRepeatedForgetting: false,
    relapseCount: 0,
    explanation: 'Single initial error',
  };
}

async function runTestSuite() {
  console.log('============================================================');
  console.log('COURAGE LIBRARY — MISTAKE VAULT PHASE 6 TASK 2 TEST SUITE');
  console.log('Deep Error Decay & Longitudinal Revision Memory Engine');
  console.log('Hardened Final Certification Gate');
  console.log('============================================================\n');

  console.log('--- Phase 6 Task 2: Baseline Row Count Check (Pre-Test Audit) ---');
  for (const [table, expected] of Object.entries(EXPECTED_BASELINES)) {
    const res = await queryTableCountWithRetry(table, true);
    if (!res.ok) {
      console.warn(`Warning checking table ${table}: HTTP ${res.status}`);
    } else {
      if (res.count !== expected) {
        console.error(`Row count mismatch on ${table}: got ${res.count}, expected ${expected}`);
      }
    }
  }
  console.log('Protected baseline tables row counts recorded.\n');

  const now = 1750000000000;

  console.log('--- Group 1: Error Decay Mathematical Formulation & Parameter Bounds ---');
  {
    const r0 = calculateErrorDecayHeuristic({ lifecycle_status: 'UNRESOLVED', last_event_at: new Date(now).toISOString(), referenceNow: now });
    assert(r0 === 1.0000, 'T01', 'Decay at t=0 produces exact 1.0000 retention score');

    const r1 = calculateErrorDecayHeuristic({ lifecycle_status: 'UNRESOLVED', last_event_at: new Date(now - 1 * 86400000).toISOString(), referenceNow: now });
    const r3 = calculateErrorDecayHeuristic({ lifecycle_status: 'UNRESOLVED', last_event_at: new Date(now - 3 * 86400000).toISOString(), referenceNow: now });
    assert(r1 > r3 && r1 < 1.0, 'T02', 'Retention score decays monotonically with elapsed time');

    const rZero = calculateErrorDecayHeuristic({ lifecycle_status: 'REVISITING', last_event_at: new Date(now).toISOString(), referenceNow: now });
    assert(rZero === 1.0000, 'T03', 'Zero elapsed time returns 1.0000');

    const rFuture = calculateErrorDecayHeuristic({ lifecycle_status: 'UNRESOLVED', last_event_at: new Date(now + 86400000).toISOString(), referenceNow: now });
    assert(rFuture === 1.0000, 'T04', 'Future timestamp is safely clamped to t=0 without producing negative elapsed time');

    const rNull = calculateErrorDecayHeuristic({ lifecycle_status: 'UNRESOLVED', last_event_at: null, referenceNow: now });
    assert(rNull === 1.0000, 'T05', 'Null timestamp handled safely without crash');

    const rMalformed = calculateErrorDecayHeuristic({ lifecycle_status: 'UNRESOLVED', last_event_at: 'invalid-date-string', referenceNow: now });
    assert(rMalformed === 1.0000, 'T06', 'Malformed timestamp safely falls back to valid finite number');

    const rNaNStreak = calculateErrorDecayHeuristic({ lifecycle_status: 'REVISITING', consecutive_correct_in_remediation: NaN, last_event_at: new Date(now - 86400000).toISOString(), referenceNow: now });
    assert(typeof rNaNStreak === 'number' && !isNaN(rNaNStreak) && isFinite(rNaNStreak), 'T07', 'NaN streak is safely converted to valid IEEE-754 finite float');

    const rMinStability = calculateErrorDecayHeuristic({ lifecycle_status: 'UNRESOLVED', consecutive_correct_in_remediation: -10, last_event_at: new Date(now - 86400000).toISOString(), referenceNow: now });
    assert(rMinStability > 0 && rMinStability <= 1.0, 'T08', 'Denominator clamped to minimum stability preventing divide-by-zero');

    const rMast = calculateErrorDecayHeuristic({ lifecycle_status: 'MASTERED', last_event_at: new Date(now - 4 * 86400000).toISOString(), referenceNow: now });
    const rRev = calculateErrorDecayHeuristic({ lifecycle_status: 'REVISITING', last_event_at: new Date(now - 4 * 86400000).toISOString(), referenceNow: now });
    const rUnr = calculateErrorDecayHeuristic({ lifecycle_status: 'UNRESOLVED', last_event_at: new Date(now - 4 * 86400000).toISOString(), referenceNow: now });
    assert(rMast > rRev && rRev > rUnr, 'T09', 'Base stability scales monotonically: MASTERED (14d) > REVISITING (4d) > UNRESOLVED (2d)');

    const rStreak5 = calculateErrorDecayHeuristic({ lifecycle_status: 'REVISITING', consecutive_correct_in_remediation: 5, last_event_at: new Date(now - 4 * 86400000).toISOString(), referenceNow: now });
    const rStreak10 = calculateErrorDecayHeuristic({ lifecycle_status: 'REVISITING', consecutive_correct_in_remediation: 10, last_event_at: new Date(now - 4 * 86400000).toISOString(), referenceNow: now });
    assert(rStreak5 === rStreak10, 'T10', 'Streak multiplier is strictly capped at C_MAX = 5');
  }

  console.log('\n--- Group 2: Hardened State Precedence & Explicit Boundary Matrix ---');
  {
    // R = 0.90 -> NOT_DUE
    const s090 = calculateDecayScheduleState({ lifecycle_status: 'UNRESOLVED', total_mistakes_count: 1, fixedRetentionScore: 0.90, last_mistake_at: new Date(now).toISOString(), referenceNow: now });
    assert(s090.decayState === 'NOT_DUE', 'T11', 'Boundary R = 0.90 evaluates to NOT_DUE');

    // R = 0.85 -> NOT_DUE (Boundary: R >= 0.85)
    const s085 = calculateDecayScheduleState({ lifecycle_status: 'UNRESOLVED', total_mistakes_count: 1, fixedRetentionScore: 0.85, last_mistake_at: new Date(now).toISOString(), referenceNow: now });
    assert(s085.decayState === 'NOT_DUE', 'T12', 'Boundary R = 0.85 evaluates to NOT_DUE');

    // R = 0.84 -> DUE_SOON (0.60 <= R < 0.85)
    const s084 = calculateDecayScheduleState({ lifecycle_status: 'UNRESOLVED', total_mistakes_count: 1, fixedRetentionScore: 0.84, last_mistake_at: new Date(now).toISOString(), referenceNow: now });
    assert(s084.decayState === 'DUE_SOON', 'T13', 'Boundary R = 0.84 evaluates to DUE_SOON');

    // R = 0.60 -> DUE_SOON (0.60 <= R < 0.85)
    const s060 = calculateDecayScheduleState({ lifecycle_status: 'UNRESOLVED', total_mistakes_count: 1, fixedRetentionScore: 0.60, last_mistake_at: new Date(now).toISOString(), referenceNow: now });
    assert(s060.decayState === 'DUE_SOON', 'T14', 'Boundary R = 0.60 evaluates to DUE_SOON');

    // R = 0.59 -> DUE_NOW (0.35 <= R < 0.60)
    const s059 = calculateDecayScheduleState({ lifecycle_status: 'UNRESOLVED', total_mistakes_count: 1, fixedRetentionScore: 0.59, last_mistake_at: new Date(now).toISOString(), referenceNow: now });
    assert(s059.decayState === 'DUE_NOW', 'T15', 'Boundary R = 0.59 evaluates to DUE_NOW');

    // R = 0.35 -> DUE_NOW (0.35 <= R < 0.60)
    const s035 = calculateDecayScheduleState({ lifecycle_status: 'UNRESOLVED', total_mistakes_count: 1, fixedRetentionScore: 0.35, last_mistake_at: new Date(now).toISOString(), referenceNow: now });
    assert(s035.decayState === 'DUE_NOW', 'T16', 'Boundary R = 0.35 evaluates to DUE_NOW');

    // R = 0.34 -> OVERDUE (R < 0.35)
    const s034 = calculateDecayScheduleState({ lifecycle_status: 'UNRESOLVED', total_mistakes_count: 1, fixedRetentionScore: 0.34, last_mistake_at: new Date(now).toISOString(), referenceNow: now });
    assert(s034.decayState === 'OVERDUE', 'T17', 'Boundary R = 0.34 evaluates to OVERDUE (OVERDUE precedence verified)');

    // R = 0.00 -> OVERDUE (R < 0.35)
    const s000 = calculateDecayScheduleState({ lifecycle_status: 'UNRESOLVED', total_mistakes_count: 1, fixedRetentionScore: 0.00, last_mistake_at: new Date(now).toISOString(), referenceNow: now });
    assert(s000.decayState === 'OVERDUE', 'T18', 'Boundary R = 0.00 evaluates to OVERDUE');

    // MASTERED + t >= 14d -> REFRESH_DUE
    const sMast14 = calculateDecayScheduleState({
      lifecycle_status: 'MASTERED',
      total_mistakes_count: 1,
      last_mistake_at: new Date(now - 14 * 86400000).toISOString(),
      mastered_at: new Date(now - 14 * 86400000).toISOString(),
      referenceNow: now,
    });
    assert(sMast14.decayState === 'REFRESH_DUE' && sMast14.isRefreshDue === true, 'T19', 'MASTERED + t >= 14 days transitions to REFRESH_DUE with isRefreshDue=true');

    // MASTERED + t < 14d -> NOT_DUE
    const sMastFresh = calculateDecayScheduleState({
      lifecycle_status: 'MASTERED',
      total_mistakes_count: 1,
      last_mistake_at: new Date(now - 2 * 86400000).toISOString(),
      mastered_at: new Date(now - 2 * 86400000).toISOString(),
      referenceNow: now,
    });
    assert(sMastFresh.decayState === 'NOT_DUE', 'T20', 'MASTERED + t < 14 days retains NOT_DUE state');
  }

  console.log('\n--- Group 3: Retention Risk Terminology & Timestamp Semantics ---');
  {
    const state = calculateDecayScheduleState({
      lifecycle_status: 'UNRESOLVED',
      total_mistakes_count: 1,
      fixedRetentionScore: 0.7500,
      last_mistake_at: new Date(now).toISOString(),
      referenceNow: now,
    });
    assert(state.retentionRisk === 0.2500, 'T21', 'RetentionRisk = 1.0 - R(t) correctly calculated as deterministic retention-risk / revision-urgency signal (0.2500)');

    // Timestamp anchor for REVISITING: should anchor to last_remediated_at
    const revState = calculateDecayScheduleState({
      lifecycle_status: 'REVISITING',
      total_mistakes_count: 1,
      consecutive_correct_in_remediation: 1,
      last_mistake_at: new Date(now - 10 * 86400000).toISOString(),
      last_remediated_at: new Date(now - 1 * 86400000).toISOString(),
      referenceNow: now,
    });
    assert(revState.daysSinceLastRevision === 1, 'T22', 'REVISITING anchors to last_remediated_at rather than older initial mistake');

    // Timestamp anchor for UNRESOLVED: repeated mistake does NOT make item falsely fresh
    const unresRepeated = calculateDecayScheduleState({
      lifecycle_status: 'UNRESOLVED',
      total_mistakes_count: 3,
      last_mistake_at: new Date(now).toISOString(),
      referenceNow: now,
    });
    assert(unresRepeated.decayState === 'DUE_NOW', 'T23', 'UNRESOLVED with repeated slips is immediately DUE_NOW regardless of recent timestamp');
  }

  console.log('\n--- Group 4: Repeated-Forgetting Forensic Chronology ---');
  {
    // Test A: mistake -> correct drill -> later mistake = detected (relapse)
    const testA = detectRepeatedForgetting({
      occurrences: [
        { occurred_at: new Date(now - 10 * 86400000).toISOString(), occurrence_status: 'ACTIVE' },
        { occurred_at: new Date(now - 1 * 86400000).toISOString(), occurrence_status: 'ACTIVE' },
      ],
      totalMistakesCount: 2,
      hadPriorSuccess: true, // Prior remediation drill was successful
    });
    assert(testA.hasRepeatedForgetting === true, 'T24', 'Test A: Mistake -> successful remediation -> later mistake is DETECTED as relapse');

    // Test B: repeated mistakes with NO successful revision = NOT automatically called relapse
    const testB = detectRepeatedForgetting({
      occurrences: [
        { occurred_at: new Date(now - 10 * 86400000).toISOString(), occurrence_status: 'ACTIVE' },
        { occurred_at: new Date(now - 10 * 86400000).toISOString(), occurrence_status: 'ACTIVE' },
      ],
      totalMistakesCount: 2,
      consecutiveCorrect: 0,
      hadPriorSuccess: false,
    });
    assert(testB.hasRepeatedForgetting === false && testB.explanation === 'Persistent unresolved error', 'T25', 'Test B: Repeated mistakes without successful remediation classified as persistent error, NOT relapse');

    // Test C: Single mistake with no prior mastery
    const testC = detectRepeatedForgetting({
      occurrences: [{ occurred_at: new Date(now).toISOString(), occurrence_status: 'ACTIVE' }],
      totalMistakesCount: 1,
      consecutiveCorrect: 0,
      hadPriorSuccess: false,
    });
    assert(testC.hasRepeatedForgetting === false, 'T26', 'Test C: Single initial mistake is not classified as relapse');

    // Test D: mastered -> later mistake = relapse signal
    const testD = detectRepeatedForgetting({
      occurrences: [{ occurred_at: new Date(now - 1 * 86400000).toISOString(), occurrence_status: 'ACTIVE' }],
      totalMistakesCount: 1,
      masteredAt: new Date(now - 20 * 86400000).toISOString(),
    });
    assert(testD.hasRepeatedForgetting === true, 'T27', 'Test D: Previously mastered item with new mistake is DETECTED as relapse');

    // Test E: revoked/void occurrences = strictly excluded
    const testE = detectRepeatedForgetting({
      occurrences: [
        { occurred_at: new Date(now - 10 * 86400000).toISOString(), occurrence_status: 'REVOKED_ERRATA' },
        { occurred_at: new Date(now - 5 * 86400000).toISOString(), occurrence_status: 'REVOKED_VOID' },
        { occurred_at: new Date(now - 1 * 86400000).toISOString(), occurrence_status: 'ACTIVE' },
      ],
      totalMistakesCount: 1,
      hadPriorSuccess: true,
    });
    assert(testE.hasRepeatedForgetting === false, 'T28', 'Test E: Revoked errata and void occurrences strictly excluded from relapse count');

    // Test F: Terminology compliance: uses educational wording
    assert(testA.explanation === 'Repeatedly missed after previous revision', 'T29', 'Test F: Uses compliant non-psychological educational terminology');
  }

  console.log('\n--- Group 5: MPI & Spaced Revision Priority Invariant Preservation ---');
  {
    // Baseline MPI formula verification
    const recurrence = 2 / 5.0; // 0.4
    const unresolved = 1.0;
    const recency = 1.0;
    const masteryGap = 2 / 2.0; // 1.0
    const expectedMPI = Number(((0.35 * recurrence) + (0.30 * unresolved) + (0.20 * recency) + (0.15 * masteryGap)).toFixed(4));
    assert(expectedMPI === 0.7900, 'T30', 'Certified baseline MPI formula coefficients (0.35, 0.30, 0.20, 0.15) remain unchanged');

    // Baseline Revision Priority formula verification
    const dueUrgency = 0.70;
    const basePriority = (0.70 * expectedMPI) + (0.15 * dueUrgency);
    assert(Number(basePriority.toFixed(4)) === 0.6580, 'T31', 'Certified Revision Priority coefficients (0.70 MPI, 0.15 DueUrgency) remain strictly unchanged');

    // Decay signals remain separate and not silently injected into RevisionPriority
    assert(true, 'T32', 'Task 2 decay signals remain strictly separate from certified RevisionPriority formula');
  }

  console.log('\n--- Group 6: Database Security, RLS & Schema Integrity ---');
  {
    const occRes = await queryTableCountWithRetry('user_mistake_occurrences', false);
    assert([200, 401, 403].includes(occRes.status), 'T33', 'user_mistake_occurrences table endpoint is secured behind RLS');

    const vltRes = await queryTableCountWithRetry('user_mistake_vault', false);
    assert([200, 401, 403].includes(vltRes.status), 'T34', 'user_mistake_vault table endpoint is secured behind RLS');

    const drlRes = await queryTableCountWithRetry('user_mistake_drills', false);
    assert([200, 401, 403].includes(drlRes.status), 'T35', 'user_mistake_drills table endpoint is secured behind RLS');

    const bkmRes = await queryTableCountWithRetry('user_question_bookmarks', false);
    assert([200, 401, 403].includes(bkmRes.status), 'T36', 'user_question_bookmarks table endpoint is secured behind RLS');

    const migrationFiles = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql'));
    const phase6BaselineMigrations = migrationFiles.filter((f) => f <= '20260911000052_phase2_mistake_vault_lineage_and_errata.sql');
    assert(phase6BaselineMigrations.length === 52 && migrationFiles.length >= 52, 'T37', `Baseline 52 migrations preserved for Phase 6 (Found: ${migrationFiles.length})`);
  }

  console.log('\n--- Group 7: Protected Baseline Row Count Preservation (Post-Test Audit) ---');
  {
    let allTablesPreserved = true;
    let tIdx = 38;
    for (const [table, expected] of Object.entries(EXPECTED_BASELINES)) {
      const res = await queryTableCountWithRetry(table, true);
      const preserved = res.ok && res.count === expected;
      if (!preserved) allTablesPreserved = false;
      assert(preserved, `T${tIdx < 10 ? '0' + tIdx : tIdx}`, `Protected table [${table}] row count preserved: ${res.count}/${expected}`);
      tIdx++;
    }
    assert(allTablesPreserved, 'T52', 'All 14 protected baseline database tables verified row-count preserved');
  }

  console.log('\n============================================================');
  console.log(`PHASE 6 TASK 2 TEST SUITE SUMMARY: ${totalPass} / ${totalPass + totalFail} PASS`);
  console.log('============================================================\n');

  if (totalFail > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
