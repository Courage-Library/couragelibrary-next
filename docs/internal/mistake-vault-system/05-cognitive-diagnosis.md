# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 05: COGNITIVE DIAGNOSIS & TAXONOMY

---

## 1. The 7 Canonical Cognitive Error Types

Courage Library structures mistake analysis across a standardized 7-type cognitive taxonomy:

| Type ID | Display Name | Underlying Cognitive Deficit | Recommended Remediation |
|---|---|---|---|
| **`CONCEPTUAL_GAP`** | Conceptual Gap | Theoretical principle misunderstood or misapplied. | Foundational article review, concept notes. |
| **`CALCULATION_SLIP`** | Calculation Slip | Correct method used, but arithmetic or sign error occurred. | Untimed calculation verification drills. |
| **`MISREAD_QUESTION`** | Misread Question | Ignored qualifiers (*NOT*, *EXCEPT*, *INCORRECT*, units). | Keyword highlighting and prompt pacing. |
| **`TIME_PANIC`** | Time Pressure / Rush | Rushed answer due to ticking exam timer or clock stress. | Pacing drills under standard time constraints. |
| **`FORMULA_CONFUSION`** | Formula Confusion | Incorrect formula recalled or wrong variable substituted. | Formula flashcard drills & derivation practice. |
| **`DISTRACTOR_TRAP`** | Distractor Trap | Selected a known high-frequency trap distractor. | Distractor analysis & comparative elimination. |
| **`UNCLASSIFIED`** | Unclassified | Ambiguous or multi-factorial slip without clear signal. | Comprehensive full-solution review. |

---

## 2. Deterministic Telemetry Inference Heuristics

When telemetry is ingested, `inferCognitiveType()` evaluates response parameters:
1. **Time Rush Trigger**: If `response_time_seconds < (question.expected_duration * 0.25)` $ightarrow$ flagged as `TIME_PANIC`.
2. **Distractor Match Trigger**: If `selected_option.is_common_distractor == true` $ightarrow$ flagged as `DISTRACTOR_TRAP`.
3. **Subject Default Rules**: Quantitative errors default to `CALCULATION_SLIP` / `FORMULA_CONFUSION` when time is normal; General Studies errors default to `CONCEPTUAL_GAP`.

---

## 3. Candidate Override Invariant
Candidates retain full agency to override the automated cognitive classification via `updateMistakeCognitiveTypeAction`. The user-specified override (`user_override_cognitive_type_id`) permanently takes precedence over the inferred type in all UI presentations and drill selections.
