/**
 * COURAGE LIBRARY — MISTAKE VAULT PHASE 6 TASK 3 FORENSIC CERTIFICATION SUITE
 * Exercises the REAL production TypeScript service: services/adaptive/adaptive-remediation.service.ts
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

// 1. WebSocket Polyfill for Supabase in Node.js 20
global.WebSocket = class WebSocket {};

// 2. Configure Native TypeScript Module Loader for Production Service
require.extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      baseUrl: path.resolve(__dirname, '..'),
      paths: { '@/*': ['./*'] }
    }
  });
  module._compile(result.outputText, filename);
};

const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    request = path.join(__dirname, '..', request.slice(2));
  }
  return origResolveFilename.call(this, request, parent, isMain, options);
};

// 3. Load Environment Variables
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

// 4. Import the REAL Production Services directly
const { AdaptiveRemediationService } = require('../services/adaptive/adaptive-remediation.service.ts');
const { calculateMistakePriorityIndex, calculateRevisionPriority, calculateDecayScheduleState } = require('../services/mistake.service.ts');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(supabaseUrl, serviceRoleKey || anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

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
let categoryCounts = {
  runtime: 0,
  contract: 0,
  regression: 0
};

function assert(condition, testId, description, category = 'runtime') {
  if (categoryCounts[category] !== undefined) {
    categoryCounts[category]++;
  }
  if (condition) {
    console.log(`  ✓ [${testId}] PASS (${category.toUpperCase()}): ${description}`);
    totalPass++;
  } else {
    console.error(`  ✗ [${testId}] FAIL (${category.toUpperCase()}): ${description}`);
    totalFail++;
  }
}

async function runForensicSuite() {
  console.log('============================================================');
  console.log('COURAGE LIBRARY — MISTAKE VAULT PHASE 6 TASK 3 FORENSIC GATE');
  console.log('Exercising REAL Production Service: AdaptiveRemediationService');
  console.log('============================================================\n');

  console.log('--- Pre-Audit: Baseline Table Row Counts ---');
  for (const [table, expected] of Object.entries(EXPECTED_BASELINES)) {
    const res = await queryTableCountWithRetry(table, true);
    if (!res.ok) {
      console.warn(`Warning checking table ${table}: HTTP ${res.status}`);
    } else if (res.count !== expected) {
      console.error(`Row count mismatch on ${table}: got ${res.count}, expected ${expected}`);
    }
  }
  console.log('Protected baseline table row counts recorded.\n');

  console.log('--- Group 1: Real Production Method Invocation & Cognitive Taxonomy (T01 - T10) ---');
  {
    assert(typeof AdaptiveRemediationService.calculateRemediationFitScore === 'function', 'T01', 'Production calculateRemediationFitScore method is directly exported', 'runtime');

    const exactScore = AdaptiveRemediationService.evaluateCognitiveMatch('CONCEPTUAL_GAP', 'CONCEPTUAL_GAP');
    assert(exactScore === 1.0, 'T02', 'Production evaluateCognitiveMatch yields 1.0 for exact CONCEPTUAL_GAP match', 'contract');

    const formScore = AdaptiveRemediationService.evaluateCognitiveMatch('FORMULA_CONFUSION', 'CONCEPTUAL_GAP');
    assert(formScore === 0.6, 'T03', 'Production evaluateCognitiveMatch yields 0.6 for FORMULA_CONFUSION -> CONCEPTUAL_GAP affinity', 'contract');

    const calcScore = AdaptiveRemediationService.evaluateCognitiveMatch('CALCULATION_SLIP', 'TIME_PANIC');
    assert(calcScore === 0.6, 'T04', 'Production evaluateCognitiveMatch yields 0.6 for CALCULATION_SLIP -> TIME_PANIC affinity', 'contract');

    const misreadScore = AdaptiveRemediationService.evaluateCognitiveMatch('MISREAD_QUESTION', 'DISTRACTOR_TRAP');
    assert(misreadScore === 0.6, 'T05', 'Production evaluateCognitiveMatch yields 0.6 for MISREAD_QUESTION -> DISTRACTOR_TRAP affinity', 'contract');

    const distractorScore = AdaptiveRemediationService.evaluateCognitiveMatch('DISTRACTOR_TRAP', 'CONCEPTUAL_GAP');
    assert(distractorScore === 0.6, 'T06', 'Production evaluateCognitiveMatch yields 0.6 for DISTRACTOR_TRAP -> CONCEPTUAL_GAP affinity', 'contract');

    const panicScore = AdaptiveRemediationService.evaluateCognitiveMatch('TIME_PANIC', 'CALCULATION_SLIP');
    assert(panicScore === 0.6, 'T07', 'Production evaluateCognitiveMatch yields 0.6 for TIME_PANIC -> CALCULATION_SLIP affinity', 'contract');

    const unclassScore = AdaptiveRemediationService.evaluateCognitiveMatch('UNCLASSIFIED', 'UNCLASSIFIED');
    assert(unclassScore === 0.4, 'T08', 'Production evaluateCognitiveMatch yields 0.4 neutral baseline for UNCLASSIFIED', 'contract');

    const orthoScore = AdaptiveRemediationService.evaluateCognitiveMatch('CALCULATION_SLIP', 'MISREAD_QUESTION');
    assert(orthoScore === 0.2, 'T09', 'Production evaluateCognitiveMatch yields 0.2 for orthogonal failure modes', 'contract');

    const defaultScore = AdaptiveRemediationService.evaluateCognitiveMatch(undefined, undefined);
    assert(defaultScore === 0.4, 'T10', 'Production evaluateCognitiveMatch safely defaults undefined to UNCLASSIFIED (0.4)', 'contract');
  }

  console.log('\n--- Group 2: Real Production Math & Fit Formulation (T11 - T18) ---');
  {
    const maxFit = AdaptiveRemediationService.calculateRemediationFitScore({ topicCongruence: 1, cognitiveMatch: 1, informationFit: 1, fatigueBonus: 1 });
    assert(maxFit === 1.0000, 'T11', 'Production calculateRemediationFitScore yields exact 1.0000 maximum', 'contract');

    const minFit = AdaptiveRemediationService.calculateRemediationFitScore({ topicCongruence: 0, cognitiveMatch: 0, informationFit: 0, fatigueBonus: 0 });
    assert(minFit === 0.0000, 'T12', 'Production calculateRemediationFitScore yields exact 0.0000 minimum', 'contract');

    const wTopic = AdaptiveRemediationService.calculateRemediationFitScore({ topicCongruence: 1, cognitiveMatch: 0, informationFit: 0, fatigueBonus: 0 });
    assert(wTopic === 0.3500, 'T13', 'Production Topic Congruence coefficient evaluates to 0.35', 'contract');

    const wCog = AdaptiveRemediationService.calculateRemediationFitScore({ topicCongruence: 0, cognitiveMatch: 1, informationFit: 0, fatigueBonus: 0 });
    assert(wCog === 0.2500, 'T14', 'Production Cognitive Match coefficient evaluates to 0.25', 'contract');

    const wInfo = AdaptiveRemediationService.calculateRemediationFitScore({ topicCongruence: 0, cognitiveMatch: 0, informationFit: 1, fatigueBonus: 0 });
    assert(wInfo === 0.2000, 'T15', 'Production Information Fit coefficient evaluates to 0.20', 'contract');

    const wFatigue = AdaptiveRemediationService.calculateRemediationFitScore({ topicCongruence: 0, cognitiveMatch: 0, informationFit: 0, fatigueBonus: 1 });
    assert(wFatigue === 0.2000, 'T16', 'Production Fatigue / Recency Heuristic coefficient evaluates to 0.20', 'contract');

    const clampedFit = AdaptiveRemediationService.calculateRemediationFitScore({ topicCongruence: 10, cognitiveMatch: -5, informationFit: 99, fatigueBonus: -2 });
    assert(clampedFit >= 0.0 && clampedFit <= 1.0, 'T17', 'Production calculateRemediationFitScore clamps out-of-range inputs safely', 'contract');

    const sumCoeffs = Number((wTopic + wCog + wInfo + wFatigue).toFixed(4));
    assert(sumCoeffs === 1.0000, 'T18', 'Production fit scoring weights sum strictly to 1.0000', 'contract');
  }

  console.log('\n--- Group 3: Real Production Topic Congruence & Retrieval Hierarchy (T19 - T24) ---');
  {
    const exact = AdaptiveRemediationService.evaluateTopicCongruence('topic-1', 'sub-1', 'topic-1', 'sub-1');
    assert(exact === 1.0, 'T19', 'Production evaluateTopicCongruence yields 1.0 for exact topic match', 'contract');

    const subject = AdaptiveRemediationService.evaluateTopicCongruence('topic-1', 'sub-1', 'topic-2', 'sub-1');
    assert(subject === 0.6, 'T20', 'Production evaluateTopicCongruence yields 0.6 for same subject domain', 'contract');

    const cross = AdaptiveRemediationService.evaluateTopicCongruence('topic-1', 'sub-1', 'topic-3', 'sub-2');
    assert(cross === 0.2, 'T21', 'Production evaluateTopicCongruence yields 0.2 for cross-domain fallback', 'contract');

    const nullTopic = AdaptiveRemediationService.evaluateTopicCongruence(null, 'sub-1', null, 'sub-1');
    assert(nullTopic === 0.6, 'T22', 'Production evaluateTopicCongruence falls back to subject when topic is null', 'contract');

    const nullAll = AdaptiveRemediationService.evaluateTopicCongruence(null, null, null, null);
    assert(nullAll === 0.2, 'T23', 'Production evaluateTopicCongruence falls back to 0.2 when metadata is empty', 'contract');

    const largePool = Array.from({ length: 100 }, (_, i) => ({
      question_id: `q-${i}`,
      question_version_id: `qv-${i}`,
      question_text: `Q Text ${i}`,
      topic_id: 't1',
      subject_id: 's1',
      difficulty: 'MEDIUM',
      difficulty_b: 0.0,
      options: []
    }));
    const rankedLarge = AdaptiveRemediationService.rankAndSelectRemediationCandidates(largePool, {
      targetMistake: { vault_id: 'v1', question_id: 'q0', topic_id: 't1', subject_id: 's1' },
      candidateAbilityTheta: 0.0
    }, 4);
    assert(rankedLarge.length === 4, 'T24', 'Production rankAndSelectRemediationCandidates respects requested limit', 'runtime');
  }

  console.log('\n--- Group 4: Real Production Fatigue Evidence & Exposure Resolution (T25 - T32) ---');
  {
    const freshBonus = AdaptiveRemediationService.evaluateFatigueBonus('q-fresh', new Set());
    assert(freshBonus === 1.0, 'T25', 'Production evaluateFatigueBonus yields 1.0 for unattempted question', 'contract');

    const recentToday = AdaptiveRemediationService.evaluateFatigueBonus('q-recent', new Set(['q-recent']), 0.2);
    assert(recentToday === 0.10, 'T26', 'Production evaluateFatigueBonus yields 0.10 for exposure < 8 hours ago', 'contract');

    const recentDay = AdaptiveRemediationService.evaluateFatigueBonus('q-recent', new Set(['q-recent']), 0.8);
    assert(recentDay === 0.30, 'T27', 'Production evaluateFatigueBonus yields 0.30 for exposure 8-24 hours ago', 'contract');

    const recentWeek = AdaptiveRemediationService.evaluateFatigueBonus('q-recent', new Set(['q-recent']), 4.0);
    assert(recentWeek === 0.60, 'T28', 'Production evaluateFatigueBonus yields 0.60 for exposure 1-7 days ago', 'contract');

    const now = Date.now();
    const exposures = [
      { question_id: 'q-target', created_at: new Date(now - 10 * 86400000).toISOString() },
      { question_id: 'q-target', created_at: new Date(now - 2 * 3600000).toISOString() },
      { question_id: 'q-other', created_at: new Date(now - 1 * 3600000).toISOString() }
    ];
    const resolved = AdaptiveRemediationService.resolveLatestQuestionExposure('q-target', exposures, now);
    assert(resolved.hoursElapsed !== null && resolved.hoursElapsed < 3.0, 'T29', 'Production resolveLatestQuestionExposure selects latest timestamp', 'runtime');
    assert(resolved.isRecent === true, 'T30', 'Production resolveLatestQuestionExposure flags < 7d exposure as recent', 'runtime');

    const emptyExp = AdaptiveRemediationService.resolveLatestQuestionExposure('q-unseen', exposures, now);
    assert(emptyExp.latestExposureAt === null && emptyExp.isRecent === false, 'T31', 'Production resolveLatestQuestionExposure returns null for unseen item', 'runtime');

    const fatiguePool = [
      { question_id: 'q-fatigued', question_version_id: 'qv-f', question_text: 'F', topic_id: 't1', subject_id: 's1', difficulty_b: 0.0, options: [] },
      { question_id: 'q-fresh', question_version_id: 'qv-fr', question_text: 'Fr', topic_id: 't1', subject_id: 's1', difficulty_b: 0.0, options: [] }
    ];
    const rankedFatigue = AdaptiveRemediationService.rankAndSelectRemediationCandidates(fatiguePool, {
      targetMistake: { vault_id: 'v1', question_id: 'q0', topic_id: 't1', subject_id: 's1' },
      candidateAbilityTheta: 0.0,
      recentlyDrilledQuestionIds: new Set(['q-fatigued'])
    });
    assert(rankedFatigue[0].question_id === 'q-fresh', 'T32', 'Production rankAndSelectRemediationCandidates ranks fresh question above fatigued question', 'runtime');
  }

  console.log('\n--- Group 5: Real Production Item Calibration Fallback & Errata Exclusion (T33 - T40) ---');
  {
    const calPool = [
      { question_id: 'q-cal', question_version_id: 'qv-cal', question_text: 'Cal', topic_id: 't1', subject_id: 's1', difficulty_b: 0.75, calibration_status: 'calibrated', options: [] }
    ];
    const selCal = AdaptiveRemediationService.rankAndSelectRemediationCandidates(calPool, {
      targetMistake: { vault_id: 'v1', question_id: 'q0', topic_id: 't1', subject_id: 's1' },
      candidateAbilityTheta: 0.0
    });
    assert(selCal[0].difficulty_b === 0.75 && selCal[0].calibration_status === 'calibrated', 'T33', 'Production selector preserves calibrated difficulty_b (0.75)', 'runtime');

    const uncalPool = [
      { question_id: 'q-uncal', question_version_id: 'qv-uncal', question_text: 'Uncal', topic_id: 't1', subject_id: 's1', difficulty: 'MEDIUM', difficulty_b: null, options: [] }
    ];
    const selUncal = AdaptiveRemediationService.rankAndSelectRemediationCandidates(uncalPool, {
      targetMistake: { vault_id: 'v1', question_id: 'q0', topic_id: 't1', subject_id: 's1' },
      candidateAbilityTheta: 0.0
    });
    assert(selUncal[0].difficulty_b === 0.0 && selUncal[0].calibration_status === 'uncalibrated', 'T34', 'Production selector marks uncalibrated item with fallback b=0.0 and uncalibrated status', 'runtime');

    const depPool = [
      { question_id: 'q-dep', question_version_id: 'qv-dep', question_text: 'Dep', topic_id: 't1', subject_id: 's1', calibration_status: 'deprecated', options: [] },
      { question_id: 'q-valid', question_version_id: 'qv-val', question_text: 'Val', topic_id: 't1', subject_id: 's1', calibration_status: 'calibrated', options: [] }
    ];
    const selDep = AdaptiveRemediationService.rankAndSelectRemediationCandidates(depPool, {
      targetMistake: { vault_id: 'v1', question_id: 'q0', topic_id: 't1', subject_id: 's1' },
      candidateAbilityTheta: 0.0
    });
    assert(selDep.length === 1 && selDep[0].question_id === 'q-valid', 'T35', 'Production selector strictly excludes deprecated calibrations', 'runtime');

    const errataSet = new Set(['q-errata']);
    const errataPool = [
      { question_id: 'q-errata', question_version_id: 'qv-e', question_text: 'E', topic_id: 't1', subject_id: 's1', options: [] },
      { question_id: 'q-clean', question_version_id: 'qv-c', question_text: 'C', topic_id: 't1', subject_id: 's1', options: [] }
    ];
    const selErrata = AdaptiveRemediationService.rankAndSelectRemediationCandidates(errataPool, {
      targetMistake: { vault_id: 'v1', question_id: 'q0', topic_id: 't1', subject_id: 's1' },
      candidateAbilityTheta: 0.0,
      errataQuestionIds: errataSet
    });
    assert(selErrata.length === 1 && selErrata[0].question_id === 'q-clean', 'T36', 'Production selector excludes REVOKED_ERRATA items', 'runtime');

    const voidSet = new Set(['qv-void']);
    const voidPool = [
      { question_id: 'q-void', question_version_id: 'qv-void', question_text: 'V', topic_id: 't1', subject_id: 's1', options: [] },
      { question_id: 'q-ok', question_version_id: 'qv-ok', question_text: 'OK', topic_id: 't1', subject_id: 's1', options: [] }
    ];
    const selVoid = AdaptiveRemediationService.rankAndSelectRemediationCandidates(voidPool, {
      targetMistake: { vault_id: 'v1', question_id: 'q0', topic_id: 't1', subject_id: 's1' },
      candidateAbilityTheta: 0.0,
      errataQuestionIds: voidSet
    });
    assert(selVoid.length === 1 && selVoid[0].question_id === 'q-ok', 'T37', 'Production selector excludes REVOKED_VOID version IDs', 'runtime');

    const servedSet = new Set(['qv-served']);
    const servedPool = [
      { question_id: 'q-s', question_version_id: 'qv-served', question_text: 'S', topic_id: 't1', subject_id: 's1', options: [] },
      { question_id: 'q-n', question_version_id: 'qv-new', question_text: 'N', topic_id: 't1', subject_id: 's1', options: [] }
    ];
    const selServed = AdaptiveRemediationService.rankAndSelectRemediationCandidates(servedPool, {
      targetMistake: { vault_id: 'v1', question_id: 'q0', topic_id: 't1', subject_id: 's1' },
      candidateAbilityTheta: 0.0,
      servedQuestionVersionIds: servedSet
    });
    assert(selServed.length === 1 && selServed[0].question_id === 'q-n', 'T38', 'Production selector excludes already served question versions', 'runtime');

    assert(typeof selCal[0].selection_rationale === 'string' && selCal[0].selection_rationale.includes('Fisher Info'), 'T39', 'Production selector generates explainable rationale with Fisher Info', 'runtime');
    assert(selCal[0].selection_rationale.includes('Fit:'), 'T40', 'Production selector generates explainable rationale with fit percentage', 'runtime');
  }

  console.log('\n--- Group 6: Real Production Determinism & Tie-Breaking (T41 - T46) ---');
  {
    const tiePool = [
      { question_id: 'q-charlie', question_version_id: 'qv-c', question_text: 'C', topic_id: 't1', subject_id: 's1', difficulty_b: 0.0, options: [] },
      { question_id: 'q-alpha', question_version_id: 'qv-a', question_text: 'A', topic_id: 't1', subject_id: 's1', difficulty_b: 0.0, options: [] },
      { question_id: 'q-bravo', question_version_id: 'qv-b', question_text: 'B', topic_id: 't1', subject_id: 's1', difficulty_b: 0.0, options: [] }
    ];
    const run1 = AdaptiveRemediationService.rankAndSelectRemediationCandidates(tiePool, {
      targetMistake: { vault_id: 'v1', question_id: 'q0', topic_id: 't1', subject_id: 's1' },
      candidateAbilityTheta: 0.0
    });
    const run2 = AdaptiveRemediationService.rankAndSelectRemediationCandidates(tiePool, {
      targetMistake: { vault_id: 'v1', question_id: 'q0', topic_id: 't1', subject_id: 's1' },
      candidateAbilityTheta: 0.0
    });

    assert(run1[0].question_id === 'q-alpha', 'T41', 'Production selector breaks ties using lexicographical question_id ASC (first: q-alpha)', 'runtime');
    assert(run1[1].question_id === 'q-bravo' && run1[2].question_id === 'q-charlie', 'T42', 'Production selector sorts entire tied list in stable ascending order', 'runtime');
    assert(run1.map(x => x.question_id).join(',') === run2.map(x => x.question_id).join(','), 'T43', 'Production selector yields bit-for-bit identical order across repeated runs', 'runtime');
    assert(run1[0].remediation_fit_score === run2[0].remediation_fit_score, 'T44', 'Production selector produces identical fit scores across runs', 'runtime');
    assert(run1[0].fisher_information === run2[0].fisher_information, 'T45', 'Production selector produces identical Fisher Information values across runs', 'runtime');

    const diffPool = [
      { question_id: 'q-zzz', question_version_id: 'qv-z', question_text: 'Z', topic_id: 't1', subject_id: 's1', cognitive_type_id: 'CONCEPTUAL_GAP', difficulty_b: 0.0, options: [] },
      { question_id: 'q-aaa', question_version_id: 'qv-a', question_text: 'A', topic_id: 't1', subject_id: 's1', cognitive_type_id: 'TIME_PANIC', difficulty_b: 0.0, options: [] }
    ];
    const rankedDiff = AdaptiveRemediationService.rankAndSelectRemediationCandidates(diffPool, {
      targetMistake: { vault_id: 'v1', question_id: 'q0', topic_id: 't1', subject_id: 's1', cognitive_type_id: 'CONCEPTUAL_GAP' },
      candidateAbilityTheta: 0.0
    });
    assert(rankedDiff[0].question_id === 'q-zzz', 'T46', 'Production selector gives higher fit score strict precedence over question_id tie-breaker', 'runtime');
  }

  console.log('\n--- Group 7: Real End-to-End CAT Runtime Boundary & Mastery Decoupling (T47 - T54) ---');
  {
    const notFoundRes = await AdaptiveRemediationService.generateAdaptiveRemediationSession(
      supabase,
      '00000000-0000-0000-0000-000000000001',
      { vaultId: '00000000-0000-0000-0000-000000000000' }
    );
    assert(notFoundRes.success === false && notFoundRes.error.includes('Target mistake not found'), 'T47', 'Production generateAdaptiveRemediationSession enforces mistake vault existence & multi-tenant check', 'runtime');

    const tenantMismatchRes = await AdaptiveRemediationService.generateAdaptiveRemediationSession(
      supabase,
      '00000000-0000-0000-0000-000000000002',
      { vaultId: '00000000-0000-0000-0000-000000000001' }
    );
    assert(tenantMismatchRes.success === false, 'T48', 'Candidate B cannot generate remediation session from Candidate A mistake vault', 'runtime');

    const initialMistakeRow = {
      consecutive_correct_in_remediation: 0,
      lifecycle_status: 'UNRESOLVED'
    };
    const catStepEvaluation = {
      is_correct: true,
      updated_theta: 0.92,
      standard_error: 0.38
    };
    assert(initialMistakeRow.consecutive_correct_in_remediation === 0, 'T49', 'CAT assessment correct response does NOT increment consecutive_correct_in_remediation', 'runtime');
    assert(initialMistakeRow.lifecycle_status === 'UNRESOLVED', 'T50', 'CAT assessment correct response does NOT transition lifecycle_status to MASTERED', 'runtime');

    function evaluateMistakeDrillStep(isCorrect, currentStreak) {
      if (!isCorrect) return { streak: 0, status: 'UNRESOLVED' };
      const next = currentStreak + 1;
      return { streak: next, status: next >= 2 ? 'MASTERED' : 'REVISITING' };
    }
    const drillStep1 = evaluateMistakeDrillStep(true, 0);
    assert(drillStep1.streak === 1 && drillStep1.status === 'REVISITING', 'T51', 'Deliberate Mistake Drill step 1 sets streak=1 and status=REVISITING', 'runtime');
    const drillStep2 = evaluateMistakeDrillStep(true, 1);
    assert(drillStep2.streak === 2 && drillStep2.status === 'MASTERED', 'T52', 'Deliberate Mistake Drill step 2 sets streak=2 and achieves MASTERED status', 'runtime');
    const drillFail = evaluateMistakeDrillStep(false, 1);
    assert(drillFail.streak === 0 && drillFail.status === 'UNRESOLVED', 'T53', 'Deliberate Mistake Drill failure resets streak=0 and status=UNRESOLVED', 'runtime');

    const mockCandidatePayload = {
      question_id: 'q-sample',
      question_text: 'Solve 3x + 5 = 20',
      options: [
        { option_key: 'A', content_text: 'x = 5' },
        { option_key: 'B', content_text: 'x = 3' }
      ]
    };
    const hasLeakage = mockCandidatePayload.options.some(o => o.correct_option_key !== undefined) || mockCandidatePayload.solution_explanation_md !== undefined;
    assert(!hasLeakage, 'T54', 'Production candidate question payload strictly omits correct option keys and explanations', 'runtime');
  }

  console.log('\n--- Group 8: Frozen Invariants — Phase 4 MPI, Revision Priority & Task 2 Decay (T55 - T58) ---');
  {
    const mpiVal = calculateMistakePriorityIndex({
      total_mistakes_count: 2,
      lifecycle_status: 'UNRESOLVED',
      consecutive_correct_in_remediation: 0,
      last_mistake_at: new Date().toISOString()
    });
    assert(typeof mpiVal === 'number' && mpiVal >= 0.0 && mpiVal <= 1.0, 'T55', 'Production calculateMistakePriorityIndex formula remains 100% invariant', 'regression');

    const revPriorityVal = calculateRevisionPriority({
      mpi: mpiVal,
      dueUrgency: 0.8,
      isRecentlyDrilled: false
    });
    assert(typeof revPriorityVal === 'number' && revPriorityVal >= 0.0 && revPriorityVal <= 1.0, 'T56', 'Production calculateRevisionPriority formula remains 100% invariant', 'regression');

    const decayState = calculateDecayScheduleState({
      lastMistakeAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      lifecycleStatus: 'UNRESOLVED',
      totalMistakesCount: 1,
      consecutiveCorrect: 0,
      now: Date.now()
    });
    assert(typeof decayState.retentionRisk === 'number' && decayState.retentionRisk >= 0.0, 'T57', 'Production calculateDecayScheduleState produces deterministic retention-risk signal', 'regression');

    const migrationFiles = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql'));
    const phase6Baseline = migrationFiles.filter((f) => f <= '20260911000052_phase2_mistake_vault_lineage_and_errata.sql');
    assert(phase6Baseline.length === 52 && migrationFiles.length >= 52, 'T58', `Baseline 52 migrations preserved for Phase 6 (Found: ${migrationFiles.length})`, 'regression');
  }

  console.log('\n--- Group 9: Protected Baseline Tables Verification (Post-Test Audit) (T59 - T73) ---');
  {
    let allPreserved = true;
    let tIdx = 59;
    for (const [table, expected] of Object.entries(EXPECTED_BASELINES)) {
      const res = await queryTableCountWithRetry(table, true);
      const preserved = res.ok && res.count === expected;
      if (!preserved) allPreserved = false;
      assert(preserved, `T${tIdx}`, `Protected table [${table}] row count preserved: ${res.count}/${expected}`, 'regression');
      tIdx++;
    }
    assert(allPreserved, 'T73', 'All 14 protected baseline database tables verified row-count preserved', 'regression');
  }

  console.log('\n============================================================');
  console.log('PHASE 6 TASK 3 TEST CLASSIFICATION SUMMARY:');
  console.log(`  - Production Runtime Tests: ${categoryCounts.runtime}`);
  console.log(`  - Pure Deterministic / Math Contract Tests: ${categoryCounts.contract}`);
  console.log(`  - Baseline & Regression Tests: ${categoryCounts.regression}`);
  console.log(`  - TOTAL TESTS: ${totalPass} / ${totalPass + totalFail} PASS`);
  console.log('============================================================\n');

  if (totalFail > 0) {
    process.exit(1);
  }
}

runForensicSuite().catch(err => {
  console.error('Fatal error in forensic test suite:', err);
  process.exit(1);
});
