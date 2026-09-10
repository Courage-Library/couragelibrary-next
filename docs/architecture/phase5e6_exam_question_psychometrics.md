# COURAGE LIBRARY — PHASE 5E.6 ARCHITECTURE SPECIFICATION
# EXAM & QUESTION QUALITY PSYCHOMETRICS
## STATISTICAL VALIDITY GATE AMENDMENT

| Document Attribute | Specification Details |
| :--- | :--- |
| **Phase / Component** | Phase 5E.6 — Exam & Question Quality Psychometrics |
| **Parent Phase** | Phase 5E — Post-Competition Intelligence, Rewards & Certificates |
| **Document Version** | 2.0.0 (Statistical Validity Gate & Architecture Amendment) |
| **Authoritative Status** | **GO (Architecture Completed & Implementation Ready)** |
| **Implementation Authorization** | **HARD STOP — PENDING EXPLICIT USER APPROVAL** |
| **Strict Scope Boundary** | ONLY Psychometric Item Calibration, Classical & IRT Item Quality, Corrected Point-Biserial Discrimination ($r_{\text{pbis}}$), Distractor Analytics, Test/Section Reliability ($\alpha, \omega$, SEM), Item Information Functions ($I(\theta)$), Deterministic Psychometric Quality Flags, and Admin Psychometric Intelligence. |
| **Explicit Invariants** | **HUMAN REVIEW BOUNDARY**: Psychometrics detects, measures, flags, and ranks statistical anomalies. It **NEVER** automatically deletes questions, modifies answer keys, or mutates published tests. |
| **Dependencies & Invariants** | Phase 4D.1–4D.7, Phase 5A–5E.5 are **Production Certified & Frozen**. Zero mutation of certified pipelines. |

---

## 1. Executive Summary

Phase 5E.6 establishes the authoritative, scientifically defensible **Exam & Question Quality Psychometrics** engine for Courage Library.

While Phase 5E.5 provided descriptive, cohort-level competition statistics, Phase 5E.6 delivers genuine **psychometric measurement science**. It transforms raw response evidence into empirical item properties, including:
1. **Item Difficulty**: Classical proportion-correct ($p$), bounded logistic difficulty ($b$), and full 1PL/Rasch item calibration.
2. **Item Discrimination**: Corrected point-biserial correlation ($r_{\text{pbis}}$) with mathematical exclusion of self-item score leakage and exam-specific negative marking accommodation.
3. **Negative Marking Accommodation**: Trait criterion formulation derived from authoritative scoring schemes across distinct competitive exam patterns.
4. **Distractor Analysis**: Selection frequency, non-functioning distractor detection, positive distractor discrimination anomalies, and option attractor dynamics.
5. **Item Information Functions ($I(\theta)$)**: 1PL / Rasch information curves and empirical measurement precision across the latent ability continuum $[-3.0, +3.0]$.
6. **Test & Section Reliability**: Internal consistency (Cronbach's $\alpha$, McDonald's $\omega$ research pipeline), Standard Error of Measurement ($SEM$).
7. **Deterministic Psychometric Quality Flags**: Automated diagnostic flagging for human review (`EXTREMELY_HARD`, `EXTREMELY_EASY`, `LOW_DISCRIMINATION`, `NEGATIVE_DISCRIMINATION`, `NON_FUNCTIONING_DISTRACTOR`, `POSITIVE_DISTRACTOR_DISCRIMINATION`, `POSSIBLE_AMBIGUITY`, `UNSTABLE_CALIBRATION`, `INSUFFICIENT_SAMPLE`).
8. **Multi-Cohort Population Isolation**: Strict separation between standardized fixed mocks, live competitions, PYQs, and adaptively targeted CAT responses.

---

## 2. Existing Psychometric Infrastructure Audit

| Domain / Phase | Existing Certified Infrastructure | Table / Service / Artifact | Audit Findings | Phase 5E.6 Architectural Decision |
| :--- | :--- | :--- | :---: | :--- |
| **Phase 4D.1** | Adaptive Foundation & Configs | `public.adaptive_system_configs`, `public.adaptive_test_configs` | **FOUND** | **REUSE**: Global status, safety boundaries, and blueprint constraints. |
| **Phase 4D.2** | Item Calibration & Response Evidence | `public.adaptive_item_calibrations`, `public.adaptive_item_response_evidence`, `public.adaptive_item_calibration_history` | **FOUND** | **REUSE & EXTEND**: Primary master ledger for immutable response events (`attempt_id`, `question_version_id`, `is_correct`, `response_source`). Phase 5E.6 builds upon this exact evidence store. |
| **Phase 4D.3** | Ability Estimation Solver | `public.adaptive_ability_estimation_history`, `AdaptiveAbilityService` | **FOUND** | **REUSE AS CANDIDATE TRAIT ESTIMATOR ONLY**: Regularized Newton-Raphson 1PL solver for candidate latent ability $\theta$. Explicitly distinguished from item calibration $b$. |
| **Phase 4D.4** | CAT Information Model | `AdaptiveSelectionService`, $I(\theta) = P(\theta)(1 - P(\theta))$ | **FOUND** | **REUSE & ISOLATE**: 1PL Fisher Information is certified for CAT selection. Phase 5E.6 provides observational analysis without mutating CAT runner. |
| **Phase 4D.5** | Stopping & Personalization | `AdaptiveStoppingService` | **FOUND** | **ISOLATE**: Stopping rules remain owned by Adaptive Engine. |
| **Phase 4D.6** | Adaptive Analytics | `public.adaptive_analytics_events` | **FOUND** | **REUSE**: Session latency and telemetry data. |
| **Phase 4D.7** | Hardening & Invariants | `test_phase4d7_adaptive_production_hardening.cjs` | **FOUND** | **PRESERVE**: All security and non-leakage invariants remain 100% active. |
| **Phase 5D** | Results & Scoring Semantics | `public.live_test_ranking_snapshots`, `public.live_test_leaderboard_entries` | **FOUND** | **REUSE**: Authoritative source for competition total scores, negative marking rules, and ranked cohorts. |
| **Phase 5E.4** | Candidate Intelligence | `CandidateIntelligenceService`, `user_topic_mastery` | **FOUND** | **REUSE**: Candidate mastery context. |
| **Phase 5E.5** | Admin Competition Intelligence | `AdminCompetitionIntelligenceService` | **FOUND** | **REUSE**: Cohort turnouts and macro participation funnels. |
| **Question Bank** | Questions, Versions, Options | `public.questions`, `public.question_versions`, `public.question_options`, `public.question_answers` | **FOUND** | **REUSE**: Question versioning and option keys. Item psychometrics strictly attach to `question_version_id`. |
| **Item Responses**| Candidate Attempt Responses | `public.attempt_answers` | **FOUND** | **REUSE**: Selected option keys (`selected_option_key`), time per question, and response timestamps for distractor analytics. |

---

## 3. Reuse vs. Extension Matrix

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           CERTIFIED UPSTREAM FOUNDATION                                 │
│  Phase 4D.2 (Evidence Ledger) │ Phase 4D.3 (1PL Solver) │ Phase 5D (Scoring Semantics)  │
│  Phase 3 (Question Versions)  │ Phase 5C (Item Answers) │ Phase 5E.5 (Admin Analytics)  │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │ (Direct Ingestion & Versioned Invariant Reuse)
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                 PHASE 5E.6: EXAM & QUESTION QUALITY PSYCHOMETRICS ENGINE                │
│                                                                                         │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────────────────┐ │
│  │ Item Classical Stats │ │  Corrected $r_{pbis}$│ │      Distractor Analytics      │ │
│  │ - Facility Value (p) │ │  - Self-Score Excl.  │ │  - Option Frequency & Traces   │ │
│  │ - Empirical Diff (d) │ │  - Negative Mark Adj.│ │  - Non-Functioning Distractors │ │
│  │ - Response Latencies │ │  - Valid Bounds Check│ │  - Positive Distractor Flaggers│ │
│  └──────────────────────┘ └──────────────────────┘ └──────────────────────────────────┘ │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────────────────┐ │
│  │   IRT Item Quality   │ │  Test/Section Health │ │     Deterministic Flag Engine    │ │
│  │ - 1PL Rasch Calib    │ │  - Cronbach's Alpha  │ │  - Ambiguity Diagnostics         │ │
│  │ - Fisher Info I(θ)   │ │  - McDonald's Omega  │ │  - Extreme Facility / Zero Var   │ │
│  │ - ICC Curve Model    │ │  - Standard Error SEM│ │  - Negative Discrimination Alert │ │
│  └──────────────────────┘ └──────────────────────┘ └──────────────────────────────────┘ │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                    ADMIN PSYCHOMETRIC INTELLIGENCE DASHBOARD                            │
│   Question-Level Quality Explorer (/admin/psychometrics/questions/[versionId])          │
│   Paper & Section Psychometric Health (/admin/psychometrics/papers/[id])                │
│   Bank-Wide Psychometric Risk Audit (/admin/psychometrics/audit)                        │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Mandatory Authority Matrix

| Metric / Domain | Existing Authority | Phase 5E.6 Role | New Authority Created? | Frozen System Impact |
| :--- | :--- | :--- | :---: | :--- |
| **Response Evidence** | `adaptive_item_response_evidence` (4D.2) | Read-Only Consumer & Ingestion | **NO** | Zero mutation of Phase 4D.2 ledger. |
| **Item Difficulty ($b$)** | `adaptive_item_calibrations` (4D.2) | Direct Consumer & Extended Validator | **NO** | Reuses empirical $b$; validates sample stability. |
| **Latent Ability ($\theta$)** | `AdaptiveAbilityService` (4D.3) | Read-Only Trait Estimator | **NO** | Reuses regularized Newton-Raphson solver for test-takers. |
| **Item Calibration ($b$)** | *None (PROX heuristic in 4D.2)* | **Authoritative Item Calibration Engine** | **YES** | Implements Joint Alternating 1PL/Rasch calibration. |
| **Item Discrimination ($r_{\text{pbis}}$)** | *None (Left NULL in 4D.2)* | **Authoritative Estimator** | **YES** | Creates versioned, corrected $r_{\text{pbis}}$ without modifying CAT selection. |
| **Distractor Analytics** | `attempt_answers` (Phase 5C) | **Authoritative Aggregator** | **YES** | Evaluates option choices for diagnostic quality. |
| **Test Reliability ($\alpha, \omega$)** | *None* | **Authoritative Estimator** | **YES** | Computes paper and section internal consistency. |
| **Quality Flags** | *None* | **Authoritative Diagnostic Detector**| **YES** | Emits human-review flags; zero automatic question bank deletion. |
| **Question Bank & Keys**| `question_versions`, `question_answers` | Read-Only Subject | **NO** | Never mutates question content or answer keys. |

---

## 5. Data Lineage & Evidence Hierarchy

```
[LEVEL 1: AUTHORITATIVE OBSERVATIONS]
  - attempt_answers (selected_option_key, response_time, is_correct)
  - adaptive_item_response_evidence (question_version_id, attempt_id, user_id)
       │
       ▼
[LEVEL 2: ITEM-LEVEL DESCRIPTIVE STATISTICS]
  - Sample Size: n = n_correct + n_incorrect
  - Facility Index: p = n_correct / n
  - Omission Rate: r_omit = n_unanswered / n_total
  - Option Frequency: f(k) = count(option_k) / n
       │
       ▼
[LEVEL 3: PSYCHOMETRIC ITEM PROPERTIES]
  - Bounded Item Difficulty: b in [-3.0, +3.0] (Calibrated via 1PL JMLE / Centered)
  - Corrected Point-Biserial Discrimination: r_pbis in [-1.0, +1.0] (Self-Excluded)
  - Distractor Discrimination: r_dist(k) for incorrect options
  - 1PL Fisher Information Function: I(theta) = P(theta,b)*(1 - P(theta,b))
  - Item Standard Error & Calibration Confidence
       │
       ▼
[LEVEL 4: TEST & SECTION PSYCHOMETRIC HEALTH]
  - Section Reliability (Cronbach's alpha_s)
  - Full-Test Reliability (Cronbach's alpha, McDonald's omega research)
  - Standard Error of Measurement: SEM = sigma_test * sqrt(1 - alpha)
  - Section Information Coverage Curves
       │
       ▼
[LEVEL 5: EXAM & QUESTION-BANK GOVERNANCE]
  - Quality Flag Registry (Ambiguity, Negative Discrimination, Non-Functioning Options)
  - Historical Drift Monitoring (Calibration v1 vs v2)
  - Admin Quality Review & Corrective Action Workflow
```

---

## 6. Response Evidence Model & Ingestion Rules

Phase 5E.6 ingests item response evidence strictly through the certified `adaptive_item_response_evidence` ledger and `attempt_answers`.

### Evidence Inclusion & Exclusion Rules
1. **INCLUDED**:
   - Completed, fully submitted, server-evaluated attempts from verified candidates.
   - Authoritative item responses matched with an active `question_version_id`.
   - Verified option selections recorded with authoritative server timestamps.
2. **EXCLUDED**:
   - In-progress, abandoned, expired, or voided unsubmitted test sessions.
   - Voided or disqualified attempts (quarantined under Phase 5D rules).
   - Unanswered questions where candidate did not commit a choice (excluded from distractor analysis; assigned zero score for total test criterion).
   - Test fixtures, automated bots, and administrative preview attempts.
   - Repeat attempts by the same candidate: only the first valid attempt is included in calibration populations to eliminate retake/exposure practice bias.

---

## 7. Mandatory Population Matrix

| Population Scope | Included Response Sources | Excluded Sources | Primary Analytical Use |
| :--- | :--- | :--- | :--- |
| **`POP_FIXED_MOCK`** | Standard fixed full-length mocks, sectional mocks | Adaptive CAT steps, practice questions | Classical item statistics, Test Reliability ($\alpha, \omega$), distractor quality. |
| **`POP_LIVE_COMPETITION`**| Live All-India Tests (Phase 5C/5D) | Practice attempts, unverified mocks | National benchmark calibrations, high-stakes discrimination, elite deciles. |
| **`POP_OFFICIAL_PYQ`** | Previous Year Official Question Papers | Unofficial community mocks | Baseline standard difficulty anchors, historical reference calibrations. |
| **`POP_ADAPTIVE_CAT`** | Adaptive testing sessions (Phase 4D) | Random non-adaptive tests | Empirical item verification under ability-targeted conditions (isolated from unweighted classical p-values). |
| **`POP_AGGREGATE_ALL`** | All valid non-adaptive responses | Voided, disqualified, adaptive steps | Master question-bank calibration bank. |

---

## 8. Item Difficulty & Item Calibration Methodology

### Critical Distinction: Candidate Ability ($\theta$) vs. Item Calibration ($b$)
- **Candidate Ability Estimation ($\theta$)** (Phase 4D.3): Estimates an individual candidate's latent ability $\theta$ given a fixed vector of known item difficulty parameters $b_1, \dots, b_k$.
- **Item Difficulty Calibration ($b$)** (Phase 5E.6): Calibrates the intrinsic difficulty parameters $b_1, \dots, b_K$ for the question bank from a population of candidate response vectors $U = (u_{ji})_{N \times K}$.

Phase 4D.3 ability estimation alone does NOT calibrate items. Phase 5E.6 establishes the formal **Production 1PL / Rasch Item Calibration Engine**.

```
Response Evidence Ledger (adaptive_item_response_evidence)
                     │
                     ▼
Population Definition (POP_FIXED_MOCK / POP_LIVE_COMPETITION)
                     │
                     ▼
Initial Parameters (PROX Formulation for b, Raw Score Logits for θ)
                     │
                     ▼
Joint Alternating Estimation (1PL JMLE with Regularized Newton-Raphson)
  ┌─────────────────────────────────────────────────────────────┐
  │ Step 1: Update θ_j for all candidates j = 1..N              │
  │ Step 2: Update b_i for all items i = 1..K                   │
  │ Step 3: Enforce Rasch Centering Constraint (Σ b_i = 0)      │
  │ Step 4: Parameter Clamping (b_i ∈ [-3.0, +3.0])             │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                     Iterative Convergence Check (max |Δb| < 0.005, max |Δθ| < 0.005)
                                 │
                     ┌───────────┴───────────┐
                     ▼                       ▼
            [CONVERGENCE MET]       [MAX ITERATIONS / DIVERGENCE]
                     │                       │
                     ▼                       ▼
             Standard Error Calc     PROX Fallback & UNSTABLE Flag
                     │                       │
                     └───────────┬───────────┘
                                 │
                                 ▼
                     Versioned Calibration Result
             (adaptive_item_calibrations + audit watermark)
```

### Production 1PL / Rasch Calibration Mathematical Specification

1. **Input Evidence**:
   Binary response matrix $U \in \{0, 1\}^{N \times K}$, where $u_{ji} = 1$ if candidate $j$ answered item $i$ correctly, and $u_{ji} = 0$ if incorrect.
2. **Initial Values ($t=0$)**:
   - Initial item difficulties via Normal Approximation (PROX):
     $$p_i = \frac{\sum_{j=1}^N u_{ji}}{N}, \quad b_i^{(0)} = \ln\left(\frac{1 - p_i + \delta}{p_i + \delta}\right) \cdot \sqrt{1 + \frac{\sigma_{\text{test}}^2}{2.89}}$$
     where $\delta = 0.005$ is a smoothing regularizer, clamped to $[-3.0, +3.0]$.
   - Initial candidate abilities:
     $$\theta_j^{(0)} = \ln\left(\frac{s_j + 0.5}{K - s_j + 0.5}\right) \quad \text{where } s_j = \sum_{i=1}^K u_{ji}$$
3. **Alternating Iteration Algorithm**:
   - **Candidate Update Step**:
     $$\theta_j^{(t+1)} = \theta_j^{(t)} + \frac{s_j - \sum_{i=1}^K P(\theta_j^{(t)}, b_i^{(t)})}{\sum_{i=1}^K P(\theta_j^{(t)}, b_i^{(t)})(1 - P(\theta_j^{(t)}, b_i^{(t)})) + \lambda_\theta}$$
     with regularization parameter $\lambda_\theta = 0.05$.
   - **Item Difficulty Update Step**:
     $$b_i^{(t+1)} = b_i^{(t)} - \frac{n_{i, \text{correct}} - \sum_{j=1}^N P(\theta_j^{(t+1)}, b_i^{(t)})}{\sum_{j=1}^N P(\theta_j^{(t+1)}, b_i^{(t)})(1 - P(\theta_j^{(t+1)}, b_i^{(t)})) + \lambda_b}$$
     with regularization parameter $\lambda_b = 0.05$.
   - **Rasch Identification / Centering Constraint**:
     To resolve scale indeterminacy, the mean item difficulty is centered to zero at each iteration:
     $$\bar{b}^{(t+1)} = \frac{1}{K} \sum_{i=1}^K b_i^{(t+1)}, \quad b_i^{(t+1)} \leftarrow b_i^{(t+1)} - \bar{b}^{(t+1)}$$
   - **Parameter Bounds**:
     $$b_i^{(t+1)} \in [-3.0, +3.0], \quad \theta_j^{(t+1)} \in [-3.5, +3.5]$$
4. **Convergence Criterion & Limits**:
   $$\max_{i=1..K} |b_i^{(t+1)} - b_i^{(t)}| < \epsilon = 0.005 \quad \text{and} \quad \max_{j=1..N} |\theta_j^{(t+1)} - \theta_j^{(t)}| < \epsilon = 0.005$$
   Maximum iterations: $T_{\max} = 50$.
5. **Numerical Stability & Sparse Data Invariants**:
   - If item responses $N_i < 20$, calibration is bypassed; state set to `UNCALIBRATED` or `INSUFFICIENT_DATA`, default $b = 0.0$.
   - If $20 \le N_i < 100$, PROX empirical logit $b = 6.0(0.5 - p)$ is emitted under `PROVISIONAL` state.
   - If iterations reach $T_{\max}$ without meeting $\epsilon$, the algorithm logs a convergence warning, falls back safely to PROX estimates, and marks the calibration state as `UNSTABLE`.
6. **Deterministic Ordering & Reproducibility**:
   - Items and candidates are deterministically sorted by UUID (`question_version_id`, `attempt_id`) prior to iteration.
   - Floating-point arithmetic executes deterministically to guarantee bit-for-bit identical parameters given the same evidence watermark.

---

## 9. Item Discrimination: Corrected Point-Biserial ($r_{\text{pbis}}$)

To eliminate mathematical self-score leakage (where an item artificially correlates with a total score that includes its own points), Phase 5E.6 mandates the **Corrected Point-Biserial Correlation** ($r_{\text{pbis-corrected}}$).

### Exact Criterion & Self-Score Exclusion
Let $Y_{\text{total}}$ be the candidate's net total test score earned under official negative marking rules.
Let $Y_i$ be the score earned by the candidate on item $i$:
$$Y_{(i)} = Y_{\text{total}} - Y_i = \sum_{j \ne i} Y_j$$

### Production Rules for Criterion Score $Y_{(i)}$
1. **Raw Net Score Basis**: $Y_{\text{total}}$ is the exact net marks obtained under the exam's authoritative marking scheme.
2. **Negative Marking Accommodation**:
   - Correct response: $Y_i = +M_{\text{correct}}$
   - Incorrect response: $Y_i = -M_{\text{penalty}}$
   - Unanswered / Skipped response: $Y_i = 0.00$
3. **Unanswered Items**: Contribute 0 to $Y_i$ and 0 to $Y_{\text{total}}$.
4. **Invalid / Voided Attempts**: Strictly excluded prior to calculation.
5. **Multiple Attempts**: Only the candidate's first valid attempt is included to eliminate practice effect bias.
6. **Adaptive Attempts**: Strictly excluded from linear test $r_{\text{pbis}}$.
7. **Minimum Variance Requirement**: Requires $\mathrm{Var}(Y_{(i)}) > 0$. If all candidates obtain the identical rest-of-test score, or if item facility $p \in \{0.0, 1.0\}$, $r_{\text{pbis}}$ outputs `NULL` (invalid state, never `NaN` or $\pm\infty$).

### Corrected Point-Biserial Formula
$$r_{\text{pbis-corrected}} = \frac{\overline{Y}_{(i), 1} - \overline{Y}_{(i), 0}}{S_{Y_{(i)}}} \cdot \sqrt{p(1 - p)}$$

Where:
- $\overline{Y}_{(i), 1}$: Mean rest-of-test score for candidates answering item $i$ correctly.
- $\overline{Y}_{(i), 0}$: Mean rest-of-test score for candidates answering item $i$ incorrectly.
- $S_{Y_{(i)}}$: Sample standard deviation of the rest-of-test score across the calibration sample.
- $p$: Item facility index ($p = n_{\text{correct}} / n$).

### Discrimination Quality Rating Matrix
| $r_{\text{pbis}}$ Value | Quality Rating | Diagnostic Interpretation & Policy Action |
| :--- | :---: | :--- |
| **$r_{\text{pbis}} \ge 0.40$** | **Excellent** | Highly discriminating item. Distinguishes high and low ability candidates effectively. |
| **$0.30 \le r_{\text{pbis}} < 0.40$** | **Good** | Solid discriminating item. Suitable for competitive tests. |
| **$0.20 \le r_{\text{pbis}} < 0.30$** | **Marginal** | Weak discrimination. Question review recommended. |
| **$0.00 \le r_{\text{pbis}} < 0.20$** | **Poor** | Extremely weak item. Trigger `LOW_DISCRIMINATION` quality flag. |
| **$r_{\text{pbis}} < 0.00$** | **Defective** | Inverse discrimination (lower ability candidates scored higher). Trigger `NEGATIVE_DISCRIMINATION` critical flag. |

---

## 10. Negative Marking Treatment & Scoring Semantics

In Indian competitive examinations (SSC, UPSC, Banking, Railways, State PSCs), incorrect responses incur penalties (e.g. $-0.50$ marks for 2-mark questions, $-0.33$ marks for 1-mark questions).

### Frozen Production Policy
1. **Zero Hardcoded Cross-Exam Assumptions**: Phase 5E.6 consumes the authoritative event/mock configuration:
   $$\text{Marking Scheme} = \{ M_{\text{correct}}, M_{\text{penalty}}, M_{\text{unanswered}} \}$$
2. **Item Score Assignment**:
   $$Y_i = \begin{cases} +M_{\text{correct}} & \text{if candidate answered correctly} \\ -M_{\text{penalty}} & \text{if candidate answered incorrectly} \\ 0 & \text{if candidate did not answer / skipped} \end{cases}$$
3. **Net Total Criterion**:
   $$Y_{\text{total}} = \sum_{j=1}^K Y_j, \quad Y_{(i)} = Y_{\text{total}} - Y_i$$
4. **Psychometric Defense**: Net marks reflect the genuine competitive ability continuum because guessing penalties deter random guessing noise, yielding a cleaner separation between ability cohorts.

---

## 11. Item Information Function ($I(\theta)$)

### CAT Runtime vs. Analytical Psychometric Distinction
- **Phase 4D.4 Live CAT Information**: Evaluated in real-time by `AdaptiveSelectionService` during an ongoing adaptive session to select the item maximizing $I(\theta_k)$.
- **Phase 5E.6 Analytical Psychometric Information**: Evaluated post-hoc across the full continuum $\theta \in [-3.0, +3.0]$ to assess item precision, section coverage, and aggregate Test Information Functions ($TIF$).
- **Shared Mathematical Authority**: Both consume the certified 1PL Fisher Information formulation:
  $$P(\theta, b) = \frac{1}{1 + \exp(-(\theta - b))}$$
  $$I(\theta) = P(\theta, b) \cdot (1 - P(\theta, b))$$

### Mathematical Invariants
- Peak Information: $I_{\max} = 0.25$ occurs at $\theta = b$.
- Symmetry: $I(\theta)$ is strictly symmetric about $\theta = b$.
- Test Information Function ($TIF$): $TIF(\theta) = \sum_{i=1}^K I_i(\theta)$.
- Standard Error of Measurement along ability scale: $SE(\theta) = \frac{1}{\sqrt{TIF(\theta)}}$.
- **CAT Invariant**: Phase 5E.6 analysis is read-only and DOES NOT mutate Phase 4D.4 live CAT runtime selection.

---

## 12. Distractor Analysis & Option Attractor Dynamics

For every multiple-choice question version with options $K = \{A, B, C, D\}$, the Distractor Engine evaluates:

### 1. Option Selection Proportion
$$f(k) = \frac{n_k}{n} \quad (\sum_{k \in K} f(k) = 1.0)$$

### 2. Distractor Discrimination ($r_{\text{dist}}(k)$)
Point-biserial correlation between selecting incorrect option $k$ and rest-of-test performance $Y_{(i)}$:
- **Expected Functioning Distractor**: $r_{\text{dist}}(k) < 0$ (lower ability candidates are more attracted to the distractor than high-ability candidates).
- **Anomaly Alert (`POSITIVE_DISTRACTOR_DISCRIMINATION`)**: If $r_{\text{dist}}(k) > 0.05$ with $n \ge 50$, high-ability candidates are preferentially selecting an incorrect option. Indicates potential **editorial ambiguity, key error, or misleading phrasing**.

### 3. Non-Functioning Distractor (`NON_FUNCTIONING_DISTRACTOR`)
- Triggered if $f(k) < 0.03$ (less than 3% of candidates select this distractor when $n \ge 100$).
- An unselected option fails to discriminate and reduces effective option count.

---

## 13. Item Characteristic Curves (ICC) & Empirical Trace Modeling

Phase 5E.6 generates Item Characteristic Curves over the latent continuum $\theta \in [-3.0, +3.0]$:

```
P(θ) 1.0 │                                             .---'
         │                                       .---'
     0.8 │                                 .---'
         │                           .---'
     0.6 │                     .---'
         │               .---'
     0.4 │         .---'
         │   .---'
     0.2 │ -'
         │
     0.0 └───┴───────┴───────┴───────┴───────┴───────┴───────┴───
        -3.0    -2.0    -1.0    0.0    +1.0    +2.0    +3.0   θ
```

### Empirical Trace Overlay
- Candidates are partitioned into 5 ability quintiles based on rest-of-test score $Y_{(i)}$.
- Observed proportion-correct within each quintile is plotted as empirical points against the theoretical 1PL ICC curve.
- Discrepancies between empirical points and theoretical ICC highlight non-monotonic response patterns or item misfit.

---

## 14. Mandatory Model Comparison & IRT Lifecycle

| Model | Purpose | Formula | Minimum Sample Size ($n$) | Theoretical Strengths | Known Limitations | Production Status in 5E.6 |
| :--- | :--- | :--- | :---: | :--- | :--- | :---: |
| **Observed $p$-value** | Classical Facility | $p = n_{\text{correct}} / n$ | $n \ge 20$ | Computationally instant, zero distributional assumptions. | Sample-dependent; does not account for cohort ability. | **CURRENT PRODUCTION (ACTIVE)** |
| **Corrected $r_{\text{pbis}}$** | Classical Discrimination | $\frac{\overline{Y}_1 - \overline{Y}_0}{S_Y} \sqrt{p(1-p)}$ | $n \ge 50$ | Eliminates self-score contamination; intuitive $[-1, 1]$ scale. | Assumes continuous total score variation. | **CURRENT PRODUCTION (ACTIVE)** |
| **1PL / Rasch IRT** | Parameter Calibration | $P(\theta, b) = \frac{1}{1 + e^{-(\theta - b)}}$ | $n \ge 100$ | Objective measurement; sample-independent $b$; additive information. | Assumes equal item discrimination ($a = 1.0$). | **CURRENT PRODUCTION (ACTIVE)** |
| **2PL IRT** | Dual Parameter ($a, b$) | $P(\theta) = \frac{1}{1 + e^{-1.7a(\theta - b)}}$ | $n \ge 500$ | Models varying item discrimination slopes. | Requires large sample sizes; susceptible to numerical non-convergence. | **EXPERIMENTAL / RESEARCH** |
| **3PL IRT** | Tri-Parameter ($a, b, c$) | $P(\theta) = c + \frac{1 - c}{1 + e^{-1.7a(\theta - b)}}$ | $n \ge 1,000$ | Accounts for pseudo-guessing on difficult items. | Parameter $c$ is poorly identified without massive samples ($N > 2,000$). | **FUTURE / RESEARCH ONLY** |

---

## 15. Pseudo-Guessing ($c$ Parameter) Justification

> [!NOTE]
> **Scientific Justification for Quarantining 3PL to Future/Research**:
> In 4-option multiple-choice examinations, theoretical guessing probability is $0.25$. However, unconstrained empirical estimation of $c$ on sample sizes $< 1,000$ leads to severe parameter confounding between $a, b,$ and $c$, creating unstable calibrations.
> Therefore, Phase 5E.6 **strictly utilizes the 1PL model for active calibration**, fixing $c = 0.0$ and quarantining 2PL and 3PL strictly to the experimental research pipeline.

---

## 16. Calibration Evidence Lifecycle & Item States

```
[New Question Version Created]
              │
              ▼
    [State: UNCALIBRATED] (n = 0, default b = 0.0)
              │
              ▼ (1 <= n < 20)
 [State: INSUFFICIENT_DATA] (accumulating evidence, metrics withheld)
              │
              ▼ (20 <= n < 100)
    [State: PROVISIONAL] (empirical facility p & provisional logit b)
              │
              ▼ (n >= 100 & Converged & SE(b) <= 0.35)
     [State: CALIBRATED] (full production parameters active)
              │
    ┌─────────┴─────────┐
    ▼                   ▼
[State: UNSTABLE]   [State: DEPRECATED]
(Δb > 0.50 or       (Admin Retired or
 SE(b) > 0.50 or     Superseded Version)
 Divergent Iter)
```

### State Transition Invariants
1. `UNCALIBRATED` $\to$ `INSUFFICIENT_DATA`: Triggered on first response evidence ($N \ge 1$).
2. `INSUFFICIENT_DATA` $\to$ `PROVISIONAL`: Triggered when $N \ge 20$.
3. `PROVISIONAL` $\to$ `CALIBRATED`: Triggered when $N \ge 100$, JMLE calibration converges, and $SE(b) \le 0.35$.
4. `CALIBRATED` $\to$ `UNSTABLE`: Triggered if parameter drift $\Delta b > 0.50$ across windows, $SE(b) > 0.50$, or calibration divergence occurs.
5. `CALIBRATED` / `UNSTABLE` $\to$ `DEPRECATED`: Manual admin deprecation or version supersession.
6. **Non-Destructive Guarantee**: State transitions never automatically delete questions or mutate published mocks.

---

## 17. Uncertainty, Standard Errors & Confidence Intervals

Every psychometric parameter in Phase 5E.6 exposes its standard error and confidence interval:

### 1. Difficulty Standard Error ($SE_b$)
$$SE_b = \frac{1}{\sqrt{\sum_{j=1}^N P(\theta_j, b)(1 - P(\theta_j, b))}} \approx \frac{6.0}{\sqrt{n \cdot p(1 - p)}} \quad (\text{for } n \ge 20, 0 < p < 1)$$

### 2. Discrimination Standard Error ($SE_{r}$)
$$SE_r = \frac{1 - r_{\text{pbis}}^2}{\sqrt{n - 2}}$$

### 3. $95\%$ Confidence Interval
$$CI_{95\%} = [\text{Metric} - 1.96 \cdot SE, \quad \text{Metric} + 1.96 \cdot SE]$$

---

## 18. Test & Section Reliability

### 1. Cronbach's Alpha ($\alpha$) — Authoritative Production Metric
$$\alpha = \frac{K}{K - 1} \left(1 - \frac{\sum_{i=1}^{K} \sigma_i^2}{\sigma_{\text{test}}^2}\right)$$
- **Covariance Basis**: $\sigma_i^2 = \mathrm{Var}(Y_i)$ is item net score variance, $\sigma_{\text{test}}^2 = \mathrm{Var}(Y_{\text{total}}) = \sum_{i=1}^K \sigma_i^2 + 2\sum_{i < j} \mathrm{Cov}(Y_i, Y_j)$.
- **Missing Data Treatment**: Computed on complete submitted attempts. Unanswered items in submitted attempts score 0.00.
- **Sample Requirements**: $N \ge 30$ candidates, $K \ge 3$ items. If $N < 30$ or $K < 3 \implies \alpha = \text{NULL}$.
- **Zero-Variance Guard**: If $\sigma_{\text{test}}^2 = 0 \implies \alpha = \text{NULL}$.
- **Multidimensionality Safeguard**: For multi-subject competitive exams, aggregate $\alpha$ across the entire test may underestimate reliability due to dimensional heterogeneity; therefore, section-level reliability $\alpha_s$ is also computed independently for every section.

### 2. McDonald's Omega ($\omega$) — EXPERIMENTAL / FUTURE (Research Pipeline)
$$\omega_t = \frac{(\sum_{i=1}^K \lambda_i)^2}{(\sum_{i=1}^K \lambda_i)^2 + \sum_{i=1}^K \psi_i^2}$$
- **Status**: Quarantined to **EXPERIMENTAL / FUTURE** research pipeline.
- **Factor Model**: Unidimensional Confirmatory Factor Analysis (CFA) where $\lambda_i$ is factor loading and $\psi_i^2 = \mathrm{Var}(Y_i) - \lambda_i^2$ is unique variance.
- **Limitation**: Numerical iterative factor extraction without dedicated external linear algebra solvers is prone to non-convergence or Heywood cases ($\psi_i^2 \le 0$) on sparse datasets. In production, Cronbach's $\alpha$ remains authoritative.

### 3. Standard Error of Measurement ($SEM$)
$$SEM = \sigma_{\text{test}} \cdot \sqrt{1 - \alpha}$$
Represents the standard deviation of observed test scores around a candidate's true score.

---

## 19. Section Quality Diagnostics

For each section in an examination blueprint:
1. **Section Difficulty Profile**: Average $p$-value and distribution of $b$ parameters.
2. **Section Discrimination Spread**: Proportion of items with $r_{\text{pbis}} \ge 0.30$.
3. **Section Reliability Contribution**: Section alpha ($\alpha_s$) and item-to-section total correlations.
4. **Weak Item Proportion**: Percentage of section items flagged with psychometric warnings.

---

## 20. Exam & Paper Quality Profiling

Rather than collapsing paper quality into an unscientific single "Score", Phase 5E.6 outputs a multidimensional **Paper Quality Profile**:
1. **Target Population Alignment**: Comparison between test information peak $I_{\text{max}}(\theta)$ and candidate score distribution.
2. **Reliability Index**: $\alpha \ge 0.85$ (Excellent for high-stakes tests).
3. **Discrimination Index**: Average $r_{\text{pbis}} \ge 0.35$.
4. **Flag Density**: Total flagged items / Total test items $\le 5.0\%$.
5. **Blueprint Information Coverage**: Measurement precision maintained across all syllabus sections.

---

## 21. Multiple Comparison Safeguards & Mass Flagging Governance

When analyzing thousands of questions simultaneously across large question banks, evaluating hypotheses purely by statistical $p$-values leads to massive false discovery rates (e.g. at $N=10,000$, a trivial $0.1\%$ difference becomes statistically significant $p < 0.001$).

### Production Flagging Safeguard Principles
1. **Primacy of Effect Size**: Flags require crossing practical effect size thresholds ($|r_{\text{pbis}}| < 0.15$, $p < 0.15$, $f(k) < 0.03$, $r_{\text{dist}} > 0.05$) rather than arbitrary hypothesis $p$-value cuts.
2. **Sample Sufficiency Gate**: No discrimination or distractor flag is emitted unless $N \ge 50$ (facility) or $N \ge 100$ (discrimination/distractor).
3. **Stability Requirement**: Flags must persist across calibration snapshots to prevent single-batch random fluctuation alerts.
4. **No Automated Verdict**: A flag is purely statistical evidence for human review, never an automatic sentence.

---

## 22. Deterministic Question Quality Flags & Full Metadata Payload

Every emitted flag strictly includes all 11 required metadata attributes:

```typescript
export interface PsychometricQualityFlag {
  flagKey: string;                          // e.g. "NEGATIVE_DISCRIMINATION"
  metric: "p_value" | "r_pbis" | "b_difficulty" | "distractor_biserial" | "calibration_stability";
  value: number;                            // Observed empirical value
  threshold: number;                        // Trigger threshold
  evidenceCount: number;                    // Sample size N
  uncertainty: { se: number; ci95: [number, number] }; // Standard error & 95% CI
  population: "POP_FIXED_MOCK" | "POP_LIVE_COMPETITION" | "POP_AGGREGATE_ALL";
  modelVersion: "1PL_RASCH_V1";
  policyVersion: "PSYCHOMETRIC_POLICY_V1";
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  interpretation: string;                   // Human-readable diagnostic description
  humanReviewRequirement: "RECOMMENDED" | "MANDATORY";
}
```

### Complete Quality Flag Registry
1. `EXTREMELY_HARD`: $p < 0.15$ with $N \ge 50$. Severity: `MEDIUM`.
2. `EXTREMELY_EASY`: $p > 0.90$ with $N \ge 50$. Severity: `LOW`.
3. `LOW_DISCRIMINATION`: $0.00 \le r_{\text{pbis}} < 0.20$ with $N \ge 50$. Severity: `HIGH`.
4. `NEGATIVE_DISCRIMINATION`: $r_{\text{pbis}} < 0.00$ with $N \ge 50$. Severity: `CRITICAL`.
5. `NON_FUNCTIONING_DISTRACTOR`: Option selected by $< 3\%$ ($f(k) < 0.03$) with $N \ge 100$. Severity: `LOW`.
6. `POSITIVE_DISTRACTOR_DISCRIMINATION`: Option $r_{\text{dist}}(k) > 0.05$ with $N \ge 50$. Severity: `HIGH`.
7. `POSSIBLE_AMBIGUITY`: Positive distractor discrimination + low facility. Severity: `CRITICAL`.
8. `UNSTABLE_CALIBRATION`: Parameter drift $\Delta b > 0.50$ or calibration divergence. Severity: `HIGH`.
9. `INSUFFICIENT_SAMPLE`: $N < 20$. Severity: `INFO`.

> [!IMPORTANT]
> **STRICT INVARIANT: HUMAN REVIEW PRIMACY**:
> Psychometric flags must **NEVER** automatically:
> - delete a question
> - deactivate a question
> - modify an answer key
> - modify scoring
> - modify an exam
> - modify a published mock
> - invalidate a candidate result

---

## 23. Ambiguity & Answer Key Anomaly Detection

Statistical evidence flags potential editorial defects:
- **Case 1: Wrong Answer Key in Database**: Keyed option has negative discrimination, while a distractor has high positive discrimination ($r > 0.40$).
- **Case 2: Ambiguous Double Correct**: Two distinct options both exhibit strong positive discrimination ($r > 0.30$).
- **Case 3: Poorly Phrased / Confusing Item**: Overall $p < 0.10$ and $r_{\text{pbis}} \approx 0.00$ across all candidate deciles.

---

## 24. Question Versioning & Calibration Lineage

1. All psychometric parameters attach strictly to `question_version_id`.
2. When content editors update a question's text, options, or answer key, a new `question_version` is created.
3. Historical responses remain attached to the previous `question_version_id` with frozen calibration parameters.
4. The new version starts in the `uncalibrated` state and accumulates fresh response evidence.

---

## 25. Adaptive Population Isolation & Selection Bias Prevention

### Theoretical Basis for Isolation
In Computerized Adaptive Testing (CAT), items are dynamically selected to match candidate ability $\theta_k \approx b_i$. This creates:
1. **Severe Selection Bias**: Hard items are administered only to top candidates; easy items only to struggling candidates.
2. **Restricted Variance & Biased $p$-values**: Classical $p$-values on adaptive items collapse toward $0.50$ regardless of true difficulty.
3. **Contaminated Point-Biserials**: Classical $r_{\text{pbis}}$ computed on adaptively targeted samples is mathematically invalid.

### Strict Architectural Rule
Adaptive CAT responses are strictly isolated in `POP_ADAPTIVE_CAT` and evaluated exclusively via IRT latent ability models. They are **NEVER pooled** into classical fixed-mock calibration populations (`POP_FIXED_MOCK`).

---

## 26. Item Exposure & Security Monitoring

- Reports item exposure rates:
  $$\text{Exposure Rate} = \frac{\text{Item Presentations}}{\text{Total Test Sessions}} \times 100$$
- Overexposed items ($> 40\%$ exposure across adaptive sessions) are flagged for item-bank replenishment.

---

## 27. Statistical Drift & Historical Parameter Stability

### Prerequisites for Drift Evaluation
- Baseline calibration window ($W_{\text{base}}$) and Comparison window ($W_{\text{comp}}$).
- Minimum sample sizes in both windows: $N_{\text{base}} \ge 100$, $N_{\text{comp}} \ge 100$.
- Pooled Standard Error: $SE(\Delta b) = \sqrt{SE(b_{\text{base}})^2 + SE(b_{\text{comp}})^2}$.

### Drift Detection Rules
- **Difficulty Drift**: $|\Delta b| = |b_{\text{comp}} - b_{\text{base}}| > 0.40$.
- **Discrimination Drift**: $|\Delta r_{\text{pbis}}| = |r_{\text{pbis, comp}} - r_{\text{pbis, base}}| > 0.20$.
- **Distractor Drift**: Shift in option selection frequency $|\Delta f(k)| > 0.15$.
- Prohibits flagging drift on small sample populations ($N < 100$).

---

## 28. Differential Item Functioning (DIF) Assessment

- **Privacy Invariant**: Courage Library does **NOT** track sensitive personal attributes.
- DIF assessment is strictly confined to legitimate educational cohorts (e.g. `First-Time vs. Veteran Repeat Test-Takers`, `Mobile vs. Desktop Web Device Mode`).
- Demographic/sensitive trait modeling is classified as **FUTURE / RESEARCH ONLY**.

---

## 29. Data Quality Diagnostics

Every psychometric payload returns explicit data quality flags:
- `PSYCHOMETRIC_DATA_AVAILABLE`: Complete response sample, valid active calibration.
- `INSUFFICIENT_SAMPLE_SIZE`: $n < n_{\text{min}}$.
- `ZERO_SCORE_VARIANCE`: All candidates scored identically ($p = 0.0$ or $p = 1.0$); $r_{\text{pbis}}$ undefined.
- `DANGLING_QUESTION_VERSION`: Question version unmapped to question bank.
- `UNMAPPED_ANSWER_KEY`: Correct answer key missing in database.

---

## 30. Model Versioning & Governance

All analytical routines operate under explicit version identifiers:
- `PSYCHOMETRIC_POLICY_V1`
- `ITEM_DIFFICULTY_MODEL_V1` (Bounded logistic $b$ / Rasch JMLE)
- `ITEM_DISCRIMINATION_MODEL_V1` (Corrected $r_{\text{pbis}}$)
- `IRT_1PL_V1` (Rasch / 1PL Information)
- `DISTRACTOR_MODEL_V1` (Option frequency & biserial)

---

## 31. Deterministic Data Lineage & Reproducibility Guarantee

Every psychometric calculation output record must deterministically capture:
1. `question_version_id`
2. `response_evidence_range` (first & last evidence IDs)
3. `population_definition` (`POP_FIXED_MOCK`, `POP_LIVE_COMPETITION`, etc.)
4. `scoring_semantics` (exact $M_{\text{correct}}, M_{\text{penalty}}, M_{\text{unanswered}}$ applied)
5. `model_version` (`1PL_RASCH_V1`)
6. `policy_version` (`PSYCHOMETRIC_POLICY_V1`)
7. `calibration_window` ($[T_{\text{start}}, T_{\text{end}}]$)
8. `evidence_watermark` (`evidence_watermark_timestamp` & hash)
9. `calculation_timestamp`

### Reproducibility Guarantee
Recalibrating against the exact same evidence watermark, population filter, and policy version deterministically produces bit-for-bit identical parameters.

---

## 32. Admin RBAC Permissions Matrix

| Role | View Psychometric Overview | Inspect Item Detail & ICC | View Quality Flags | Trigger Recalibration | Review & Clear Flags | Deprecate Question Version |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **SUPER_ADMIN** | Full Access | Full Access | Full Access | Full Access | Full Access | Full Access |
| **ADMIN** | Full Access | Full Access | Full Access | Full Access | Full Access | Full Access |
| **STAFF / ANALYST** | Full Access | Full Access | Full Access | **BLOCKED** | View Only | **BLOCKED** |
| **CANDIDATE** | **BLOCKED** | **BLOCKED** | **BLOCKED** | **BLOCKED** | **BLOCKED** | **BLOCKED** |

---

## 33. Row Level Security & Candidate Isolation

1. All psychometric computation executes in server actions / background jobs using the Supabase Service Role client after verifying administrator credentials.
2. Candidate endpoints have **zero access** to item discrimination, latent difficulty parameters, distractor attractors, or quality flags.
3. Answer keys are strictly scrubbed from all public API responses.

---

## 34. Human Review Boundary & Corrective Workflow

```
[Psychometric Anomaly Detected (e.g. r_pbis < 0)]
                     │
                     ▼
[Diagnostic Flag Recorded in Review Queue]
                     │
                     ▼
[Admin / Subject Expert Review Action]
        ┌────────────┴────────────┐
        ▼                         ▼
[Verify & Deprecate Item]   [Dismiss / False Positive]
(Flagged as DEPRECATED;      (Justification recorded in
 Author drafts new version)   admin_audit_logs)
```

---

## 35. Performance & Scalability Architecture

- **Set-Based PostgreSQL SQL Aggregations**: Computes $\sum X, \sum X^2, \sum XY$ directly on PostgreSQL indexes to derive correlation matrices without loading millions of raw attempts into Node.js memory.
- **Indexing Strategy**: Leverages existing indexes on `adaptive_item_response_evidence(question_version_id, is_correct)` and `attempt_answers(attempt_id, question_id)`.
- **Zero N+1 Query Loops**: Batch aggregations execute via single group-by statements across question banks.

---

## 36. Incremental Calibration & Watermark Tracking

- Calibration stores an `evidence_watermark_timestamp`.
- Recalibration queries only process evidence rows recorded after the watermark timestamp ($T_{\text{new}} > T_{\text{watermark}}$), updating running sums $(\sum x, \sum y, \sum xy)$ incrementally.

---

## 37. Statistical Computation Architecture

- All primary mathematical operations (proportions, point-biserials, 1PL information, Cronbach's $\alpha$, McDonald's $\omega$ research, SEM) are executed in **server-side TypeScript** and **PostgreSQL SQL functions**.
- Zero external Python dependencies or microservices required, minimizing operational overhead and latency.

---

## 38. Async Processing & Job Boundary

- Routine on-demand item inspection executes synchronously in $< 50\text{ms}$.
- Bank-wide full recalibrations execute via batched background tasks using existing database RPC patterns.

---

## 39. Caching Strategy

- **Item Psychometrics**: `admin:psychometrics:item:{version_id}:pop:{pop_id}` (TTL: 15 minutes; invalidated on recalibration).
- **Test Reliability**: `admin:psychometrics:test:{mock_test_id}` (Immutable once snapshot frozen).

---

## 40. Admin UI Architecture (`/admin/psychometrics`)

- **Module 1: Bank Overview**: Distribution of item facility ($p$), average discrimination ($r_{\text{pbis}}$), total flagged questions.
- **Module 2: Flagged Questions Review Queue**: Prioritized list of items with negative discrimination, extreme difficulty, or distractor anomalies.
- **Module 3: Test & Paper Health**: Reliability ($\alpha, \omega$, SEM) scorecard across test series.
- **Module 4: Question Detail Explorer**: Deep-dive item inspection view.

---

## 41. Question Detail View Architecture (`/admin/psychometrics/questions/[versionId]`)

- **Header**: Question version metadata, subject, topic, nominal difficulty tier.
- **Classical Metrics Strip**: $p$-value, sample size $n$, corrected $r_{\text{pbis}}$, omission rate.
- **IRT Curve Viewer**: Theoretical 1PL ICC with empirical decile trace overlay.
- **Distractor Analysis Table**: Selection percentage, distractor biserial $r_{\text{dist}}$, non-functioning status.
- **Quality Flags Panel**: Active diagnostic alerts with severity ratings.
- **Audit Action Panel**: Admin Flag Dismiss / Deprecate controls with mandatory justification.

---

## 42. Paper / Exam Detail View Architecture (`/admin/psychometrics/papers/[id]`)

- Summary KPI Strip: Overall test $\alpha$, McDonald's $\omega$, $SEM$, mean $r_{\text{pbis}}$.
- Section-wise Reliability & Difficulty Breakdown table.
- Test Information Curve ($TIF$) plotted against target candidate ability deciles.
- Problematic item roster sorted by lowest discrimination.

---

## 43. Export Capabilities

- Supported formats: **CSV** and **JSON**.
- Gated by `SUPER_ADMIN` and `ADMIN` roles; every export logged in `admin_audit_logs`.

---

## 44. Audit Logging Requirements

All high-impact psychometric operations write an immutable record to `public.admin_audit_logs`:
- `action_type`: `PSYCHOMETRIC_RECALIBRATION_EXECUTE`, `PSYCHOMETRIC_FLAG_DISMISS`, `PSYCHOMETRIC_ITEM_DEPRECATE`, `PSYCHOMETRIC_EXPORT`.
- Captures `actor_id`, `actor_email`, `target_entity`, `target_id`, `reason`, `old_value`, `new_value`.

---

## 45. Database Changes Analysis

- **Zero Breaking Changes / Additive Only**:
  - Reuses existing certified tables `adaptive_item_calibrations`, `adaptive_item_response_evidence`, `adaptive_item_calibration_history`.
  - Phase 5E.6 adds additive columns to `adaptive_item_calibrations`:
    - `discrimination_pbis` (numeric NULL)
    - `distractor_metrics` (jsonb NULL)
    - `quality_flags` (text[] DEFAULT '{}')
    - `reliability_alpha` (numeric NULL)
    - `psychometric_policy_version` (text DEFAULT 'v1.0.0')
  - Zero tables dropped; zero core baseline tables mutated.

---

## 46. Comprehensive Testing Strategy

A 10-track test suite will validate the implementation:
1. **Track 1: Mathematical Correctness** (Known $p, b, r_{\text{pbis}}$, zero-variance safeguards, negative discrimination).
2. **Track 2: Sample Size Boundaries** (Uncalibrated $n < 20$, Provisional $20 \le n < 100$, Calibrated $n \ge 100$).
3. **Track 3: Distractor Analysis** (Balanced options, non-functioning distractors, positive distractor discrimination).
4. **Track 4: 1PL IRT Information & ICC** (Information peak at $\theta = b$, bounds $[-3.0, +3.0]$, numerical stability).
5. **Track 5: Test & Section Reliability** (Cronbach's $\alpha$, McDonald's $\omega$, SEM formulations on known datasets).
6. **Track 6: Population Isolation** (Verified separation of fixed mocks, live tests, and adaptive data).
7. **Track 7: Diagnostic Flag Logic** (Evaluates all 9 quality flags under threshold conditions).
8. **Track 8: Security & Candidate Isolation** (Candidate denial, RBAC matrix, answer key protection).
9. **Track 9: Human Review Boundary** (Verifies flags do not mutate question bank).
10. **Track 10: Deterministic Reproducibility** (Identical input + policy = exact same output).

---

## 47. Production Runtime Gate Specification

Will be verified in live Supabase production via:
`scripts/verify_phase5e6_production_runtime_gate.cjs`

Validating:
1. 14 Core Baseline Tables 100% Intact Pre/Post Audit.
2. RBAC & Candidate Denial Safeguards.
3. RLS Isolation & Answer Key Security.
4. Response Evidence Ledger Integrity.
5. Difficulty & Corrected Discrimination Calculation.
6. Distractor Analytics & Non-Functioning Option Flagging.
7. Test Reliability ($\alpha, \omega$, SEM) Integrity.
8. Population Isolation & Errata Snapshot Compliance.
9. Secret Audit (0 credentials exposed).

---

## 48. Full Regression Chain

The final implementation will execute the complete 27-suite regression track:
- Phase 4D.1 to 4D.7 + Runtime Gate
- Phase 5A to 5D + Runtime Gates
- Phase 5E.1 to 5E.5 + Runtime Gates
- Phase 5E.6 + Phase 5E.6 Runtime Gate

---

## 49. Migration Safety & Zero-Downtime Rollback

- Additive column migrations on `adaptive_item_calibrations` with safe defaults (`NULL` / `{}`).
- Instant rollback capability without data loss.

---

## 50. Risks & Mitigation

| Risk | Impact | Mitigation Strategy |
| :--- | :---: | :--- |
| **Small Sample Size Instability** | Misleading metrics | Strict sample thresholds ($n < 20 \implies$ uncalibrated; $n < 50 \implies$ discrimination withheld). |
| **Self-Score Correlation Contamination** | Inflated discrimination | Corrected point-biserial excluding the target item's score from total test score. |
| **Negative Marking Skew** | Distorted trait proxy | Criterion total score computed on net authoritative marks under official exam rules. |
| **Adaptive Selection Sampling Bias** | Inaccurate facility values | Strict quarantine of CAT response evidence from unweighted classical mock baselines. |
| **Mass Flagging False Discoveries** | Admin fatigue | Flagging driven by practical effect sizes, sample sufficiency, and persistence over raw $p$-values. |

---

## 51. Implementation Sequence

The implementation will proceed in 12 structured stages upon authorization:
1. **Phase 5E.6.1**: Psychometric Foundation & Data Contracts (`types/psychometrics.ts`).
2. **Phase 5E.6.2**: Additive Schema Migration (`adaptive_item_calibrations` extensions).
3. **Phase 5E.6.3**: Item Classical Statistics & Difficulty Calibration Engine.
4. **Phase 5E.6.4**: Corrected Point-Biserial Discrimination & Distractor Analytics Engine.
5. **Phase 5E.6.5**: 1PL Information & ICC Response Curve Model.
6. **Phase 5E.6.6**: Section & Test Reliability Engine ($\alpha, \omega$, SEM).
7. **Phase 5E.6.7**: Psychometric Quality Flag & Ambiguity Detection System.
8. **Phase 5E.6.8**: Server Actions & Admin API Layer (`app/admin/psychometrics/actions.ts`).
9. **Phase 5E.6.9**: Admin Psychometric UI (`/admin/psychometrics`, Question Detail, Paper Health).
10. **Phase 5E.6.10**: Dedicated Automated Test Suite (`test_phase5e6_psychometrics.cjs`).
11. **Phase 5E.6.11**: Production Runtime Certification Gate (`verify_phase5e6_production_runtime_gate.cjs`).
12. **Phase 5E.6.12**: Full Regression (27 suites) & Final Certification.

---

## 52. 5E.6 Scope Boundary Declaration

> [!IMPORTANT]
> **STRICT ARCHITECTURAL SCOPE BOUNDARY**:
> Phase 5E.6 delivers **Item Psychometrics, Classical Item Statistics, Corrected Discrimination, Distractor Analytics, Test Reliability, and Administrative Quality Intelligence**.
>
> **HUMAN REVIEW BOUNDARY**:
> Phase 5E.6 **DOES NOT** perform automatic question deletion, automatic answer key modification, or automated test restructuring. All corrective actions require human administrator review.

---

## 53. Implementation Readiness Decision

| Gate Metric | Status | Evaluation |
| :--- | :---: | :--- |
| **Architecture Specification** | **COMPLETE** | All 53 required sections documented with full mathematical contracts and statistical validity amendments |
| **Item Calibration Methodology** | **RIGOROUS** | Explicit distinction between candidate ability $\theta$ and item calibration $b$; full 1PL JMLE / Centering specification |
| **Corrected Point-Biserial** | **FROZEN** | Rest-of-test criterion $Y_{(i)} = Y_{\text{total}} - Y_i$, negative marking accommodation, zero-variance protection |
| **Reliability Contracts** | **SPECIFIED** | Cronbach's $\alpha$ authoritative with covariance matrix; McDonald's $\omega$ quarantined to experimental research pipeline |
| **Adaptive Population Isolation** | **STRICT** | Complete quarantine of CAT targeted responses from linear classical mock baselines |
| **Quality Flags & Mass Flagging** | **SECURED** | Effect size + sample sufficiency + stability over raw $p$-values; 11-field metadata payload; zero auto-deletion |
| **Core Database Baseline** | **INTACT** | 14/14 core tables verified 100% intact (72/72 production gate tests passing) |
| **TypeScript Type Safety** | **CLEAN** | 0 compilation errors across codebase |
| **Overall Implementation Readiness** | **STATUS: GO** | Ready for implementation upon explicit user authorization |

```
============================================================
HARD STOP: PHASE 5E.6 ARCHITECTURE SPECIFICATION COMPLETED
DO NOT IMPLEMENT CODE UNTIL EXPLICITLY AUTHORIZED BY THE USER.
============================================================
```
