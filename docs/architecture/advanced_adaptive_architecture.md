# Courage Library — Advanced Adaptive & CAT Testing Engine Architecture
## Phase 4D.1: Advanced Architecture & Complete Admin Foundation

---

## 1. Executive Summary & Evolutionary Vision
Courage Library is modernizing its assessment platform by transitioning from fixed-linear test blueprints to a state-of-the-art **Computerized Adaptive Testing (CAT)** and **Item Response Theory (IRT)** ecosystem. 

The adaptive testing evolution follows a rigorous three-tier lifecycle:
1. **CURRENT IMPLEMENTED (Adaptive v1.0 — Heuristic Stepper)**: Production-verified, server-authoritative engine using deterministic ability proxies ($\theta \in [-3.0, 3.0]$), difficulty tier adjustment ($0.3$ step sizes), dynamic topic distribution constraints, Fisher-heuristic item selection, standard error approximation, and graceful session finalization.
2. **FOUNDATION CREATED (Phase 4D.1 — Architecture, Versioning & Complete Admin Center)**: Version-controlled algorithm registry, psychometric item calibration data structures, authoritative safety guardrails, emergency kill-switch semantics, rollback protections, and an enterprise Admin Control Center.
3. **FUTURE (Phase 4D.2+ — Empirical IRT & Multidimensional CAT)**: Offline psychometric calibration pipelines (marginal maximum likelihood estimation / MML), 1PL/2PL/3PL item response curves, Bayesian EAP/MAP ability updates, Sympson-Hetter exposure control, and multi-stage testing (MST).

---

## 2. Theoretical CAT & IRT Foundations

### 2.1 Model Hierarchy
- **Adaptive v1 (Current Implementation)**:
  - Bounded heuristic scoring: $\theta_{k+1} = \theta_k \pm \delta \cdot (1 - \text{accuracy\_weight})$
  - Difficulty normalization: Coarse-grained mappings (`easy` $\to -1.0$, `medium` $\to 0.0$, `hard` $\to +1.0$).
- **Rasch / 1-Parameter Logistic (1PL)** *(Future Evolution)*:
  $$P_i(\theta) = \frac{1}{1 + e^{-D a (\theta - b_i)}}$$
  where $a = 1.0$ (uniform discrimination) and $b_i$ is the item difficulty parameter.
- **2-Parameter Logistic (2PL)** *(Future Evolution)*:
  $$P_i(\theta) = \frac{1}{1 + e^{-D a_i (\theta - b_i)}}$$
  where $a_i > 0$ denotes item discrimination.
- **3-Parameter Logistic (3PL)** *(Future Evolution)*:
  $$P_i(\theta) = c_i + (1 - c_i) \frac{1}{1 + e^{-D a_i (\theta - b_i)}}$$
  where $c_i \in [0, 0.35]$ represents pseudo-guessing probability on multiple-choice items.

---

## 3. Item Calibration & Question Bank Health

### 3.1 Item Calibration Data Model (`adaptive_item_calibrations`)
To prepare for empirical psychometrics without corrupting uncalibrated baseline items, Phase 4D.1 defines the storage foundation:
- `difficulty_b`: Item location on latent scale $[-4.0, +4.0]$.
- `discrimination_a`: Slope parameter $[0.2, 3.0]$.
- `guessing_c`: Lower asymptote $[0.0, 0.35]$.
- `sample_size`: Number of candidate responses accumulated.
- `reliability_score`: Calibration confidence / empirical standard error.
- `calibration_status`: Explicit state machine (`uncalibrated` $\to$ `provisional` $\to$ `calibrated` $\to$ `flagged` $\to$ `deprecated`).
- `calibrated_at`: Timestamp of last calibration run.

> [!IMPORTANT]
> In Phase 4D.1, all existing questions remain `uncalibrated` or use verified baseline difficulty tags. No synthetic psychometric parameters are fabricated.

---

## 4. Ability Estimation & Uncertainty Mathematics

### 4.1 Estimation Methods
1. **Adaptive v1 Proxy (Current)**:
   - Initial $\theta_0 = 0.0, \text{SE}_0 = 1.0$
   - Update on response $u_k \in \{0, 1\}$:
     $$\Delta\theta = \text{step\_size} \cdot \frac{1}{\sqrt{k + 1}} \cdot (u_k - P(\theta_k, d_k))$$
     $$\text{SE}_{k+1} = \frac{1}{\sqrt{1 + \sum_{j=1}^{k} w_j}}$$
2. **Maximum Likelihood Estimation (MLE)** *(Future)*:
   $$\frac{\partial \ln L(\theta)}{\partial \theta} = \sum_{i=1}^{k} \frac{a_i (u_i - P_i(\theta))}{P_i(\theta)(1 - P_i(\theta))} P'_i(\theta) = 0$$
3. **Expected A Posteriori (EAP)** *(Future)*:
   $$\hat{\theta}_{\text{EAP}} = \int \theta \, p(\theta \mid \mathbf{u}) \, d\theta$$
   With Gaussian prior $\theta \sim \mathcal{N}(\mu_0, \sigma_0^2)$.

---

## 5. Next-Item Selection & Exposure Control

### 5.1 Selection Strategies
- **v1 Max Fisher Information Heuristic (Current)**:
  Selects unseen questions from target topic $t^*$ whose nominal difficulty tier matches the target difficulty bracket of current $\theta_k$.
- **Sympson-Hetter Exposure Control** *(Future)*:
  Assigns exposure probability $P(\text{Serve} \mid \text{Select}) \le k_{\text{max}}$ to prevent overexposure of high-discrimination items.

---

## 6. Stopping Rules & Variable-Length Termination

The engine supports 4 termination policies configured in `adaptive_test_configs.stopping_policy`:
1. **Fixed Question Boundary**: $\text{served\_count} \ge \text{max\_questions}$.
2. **Standard Error Precision**: $\text{SE}_k \le \text{target\_se}$ (subject to $\text{served\_count} \ge \text{min\_questions}$).
3. **Classification Confidence**: 95% confidence interval of $\theta_k$ falls entirely above or below passing threshold $\theta_{\text{pass}}$.
4. **Time Expiry**: Authoritative server timer elapsed.

---

## 7. Blueprint & Content Balancing Constrained Optimization

To ensure every adaptive mock test complies with syllabus coverage standards:
- **Topic Coverage Policy**:
  $$\text{count}(\text{topic}_j) \le \text{max\_per\_topic}$$
  $$\sum_{j \in \text{required\_topics}} \mathbb{I}(\text{count}(\text{topic}_j) > 0) = |\text{required\_topics}|$$
- Target topics are determined dynamically by selecting under-represented topics with lowest served counts in the active attempt state.

---

## 8. Runtime State & Server-Authoritative Architecture

```
Candidate Browser (Player UI)
       │
       │ POST /api/assessment/adaptive-step { attemptId, stepNumber, selectedOptionKey }
       ▼
Next.js Route Handler (/api/assessment/adaptive-step)
       │
       ├─► 1. Verify User Session & RBAC
       ├─► 2. Lock & Load Attempt State (SELECT FOR UPDATE / Atomic State)
       ├─► 3. Validate Step Sequence (stepNumber == questions_served_count)
       ├─► 4. Grade Answer Authoritatively against question_answers
       ├─► 5. Compute Ability & SE Updates (AdaptiveEngineService)
       ├─► 6. Evaluate Stopping Rules (StoppingRuleMet / InProgress)
       ├─► 7. Select Next Question (AdaptiveSelectionService)
       ├─► 8. Log Decision Immutably (adaptive_question_decisions)
       ├─► 9. Commit State (adaptive_attempt_states & attempt_answers)
       ▼
Return Sanitized Response (Zero Answer Key / Zero Explanation / Zero Internal Metrics)
```

---

## 9. Algorithm Versioning & Zero-Downtime Rollback

### 9.1 Version Lifecycle
```
[draft] ──► [testing] ──► [active] ──► [deprecated] ──► [archived]
                             │
                             └──► (Rollback activates previous verified version)
```

### 9.2 Invariant Guarantees
- **No Code Execution**: Algorithm versions are metadata registries containing hyperparameters, model descriptors, and policy pointers.
- **Immutable Historical Binding**: Every historical attempt references the exact version active at attempt creation.
- **Zero-Downtime Rollback**: Activating an older version updates future attempt routing instantly without mutating past attempts or audit logs.

---

## 10. Emergency Disable, Fallback & System Resilience

### 10.1 Operational Semantics
When emergency disable is triggered (`emergency_disabled = true` in `adaptive_system_configs`):
1. **New Attempts**: New Advanced Adaptive sessions are immediately blocked with a user-friendly notice.
2. **In-Flight Attempts**: Active attempts proceed using deterministic fallback (Adaptive v1 Heuristic) or graceful session closure without crashing.
3. **Fixed & Daily Mocks**: 100% isolated and unaffected.
4. **Historical Access**: Result reviews, Mistake Vault, and analytics remain fully accessible.

---

## 11. Anti-Leakage & Security Governance

1. **Zero Client Leakage**:
   - `question_answers.correct_option_key` and explanation markdown are NEVER sent to the client during an in-progress adaptive attempt.
   - $\theta$, Standard Error, item discrimination, and Fisher information metrics are withheld until final result generation.
2. **Trigger-Enforced Immutability**:
   - `trg_prevent_adaptive_decision_mutation` prevents update/delete on `adaptive_question_decisions`.
   - `trg_prevent_admin_audit_log_mutation` prevents update/delete on `admin_audit_logs`.

---

## 12. Complete Admin Control Center Specification (`/admin/adaptive`)

The Admin Studio provides dedicated management tools across 6 primary tabs:
1. **Overview & Health**: High-level telemetry, active engine status, attempt volume, completion rates, error tracking, and emergency status banner.
2. **Algorithm Version Registry**: Version management, status progression, hyperparameters inspector, and safe activation / rollback.
3. **Blueprint & Policy Studio**: Min/max question limits, target test durations, difficulty step parameters, and stopping thresholds.
4. **Calibration Bank Explorer**: Visibility into question calibration statuses (`uncalibrated`, `provisional`, `calibrated`, `flagged`), sample sizes, and empirical metrics.
5. **Safety & Emergency Controls**: Global kill-switch, emergency fallback policy selector, and exposure ceiling limits.
6. **Audit Trail Explorer**: Filterable historical log of all administrative actions with actor details, timestamps, and before/after diffs.

---

## 13. Database Schema & RLS Matrix

| Table | SELECT | INSERT | UPDATE | DELETE |
| :--- | :--- | :--- | :--- | :--- |
| `adaptive_algorithm_versions` | Authenticated (Active/Testing) | Service Role / Admin | Service Role / Admin | Disabled / Service Role |
| `adaptive_item_calibrations` | Authenticated | Service Role / Admin | Service Role / Admin | Service Role / Admin |
| `adaptive_system_configs` | Authenticated (Active) | Service Role / Admin | Service Role / Admin | Service Role / Admin |
| `adaptive_test_configs` | Authenticated (Active) | Service Role / Admin | Service Role / Admin | Service Role / Admin |
| `adaptive_attempt_states` | Own User ID / Admin | Service Role | Service Role | Service Role |
| `adaptive_question_decisions` | Own User ID / Admin | Service Role | Blocked (Trigger) | Blocked (Trigger) |
| `admin_audit_logs` | Service Role / Admin | Service Role / Admin | Blocked (Trigger) | Blocked (Trigger) |

---

## 14. Candidate Experience & UI Principles

- **Single Unified Player**: Candidate plays adaptive tests seamlessly inside the Common Mock Player UI (`/mock/[testId]/take`) without jarring redirects.
- **Adaptive Badge & Progress**: Clear indicator of current step, questions answered, and remaining test time without revealing real-time ability fluctuations that cause test anxiety.
- **Resilience Across Disruptions**: Tab close, browser refresh, network reconnect, and double-clicks are handled idempotently with server state recovery.

---

## 15. Phased Roadmap

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 4A: Database Foundation & Schema Setup (COMPLETE)                 │
├─────────────────────────────────────────────────────────────────────────┤
│ Phase 4B: Adaptive Decision Engine Services (COMPLETE)                  │
├─────────────────────────────────────────────────────────────────────────┤
│ Phase 4C: Attempt Lifecycle, Step API, Player UI & Hardening (COMPLETE) │
├─────────────────────────────────────────────────────────────────────────┤
│ Phase 4D.1: Advanced Architecture & Complete Admin Center (CURRENT)     │
├─────────────────────────────────────────────────────────────────────────┤
│ Phase 4D.2: Offline Psychometric Calibration & 1PL/2PL Models (FUTURE)  │
├─────────────────────────────────────────────────────────────────────────┤
│ Phase 4D.3: Multidimensional CAT, Sympson-Hetter & MST (FUTURE)        │
└─────────────────────────────────────────────────────────────────────────┘
```
