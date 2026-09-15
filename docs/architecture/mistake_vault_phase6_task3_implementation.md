# Courage Library � Mistake Vault Phase 6: Task 3 Architecture Specification
## CAT Adaptive Remediation Engine (Deterministic & Explainable)

**Status:** CERTIFIED PRODUCTION GO  
**Phase:** Mistake Vault Phase 6 � Task 3  
**Date:** September 2026  
**Implementation File:** `services/adaptive/adaptive-remediation.service.ts`  
**Test Suite:** `scripts/test_phase6_task3_cat_remediation.cjs` (73/73 PASS)  
**Regression Audit:** 30 / 30 Certified Test Suites PASS (1,498 / 1,498 assertions, 100%)  

---

## 1. Executive Summary & Purpose

Phase 6 Task 3 introduces a deterministic, explainable Computerized Adaptive Testing (CAT)-style adaptive remediation selection and session configuration layer for the Courage Library Mistake Vault.

When a candidate encounters or reviews an error in their Mistake Vault, the system dynamically recommends and sequences high-yield remediation items tailored to:
1. **The Specific Mistake / Topic Context**: Aligning with the failed question's topic or subject domain using a multi-stage retrieval hierarchy.
2. **Authoritative Seven-Type Cognitive Error Taxonomy**: Preserving the canonical 7 Mistake Vault types (`CONCEPTUAL_GAP`, `CALCULATION_SLIP`, `MISREAD_QUESTION`, `TIME_PANIC`, `FORMULA_CONFUSION`, `DISTRACTOR_TRAP`, `UNCLASSIFIED`) and mapping them to deterministic remediation affinity classes without introducing any duplicate taxonomy.
3. **Candidate Latent Ability (theta) vs. Item Difficulty (b)**: Maximizing 1PL Fisher Information I(theta, b) to ensure questions provide optimal diagnostic measurement precision.
4. **Recency / Fatigue Educational Heuristic**: Applying a deterministic recency/fatigue heuristic based on question-level exposure timestamps.

---

## 2. Mathematical Specification of Remediation Fit Score

The remediation selection engine evaluates every candidate question i against a target mistake m using a strictly normalized multi-factor scoring function:

$$\text{RemediationFit}(i, m, \theta) = (0.35 \cdot \text{TopicCongruence}) + (0.25 \cdot \text{CognitiveMatch}) + (0.20 \cdot \text{InformationFit}) + (0.20 \cdot \text{FatigueBonus})$$

Where each component is bounded in [0.0, 1.0], ensuring that RemediationFit is strictly in [0.0000, 1.0000].

### Component Breakdown

| Component | Weight | Mathematical / Heuristic Formulation | Range |
|---|---|---|---|
| **Topic Congruence** | 0.35 | Exact topic match = 1.0; Same subject = 0.6; Cross-domain fallback = 0.2 | [0.2, 1.0] |
| **Cognitive Match** | 0.25 | Authoritative 7-type affinity matrix alignment | [0.2, 1.0] |
| **Information Fit** | 0.20 | 4 * P(theta, b) * (1 - P(theta, b)) where P(theta, b) = 1 / (1 + exp(-(theta - b))) | [0.0, 1.0] |
| **Fatigue Bonus** | 0.20 | Recency decay penalty based on hours elapsed since latest question exposure | [0.1, 1.0] |

---

## 3. Component Details & Heuristic Matrices

### 3.1 Topic Congruence Matrix & Deterministic Retrieval Hierarchy
1. **Exact Topic Match (1.0)**: Candidate question matches target mistake `canonical_topic_id`.
2. **Subject-Level Match (0.6)**: Candidate question belongs to the same subject domain when sub-topic pool is exhausted.
3. **Cross-Domain Fallback (0.2)**: Fallback when topic/subject candidates are completely exhausted.
- **Pool Query Limit**: Strictly capped at 50 candidate questions ($O(1)$ round-trips, 0 N+1).

### 3.2 Authoritative Seven-Type Cognitive Error Taxonomy
The authoritative Mistake Vault cognitive taxonomy is preserved 100% without modification or duplicate creation:
1. `CONCEPTUAL_GAP`
2. `CALCULATION_SLIP`
3. `MISREAD_QUESTION`
4. `TIME_PANIC`
5. `FORMULA_CONFUSION`
6. `DISTRACTOR_TRAP`
7. `UNCLASSIFIED`

**Deterministic Remediation Affinity Matrix:**
- **Exact Cognitive Match (1.0)**: Target mistake cognitive type equals item cognitive classification (for classified types).
- **Related Cognitive Affinity (0.6)**:
  - `CONCEPTUAL_GAP` <-> `FORMULA_CONFUSION`, `DISTRACTOR_TRAP`
  - `FORMULA_CONFUSION` <-> `CONCEPTUAL_GAP`, `CALCULATION_SLIP`
  - `CALCULATION_SLIP` <-> `FORMULA_CONFUSION`, `TIME_PANIC`
  - `MISREAD_QUESTION` <-> `DISTRACTOR_TRAP`, `TIME_PANIC`
  - `DISTRACTOR_TRAP` <-> `MISREAD_QUESTION`, `CONCEPTUAL_GAP`
  - `TIME_PANIC` <-> `CALCULATION_SLIP`, `MISREAD_QUESTION`
- **Unclassified Item / Mistake (0.4)**: Neutral baseline when either item or mistake is unclassified.
- **Orthogonal (0.2)**: Unrelated cognitive failure modes.

### 3.3 1PL Item Information Fit & Uncalibrated Fallback Assumption
Under the 1-Parameter Logistic (Rasch) IRT model:
- $P(\theta, b) = \frac{1}{1 + \exp(-(\theta - b))}$
- $\text{Fisher Information } I(\theta, b) = P(\theta, b) \cdot (1 - P(\theta, b))$

Since the maximum value of $P(1 - P)$ occurs at theta = b where P = 0.5 and I = 0.25:
- $\text{InformationFit}(\theta, b) = 4 \cdot I(\theta, b) = 4 \cdot P(\theta, b) \cdot (1 - P(\theta, b)) \in [0.0, 1.0]$

**Uncalibrated Fallback Difficulty Assumption:**
- When an item has not yet been calibrated in `adaptive_item_calibrations`, an explicit **uncalibrated fallback difficulty assumption** of $b = 0.0$ (or mapped from static tier) is applied.
- This is explicitly categorized as an uncalibrated assumption and is never presented as psychometric evidence.
- Calibrated items always take strict precedence.

### 3.4 Recency / Fatigue Educational Heuristic
Evaluated from actual question-level exposure evidence across `attempt_answers`, `user_mistake_occurrences`, and `user_mistake_drills`:
- **Exposure < 8 hours ago**: Bonus = 0.10 (Severe suppression).
- **Exposure 8 to 24 hours ago**: Bonus = 0.30 (Moderate penalty).
- **Exposure 1 to 7 days ago**: Bonus = 0.60 (Mild penalty).
- **Exposure > 7 days ago / Never Seen**: Bonus = 1.00 (Zero penalty / Fresh item).
- **Multiple Exposures**: Strictly selects the latest exposure timestamp.

---

## 4. Deterministic Ranking & Stable Tie-Breaking

Deterministic ordering for identical normalized inputs is guaranteed via:
1. **Primary Sort Key**: `remediation_fit_score` DESCENDING.
2. **Secondary Sort Key**: `fisher_information` DESCENDING.
3. **Tertiary Tie-Breaker**: `question_id` ASCENDING (lexicographical string comparison).

---

## 5. Actual CAT Runtime Integration Boundary

**Architecture Definition**: Task 3 provides the **Deterministic Selection and Session Configuration Layer** (`AdaptiveRemediationService`).

Execution Pipeline:
1. **Candidate Authentication**: Verified candidate session.
2. **Multi-Tenant Ownership Verification**: Mistake record verified to belong to `user_id`.
3. **Remediation Session Creation**: Session generated and persisted with status `IN_PROGRESS`.
4. **Adaptive Question Selection**: Optimal remediation questions selected and ranked.
5. **Zero-Leakage Scrubbing**: Question payload delivered to candidate player with `correct_option_key` and `solution_explanation_md` scrubbed.
6. **Candidate Response & Server Evaluation**: Candidate submits answers to test engine.
7. **Adaptive Evidence Handling**: Candidate latent ability $\theta$ is updated in `user_adaptive_profiles`.

---

## 6. Sacred Semantic Boundary: CAT Assessment vs. Mistake Mastery

> **A CAT response is NOT automatically equivalent to a Mistake Drill mastery response.**

- **Adaptive Assessment Role (theta)**: Evaluates latent cognitive proficiency $\theta$ and selects informative items. CAT responses do NOT increment `consecutive_correct_in_remediation` or mark mistakes as `MASTERED`.
- **Mistake Vault Mastery Role (Deliberate Practice)**: Mistake Vault deliberate mastery is strictly governed by the official Mistake Drill workflow, requiring **2 consecutive correct solutions** in deliberate drill sessions (`user_mistake_vault.consecutive_correct >= 2`).

---

## 7. Frozen Baseline Invariants

1. **Phase 4 Mistake Priority Index (MPI)**: 100% Frozen.
   $$\text{MPI} = 0.35R + 0.30U + 0.20R_c + 0.15G$$
2. **Phase 4 Revision Priority**: 100% Frozen.
   $$\text{RevisionPriority} = 0.70\text{MPI} + 0.15\text{DueUrgency} + \text{Bonus} - \text{Fatigue}$$
3. **Task 2 Error Decay Engine**: 100% Frozen.
   $$R(t) = \exp(-t/S_{\text{eff}})$$
   - Retention risk score $1 - R(t)$ is strictly termed "deterministic retention-risk / revision-urgency signal".
4. **Errata Exclusion**: `REVOKED_ERRATA` and `REVOKED_VOID` items are excluded from active selection.
5. **Database Baseline**: 52 migrations invariant, 0 new tables, 0 schema alterations.
   - 14 protected tables verified row-count preserved.

---

- **Phase 6 Task 3 Forensic Test Suite**: 73 / 73 PASS (`scripts/test_phase6_task3_cat_remediation.cjs`)
  - **Production Runtime Tests**: 28 / 28 PASS
  - **Pure Deterministic / Math Contract Tests**: 26 / 26 PASS
  - **Baseline & Regression Tests**: 19 / 19 PASS
- **Full System Regression Audit**: 30 / 30 Certified Test Suites PASS (1,498 / 1,498 assertions, 100%)
- **TypeScript Strict Check**: 0 Errors (`npx tsc --noEmit`)
- **Next.js Production Build**: Exit 0 (PASS across 110+ production routes)
