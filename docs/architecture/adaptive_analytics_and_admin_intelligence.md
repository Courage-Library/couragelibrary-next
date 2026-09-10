# Courage Library — Phase 4D.6 Architectural Specification
## Adaptive Analytics & Admin Intelligence Layer

### 1. Executive Overview & Scope
Phase 4D.6 builds the production-grade **Adaptive Analytics + Admin Intelligence layer** for the Courage Library adaptive examination system. It transforms operational psychometric telemetry generated across Phases 4D.1 through 4D.5 into actionable, explainable Admin decision support, candidate/item/CAT/ability/stopping/personalization observability, algorithm version comparisons, quality/health monitoring, and attempt diagnostics.

```
+-----------------------------------------------------------------------------------------+
|                                    ADAPTIVE PIPELINE                                    |
|                                                                                         |
|  [Item Bank & Calibration]  -->  [Ability Estimation]  -->  [CAT 1PL Fisher Selection]  |
|            |                              |                             |               |
|            v                              v                             v               |
|  [Item Response Evidence]        [Estimation History]          [Question Decisions]     |
|            |                              |                             |               |
|            +------------------------------+-----------------------------+               |
|                                           |                                             |
|                                           v                                             |
|                             [Adaptive Attempt States]                                   |
|                                           |                                             |
|                                           v                                             |
|                       +---------------------------------------+                         |
|                       |   PHASE 4D.6: ANALYTICS & DIAGNOSTICS |                         |
|                       |   (AdaptiveAnalyticsService)          |                         |
|                       +---------------------------------------+                         |
|                                           |                                             |
|         +-------------------+-------------+-------------+--------------------+          |
|         |                   |                           |                    |          |
|         v                   v                           v                    v          |
|  [Executive KPIs]  [Item Intelligence]         [CAT / Stopping]     [Attempt Diagnostics|
|   - Completion %    - Quality Flags             - Strategy Split     - Step-by-step why |
|   - Final θ / SE    - Drift Alerts              - Terminal vs Gate   - Information/Bias |
|   - Fallback Rate   - Empirical p-value         - Bounded Influence  - Stopping checks  |
+-----------------------------------------------------------------------------------------+
```

---

### 2. Core Architectural Tenets

1. **Strict Server-Authoritative Execution**:
   All metric calculations, statistical aggregations, quality flag evaluations, and diagnostics run server-side within [`AdaptiveAnalyticsService`](file:///e:/Courage%20Library/services/adaptive/adaptive-analytics.service.ts).

2. **Zero Candidate Data Leakage**:
   All psychometric metrics ($\theta$, SE, Fisher information, item discrimination, stopping rationale, candidate mastery vectors, algorithm metadata) are strictly restricted to administrators via `AdminService.checkIsAdminOrStaff()`. Candidate-facing views only receive raw score percentages and standard mock results.

3. **Observational Rigor**:
   All reported metrics are computed from actual attempt and question response records with explicit sample sizes and reliability indicators; no synthetic psychometrics or ungrounded claims.

4. **Continuation vs. Terminal Stopping Separation**:
   Continuation conditions (`MIN_QUESTIONS_NOT_REACHED`, `BLUEPRINT_INCOMPLETE`, `TOPIC_COVERAGE_INCOMPLETE`) are clearly separated from terminal stopping reasons (`MAX_QUESTIONS_REACHED`, `TARGET_SE_ACHIEVED`, `ATTEMPT_EXPIRED`, `DIMINISHING_INFORMATION`, `NO_ELIGIBLE_ITEMS`).

5. **Schema Efficiency**:
   All analytics are derived directly from existing transactional tables without introducing redundant or bloated analytics storage.

---

### 3. Metric Definitions & Formulas

#### 3.1 Executive KPIs
- **Completion Rate (%)**:
  $$\text{Completion Rate} = \frac{N_{\text{completed}} + N_{\text{stopping\_rule\_met}}}{N_{\text{total\_attempts}}} \times 100$$
- **Average & Median Questions Answered**: Calculated from completed attempt sequence lengths.
- **Average & Median Final Ability ($\theta$) and Precision ($\text{SE}$)**:
  $$\overline{\theta} = \frac{1}{N} \sum_{i=1}^N \theta_i, \quad \overline{\text{SE}} = \frac{1}{N} \sum_{i=1}^N \text{SE}_i$$
- **CAT Fallback Rate (%)**:
  $$\text{Fallback Rate} = \frac{N_{\text{decisions}} - N_{\text{strict\_cat\_max\_info}}}{N_{\text{decisions}}} \times 100$$
- **Cold Start Rate (%)**: Percentage of attempts initiated without historical adaptive calibration records.

#### 3.2 Item Intelligence & Quality Flag Taxonomy
- **Empirical Difficulty / $p$-Value**:
  $$p = \frac{\text{Correct Responses}}{\text{Total Responses}}$$
- **Quality Flags**:
  - `LOW_SAMPLE`: Sample size $n < 10$ responses.
  - `HIGH_EXPOSURE`: Exposure count $n > 50$ (potential item wear / memorization risk).
  - `UNSTABLE_RESPONSE_RATE`: $n \ge 15$ with extreme $p < 0.15$ or $p > 0.90$.
  - `CALIBRATION_DRIFT`: Static tier mismatch with calibrated difficulty $b$ (e.g., static Easy with $b > 0.8$ or static Hard with $b < -0.8$).
  - `FLAGGED`: Administrator or automated quality flag actively raised.
  - `DEPRECATED`: Item retired from active CAT selection pools.

#### 3.3 CAT & Ability Intelligence
- **Fisher Information Under 1PL Rasch**:
  $$\mathcal{I}(\theta, b_i) = P_i(\theta)(1 - P_i(\theta)) = \frac{e^{\theta - b_i}}{(1 + e^{\theta - b_i})^2}$$
- **Convergence Rate (%)**: Percentage of Newton-Raphson/MAP estimation cycles converging within tolerance ($\Delta \theta < 0.001$).
- **Ability Buckets**: Grouped into standard standard deviation bands ($<-2.0, [-2.0, -1.0), [-1.0, 0.0), [0.0, 1.0), [1.0, 2.0), \ge 2.0$).

#### 3.4 Stopping & Personalization Intelligence
- **Terminal Stopping Breakdown**: Proportion of attempts stopped by `MAX_QUESTIONS_REACHED`, `TARGET_SE_ACHIEVED`, `ATTEMPT_EXPIRED`, `DIMINISHING_INFORMATION`, `NO_ELIGIBLE_ITEMS`, and `USER_SUBMITTED`.
- **Continuation Gates Monitored**: Count of evaluations blocked by `MIN_QUESTIONS_NOT_REACHED`, `BLUEPRINT_INCOMPLETE`, and `TOPIC_COVERAGE_INCOMPLETE`.
- **Personalization Influence**: Tracking bounded bonus influences ($w_{\text{pers}} \le 0.40$) for weak-area remediation, mistake-vault reinforcement, and controlled exploration.

#### 3.5 System Health KPI Status Thresholds
| KPI | GREEN | YELLOW | RED |
|---|---|---|---|
| **Selection Error Rate** | $0\%$ | $< 2.0\%$ | $\ge 2.0\%$ |
| **CAT Fallback Rate** | $< 20.0\%$ | $20.0\% - 40.0\%$ | $\ge 40.0\%$ |
| **Stale Attempt Rate** | $0\%$ | $< 5.0\%$ | $\ge 5.0\%$ |
| **Uncalibrated Item Ratio** | $< 50$ items | $50 - 150$ items | $\ge 150$ items |
| **Non-Convergence Rate** | $< 1.0\%$ | $1.0\% - 5.0\%$ | $\ge 5.0\%$ |

---

### 4. Attempt Diagnostics & Explainability Protocol
The Attempt Diagnostics Inspector provides step-by-step transparency for any attempt:
1. **Target Parameters**: Target $\theta$, target topic, target difficulty tier.
2. **Selection Details**: Strategy used (`strict_cat_max_info` vs fallback levels), candidate items evaluated, chosen question version.
3. **Item Properties**: Item calibrated difficulty $b$, discrimination $a$, Fisher information $\mathcal{I}(\theta)$.
4. **Candidate Response & Trajectory**: Step correctness, time spent, prior $\theta \to$ updated $\theta$, prior $\text{SE} \to$ updated $\text{SE}$.
5. **Personalization Context**: Weakness bonus, mistake reinforcement score, exploration randomizer.
6. **Stopping Rule Evaluation**: Evaluation status against all stopping criteria and continuation gates.

---

### 5. Security & Authorization
- Every analytical query method requires active Admin authentication via `AdminService.checkIsAdminOrStaff()`.
- Public APIs and candidate-facing client components have zero access to analytics endpoints.
