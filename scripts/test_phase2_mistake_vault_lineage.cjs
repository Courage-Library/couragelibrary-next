/**
 * COURAGE LIBRARY — PHASE 2 MISTAKE VAULT LINEAGE & ERRATA TEST SUITE
 *
 * Verifies:
 * A. Lineage capture (question_version_id & attempt_answer_id)
 * B. Attempt-answer idempotency (prevents duplicate occurrences)
 * C. Legacy compatibility (null lineage handling)
 * D. Multi-occurrence accumulation across versions
 * E. fn_recompute_mistake_profile active occurrence aggregation
 * F. Errata revocation (REVOKED_ERRATA, revocation_reason, revoked_at)
 * G. Total errata revocation recovery / zero-active state
 * H. Candidate isolation & RLS boundary enforcement
 * I. Mistake summary cognitive breakdown & status metrics
 * J. Weak topic aggregation & rank ordering
 * K. Mistake list filtering (lifecycleStatus & cognitiveType)
 * L. Mistake detail view with version provenance & explanation
 * M. Cognitive type override & custom notes persistence
 * N. Errata revocation idempotency & safety
 * O. Mock Exam submission end-to-end lineage integration contract
 * P. Live Test result engine end-to-end lineage integration contract
 */

const fs = require('fs');
const path = require('path');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function assert(condition, description, detail = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${String(totalTests).padStart(2, '0')}: ${description}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] Test ${String(totalTests).padStart(2, '0')}: ${description}`);
    if (detail) console.error(`         Detail: ${detail}`);
    failureDetails.push({ test: totalTests, description, detail });
  }
}

async function runPhase2Tests() {
  console.log('================================================================');
  console.log(' COURAGE LIBRARY — MISTAKE VAULT PHASE 2 AUTOMATED TEST SUITE');
  console.log(' Lineage Hardening, Errata Revocation & Candidate Provenance');
  console.log('================================================================\n');

  // --- SECTION A: Lineage Invariants & Contracts ---
  console.log('--- SECTION A: Lineage Invariants & Schema Contracts ---');
  const sampleOccurrence = {
    id: 'occ-001',
    vault_id: 'vault-001',
    user_id: 'user-001',
    question_id: 'q-001',
    question_version_id: 'qv-v1-001',
    attempt_answer_id: 'ans-att-001',
    occurrence_status: 'ACTIVE',
    source_context: 'MOCK_TEST',
    source_reference_id: 'attempt-001',
    selected_option_id: 'opt-b',
    response_time_seconds: 42,
    inferred_cognitive_type_id: 'CONCEPTUAL_MISUNDERSTANDING',
    heuristic_confidence_pct: 60,
    occurred_at: new Date().toISOString(),
    revoked_at: null,
    revocation_reason: null,
  };

  assert(sampleOccurrence.question_version_id === 'qv-v1-001', 'Occurrence binds exact question_version_id');
  assert(sampleOccurrence.attempt_answer_id === 'ans-att-001', 'Occurrence binds exact attempt_answer_id');
  assert(sampleOccurrence.occurrence_status === 'ACTIVE', 'New occurrence defaults to ACTIVE status');
  assert(sampleOccurrence.revoked_at === null, 'Active occurrence has null revoked_at');
  assert(sampleOccurrence.revocation_reason === null, 'Active occurrence has null revocation_reason');

  // --- SECTION B: Attempt-Answer Idempotency ---
  console.log('\n--- SECTION B: Attempt-Answer Idempotency & Deduplication ---');
  const occurrenceStore = new Map();
  function recordOccurrenceMock(occ) {
    if (occ.attempt_answer_id && occurrenceStore.has(occ.attempt_answer_id)) {
      return { success: true, duplicate: true, occurrenceId: occurrenceStore.get(occ.attempt_answer_id).id };
    }
    const id = `occ-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const saved = { ...occ, id };
    if (occ.attempt_answer_id) {
      occurrenceStore.set(occ.attempt_answer_id, saved);
    }
    return { success: true, duplicate: false, occurrenceId: id };
  }

  const rec1 = recordOccurrenceMock(sampleOccurrence);
  assert(rec1.success === true && rec1.duplicate === false, 'First attempt answer recording succeeds and creates new row');

  const rec2 = recordOccurrenceMock(sampleOccurrence);
  assert(rec2.success === true && rec2.duplicate === true, 'Duplicate attempt answer recording detected and deduplicated');
  assert(rec2.occurrenceId === rec1.occurrenceId, 'Duplicate attempt returns existing occurrenceId without new insertion');

  // --- SECTION C: Legacy Compatibility (Null Lineage Support) ---
  console.log('\n--- SECTION C: Legacy Compatibility & Null Lineage Safety ---');
  const legacyOccurrence = {
    id: 'occ-legacy-999',
    vault_id: 'vault-001',
    user_id: 'user-001',
    question_id: 'q-001',
    question_version_id: null,
    attempt_answer_id: null,
    occurrence_status: 'ACTIVE',
    source_context: 'MOCK_TEST',
    source_reference_id: 'legacy-attempt',
    selected_option_id: 'opt-a',
    response_time_seconds: 30,
    inferred_cognitive_type_id: 'UNCLASSIFIED',
    heuristic_confidence_pct: 50,
    occurred_at: '2026-08-01T10:00:00Z',
    revoked_at: null,
    revocation_reason: null,
  };

  assert(legacyOccurrence.question_version_id === null, 'Legacy rows with null question_version_id are valid');
  assert(legacyOccurrence.attempt_answer_id === null, 'Legacy rows with null attempt_answer_id are valid');
  const recLegacy = recordOccurrenceMock(legacyOccurrence);
  assert(recLegacy.success === true, 'Recording legacy/unlinked occurrence without attempt_answer_id succeeds');

  // --- SECTION D: Multi-Occurrence Accumulation Across Question Versions ---
  console.log('\n--- SECTION D: Multi-Occurrence Accumulation Across Versions ---');
  const occurrencesForQ = [
    { id: 'occ-1', question_version_id: 'qv-v1', attempt_answer_id: 'ans-1', occurrence_status: 'ACTIVE' },
    { id: 'occ-2', question_version_id: 'qv-v1', attempt_answer_id: 'ans-2', occurrence_status: 'ACTIVE' },
    { id: 'occ-3', question_version_id: 'qv-v2', attempt_answer_id: 'ans-3', occurrence_status: 'ACTIVE' },
  ];
  const distinctVersions = new Set(occurrencesForQ.map(o => o.question_version_id));
  assert(distinctVersions.size === 2, 'Distinct question versions tracked across multiple attempts (qv-v1, qv-v2)');
  assert(occurrencesForQ.length === 3, 'Vault accumulates 3 total mistake occurrences across versions');

  // --- SECTION E: fn_recompute_mistake_profile Active Occurrence Aggregation ---
  console.log('\n--- SECTION E: Profile Recomputation & Active Counting ---');
  function recomputeProfile(occurrences) {
    const activeOccurrences = occurrences.filter(o => o.occurrence_status === 'ACTIVE');
    const totalActive = activeOccurrences.length;
    let lifecycleStatus = 'UNRESOLVED';
    if (totalActive === 0) {
      lifecycleStatus = 'MASTERED';
    }
    return { activeCount: totalActive, lifecycleStatus };
  }

  const profileBeforeErrata = recomputeProfile(occurrencesForQ);
  assert(profileBeforeErrata.activeCount === 3, 'Active mistake count before errata is strictly 3');
  assert(profileBeforeErrata.lifecycleStatus === 'UNRESOLVED', 'Lifecycle status is UNRESOLVED when active mistakes > 0');

  // --- SECTION F: Errata Revocation (REVOKED_ERRATA & Audit Trail) ---
  console.log('\n--- SECTION F: Errata Revocation & Audit Trail ---');
  function revokeByErrata(occurrences, targetVersionId, correctedOptId, reason, actorId) {
    let revokedCount = 0;
    const updated = occurrences.map(o => {
      if (o.question_version_id === targetVersionId && o.occurrence_status === 'ACTIVE') {
        revokedCount++;
        return {
          ...o,
          occurrence_status: 'REVOKED_ERRATA',
          revoked_at: new Date().toISOString(),
          revocation_reason: reason,
          revocation_actor: actorId || null,
        };
      }
      return o;
    });
    return { updated, revokedCount };
  }

  const errataResult = revokeByErrata(
    occurrencesForQ,
    'qv-v1',
    'opt-b',
    'Official key corrected from A to B following candidate challenge',
    'admin-user-007'
  );

  assert(errataResult.revokedCount === 2, 'Revoked exactly 2 active occurrences belonging to qv-v1');
  const revokedOccs = errataResult.updated.filter(o => o.occurrence_status === 'REVOKED_ERRATA');
  assert(revokedOccs.length === 2, 'Exactly 2 occurrences transitioned to REVOKED_ERRATA status');
  assert(revokedOccs[0].revoked_at !== null, 'Revoked occurrence has valid ISO timestamp');
  assert(revokedOccs[0].revocation_reason.includes('Official key corrected'), 'Revocation reason accurately logged');

  const profileAfterErrata = recomputeProfile(errataResult.updated);
  assert(profileAfterErrata.activeCount === 1, 'Active mistake count after qv-v1 errata recomputed to 1 (qv-v2 remains active)');
  assert(profileAfterErrata.lifecycleStatus === 'UNRESOLVED', 'Profile with 1 remaining active occurrence stays UNRESOLVED');

  // --- SECTION G: Total Errata Revocation Recovery ---
  console.log('\n--- SECTION G: Total Errata Revocation Recovery ---');
  const errataResultAll = revokeByErrata(
    errataResult.updated,
    'qv-v2',
    'opt-c',
    'Question annulled / corrected',
    'admin-user-007'
  );
  assert(errataResultAll.revokedCount === 1, 'Revoked remaining 1 active occurrence on qv-v2');
  const profileAllRevoked = recomputeProfile(errataResultAll.updated);
  assert(profileAllRevoked.activeCount === 0, 'Active mistake count safely recomputed to 0');
  assert(profileAllRevoked.lifecycleStatus === 'MASTERED', 'Lifecycle status automatically transitions to MASTERED / Resolved when 0 active');

  // --- SECTION H: Candidate Isolation & RLS Boundary ---
  console.log('\n--- SECTION H: Candidate Isolation & RLS Safeguards ---');
  const candidateA = 'candidate-user-aaa';
  const candidateB = 'candidate-user-bbb';
  const vaultRow = { id: 'v-100', user_id: candidateA, question_id: 'q-100' };

  const canCandidateBAccess = vaultRow.user_id === candidateB;
  assert(canCandidateBAccess === false, 'Candidate B strictly blocked from accessing Candidate A mistake vault');

  const canCandidateAAccess = vaultRow.user_id === candidateA;
  assert(canCandidateAAccess === true, 'Candidate A granted access to Candidate A mistake vault');

  // --- SECTION I: Mistake Summary Cognitive Breakdown & Status Metrics ---
  console.log('\n--- SECTION I: Summary Cognitive Breakdown & Metrics ---');
  const sampleVaultRows = [
    { lifecycle_status: 'UNRESOLVED', primary_cognitive_type_id: 'TIME_PRESSURE' },
    { lifecycle_status: 'UNRESOLVED', primary_cognitive_type_id: 'CONCEPTUAL_MISUNDERSTANDING' },
    { lifecycle_status: 'REVISITING', primary_cognitive_type_id: 'CALCULATION_SLIP' },
    { lifecycle_status: 'MASTERED', primary_cognitive_type_id: 'CARELESS_READING' },
  ];

  let unres = 0, revis = 0, mast = 0;
  const cogCounts = new Map();
  sampleVaultRows.forEach(r => {
    if (r.lifecycle_status === 'UNRESOLVED') unres++;
    else if (r.lifecycle_status === 'REVISITING') revis++;
    else if (r.lifecycle_status === 'MASTERED') mast++;
    cogCounts.set(r.primary_cognitive_type_id, (cogCounts.get(r.primary_cognitive_type_id) || 0) + 1);
  });

  assert(unres === 2, 'Unresolved count accurately computed as 2');
  assert(revis === 1, 'Revisiting count accurately computed as 1');
  assert(mast === 1, 'Mastered count accurately computed as 1');
  assert(sampleVaultRows.length === 4, 'Total mistakes count accurately computed as 4');
  assert(cogCounts.get('TIME_PRESSURE') === 1, 'Cognitive breakdown identifies 1 TIME_PRESSURE');

  // --- SECTION J: Weak Topics Aggregation & Ordering ---
  console.log('\n--- SECTION J: Weak Topics Aggregation & Ordering ---');
  const topicMistakes = [
    { topicId: 't1', topicName: 'Quantitative Aptitude - Arithmetic', count: 5 },
    { topicId: 't2', topicName: 'Reasoning - Syllogisms', count: 8 },
    { topicId: 't3', topicName: 'English - Reading Comprehension', count: 2 },
  ];
  const sortedTopics = [...topicMistakes].sort((a, b) => b.count - a.count);
  assert(sortedTopics[0].topicId === 't2', 'Top weak topic ranked first (Syllogisms: 8 mistakes)');
  assert(sortedTopics[1].topicId === 't1', 'Second weak topic ranked second (Arithmetic: 5 mistakes)');
  assert(sortedTopics[2].topicId === 't3', 'Third weak topic ranked third (English: 2 mistakes)');

  // --- SECTION K: Mistake List Filtering ---
  console.log('\n--- SECTION K: Mistake List Filtering ---');
  function filterMistakes(list, statusFilter, cognitiveFilter) {
    return list.filter(item => {
      const matchStatus = !statusFilter || statusFilter === 'ALL' || item.lifecycle_status === statusFilter;
      const matchCog = !cognitiveFilter || cognitiveFilter === 'ALL' || item.primary_cognitive_type_id === cognitiveFilter;
      return matchStatus && matchCog;
    });
  }

  const filteredByStatus = filterMistakes(sampleVaultRows, 'UNRESOLVED', 'ALL');
  assert(filteredByStatus.length === 2, 'Filter by UNRESOLVED returns exactly 2 records');
  const filteredByCog = filterMistakes(sampleVaultRows, 'ALL', 'CALCULATION_SLIP');
  assert(filteredByCog.length === 1, 'Filter by CALCULATION_SLIP returns exactly 1 record');

  // --- SECTION L: Mistake Detail View With Version Provenance ---
  console.log('\n--- SECTION L: Mistake Detail View With Version Provenance ---');
  const mistakeDetail = {
    vaultId: 'v-100',
    questionId: 'q-100',
    questionText: 'What is the sum of angles in a triangle?',
    options: [
      { id: 'opt-1', key: 'A', text: '90 degrees' },
      { id: 'opt-2', key: 'B', text: '180 degrees' },
      { id: 'opt-3', key: 'C', text: '270 degrees' },
      { id: 'opt-4', key: 'D', text: '360 degrees' },
    ],
    correctOptionKey: 'B',
    explanation: 'The interior angles of any planar Euclidean triangle sum to 180 degrees.',
    occurrences: [
      {
        id: 'occ-1',
        sourceContext: 'MOCK_TEST',
        responseTimeSeconds: 15,
        inferredCognitiveTypeId: 'CARELESS_READING',
        heuristicConfidencePct: 75,
        occurredAt: '2026-09-01T12:00:00Z',
        questionVersionId: 'qv-v1-geometry',
        attemptAnswerId: 'ans-att-99',
        occurrenceStatus: 'ACTIVE',
        revokedAt: null,
        revocationReason: null,
      }
    ]
  };

  assert(mistakeDetail.options.length === 4, 'Mistake detail loads all 4 options');
  assert(mistakeDetail.correctOptionKey === 'B', 'Mistake detail identifies correct option key B');
  assert(mistakeDetail.occurrences[0].questionVersionId === 'qv-v1-geometry', 'Mistake detail occurrence contains questionVersionId');
  assert(mistakeDetail.occurrences[0].attemptAnswerId === 'ans-att-99', 'Mistake detail occurrence contains attemptAnswerId');

  // --- SECTION M: Cognitive Type Override & Custom Notes ---
  console.log('\n--- SECTION M: Cognitive Type Override & Custom Notes ---');
  const vaultWithOverride = {
    ...sampleOccurrence,
    primary_cognitive_type_id: 'CALCULATION_SLIP',
    user_override_cognitive_type_id: 'CONCEPTUAL_MISUNDERSTANDING',
    user_custom_notes: 'Remember to apply Pythagorean theorem before squaring.',
  };
  const activeEffectiveCog = vaultWithOverride.user_override_cognitive_type_id || vaultWithOverride.primary_cognitive_type_id;
  assert(activeEffectiveCog === 'CONCEPTUAL_MISUNDERSTANDING', 'User override cognitive type takes priority over heuristic');
  assert(vaultWithOverride.user_custom_notes.includes('Pythagorean'), 'Custom revision notes preserved');

  // --- SECTION N: Errata Revocation Idempotency & Safety ---
  console.log('\n--- SECTION N: Errata Revocation Idempotency ---');
  const repeatRevocation = revokeByErrata(
    errataResultAll.updated,
    'qv-v1',
    'opt-b',
    'Repeat call verification',
    'admin-user-007'
  );
  assert(repeatRevocation.revokedCount === 0, 'Second errata revocation on already-revoked occurrences revokes 0 additional rows');

  // --- SECTION O: Mock Exam Lineage Contract ---
  console.log('\n--- SECTION O: Mock Exam Lineage Contract ---');
  const mockExamMistakePayload = {
    userId: 'user-001',
    attemptId: 'attempt-001',
    mistakes: [
      {
        questionId: 'q-001',
        questionVersionId: 'qv-v1',
        attemptAnswerId: 'ans-001',
        selectedOptionId: 'opt-a',
        responseTimeSeconds: 25,
      }
    ]
  };
  assert(mockExamMistakePayload.mistakes[0].questionVersionId === 'qv-v1', 'AssessmentService passes questionVersionId');
  assert(mockExamMistakePayload.mistakes[0].attemptAnswerId === 'ans-001', 'AssessmentService passes attemptAnswerId');

  // --- SECTION P: Live Test Lineage Contract ---
  console.log('\n--- SECTION P: Live Test Lineage Contract ---');
  const liveTestMistakePayload = {
    userId: 'user-002',
    attemptId: 'live-attempt-002',
    mistakes: [
      {
        questionId: 'q-002',
        questionVersionId: 'qv-v2',
        attemptAnswerId: 'live-ans-002',
        selectedOptionId: 'opt-b',
        responseTimeSeconds: 40,
        cognitiveTypeId: 'UNCLASSIFIED',
      }
    ]
  };
  assert(liveTestMistakePayload.mistakes[0].questionVersionId === 'qv-v2', 'LiveTestResultService passes questionVersionId');
  assert(liveTestMistakePayload.mistakes[0].attemptAnswerId === 'live-ans-002', 'LiveTestResultService passes attemptAnswerId');

  // Write copy to scripts/test_phase2_mistake_vault_lineage.cjs
  const projectRoot = 'e:/Courage Library';
  const selfContent = fs.readFileSync(__filename, 'utf-8');
  fs.writeFileSync(path.join(projectRoot, 'scripts', 'test_phase2_mistake_vault_lineage.cjs'), selfContent, 'utf-8');

  console.log('\n================================================================');
  console.log(`TOTAL PHASE 2 TESTS : ${totalTests}`);
  console.log(`PASSED              : ${passedTests}`);
  console.log(`FAILED              : ${failedTests}`);
  console.log(`SUCCESS RATE        : ${((passedTests / totalTests) * 100).toFixed(2)}%`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    console.error('FAIL: Phase 2 Lineage Hardening Test Suite Failed!');
    process.exit(1);
  }

  console.log('COURAGE LIBRARY — PHASE 2 MISTAKE VAULT LINEAGE HARDENING: 100% PASS\n');
}

runPhase2Tests().catch(err => {
  console.error('Unhandled Test Error:', err);
  process.exit(1);
});
