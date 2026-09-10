# Courage Library — Item Calibration & Difficulty Intelligence
## Phase 4D.2 Architecture & Engineering Specification

> [!IMPORTANT]
> **Explicit Engineering Guarantee**:
> This is a deterministic, evidence-backed calibration intelligence layer for Courage Library's question bank, **not a full psychometric Item Response Theory (IRT) or Computerized Adaptive Testing (CAT) estimation solver**. Parameters ($a$, $c$) are strictly non-fabricated (`NULL`), and difficulty parameter $b$ operates as a transparent, bounded empirical proxy.

---

## 1. Purpose & Core Philosophy
The core objective of Phase 4D.2 is to evolve Courage Library's assessment engine from treating item difficulty as a static author-assigned tag (`easy`, `medium`, `hard`) into a **version-aware, evidence-backed, continuously calibratable item property**.

As candidates complete verified exam attempts, their responses form an immutable body of psychometric evidence. The calibration engine aggregates this evidence to compute empirical difficulty, measure statistical confidence, monitor item stability, and inform future adaptive question selections.

---

## 2. Evidence Data Model (`adaptive_item_response_evidence`)

All empirical calculations are grounded in the `adaptive_item_response_evidence` table:
- **`id`**: Unique evidence event identifier (UUID PK).
- **`question_version_id`**: Foreign key to `question_versions(id)`. Ensures calibration is strictly version-specific.
- **`attempt_id`**: Foreign key to `test_attempts(id)`.
- **`user_id`**: Foreign key to `auth.users(id)`.
- **`is_correct`**: Server-evaluated boolean correctness against authoritative `question_answers`.
- **`response_source`**: Context source (`adaptive_step`, `daily_mock`, `fixed_mock`, `pyq`).
- **`difficulty_context`**: Nominal difficulty bracket active at presentation time.
- **`ability_estimate_before` / `ability_estimate_after`**: Latent ability state snapshot if served in an adaptive session.
- **`response_recorded_at`**: Authoritative server timestamp.
- **`metadata`**: Structured context payload.
- **Uniqueness Invariant**: `UNIQUE(attempt_id, question_version_id)` prevents duplicate evidence from retries or race conditions.
- **Trigger-Enforced Immutability**: `trg_prevent_response_evidence_mutation` prohibits `UPDATE` and `DELETE` operations.

---

## 3. Eligible Responses & Quality Filters

Evidence is collected solely from **valid, submitted, server-graded attempts**. The following responses are strictly excluded:
1. In-progress or abandoned test attempts.
2. Unanswered / skipped questions (`selected_option_key IS NULL`).
3. Synthetic test fixtures or administrative test runs.
4. Client-reported correctness or client-provided metrics.
5. Inconsistent or dangling question-version records.

---

## 4. Calibration Formulas & Mathematical Metrics

### 4.1 Sample Size ($n$)
$$n = \text{correct\_count} + \text{incorrect\_count}$$

### 4.2 Empirical Accuracy ($p$)
$$p = \frac{\text{correct\_count}}{n} \quad (n > 0)$$

### 4.3 Difficulty Score ($d$)
$$d = 1.0 - p \in [0.0, 1.0]$$

### 4.4 Bounded Continuous Difficulty Parameter ($b$)
For items with sufficient sample size ($n \ge n_{\text{provisional}}$):
$$b = 3.0 \cdot (2 \cdot d - 1.0) = 6.0 \cdot (0.5 - p) \in [-3.0, +3.0]$$
- **100% Accuracy ($p=1.0$)**: $b = -3.0$ (Very Easy)
- **50% Accuracy ($p=0.5$)**: $b = 0.0$ (Medium / Baseline)
- **0% Accuracy ($p=0.0$)**: $b = +3.0$ (Very Hard)
- If $n < n_{\text{provisional}}$ ($n < 20$): $b = \text{NULL}$ (uncalibrated baseline).

---

## 5. Sample Thresholds

| State | Sample Threshold | Description |
| :--- | :--- | :--- |
| **`uncalibrated`** | $n < 20$ | Insufficient evidence. Relies on static question baseline. |
| **`provisional`** | $20 \le n < 100$ | Preliminary estimate available. Used cautiously if policy allows. |
| **`calibrated`** | $n \ge 100$ | Robust empirical sample. Calibrated $b$ is authoritative. |
| **`flagged`** | Any $n$ with high instability | Significant accuracy swings or anomalies detected. |
| **`deprecated`** | Any $n$ | Item version retired from adaptive generation by Admin. |

---

## 6. Confidence Metric

The statistical confidence metric measures the weight of evidence supporting an item's calibration:
$$\text{confidence} = \min\left(1.0, \frac{\sqrt{n}}{\sqrt{n_{\text{calibrated}}}}\right) \cdot (1.0 - \text{instability\_penalty}) \in [0.0, 1.0]$$
- Grows proportionally with $\sqrt{n}$ up to $n = 100$.
- Penalized if variance/instability exceeds tolerance.

---

## 7. Reliability Proxy

To provide an intuitive sample stability measure without claiming classical psychometric split-half reliability:
$$\text{reliability\_proxy} = \min\left(1.0, \frac{n}{n + 10}\right) \cdot (1.0 - \text{instability\_penalty}) \in [0.0, 1.0]$$
- Smoothly asymptotes toward $1.0$ as $n \to \infty$.
- Penalized for sudden distribution shifts.

---

## 8. Discrimination ($a$) & Pseudo-Guessing ($c$) Policy

> [!CAUTION]
> **Strict Non-Fabrication Rule**:
> In Phase 4D.2, **$a = \text{NULL}$** and **$c = \text{NULL}$**. 
> The system will NEVER assign arbitrary values (such as $a=1.0$ or $c=0.25$) to pretend an item is calibrated under a 2PL or 3PL model.

---

## 9. Stability & Drift Detection

An item is evaluated for stability by comparing its recent response accuracy window ($p_{\text{recent}}$, last 20 responses) against its all-time cumulative accuracy ($p_{\text{all}}$):
$$\Delta p = |p_{\text{recent}} - p_{\text{all}}|$$
- If $\Delta p > 0.35$ and $n \ge 40$, the item is automatically categorized as **`flagged`** with reason `HIGH_ACCURACY_DRIFT`.

---

## 10. Recalibration Engine & Repeatability

The `AdaptiveCalibrationService.recalibrateQuestionVersion()` workflow is fully repeatable and deterministic:
1. Fetch all immutable evidence for `question_version_id` from `adaptive_item_response_evidence`.
2. Filter for verified responses and compute $n$, correct, incorrect, $p$, $d$, $b$, confidence, and reliability proxy.
3. Determine new calibration status based on thresholds and stability check.
4. Record an immutable entry in `adaptive_item_calibration_history` capturing previous and new parameter snapshots.
5. Upsert the current record in `adaptive_item_calibrations`.
6. Write an administrative audit log to `admin_audit_logs`.

---

## 11. Calibration Snapshot History (`adaptive_item_calibration_history`)

To ensure complete temporal auditability ("What did the engine believe about Item X at time T?"):
- **`question_version_id`**: Version audited.
- **`previous_status` / `new_status`**: State transition.
- **`previous_parameters` / `new_parameters`**: JSON snapshot of $b$, confidence, reliability, accuracy.
- **`calculation_version`**: Algorithm version code (`calibration_v1_heuristic`).
- **`reason`**: Trigger explanation (e.g. `BATCH_RECALIBRATION`, `ADMIN_OVERRIDE`, `EVIDENCE_THRESHOLD_MET`).
- **Trigger-Enforced Immutability**: Protected against mutation or deletion.

---

## 12. Admin Controls & Bulk Limits

Accessible via `/admin/adaptive` (Calibration Bank Tab):
1. **Calibration Overview**: Live KPIs for Uncalibrated, Provisional, Calibrated, Flagged, and Deprecated counts.
2. **Item Calibration Explorer**: Searchable, filterable table with question text previews and parameter metrics.
3. **Item Detail Modal**: Deep inspection of sample size, accuracy, continuous $b$, confidence, stability, and historical timeline.
4. **Single-Item Recalibration**: Instant recalculation from accumulated evidence.
5. **Bulk Recalibration**: Bounded batch processing (maximum 50 items per batch) to prevent server timeouts.
6. **Flagging & Deprecation Controls**: Administrative flag/unflag and deprecate/restore toggles with mandatory reason logging.

---

## 13. Fallback Hierarchy in Adaptive Selection

When `AdaptiveSelectionService` selects candidate questions matching a target ability bracket:
```
Priority 1: CALIBRATED item (use calibrated b)
    ↓
Priority 2: PROVISIONAL item (use provisional b if policy permits; else baseline)
    ↓
Priority 3: UNCALIBRATED item (use static difficulty tier: easy=-1.0, med=0.0, hard=+1.0)
    ↓
Priority 4: FLAGGED item (use baseline difficulty; exclude if strict policy active)
    ↓
EXCLUDE: DEPRECATED item (never served in adaptive tests)
```

---

## 14. Security & RLS Matrix

| Entity | Candidate Access | Admin Access | Service Role |
| :--- | :--- | :--- | :--- |
| `adaptive_item_response_evidence` | None (Zero Read / Zero Write) | Read Only | Full Control |
| `adaptive_item_calibrations` | Read Only (Filtered) | Full Control | Full Control |
| `adaptive_item_calibration_history` | None | Read Only | Full Control |
| `admin_audit_logs` | None | Read Only | Full Control |

---

## 15. Known Limitations & What is NOT Implemented
- **No 2PL / 3PL Parameter Estimation**: Discrimination $a$ and pseudo-guessing $c$ remain `NULL`.
- **No Fisher Information Item Selection**: Items are selected using heuristic bracket matching and topic balancing.
- **No Maximum Likelihood / Bayesian EAP Ability Solvers**: Candidate $\theta$ estimation uses bounded step-size proxies.
- **No Sympson-Hetter Exposure Control**: Exposure limits use basic ceiling thresholds.
- **No Unsupervised ML / Neural Network Models**: All calculations are 100% deterministic arithmetic.

---

## 16. Summary & Readiness
Phase 4D.2 establishes a solid, transparent, and evidence-grounded difficulty calibration pipeline. It lays the groundwork for Phase 4D.3 (Item Response Theory & Psychometric Models) without introducing premature mathematical complexity or synthetic data.
