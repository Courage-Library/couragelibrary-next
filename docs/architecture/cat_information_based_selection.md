# Courage Library — CAT / Information-Based Adaptive Item Selection Architecture
## Phase 4D.4 Technical Specification

---

## 1. Executive Summary & Objective

Phase 4D.4 establishes the production-grade **Computerized Adaptive Testing (CAT) Item Selection Layer** for Courage Library. Building directly on top of the calibrated item difficulty parameters ($b_i$) from Phase 4D.2 and the server-authoritative regularized MAP ability estimator ($\hat{\theta}$) from Phase 4D.3, this subsystem replaces heuristic target-difficulty matching with an exact, information-theoretic item selection engine based on the **1PL / Rasch Model Fisher Information Function**.

At every adaptive step $k$:
1. The candidate ability estimate $\hat{\theta}_{k-1}$ is retrieved from the immutable session state.
2. Candidate questions are queried, filtered against exposure history and exclusions, and evaluated.
3. For each eligible item, 1PL Fisher Information $I_i(\hat{\theta}_{k-1})$ is computed and normalized into $[0.0, 1.0]$.
4. A multi-objective composite score is computed integrating:
   - **Normalized Fisher Information ($I_{\text{norm}}$)**
   - **Content & Blueprint Balancing ($C_i$)**
   - **Topic Exploration Value ($E_i$)**
   - **Mistake Vault Reinforcement ($M_i$)**
   - **Item Exposure Regulation ($\text{Exp}_i$)**
5. Topic streak mitigation dampens questions from recently repeated topics to preserve test breadth.
6. A 4-level candidate pool exhaustion fallback relaxation hierarchy guarantees 100% item availability.
7. Fully deterministic tie-breaking ensures 100% reproducibility in audit verification.

---

## 2. Theoretical Mathematical Formulation (1PL / Rasch)

Under the 1-Parameter Logistic (1PL / Rasch) Item Response Theory model:
- Item Discrimination parameter: $a = 1.0$ (model constant).
- Pseudo-guessing parameter: $c = 0.0$ (model constant).
- Calibrated item difficulty: $b_i \in [-3.0, +3.0]$.
- Candidate ability: $\theta \in [-3.0, +3.0]$.

### Probability of Correct Response:
$$P_i(\theta) = \sigma(\theta - b_i) = \frac{1}{1 + e^{-(\theta - b_i)}}$$
$$Q_i(\theta) = 1 - P_i(\theta) = \frac{e^{-(\theta - b_i)}}{1 + e^{-(\theta - b_i)}}$$

### Fisher Information Function:
$$I_i(\theta) = P_i(\theta) \cdot Q_i(\theta) = P_i(\theta)(1 - P_i(\theta))$$

### Mathematical Properties:
1. **Maximum Information Peak**:
   At $\theta = b_i$, $P_i(\theta) = 0.5$, yielding the maximum theoretical Fisher information:
   $$I_i(b_i) = 0.5 \times 0.5 = 0.25$$
2. **Symmetry**:
   $I_i(b_i + \delta) = I_i(b_i - \delta)$ for any distance $\delta$.
3. **Monotonic Drop-off**:
   As $|\theta - b_i| \to \infty$, $I_i(\theta) \to 0$.

### Normalized Fisher Information Metric:
$$I_{\text{norm}, i}(\theta) = \frac{I_i(\theta)}{0.25} = 4 \cdot P_i(\theta)(1 - P_i(\theta)) \in [0.0, 1.0]$$

When an item is perfectly targeted to candidate ability ($\theta = b_i$), $I_{\text{norm}, i} = 1.0$.

---

## 3. Multi-Objective Composite Ranking Model

To ensure both psychometric precision and curricular validity, the CAT selector computes an additive weighted composite score:

$$\text{Score}_i = w_{\text{info}} \cdot I_{\text{norm}, i} + w_{\text{content}} \cdot C_i + w_{\text{expl}} \cdot E_i + w_{\text{mistake}} \cdot M_i + w_{\text{exposure}} \cdot \text{Exp}_i$$

### Component Definitions:
1. **Normalized Fisher Information ($I_{\text{norm}, i}$)**:
   $$I_{\text{norm}, i} = 4 \cdot P_i(\theta)(1 - P_i(\theta))$$
2. **Content / Blueprint Balance Score ($C_i$)**:
   Measures remaining topic quota need:
   $$C_i = \max\left(0, \frac{\text{TargetQuota}_T - \text{ServedCount}_T}{\text{TargetQuota}_T}\right)$$
   (Defaults to $1.0$ if under topic limit, $0.0$ if topic capacity exceeded).
3. **Exploration Score ($E_i$)**:
   Encourages broad curriculum coverage during early steps:
   $$E_i = \begin{cases} 1.0 & \text{if topic } T \text{ has not been served yet in attempt} \\ 0.2 & \text{if topic } T \text{ has already been served} \end{cases}$$
4. **Mistake Vault Weakness Bonus ($M_i$)**:
   Reinforces candidate learning by prioritizing questions from candidate's historical mistake library:
   $$M_i = \begin{cases} 1.0 & \text{if question } i \in \text{MistakeVault}(\text{user}) \\ 0.0 & \text{otherwise} \end{cases}$$
5. **Exposure Control Score ($\text{Exp}_i$)**:
   Penalizes over-exposed items to prevent item exhaustion and memorization:
   $$\text{Exp}_i = 1.0 - \min\left(1.0, \frac{\text{GlobalExposureCount}_i}{\text{MaxExposureCeiling}}\right)$$

### Default Weights:
- $w_{\text{info}} = 0.40$
- $w_{\text{content}} = 0.25$
- $w_{\text{expl}} = 0.15$
- $w_{\text{mistake}} = 0.10$
- $w_{\text{exposure}} = 0.10$
- $\sum w = 1.00$

---

## 4. Topic Streak & Anti-Fatigue Dampening

To avoid cognitive fatigue and preserve test realism:
- **Maximum Consecutive Topic Streak**: $\text{Streak}_{\text{max}} = 3$ (configurable).
- If the previous $K \ge \text{Streak}_{\text{max}}$ consecutive steps were all served from Topic $T$, candidate questions from Topic $T$ receive a streak dampening factor ($\text{StreakPenalty} = 0.70$) or are gated unless no alternative topic candidates exist.

---

## 5. Candidate Pool Exhaustion Fallback Hierarchy

When filtering candidate pools with strict constraints, small question banks could encounter empty candidate sets. The engine implements a strict 4-level deterministic relaxation cascade:

```
[Level 1: Strict CAT Information Selection]
- Topic Streak respected (< StreakMax)
- Topic Max Capacity respected
- Calibrated items preferred
        │ (if candidates == 0)
        ▼
[Level 2: Relaxed Topic Streak]
- Allow items from current streak topic
- Topic Max Capacity respected
        │ (if candidates == 0)
        ▼
[Level 3: Relaxed Topic Capacity]
- Allow items from any topic exceeding max_per_topic
        │ (if candidates == 0)
        ▼
[Level 4: Static Difficulty Tier Fallback]
- Use uncalibrated questions mapped by static difficulty tier
```

---

## 6. Deterministic Tie-Breaking & Auditability

When two candidate items achieve identical composite scores (up to 4 decimal places):
1. Candidate items are sorted by `total_score DESC`.
2. Tie-breaker: `question_version_id ASC` (lexicographical string comparison).
3. Selection decisions are recorded in `adaptive_question_decisions` with complete explainable metadata payloads, ensuring 100% reproducible audit replay.

---

## 7. Zero Answer-Key Leakage & Security Boundary

- All item information calculations, composite score evaluations, and candidate rankings execute strictly within server-authoritative service boundaries.
- The client receives only `SafeAdaptiveQuestionPayload` containing question prompt, options (shuffled, without `is_correct`), and step identifiers.
- Internal metrics ($I_i(\theta)$, composite score, decision rationales) are written exclusively to server audit tables.
