# COURAGE LIBRARY — MISTAKE VAULT PHASE 6 TASK 2 ARCHITECTURE
## Deep Error Decay & Longitudinal Revision Memory Engine

### 1. Executive Summary & Production Scope
Phase 6 Task 2 implements a deterministic, explainable **Longitudinal Error-Decay & Revision Memory Engine** on top of the certified Mistake Vault foundation (Phases 1–4E) and Adaptive Testing Engine (Phase 4D.1–4D.7).
The engine provides candidate-facing longitudinal retention indicators, schedule state recommendations, repeated-forgetting detection, and mistake velocity telemetry without introducing new database tables, schema migrations, or altering certified baseline scoring formulas.

---

### 2. Theoretical vs. Engineering Classification
- **System Classification**: Deterministic revision-retention / error-decay heuristic.
- **Explicit Non-Cognitive Boundary**:
  - The retention score $R(t)$ is an **educational scheduling heuristic** designed for prioritization and triage within the Courage Library.
  - It is **not** a biologically or psychologically validated memory model, nor an exact cognitive Ebbinghaus prediction of human memory forgetting curves.
  - $\text{RetentionRisk} = 1.0000 - R(t)$ is strictly designated as a **"Deterministic retention-risk / revision-urgency signal"**. It is **never** described as a probability, probability of forgetting, probability of knowledge attenuation, scientifically measured retention, or psychological certainty.
- **Explainability**: Every derived state and urgency score is deterministically computed from observable timestamp deltas, attempt lineages, and consecutive success streaks.

---

### 3. Error-Decay Mathematical Formulation & Bounds

#### A. Formula Definition
$$R(t) = \exp\left(-\frac{t}{S_{\text{effective}}}\right) = \exp\left(-\frac{\max(0, t)}{S_{\text{base}} \cdot (1 + \mu \cdot \min(\max(0, C), C_{\text{max}}))}\right)$$

#### B. Parameter Boundaries & Values
- **Elapsed Time ($t$)**: Time in fractional days since the authoritative lifecycle anchor timestamp. Safeguarded as $\max(0, \text{elapsedDays})$. Null, negative, NaN, or future timestamps default safely to $t = 0$ ($R(t) = 1.0000$).
- **Base Stability ($S_{\text{base}}$)**:
  - `UNRESOLVED`: $2.0\text{ days}$
  - `REVISITING`: $4.0\text{ days}$
  - `MASTERED`: $14.0\text{ days}$
- **Consecutive Correct Streak ($C$)**: Active consecutive remediation streak, clamped to $C_{\text{effective}} = \min(\max(0, C), 5)$.
- **Spacing Multiplier ($\mu$)**: $\mu = 0.50$, rewarding each successful spaced recall step with a $50\%$ stability increase up to 5 steps ($3.5\times$ base stability).
- **Effective Stability Floor**: $S_{\text{effective}} \ge 0.5\text{ days}$ (prevents division by zero or negative denominator).
- **Retention Score Output ($R(t)$)**: Clamped strictly to $[0.0000, 1.0000]$ formatted to 4 decimal places.
- **Retention Risk Signal**: $\text{RetentionRisk} = 1.0000 - R(t)$ (Deterministic retention-risk / revision-urgency signal).

---

### 4. Authoritative Timestamp Semantics by Lifecycle Anchor

Decay time $t$ is anchored strictly to distinct, authoritative lifecycle timestamps:

| Lifecycle Status | Authoritative Anchor Timestamp | Architectural Semantic & Rationale |
| :--- | :--- | :--- |
| `UNRESOLVED` | `last_remediated_at` (if partial drill) OR `last_mistake_at` | Measures time elapsed since the original error without resolution. A new repeated mistake does **not** make the item appear "fresh" because recurrence ($\ge 2$) keeps the item urgently `DUE_NOW`/`OVERDUE`. |
| `REVISITING` | `last_remediated_at` / `last_drill_at` | Measures elapsed time since the last successful remediation step that achieved progress ($C \ge 1$) toward mastery. |
| `MASTERED` | `mastered_at` (or `last_drill_at` if refreshed) | Measures elapsed time since mastery verification ($C = 2$). |

---

### 5. Derived State Precedence & Explicit Boundary Matrix

The engine maps continuous decay scores to discrete presentation states using strict deterministic precedence:

#### A. Precedence for `UNRESOLVED` / `REVISITING`
1. **`OVERDUE`** (Evaluated First):
   - Condition: $R(t) < 0.35$ OR $\text{daysSinceLastRevision} > 2 \cdot S_{\text{effective}}$
   - Rationale: High knowledge decay; requires urgent attention.
2. **`DUE_NOW`** (Evaluated Second):
   - Condition: $R(t) < 0.60$ OR $\text{totalMistakes} \ge 2$ OR $\text{daysSinceLastRevision} \ge S_{\text{effective}}$
   - Rationale: Retention risk elevated or repeated slip requiring prompt drill re-testing.
3. **`DUE_SOON`** (Evaluated Third):
   - Condition: $R(t) < 0.85$ ($0.60 \le R(t) < 0.85$)
   - Rationale: Approaching scheduled spaced practice window.
4. **`NOT_DUE`** (Evaluated Last):
   - Condition: $R(t) \ge 0.85$
   - Rationale: Recently practiced; retaining active revision momentum.

#### B. Precedence for `MASTERED`
1. **`REFRESH_DUE`** (Evaluated First):
   - Condition: $\text{daysSinceMastered} \ge 14.0$ OR $R(t) < 0.50$
   - Rationale: Spaced maintenance milestone reached for mastered item.
2. **`DUE_SOON`** (Evaluated Second):
   - Condition: $R(t) < 0.75$
   - Rationale: Retention stable; refresh approaching.
3. **`NOT_DUE`** (Evaluated Last):
   - Condition: $R(t) \ge 0.75$
   - Rationale: Strong retention stability.

#### C. Verified State Boundary Test Matrix
- $R = 0.90 \rightarrow$ `NOT_DUE`
- $R = 0.85 \rightarrow$ `NOT_DUE` (Boundary: $R \ge 0.85$)
- $R = 0.84 \rightarrow$ `DUE_SOON` ($0.60 \le R < 0.85$)
- $R = 0.60 \rightarrow$ `DUE_SOON` ($0.60 \le R < 0.85$)
- $R = 0.59 \rightarrow$ `DUE_NOW` ($0.35 \le R < 0.60$)
- $R = 0.35 \rightarrow$ `DUE_NOW` ($0.35 \le R < 0.60$)
- $R = 0.34 \rightarrow$ `OVERDUE` ($R < 0.35$)
- $R = 0.00 \rightarrow$ `OVERDUE` ($R < 0.35$)
- `MASTERED` $+ t \ge 14\text{ days} \rightarrow$ `REFRESH_DUE` (`isRefreshDue: true`)
- `MASTERED` $+ t < 14\text{ days} \rightarrow$ `NOT_DUE`

---

### 6. Repeated-Forgetting Forensic Chronology

The engine detects true educational relapse based on chronological evidence from `user_mistake_occurrences` and `user_mistake_drills`:

- **Case A: Relapse after Remediation**: Initial Mistake $\rightarrow$ Successful remediation ($C \ge 1$) $\rightarrow$ Later Mistake = **DETECTED** (`hasRepeatedForgetting: true`).
- **Case B: Persistent Unresolved Difficulty**: Repeated mistakes with NO intervening successful remediation ($C = 0$ throughout) = **NOT Relapse** (`hasRepeatedForgetting: false`, `explanation: "Persistent unresolved error"`).
- **Case C: Unrelated Correct Answer**: Correct answer without deliberate remediation context does not count as verified mastery.
- **Case D: Relapse after Mastery**: Concept was `MASTERED` (`mastered_at` recorded) $\rightarrow$ Later Mistake = **DETECTED** (`hasRepeatedForgetting: true`).
- **Case E: Revoked Occurrence Exclusion**: Records with `occurrence_status = 'REVOKED_ERRATA'` or `'REVOKED_VOID'` are strictly excluded before evaluation.
- **Case F: Multi-Tenant Isolation**: All queries enforce strict `auth.uid()` scoping via Supabase RLS.

---

### 7. Canonical Protected Baseline (14 Tables)

The canonical protected baseline for Courage Library Mistake Vault & Assessment Engine comprises exactly 14 tables:
1. `mock_tests` (8 rows)
2. `mock_sections` (14 rows)
3. `mock_questions` (350 rows)
4. `mock_templates` (8 rows)
5. `test_attempts` (31 rows)
6. `test_results` (10 rows)
7. `attempt_answers` (200 rows)
8. `questions` (103 rows)
9. `question_versions` (103 rows)
10. `question_options` (412 rows)
11. `question_answers` (103 rows)
12. `subscription_plans` (1 row)
13. `coin_wallets` (5 rows)
14. `coin_ledger` (8 rows)

All 14 tables were audited pre- and post-test and verified 100% row-count preserved.

---

### 8. Certified Baseline Formula Invariance

Phase 6 Task 2 preserves all certified baseline formulas with zero modifications:
1. **Mistake Priority Index (MPI)**:
   $$\text{MPI} = 0.35 \cdot R + 0.30 \cdot U + 0.20 \cdot R_c + 0.15 \cdot G \quad (\text{Strictly Intact})$$
2. **Phase 4 Revision Priority**:
   $$\text{RevisionPriority} = \text{clamp}\Big(0.70 \cdot \text{MPI} + 0.15 \cdot \text{DueUrgency} + \text{Bonus} - \text{Fatigue}, 0.0, 1.0\Big) \quad (\text{Strictly Intact})$$

Decay signals remain strictly separate from these certified formulas and are not injected into Revision Priority.
