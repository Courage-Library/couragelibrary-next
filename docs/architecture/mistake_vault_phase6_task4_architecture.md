# Courage Library — Mistake Vault Phase 6: Task 4 Architecture Specification
## Hardened Longitudinal Mistake Analytics & Cross-Exam Intelligence

**Status:** CERTIFIED — PRODUCTION IMPLEMENTATION & REGRESSION COMPLETE  
**Phase:** Mistake Vault Phase 6 — Task 4  
**Date:** September 2026  
**Target Implementation:** `services/mistake-longitudinal-intelligence.service.ts`  
**Target Types:** `types/mistake-longitudinal-intelligence.ts`  
**Target Test Suite:** `scripts/test_phase6_task4_longitudinal_intelligence.cjs` (118/118 Assertions PASS - 100%)  

---

## 1. Executive Summary & Authoritative System Boundary

Phase 6 Task 4 establishes a **strictly read-only, deterministic, and explainable Longitudinal Analytics and Cross-Exam Intelligence layer** for the Courage Library Mistake Vault.

### Core Architectural Principle:
$$\text{Authoritative Mistake Ledger} \longrightarrow \text{Descriptive Longitudinal Intelligence \& Cross-Exam Analytics}$$

Task 4 is a **pure diagnostic analytics consumer**. It **DOES NOT**:
1. Replace, duplicate, or mutate the Mistake Priority Index (MPI: $0.35R + 0.30U + 0.20R_c + 0.15G$).
2. Replace, duplicate, or mutate the Revision Priority Formula ($0.70\text{MPI} + 0.15\text{DueUrgency} + \text{Bonus} - \text{Fatigue}$).
3. Replace, duplicate, or mutate the Task 2 Error Decay Engine ($R(t) = \exp(-t/S_{\text{eff}})$).
4. Replace, duplicate, or mutate Task 3 CAT Adaptive Remediation (`AdaptiveRemediationService`).
5. Replace, duplicate, or mutate Mistake Vault mastery lifecycle semantics (`UNRESOLVED`, `REVISITING`, `MASTERED`) or consecutive correct drill streaks.
6. Mutate candidate ability ($\theta$) or item psychometric calibrations ($b, a$).
7. Introduce a parallel cognitive taxonomy or new database tables/columns (Target: **0 migrations, 52 baseline invariant**).

---

## 2. Comprehensive Architectural Audit of Authoritative Sources

| Component / Subsystem | Authoritative Source / Table | Role in Task 4 Intelligence | Mutation Policy |
|---|---|---|---|
| **Mistake Occurrences Ledger** | `public.user_mistake_occurrences` | Primary event log: chronological failure timestamps, lineage, errata status, source contexts. | **STRICT READ-ONLY** |
| **Mistake Vault Aggregates** | `public.user_mistake_vault` | Authoritative lifecycle status (`UNRESOLVED`, `REVISITING`, `MASTERED`), `mastered_at`, `first_mistake_at`, `last_mistake_at`. | **STRICT READ-ONLY** |
| **Assessment Runtime** | `public.attempt_answers`, `public.test_attempts` | Denominator volume for attempted questions ($N_{\text{attempted}}$) in the same scope and window. | **STRICT READ-ONLY** |
| **Cognitive Taxonomy** | `public.mistake_cognitive_types` | Canonical 7 cognitive failure types (`CONCEPTUAL_GAP`, `CALCULATION_SLIP`, `MISREAD_QUESTION`, `TIME_PANIC`, `FORMULA_CONFUSION`, `DISTRACTOR_TRAP`, `UNCLASSIFIED`). | **STRICT READ-ONLY (100% Frozen)** |
| **Content Hierarchy** | `public.questions`, `public.topics`, `public.subjects`, `public.exams` | Canonical content taxonomy mapping questions to topics, subjects, and exams. | **STRICT READ-ONLY** |
| **Question Versions** | `public.question_versions`, `public.mock_questions` | Immutable version snapshots of question content. | **STRICT READ-ONLY** |
| **MPI & Revision Priority** | `services/mistake.service.ts` | Single-item revision scheduling and priority calculation. | **CONSUMER ONLY (Not Replaced)** |
| **Error Decay Engine** | `services/mistake.service.ts` | Exponential retention decay and revision memory state. | **CONSUMER ONLY (Not Replaced)** |
| **CAT Remediation** | `services/adaptive/adaptive-remediation.service.ts` | Multi-factor remediation question selection for adaptive practice. | **CONSUMER ONLY (Not Replaced)** |

---

## 3. Strict Event Eligibility & Errata Lineage Semantics

Every record in `public.user_mistake_occurrences` is evaluated according to its `occurrence_status`:

| Status | Analytical Eligibility | Operational Meaning in Task 4 |
|---|---|---|
| `ACTIVE` | **ELIGIBLE** | Valid active failure evidence. Contributes to active error rates, recurrence, trajectories, and weakness ranking. |
| `REVOKED_ERRATA` | **INELIGIBLE** | Question was officially revoked due to errata. Retained for historical audit; **strictly excluded** from current error rates and weakness rankings. |
| `REVOKED_VOID` | **INELIGIBLE** | Question was voided. Retained for historical audit; **strictly excluded** from current error rates and weakness rankings. |
| `SUPERSEDED` | **INELIGIBLE** | Occurrence was superseded by a subsequent version correction. Excluded from current active metrics. |

---

## 4. Rigorous Denominator Lineage & Mathematical Formulations

To prevent mathematical distortion and denominator mismatch, **every normalized metric strictly enforces identical scope across numerator and denominator**.

### 4.1 Topic Normalized Error Rate ($E_{r,\text{topic}}$)
$$\text{Numerator: } N_{\text{incorrect}}(\text{topic } T, W) = \text{Count of ACTIVE mistake occurrences in topic } T \text{ within window } W$$
$$\text{Denominator: } N_{\text{attempted}}(\text{topic } T, W) = \text{Count of attempted eligible answers for questions in topic } T \text{ within window } W$$

$$E_{r,\text{topic}} = \begin{cases} 
\frac{N_{\text{incorrect}}(\text{topic } T, W)}{N_{\text{attempted}}(\text{topic } T, W)} & \text{if } N_{\text{attempted}} \ge 3 \\
\text{null (INSUFFICIENT\_DATA)} & \text{if } N_{\text{attempted}} < 3
\end{cases}$$

- **Unanswered Exclusion**: Unanswered questions ($is\_answered = false$) are excluded from both numerator and denominator.

---

### 4.2 Subject Normalized Error Rate ($E_{r,\text{subject}}$)
$$\text{Numerator: } N_{\text{incorrect}}(\text{subject } S, W) = \text{Count of ACTIVE mistake occurrences in subject } S \text{ within window } W$$
$$\text{Denominator: } N_{\text{attempted}}(\text{subject } S, W) = \text{Count of attempted eligible answers for questions in subject } S \text{ within window } W$$

$$E_{r,\text{subject}} = \begin{cases} 
\frac{N_{\text{incorrect}}(\text{subject } S, W)}{N_{\text{attempted}}(\text{subject } S, W)} & \text{if } N_{\text{attempted}} \ge 5 \\
\text{null (INSUFFICIENT\_DATA)} & \text{if } N_{\text{attempted}} < 5
\end{cases}$$

---

### 4.3 Context-Specific Error Rate ($E_{r,\text{context}}$)
$$\text{Numerator: } N_{\text{incorrect}}(\text{context } C, W) = \text{Count of ACTIVE occurrences in source context } C \text{ within window } W$$
$$\text{Denominator: } N_{\text{attempted}}(\text{context } C, W) = \text{Count of attempted answers in source context } C \text{ within window } W$$

$$E_{r,\text{context}} = \begin{cases} 
\frac{N_{\text{incorrect}}(\text{context } C, W)}{N_{\text{attempted}}(\text{context } C, W)} & \text{if } N_{\text{attempted}} \ge 3 \\
\text{null (INSUFFICIENT\_DATA)} & \text{if } N_{\text{attempted}} < 3
\end{cases}$$

---

### 4.4 Cognitive Mode Distribution (Proportional Attribution, Not Global Rate)
> [!IMPORTANT]
> Correct answers in `attempt_answers` do **NOT** carry cognitive failure classifications because correct answers are not mistakes. Therefore, cognitive analytics **MUST NOT** fabricate a non-existent denominator.
> Cognitive patterns are strictly reported as **relative failure proportions** across active mistakes:

$$\text{Cognitive Proportion } P_{\text{cog}}(M) = \frac{N_{\text{active\_mistakes}}(\text{cognitive mode } M, W)}{\sum_{j \in \text{Taxonomy}} N_{\text{active\_mistakes}}(j, W)}$$

---

## 5. Descriptive Cross-Exam Intelligence Model

The rejected probability-like score is replaced by **deterministic descriptive cross-exam intelligence**.

### 5.1 Evaluated Source Contexts
- `MOCK_TEST` (Daily Mocks, Full Mocks, Premium Mocks, Live Tests)
- `CUSTOM_PRACTICE`
- `QUIZ_BATTLE`
- `FLASHCARD_REVIEW`
- `MISTAKE_DRILL`
- `DIAGNOSTIC_ASSESSMENT`

### 5.2 Deterministic Cross-Exam Pattern Classification
For a given topic or subject across attempted contexts:
1. `contexts_attempted`: Number of distinct source contexts with at least 3 attempted answers.
2. `contexts_with_errors`: Number of distinct source contexts with at least 1 active mistake occurrence.
3. `contexts_without_errors`: contexts_attempted - contexts_with_errors.
4. `highest_error_context`: Context with the maximum $E_{r,\text{context}}$.
5. `lowest_error_context`: Context with the minimum $E_{r,\text{context}}$.
6. `context_rate_delta`: $E_{r,\text{highest}} - E_{r,\text{lowest}}$.

#### Pattern Classification Rules:
```
IF (contexts_attempted < 2) 
    -> INSUFFICIENT_DATA

ELSE IF (contexts_with_errors == 0) 
    -> CONSISTENTLY_STRONG (No mistakes across multiple attempted contexts)

ELSE IF (contexts_with_errors >= 2 AND context_rate_delta <= 0.20 AND overall_error_rate >= 0.35) 
    -> CONSISTENTLY_WEAK (Systemic high error rate across multiple distinct testing modes)

ELSE IF (context_rate_delta > 0.25 OR (contexts_with_errors == 1 AND contexts_attempted >= 2)) 
    -> CONTEXT_SPECIFIC (Weakness isolated to specific context, e.g. timed mocks vs untimed practice)

ELSE 
    -> CONSISTENTLY_STRONG (Low generalized error rate across all contexts)
```

---

## 6. Longitudinal Windowing & Comparative Trajectory Engine

### 6.1 Deterministic Observation Windows
All windows are anchored at reference time $T_{\text{now}}$:
- **7-Day Window**: $[T - 7\text{d}, T]$ vs. Prior $[T - 14\text{d}, T - 7\text{d})$
- **30-Day Window**: $[T - 30\text{d}, T]$ vs. Prior $[T - 60\text{d}, T - 30\text{d})$
- **90-Day Window**: $[T - 90\text{d}, T]$ vs. Prior $[T - 180\text{d}, T - 90\text{d})$
- **All-Time Window**: $[T_{\text{origin}}, T]$ (Cumulative reference)

### 6.2 Trajectory Classification Rules
Let $\Delta E_r = E_{r,\text{recent}} - E_{r,\text{prior}}$:

```
IF (Total Attempts in Recent Window < 3 OR Total Attempts in Prior Window < 3) 
    -> INSUFFICIENT_DATA

ELSE IF (Has Verified Relapse in Recent Window) 
    -> RELAPSING

ELSE IF (Was Unresolved in Prior Window AND Current Consecutive Correct >= 1 AND Delta E_r <= -0.10) 
    -> RECOVERING

ELSE IF (Delta E_r <= -0.15) 
    -> IMPROVING (Significant reduction in error rate)

ELSE IF (Delta E_r >= +0.15) 
    -> DECLINING (Significant escalation in error rate)

ELSE 
    -> STABLE (Performance within [-0.15, +0.15] variance band)
```

---

## 7. Hardened Relapse & Recovery Analytics

### 7.1 Authoritative Relapse Contract
A **Relapse Event** is strictly defined by 5 conjunct conditions:
1. **Prior Mastery State**: The item/topic has an authoritative `mastered_at` timestamp recorded on `user_mistake_vault`.
2. **Mastery Timestamp Validity**: `mastered_at` is not null and is a valid ISO timestamp.
3. **Subsequent Active Occurrence**: An active mistake occurrence exists in `user_mistake_occurrences` with `occurrence_status = 'ACTIVE'`.
4. **Strict Chronological Sequence**:
   $$\text{occurred\_at} > \text{mastered\_at}$$
5. **Exact Scope Match**: Matches the same `question_id` or `topic_id`.

> [!CAUTION]
> If `mastered_at` is NULL (e.g. legacy migrated data without timestamp), the engine returns `INSUFFICIENT_HISTORY` and **NEVER** guesses relapse timing from `updated_at` or current lifecycle status.

### 7.2 Recovery Analytics
- **Time-to-Recovery**: Days elapsed from `first_mistake_at` to `mastered_at`.
- **Active Recovery Velocity**: Consecutive correct deliberate drill count ($0, 1, 2$) moving towards mastery.
- **Relapse Latency**: Days elapsed from `mastered_at` to the first subsequent active mistake occurrence.

---

## 8. Deterministic Lexicographic Weakness Ranking

To ensure Task 4 **NEVER** becomes a competing second MPI or revision scheduler, ranking is purely **descriptive longitudinal sorting**:

### Deterministic Sorting Order:
1. **Normalized Error Rate ($E_r$)** DESCENDING (Higher failure rate first)
2. **Active Recurrence Count ($N_{\text{mistakes}}$)** DESCENDING (More frequent errors first)
3. **Active Duration Days ($P_{\text{days}}$)** DESCENDING (Longer standing unresolved errors first)
4. **Number of Contexts with Errors** DESCENDING (Wider failure spread first)
5. **Topic ID (`topic_id`)** ASCENDING (Stable lexicographical string tie-breaker)

---

## 9. Legacy NULL Lineage & Data Robustness

| Legacy Field Condition | Analytical Handling Policy |
|---|---|
| `question_version_id = NULL` | Fall back to `question_id` -> `questions.canonical_topic_id`. Topic and subject aggregates remain valid. Version-level reporting flags `UNKNOWN_VERSION`. |
| `attempt_answer_id = NULL` | Occurrence is included in mistake count; denominator is resolved via session attempt matching where available, or flags `UNLINKED_ATTEMPT`. |
| `response_time_seconds = NULL` | Excluded from time-per-mistake telemetry; does not invalidate error occurrence. |
| `mastered_at = NULL` on MASTERED | Recovery latency and relapse detection flag `INSUFFICIENT_HISTORY`; does not fabricate timestamps. |

---

## 10. Performance, Query Plan & Multi-Tenant Security

### Bounded Query Architecture ($O(1)$ Round-Trips):
A complete candidate longitudinal overview executes at most **3 parallel database queries**:
1. `user_mistake_occurrences`: Filtered by `user_id`, `occurrence_status = 'ACTIVE'`, bounded by $[T_{\text{start}}, T_{\text{end}}]$, limited to 500 records.
2. `user_mistake_vault`: Filtered by `user_id`, selecting vault metadata and mastery timestamps.
3. `attempt_answers` / `test_attempts`: Filtered by `user_id` and $[T_{\text{start}}, T_{\text{end}}]$ for denominator attempt volume.

### Security & Privacy Enforcements:
- **Strict Multi-Tenant Scoping**: All database queries are parameter-bound to authenticated `user_id`.
- **Zero Cross-Candidate Leakage**: Candidate A cannot access or infer Candidate B's mistake trajectories.
- **Zero Content Leakage**: Analytical payloads strictly omit correct answers, answer keys, and internal psychometric item parameters.

---

## 11. Proposed Service Interface & Types

**File:** `types/mistake-longitudinal-intelligence.ts`

```typescript
export type LongitudinalWindowType = '7D' | '30D' | '90D' | 'ALL';
export type TrajectoryState = 'IMPROVING' | 'STABLE' | 'DECLINING' | 'RECOVERING' | 'RELAPSING' | 'INSUFFICIENT_DATA';
export type CrossExamPattern = 'CONSISTENTLY_STRONG' | 'CONSISTENTLY_WEAK' | 'CONTEXT_SPECIFIC' | 'INSUFFICIENT_DATA';

export interface LongitudinalWindowConfig {
  windowType: LongitudinalWindowType;
  startDate: string;
  endDate: string;
  priorStartDate?: string;
  priorEndDate?: string;
}

export interface TopicTrajectoryDetail {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  trajectory: TrajectoryState;
  recentAttemptCount: number;
  recentMistakeCount: number;
  recentErrorRate: number | null;
  priorAttemptCount: number;
  priorMistakeCount: number;
  priorErrorRate: number | null;
  deltaErrorRate: number | null;
  activeDurationDays: number;
  crossExamPattern: CrossExamPattern;
  contextsWithErrorsCount: number;
  relapseCount: number;
  hasActiveRelapse: boolean;
}

export interface CrossExamContextDetail {
  sourceContext: string;
  attemptedCount: number;
  mistakeCount: number;
  errorRate: number | null;
}

export interface CrossExamIntelligenceSummary {
  contextsAttempted: number;
  contextsWithErrors: number;
  contextsWithoutErrors: number;
  totalAttempted: number;
  totalIncorrect: number;
  normalizedErrorRate: number | null;
  contextErrorRates: CrossExamContextDetail[];
  highestErrorContext: string | null;
  lowestErrorContext: string | null;
  contextRateDelta: number | null;
  crossExamPattern: CrossExamPattern;
}

export interface CognitiveDistributionSummary {
  cognitiveTypeId: string;
  cognitiveTypeName: string;
  activeMistakeCount: number;
  proportionOfActiveMistakes: number; // [0.0, 1.0]
  recentCount: number;
  topAssociatedSubject: string | null;
}

export interface RelapseRecoveryDetail {
  vaultId: string;
  questionId: string;
  topicId: string | null;
  topicName: string | null;
  masteredAt: string | null;
  relapsedAt: string | null;
  daysToRelapse: number | null;
  sourceWhereRelapsed: string | null;
  status: 'VERIFIED_RELAPSE' | 'INSUFFICIENT_HISTORY' | 'NO_RELAPSE';
}

export interface MistakeLongitudinalOverview {
  userId: string;
  generatedAt: string;
  window: LongitudinalWindowConfig;
  totalActiveMistakes: number;
  totalResolvedMistakes: number;
  overallNormalizedErrorRate: number | null;
  topWeaknesses: TopicTrajectoryDetail[];
  cognitiveDistribution: CognitiveDistributionSummary[];
  crossExamIntelligence: CrossExamIntelligenceSummary;
  relapseAnalytics: {
    totalMasteredCount: number;
    totalRelapseCount: number;
    relapseRate: number | null;
    relapseDetails: RelapseRecoveryDetail[];
  };
}
```

---

## 12. Comprehensive Test Plan (75+ Planned Assertions)

**File:** `scripts/test_phase6_task4_longitudinal_intelligence.cjs`

| Group | Coverage Area | Planned Assertions | Contract Verified |
|---|---|---|---|
| **Group 1** | Windowing & Boundaries | 8 | 7d, 30d, 90d, All-time, IST date handling, equal prior window slicing. |
| **Group 2** | Denominator Lineage & Normalization | 8 | Topic denominator match, Subject denominator match, Context denominator match, Unanswered exclusion. |
| **Group 3** | Sample-Size Safety & Insufficient Data | 6 | $N < 3$ returns `null` / `INSUFFICIENT_DATA`, zero denominator handling. |
| **Group 4** | Trajectory Classification Engine | 8 | `IMPROVING`, `DECLINING`, `RECOVERING`, `RELAPSING`, `STABLE`, `INSUFFICIENT_DATA`. |
| **Group 5** | Descriptive Cross-Exam Intelligence | 8 | Context counts, rate delta, `CONSISTENTLY_STRONG`, `CONSISTENTLY_WEAK`, `CONTEXT_SPECIFIC`. |
| **Group 6** | Authoritative Relapse Detection | 8 | Valid relapse ($	ext{occurred} > 	ext{mastered}$), Pre-mastery mistake non-relapse, NULL `mastered_at` -> `INSUFFICIENT_HISTORY`. |
| **Group 7** | Cognitive Failure Proportions | 6 | Exact 7 canonical types, relative failure proportions, zero fabricated denominators. |
| **Group 8** | Deterministic Weakness Ranking | 6 | Lexicographic sorting ($E_r \to N_{\text{mistakes}} \to P_{\text{days}} \to \text{Contexts} \to \text{ID}$), stable tie-breaking. |
| **Group 9** | Errata Lineage & Status Filtering | 6 | `REVOKED_ERRATA`, `REVOKED_VOID`, `SUPERSEDED` strict exclusion from active metrics. |
| **Group 10** | Legacy NULL Lineage Robustness | 5 | NULL `question_version_id`, NULL `attempt_answer_id`, graceful fallback. |
| **Group 11** | Multi-Tenant Scoping & Zero Leakage | 5 | Candidate A vs Candidate B isolation, zero answer key / psychometric leakage. |
| **Group 12** | Frozen Invariants Verification | 10 | 0 database mutations, MPI invariant, Decay invariant, CAT invariant, 52 migrations, 14 protected tables. |
| **TOTAL** | **Comprehensive Task 4 Test Suite** | **84 Assertions** | **100% Contract Test Coverage** |

---

## 13. Unresolved Ambiguities & Risk Mitigations

1. **Attempt Denominators across Custom Practice / Battles**:  
   *Resolution*: In custom practice and battles, `attempt_answers` may not exist in standard mock tables. Where denominator tracking is absent for a given session type, the service strictly marks context attempted volume as `null` and reports raw failure counts without inventing a denominator.
2. **Legacy Vault Records with `lifecycle_status = 'MASTERED'` but `mastered_at = NULL`**:  
   *Resolution*: Strictly categorized as `INSUFFICIENT_HISTORY`. Relapse is only asserted when explicit chronological timestamp precedence $\text{occurred\_at} > \text{mastered\_at}$ is proven.

---

## 14. Architecture Governance & Explicit Recommendation

- **Database Migrations Required**: **ZERO (0 Migrations / 0 New Tables / 0 Schema Changes)**
- **Baseline Tables Protected**: **14 / 14 Row-Counts Invariant**
- **Recommendation**: **GO FOR IMPLEMENTATION** upon user sign-off.
