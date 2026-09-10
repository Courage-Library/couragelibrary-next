# Courage Library — Advanced Stopping & Personalization Architecture
## Phase 4D.5 Technical Specification

---

## 1. Executive Summary & Objective

Phase 4D.5 establishes the production-grade **Advanced Stopping & Personalization layer** for Courage Library. This subsystem coordinates server-authoritative termination criteria and bounded curriculum personalization while maintaining the mathematical primacy of the **1PL / Rasch Model CAT Selection Engine** established in Phase 4D.4.

The core principle:
> **Personalization modulates priorities; it never replaces CAT. Stopping decisions evaluate structured psychometric evidence and content completeness with strict deterministic precedence.**

---

## 2. Conceptual Separation of Concerns

The architecture strictly separates six orthogonal responsibilities:

```
┌─────────────────────────────┐
│ 1. ABILITY (θ)              │ Latent candidate competence [-3.0, +3.0]
├─────────────────────────────┤
│ 2. MEASUREMENT PRECISION    │ Standard Error (SE) and Fisher Information
├─────────────────────────────┤
│ 3. TOPIC MASTERY (M_T)      │ Laplace-smoothed topic proficiency [0.0, 1.0]
├─────────────────────────────┤
│ 4. PERSONALIZATION          │ Bounded educational priorities (weakness, exploration, mistakes)
├─────────────────────────────┤
│ 5. STOPPING RULES           │ Psychometric & blueprint completion gates
├─────────────────────────────┤
│ 6. CAT SELECTION            │ 1PL Fisher Information item targeting
└─────────────────────────────┘
```

---

## 3. Advanced Stopping Engine (`AdaptiveStoppingService`)

The stopping engine evaluates whether an adaptive attempt should terminate or continue at step $k$.

### Structured Decision Model:
```typescript
export interface StoppingDecision {
  shouldStop: boolean;
  reasonCode: StoppingReasonCode;
  rationale: string;
  questionsAnswered: number;
  minQuestionsSatisfied: boolean;
  maxQuestionsReached: boolean;
  targetSESatisfied: boolean;
  blueprintSatisfied: boolean;
  topicCoverageSatisfied: boolean;
  diminishingInformation: boolean;
  evaluatedAt: string;
}
```

### Deterministic Evaluation Precedence:

Stopping conditions are evaluated in strict priority order:

1. **`SYSTEM_SAFETY_STOP`** (`shouldStop = true`):
   Triggered if emergency kill-switch is activated or unrecoverable error occurs.
2. **`ATTEMPT_EXPIRED`** (`shouldStop = true`):
   Triggered if candidate session duration exceeds configured test duration limit.
3. **`MAX_QUESTIONS_REACHED`** (`shouldStop = true`):
   Authoritative hard ceiling ($k \ge \text{max\_questions}$). The test terminates immediately regardless of SE or blueprint state.
4. **`NO_ELIGIBLE_ITEMS`** (`shouldStop = true`):
   Triggered if question bank candidate pool is fully exhausted under all relaxation levels.
5. **`MIN_QUESTIONS_NOT_REACHED`** (`shouldStop = false`):
   **Continuation Gate**: If $k < \text{min\_questions}$, the test **MUST continue** even if $\text{SE} \le \text{target\_se}$ or diminishing information is observed.
6. **`BLUEPRINT_INCOMPLETE`** (`shouldStop = false`):
   **Continuation Gate**: If subject/section quota requirements are unmet, test **MUST continue** unless `max_questions` is reached.
7. **`TOPIC_COVERAGE_INCOMPLETE`** (`shouldStop = false`):
   **Continuation Gate**: If essential topic coverage minimums are unmet, test **MUST continue**.
8. **`TARGET_SE_ACHIEVED`** (`shouldStop = true`):
   Triggered when $k \ge \text{min\_questions} \land \text{SE} \le \text{target\_se} \land \text{blueprint complete}$.
9. **`DIMINISHING_INFORMATION`** (`shouldStop = true`):
   Triggered when $k \ge \text{min\_questions} \land \text{blueprint complete} \land \text{recent information contribution} < \text{threshold}$ over a sliding window.
10. **`CONTINUE`** (`shouldStop = false`):
    Default state indicating normal assessment progression.

---

## 4. Diminishing Information Contribution Detector

To prevent candidate fatigue when additional items yield negligible measurement value:
- Tracks recent Fisher information contributions over a sliding window $W$ (default $W = 5$ steps).
- Computes average contribution:
  $$\bar{I}_{\text{recent}} = \frac{1}{W} \sum_{j=k-W+1}^{k} I_j(\hat{\theta}_{j-1})$$
- If $\bar{I}_{\text{recent}} < \tau_{\text{info}}$ (default $\tau = 0.05$) AND $k \ge \text{min\_questions}$ AND blueprint requirements are met:
  $$\text{DiminishingInformation} = \text{true} \implies \text{STOP}$$

> [!NOTE]
> Diminishing information is strictly an early stopping criterion for completed blueprints; it is never permitted to stop before `min_questions` or with incomplete blueprints.

---

## 5. Bounded Personalization Engine (`AdaptivePersonalizationService`)

The personalization engine computes bounded candidate guidance signals consumed by the CAT selector.

### Key Personalization Signals (Each Bounded in $[0.0, 1.0]$):
1. **Weak-Area Priority ($W_T$)**:
   Derived from Bayesian Laplace-smoothed topic mastery $M_T$:
   $$W_T = \max(0.0, 1.0 - M_T) \in [0.0, 1.0]$$
2. **Mistake Vault Reinforcement ($M_i$)**:
   Identifies questions from candidate's unresolved Mistake Vault entries ($1.0$ if present, $0.0$ otherwise).
3. **Exploration Priority ($E_T$)**:
   Prioritizes unserved curriculum areas ($1.0$ for unserved topics, $0.2$ for served topics).
4. **Subject Balance Weight ($S_B$)**:
   Measures remaining subject quota need based on exam blueprint targets.

### Personalization Influence Cap:
To guarantee that educational personalization cannot degrade psychometric measurement quality:
- Total personalization influence is bounded by $\gamma_{\text{max}} = 0.40$.
- 1PL Fisher Information remains the principal anchor ($w_{\text{info}} \ge 0.40$).
- Personalization can never:
  - Select deprecated or inactive questions.
  - Bypass global item exposure ceilings.
  - Bypass language, pattern, or exam constraints.
  - Bypass topic streak anti-fatigue limits.

---

## 6. Cold Start vs. Warm Start Profile Integration

1. **Cold Start Candidates** ($N_{\text{history}} < 5$ questions):
   - Personalization signals are set to neutral baseline ($W_T = 0.5, M_i = 0.0, E_T = 1.0$).
   - Initial $\theta = 0.0, \text{SE} = 1.0$.
2. **Warm Start Candidates** ($N_{\text{history}} \ge 5$ questions):
   - Integrates historical subject ability and topic mastery from `user_adaptive_profiles`.
   - Weak areas and Mistake Vault entries modulate candidate item ranking with bounded influence.

---

## 7. Versioning & Immutable Attempt Retention

1. **Algorithm & Policy Versions**:
   - `stopping_v1_deterministic`
   - `personalization_v1_balanced`
2. **Attempt Policy Retention**:
   - Every adaptive attempt records `stopping_policy_version` and `personalization_policy_version` at initialization in `adaptive_attempt_states`.
   - Ongoing attempts execute under their locked creation policy; future admin configuration changes apply exclusively to newly initialized attempts.

---

## 8. Server Authority & Zero Leakage Security

- All stopping and personalization calculations occur strictly on the server.
- Candidates receive only safe question payloads without $\theta$, SE, Fisher information, mastery scores, or stopping rationale.
- Final attempt completion seamlessly generates standard Result Engine outputs and Mistake Vault updates.
