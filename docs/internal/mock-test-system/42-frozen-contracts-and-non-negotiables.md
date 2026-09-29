# 42 — Frozen Architectural Contracts & The 12 Sacred Laws

## 1. Architectural Philosophy: The Sacred Invariants

The Courage Library Assessment Engine is governed by **12 Frozen Architectural Laws**. These laws represent non-negotiable boundaries established across multiple production certifications. No feature request, engineering refactoring, or AI coding agent is permitted to violate these laws under any circumstances.

```
                    ┌──────────────────────────────────────────────┐
                    │      THE 12 SACRED ARCHITECTURAL LAWS        │
                    ├──────────────────────────────────────────────┤
                    │  1. Scoring != Psychometrics                 │
                    │  2. Attempt != Result                        │
                    │  3. Question != Question Version             │
                    │  4. Template != Instance                     │
                    │  5. Registration != Attempt                  │
                    │  6. Zero Client Answer Exposure              │
                    │  7. Server Monotonic Time Authority          │
                    │  8. 1-Attempt / IST Day Mutex                │
                    │  9. Manual Next Supremacy                    │
                    │ 10. Direct Pearson Distractor Equivalence    │
                    │ 11. Test SEM != Item Info SE                 │
                    │ 12. McDonald's Omega Quarantine              │
                    └──────────────────────────────────────────────┘
```

---

## 2. Detailed Breakdown of the 12 Sacred Laws

### Law 1: Scoring $\ne$ Psychometrics Separation
- **The Law**: The Scoring Engine and the Psychometrics Engine are strictly decoupled. Scoring computes authoritative candidate marks ($+M, -M, \text{Accuracy}$) synchronously at submission. Psychometrics computes item-level diagnostic parameters ($p, r_{\text{pbis}}, b_i$) asynchronously.
- **Why it Exists**: Psychometric updates must never mutate or delay a candidate's scorecard. If a psychometric model fails, exam scoring remains 100% operational.
- **Failure Mode if Violated**: Item calibration crashes could block candidate result generation; score recalculations could retroactively alter published student marks without audit.

### Law 2: Attempt $\ne$ Result Decoupling
- **The Law**: `test_attempts` represents active, mutable runtime state during test taking. `test_results` represents immutable, evaluated scorecards post-submission.
- **Why it Exists**: Separates high-frequency in-flight write operations from analytical, query-heavy reporting.
- **Failure Mode if Violated**: Mid-exam crashes could corrupt historical analytics; result queries could lock in-progress test attempts.

### Law 3: Question $\ne$ Question Version Immutable Lineage
- **The Law**: Question contents, options, and solutions are stored in immutable `question_versions`. Edits always create a new version with a new UUID.
- **Why it Exists**: Guarantees that historical tests taken in 2024 reproduce the exact text and options evaluated, even if the question is revised in 2026.
- **Failure Mode if Violated**: Editing a typo in 2026 could invalidate historical student attempts or alter answer keys of already scored exams.

### Law 4: Template $\ne$ Instance Distinction
- **The Law**: `mock_templates` defines blueprint rules (sections, mark distributions, timers). `mock_tests` defines resolved, concrete question papers.
- **Why it Exists**: Allows dynamic generation and versioned updates to exam patterns without breaking previously generated instances.
- **Failure Mode if Violated**: Changing an exam blueprint would alter the structure of previously scheduled live or completed tests.

### Law 5: Registration $\ne$ Attempt Boundary (Live Tests)
- **The Law**: Registering for a Live All-India Test (`live_test_registrations`) is separate from starting the attempt (`test_attempts`).
- **Why it Exists**: Candidates may register but not appear. Pre-allocating attempts causes database bloat and corrupts attendance statistics.
- **Failure Mode if Violated**: "No-show" candidates would leave dangling in-progress attempts that fail auto-submit workers.

### Law 6: Zero Client-Side Answer Exposure
- **The Law**: No correct answer keys, solutions, or discriminatory metrics may exist in client JavaScript memory, DOM, network packets, or local storage during an active attempt.
- **Why it Exists**: Prevents browser developer tools and memory inspection cheats.
- **Failure Mode if Violated**: Widespread exam leaks, unfair All-India competition ranks, destruction of platform credibility.

### Law 7: Server Monotonic Time Authority
- **The Law**: Time remaining is computed strictly from `test_attempts.started_at` and server `NOW()`. Client clocks are treated as untrusted.
- **Why it Exists**: Prevents candidates from pausing JavaScript timers or setting system clocks backward to gain extra time.
- **Failure Mode if Violated**: Candidates could exploit infinite exam time by spoofing local timestamps.

### Law 8: 1-Attempt / IST Day Mutex (Daily Mocks)
- **The Law**: Candidates are entitled to exactly one attempt per Daily Mock template per IST calendar date (`00:00:00` to `23:59:59 IST`), enforced via database advisory locks.
- **Why it Exists**: Protects daily practice integrity and gamification coin economics.
- **Failure Mode if Violated**: Rapid multi-tab clicking could allow double attempts, farming unlimited CL Coins.

### Law 9: Manual Next Supremacy (Palette & Navigation)
- **The Law**: Selecting an option does NOT automatically navigate to the next question. Navigation requires an explicit candidate action (Clicking "Save & Next", "Mark for Review", or Palette button).
- **Why it Exists**: Prevents accidental skipping and aligns with national testing norms (NTA, SSC, TCS iON).
- **Failure Mode if Violated**: Candidates accidentally select wrong options on touch screens while scrolling and get prematurely jumped to the next question.

### Law 10: Direct Pearson Distractor Equivalence
- **The Law**: Distractor discrimination $r_{\text{dist}}(k)$ must be mathematically identical to the Pearson correlation between option selection ($X_k \in \{0, 1\}$) and criterion score excluding the focal item ($Y_{(i)} = Y_{\text{total}} - Y_i$).
- **Why it Exists**: Eliminates spurious self-correlation and guarantees mathematical rigor in distractor analysis.
- **Failure Mode if Violated**: High-scoring items would artificially inflate distractor correlations, misclassifying functional distractors as flawed.

### Law 11: Test SEM $\ne$ Item Information SE
- **The Law**: Classical Test Standard Error of Measurement ($\text{SEM}_{\text{test}} = s_X \sqrt{1 - \alpha}$) and IRT Item Information Standard Error ($SE(\hat{\theta}) = 1 / \sqrt{I(\theta)}$) must never be conflated or substituted for one another.
- **Why it Exists**: CTT SEM applies uniformly to the aggregate raw test score; IRT SE is a conditional function of candidate ability $\theta$.
- **Failure Mode if Violated**: Psychometric reports would present invalid confidence intervals to students.

### Law 12: McDonald's Omega Quarantine
- **The Law**: McDonald's $\omega$ (hierarchical / total) is strictly quarantined as `EXPERIMENTAL_RESEARCH`. It is NEVER used as the primary production reliability metric for operational decisions. Cronbach's $\alpha$ is the authoritative standard.
- **Why it Exists**: Single-factor and bifactor CFA estimations can suffer non-convergence or indeterminacy on small samples ($N < 300$).
- **Failure Mode if Violated**: Non-converged factor models could produce `NaN` or uninterpretable reliability flags in production reports.

---

## 3. Change Control & Architecture Amendment Protocol

Any modification to these 12 laws requires a formal **Architecture Decision Record (ADR)**, passing a 7-stage review:
1. Mathematical proof of equivalence or superiority.
2. Zero-regression impact analysis across all 14 baseline tables.
3. Pre-implementation runtime test gate design.
4. Formal review by Lead Psychometrician and System Architect.
5. Implementation inside an isolated feature branch.
6. Execution of 385+ automated certification test assertions.
7. Explicit user authorization and baseline audit sign-off.
