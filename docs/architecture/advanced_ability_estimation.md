# Courage Library — Advanced Ability Estimation Engine
## Phase 4D.3 Architecture & Engineering Specification

> [!IMPORTANT]
> **Explicit Engineering Guarantee**:
> Phase 4D.3 implements a **deterministic regularized 1PL / Rasch-style ability estimator** with a bounded Newton-Raphson numerical solver and Fisher information measurement precision. It is **not yet a full Computerized Adaptive Testing (CAT) selection engine** (which arrives in Phase 4D.4) and does not use empirically calibrated discrimination ($a$) or pseudo-guessing ($c$) parameters. Discrimination $a = 1.0$ is used solely as a mathematical model constant and is never stored as fabricated item metadata.

---

## 1. Objective & Purpose
The primary objective of Phase 4D.3 is to transition Courage Library's adaptive assessment engine from a heuristic step-size ability updater ($\Delta \theta = \frac{0.8}{\sqrt{k}}(y - P)$) into a **statistically principled, regularized logistic maximum a posteriori (MAP-like) ability estimator**.

```
    RESPONSE (y_i in {0, 1})
               │
               ▼
    ITEM PARAMETERS (b_i from Phase 4D.2 Calibration)
               │
               ▼
    REGULARIZED 1PL ESTIMATION ENGINE
               │
       ┌───────┴───────┐
       ▼               ▼
    THETA (θ)       STANDARD ERROR (SE)
       │               │
       └───────┬───────┘
               ▼
    ADAPTIVE ATTEMPT STATE & IMMUTABLE HISTORY
               │
               ▼
    FUTURE QUESTION SELECTION (Phase 4D.4 CAT)
```

---

## 2. Mathematical Formulation

### 2.1 Item Response Probability (Logistic Model)
For item $i$ with difficulty location parameter $b_i$:
$$P_i(\theta) = \sigma(\theta - b_i) = \frac{1}{1 + e^{-(\theta - b_i)}}$$
where $\theta \in [-3.0, +3.0]$ and $b_i \in [-3.0, +3.0]$.

### 2.2 Regularized Log-Likelihood Objective
For a response sequence $\{y_1, y_2, \dots, y_k\}$ where $y_i \in \{0, 1\}$:
$$\mathcal{L}(\theta) = \sum_{i=1}^k \left[ y_i \ln P_i(\theta) + (1 - y_i) \ln(1 - P_i(\theta)) \right] - \frac{\lambda}{2} \theta^2$$
- **Regularization Parameter ($\lambda$)**: Default $\lambda = 0.20$.
- Regularization anchors the estimate toward prior mean $\theta_0 = 0.0$, guaranteeing finite, non-divergent solutions even for all-correct ($y_i = 1 \ \forall i$) or all-incorrect ($y_i = 0 \ \forall i$) response strings or very short sequences ($k = 1, 2$).

### 2.3 Likelihood Gradient ($g(\theta)$)
$$g(\theta) = \frac{\partial \mathcal{L}}{\partial \theta} = \sum_{i=1}^k \left( y_i - P_i(\theta) \right) - \lambda \theta$$

### 2.4 Likelihood Hessian ($H(\theta)$)
$$H(\theta) = \frac{\partial^2 \mathcal{L}}{\partial \theta^2} = -\sum_{i=1}^k P_i(\theta)(1 - P_i(\theta)) - \lambda$$
- Since $P_i(1 - P_i) \in (0, 0.25]$ and $\lambda > 0$, $H(\theta) < 0$ strictly for all $\theta \in \mathbb{R}$.
- This guarantees that $\mathcal{L}(\theta)$ is **strictly concave** with a unique global maximum.

---

## 3. Bounded Newton-Raphson Numerical Solver

The root of $g(\theta) = 0$ is found iteratively via Newton-Raphson:
$$\theta^{(t+1)} = \operatorname{clamp}\left( \theta^{(t)} - \frac{g(\theta^{(t)})}{H(\theta^{(t)})}, \theta_{\min}, \theta_{\max} \right)$$

### Numerical Hyperparameters:
- **Maximum Iterations**: $T_{\max} = 25$
- **Convergence Tolerance**: $\epsilon = 10^{-4}$ (terminates when $|\theta^{(t+1)} - \theta^{(t)}| < \epsilon$ or $|g(\theta)| < \epsilon$)
- **Bound Clamping**: $[\theta_{\min}, \theta_{\max}] = [-3.0, +3.0]$
- **Numerical Safety**: Finite-number assertions guard against `NaN`, `Infinity`, non-finite arithmetic, and division by zero. If a non-convergent condition is encountered, the algorithm smoothly falls back to the previous stable estimate.

---

## 4. Measurement Precision & Standard Error (SE)

Measurement precision is derived from the effective Fisher information:
$$\mathcal{I}_{\text{effective}}(\theta) = \sum_{i=1}^k P_i(\theta)(1 - P_i(\theta)) + \lambda$$
$$\operatorname{SE}(\theta) = \operatorname{clamp}\left( \frac{1}{\sqrt{\mathcal{I}_{\text{effective}}(\theta)}}, \operatorname{SE}_{\min}, \operatorname{SE}_{\max} \right)$$
- **Bounds**: $[\operatorname{SE}_{\min}, \operatorname{SE}_{\max}] = [0.10, 1.00]$.
- As response count $k$ increases, effective information accumulates monotonically, decreasing $\operatorname{SE}(\theta)$ toward the measurement threshold.

---

## 5. Difficulty Parameter ($b$) Resolution Hierarchy

To integrate with Phase 4D.2 calibration without fabricating parameters:
1. **Priority 1 (Calibrated)**: If $qv$ has an active calibration record with `status = 'calibrated'` and $b \in [-3.0, +3.0]$, use empirical calibrated $b$ (`source = 'CALIBRATED'`).
2. **Priority 2 (Provisional)**: If `status = 'provisional'` and blueprint policy permits, use provisional $b$ (`source = 'PROVISIONAL'`).
3. **Priority 3 (Static Baseline Fallback)**: If `status = 'uncalibrated'` or `flagged`, map author difficulty tier (`easy` $\to -1.0$, `medium` $\to 0.0$, `hard` $\to +1.0$) (`source = 'STATIC_FALLBACK'`).
4. **Exclusion (Deprecated)**: Items marked `deprecated` are excluded from selection.

---

## 6. Cold Start vs. Warm Start Policy

- **Cold Start (Default)**: Initial ability is initialized to $\theta_0 = 0.0, \operatorname{SE}_0 = 1.0$.
- **Warm Start (Policy-Controlled)**: When enabled by configuration and an established `user_adaptive_profiles` record exists for the candidate and target exam:
  $$\theta_{\text{start}} = \operatorname{clamp}(\theta_{\text{profile}}, \text{warm\_start\_min}, \text{warm\_start\_max})$$
  Default warm-start bounds: $[-2.0, +2.0]$. Prevents historical extremes from skewing new test sessions.

---

## 7. Subject Ability Breakdown vs. Topic Mastery

- **Latent Ability ($\theta_{\text{subject}}$)**: Estimated by running the regularized 1PL estimator over the candidate's responses restricted to that subject's items.
- **Topic Mastery**: Remains the empirical ratio / weighted performance metric computed in Phase 4B. Topic mastery and latent ability operate side-by-side without collision.

---

## 8. Immutable Estimation History (`adaptive_ability_estimation_history`)

Every adaptive step submission records an immutable audit snapshot:
- `attempt_id`, `step_number`, `question_version_id`, `user_id`
- `theta_before`, `theta_after`, `se_before`, `se_after`
- `estimator_version` (`estimator_v1_regularized_1pl`)
- `difficulty_source` (`CALIBRATED`, `PROVISIONAL`, `STATIC_FALLBACK`)
- `difficulty_b`, `is_correct`, `converged`, `iterations`, `effective_information`
- Protected against `UPDATE` and `DELETE` via database trigger `trg_prevent_ability_estimation_history_mutation`.

---

## 9. Admin Control Center & Telemetry

Accessible at `/admin/adaptive` under the **Ability Estimation** tab:
1. **Estimator Configuration**: View and modify active estimator, $\lambda$, $\theta$ bounds, $\operatorname{SE}$ bounds, convergence tolerance, max iterations, and warm-start policies.
2. **Estimator Health & Convergence**: Real-time KPI metrics tracking total estimations, convergence rate, average iterations, average $\theta$, and average $\operatorname{SE}$.
3. **Ability Explorer**: Searchable and filterable attempt explorer showing candidate abilities, precision, and attempt statuses.
4. **Attempt Ability Detail**: Modal displaying complete step-by-step $\theta / \operatorname{SE}$ trajectory and response timelines.

---

## 10. Backward Compatibility & Algorithm Versioning

- Historical attempts completed under `v1_heuristic` retain their original ability states without retroactive recalculation.
- The new estimator is identified as `estimator_v1_regularized_1pl` in `adaptive_algorithm_versions` and applies to new adaptive sessions according to configuration.

---

## 11. Security & Candidate Isolation
- Candidates have **zero access** to internal psychometric parameters ($\theta$, $\operatorname{SE}$, item $b$, calibration status, information).
- Candidates view only user-friendly progress indicators (e.g. "Difficulty adapting to your performance").
- All estimation and parameter grading is strictly server-authoritative.
