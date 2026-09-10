# COURAGE LIBRARY — PHASE 5E.6.6
## SECTION & TEST RELIABILITY ENGINE ARCHITECTURE & SPECIFICATION

**Status:** PRODUCTION CERTIFIED & FROZEN  
**Policy Version:** `PSYCHOMETRIC_POLICY_V1`  
**Evaluation Model:** `1PL_RASCH_V1` / Classical Test Reliability V1  

---

### 1. Executive Overview

Phase 5E.6.6 implements the production reliability measurement layer for completed fixed mock tests, synchronized live competitions, and official PYQ examination administrations across Courage Library.

The system computes:
1. **Test-Level Cronbach's Alpha ($\alpha$)**: Full sample covariance-to-total variance ratio across binary item-response matrices.
2. **Section-Level Cronbach's Alpha ($\alpha_s$)**: Independent sectional reliability metrics for diagnostic paper balance.
3. **Test Standard Error of Measurement ($\text{TEST\_SEM}$)**: Total score measurement uncertainty ($\sigma_{\text{test}} \sqrt{1 - \alpha}$) on the authoritative score scale.
4. **Deterministic Evidence Watermarking (`rel_wm_...`)**: SHA-256 canonical hashing across sorted attempts and responses.
5. **Deterministic Reliability Quality Flags**: Non-destructive evidence flags for small cohorts, zero score variance, negative alpha, extreme alpha, and high missingness.
6. **Immutable Snapshot Ledger**: Reproducible record storage in `public.test_psychometric_snapshots`.
7. **Strict Population Isolation**: Exclusion of Computerized Adaptive Testing (`POP_ADAPTIVE_CAT`) from classical linear reliability models.
8. **McDonald's Omega Quarantine**: Strict tagging and quarantine of McDonald's Omega as `EXPERIMENTAL_RESEARCH` with zero candidate-facing authority.

---

### 2. Mathematical Formulations & Contracts

#### 2.1 Classical Cronbach's Alpha
Cronbach's Alpha evaluates the internal consistency of an assessment based on the binary item response matrix $X_{N \times K}$ (where $X_{ji} = 1$ if candidate $j$ answered item $i$ correctly, $0$ otherwise):

$$\alpha = \frac{K}{K - 1} \left(1 - \frac{\sum_{i=1}^K \sigma_i^2}{\sigma_T^2}\right)$$

where:
- $K$: Total number of items in the test or section ($K \ge 3$ required).
- $N$: Number of eligible candidate complete cases ($N \ge 30$ required).
- $T_j = \sum_{i=1}^K X_{ji}$: Binary total score for candidate $j$.
- $\bar{T} = \frac{1}{N} \sum_{j=1}^N T_j$: Mean binary total score.
- $\sigma_T^2 = \frac{1}{N - 1} \sum_{j=1}^N (T_j - \bar{T})^2$: Sample variance of the binary total test score.
- $p_i = \frac{1}{N} \sum_{j=1}^N X_{ji}$: Facility index (p-value) of item $i$.
- $\sigma_i^2 = \frac{N}{N - 1} p_i (1 - p_i)$: Sample variance of item $i$.

#### 2.2 Test Standard Error of Measurement ($\text{TEST\_SEM}$)
The Test Standard Error of Measurement estimates the error band around an individual candidate's observed total test score:

$$\text{TEST\_SEM} = \sigma_{\text{test}} \cdot \sqrt{\max(0, 1 - \alpha)}$$

where:
- $\sigma_{\text{test}}$ is the standard deviation of the **authoritative evaluated test score** (incorporating positive marks $+M_{\text{correct}}$, negative penalties $-M_{\text{penalty}}$, unanswered marks $0$, and exam-specific weighting).
- $\alpha$ is the authoritative test-level Cronbach's Alpha.

> [!IMPORTANT]
> **Critical Terminology Distinction**:
> - **$\text{TEST\_SEM}$ (Phase 5E.6.6)**: Aggregate score-scale measurement error ($\sigma_{\text{test}} \sqrt{1 - \alpha}$) for candidate score bands.
> - **$\text{CONDITIONAL\_ITEM\_INFORMATION\_SE}$ (Phase 5E.6.5)**: Item-level conditional standard error ($1 / \sqrt{I(\theta)}$) in latent Rasch ability trait space.
> 
> These two metrics operate on different mathematical spaces and must never be conflated in types, UI, or reporting.

---

### 3. Population Scopes & Adaptive CAT Quarantine

| Population Scope | Description | Linear Reliability Status | Minimum Sample ($N$) |
| :--- | :--- | :---: | :---: |
| `POP_FIXED_MOCK` | Standard full-length and sectional fixed mock tests | **AUTHORIZED** | 30 complete cases |
| `POP_LIVE_COMPETITION` | Scheduled All-India synchronized live competitions | **AUTHORIZED** | 30 complete cases |
| `POP_OFFICIAL_PYQ` | Official Previous Year Question papers | **AUTHORIZED** | 30 complete cases |
| `POP_AGGREGATE_ALL` | Master aggregate pool across non-adaptive attempts | **AUTHORIZED** | 30 complete cases |
| `POP_ADAPTIVE_CAT` | Computerized Adaptive Testing sessions | **QUARANTINED** | Strictly rejected |

**CAT Quarantine Principle**: CAT algorithms adaptively match item difficulty to the candidate's real-time $\theta$, deliberately manipulating candidate response variance and violating classical test theory's assumption of uniform item presentation across the cohort. Mixing CAT attempts into classical Cronbach's Alpha or linear test SEM is mathematically invalid and strictly blocked at runtime.

---

### 4. Missing Data & Complete Case Policy

1. **Complete Cases Only**: Cronbach's Alpha and covariance matrices are constructed exclusively from candidates who submitted responses for all evaluated items on the test form.
2. **Missingness Metrics**:
   - `eligible_attempts`: Total attempts meeting completion criteria (`COMPLETED`, `EVALUATED`, `PUBLISHED`).
   - `complete_cases`: Attempts with complete responses across all $K$ items.
   - `excluded_cases`: Attempts excluded due to omitted/unanswered cells.
   - `missing_response_rate`: Ratio of missing cells to total matrix capacity.
3. **Thresholds & Flags**:
   - If $\text{missing\_response\_rate} > 0.15$: emits `HIGH_MISSINGNESS`.
   - If $\frac{\text{complete\_cases}}{\text{eligible\_attempts}} < 0.70$: emits `LOW_RESPONSE_COVERAGE`.

---

### 5. Deterministic Reliability Quality Flags

Quality flags represent diagnostic evidence and never trigger autonomous destructive actions.

| Flag Key | Severity | Trigger Threshold | Interpretation |
| :--- | :---: | :--- | :--- |
| `INSUFFICIENT_SAMPLE` | **HIGH** | $N < 30$ | Candidate cohort is below the minimum psychometric threshold. |
| `LOW_ITEM_COUNT` | **HIGH** | $K < 3$ | Item count is insufficient for meaningful internal consistency evaluation. |
| `ZERO_SCORE_VARIANCE` | **CRITICAL** | $\sigma_T^2 \le 10^{-12}$ | All candidates obtained identical total scores; alpha cannot be computed. |
| `NEGATIVE_ALPHA` | **HIGH** | $\alpha < 0.0$ | Items exhibit negative inter-item correlation (key mismatch or multidimensionality). |
| `EXTREME_ALPHA` | **MEDIUM** | $\alpha > 0.95$ | Extremely high reliability may indicate excessive item redundancy or bloated length. |
| `HIGH_MISSINGNESS` | **HIGH** | $\text{rate} > 0.15$ | High missingness across matrix (>15% omitted cells). |
| `LOW_RESPONSE_COVERAGE`| **MEDIUM** | $\text{coverage} < 0.70$ | Less than 70% of attempts provided complete item responses. |
| `SECTION_INSUFFICIENT_DATA`| **LOW** | Section $N_s < 30$ or $K_s < 3$ | One or more sections lacked sufficient data for independent sectional alpha. |

---

### 6. McDonald's Omega Quarantine

McDonald's Omega ($\omega$) requires single-factor confirmatory factor analysis or structural equation factor loadings:
- In Phase 5E.6.6, McDonald's Omega is strictly **QUARANTINED** as `EXPERIMENTAL_RESEARCH`.
- Its value is stored as `null` or experimental research metadata.
- It is strictly hidden from candidate-facing UIs and never treated as production-authoritative.

---

### 7. Deterministic Evidence Watermark & Lineage

The evidence watermark guarantees bit-for-bit reproducibility regardless of database row order:

$$\text{Watermark} = \text{SHA-256}(\text{WATERMARK\_V1\_RELIABILITY} \mathbin{\Vert} \text{population} \mathbin{\Vert} \text{mockTestId} \mathbin{\Vert} \text{policyVersion} \mathbin{\Vert} \text{evaluationVersion} \mathbin{\Vert} \text{sortedAttempts})$$

- Prefix: `rel_wm_` followed by the first 16 hex characters.
- **Errata Recalculation**: When errata adjustments change candidate item scores or responses, recalculation produces a new immutable snapshot with a distinct watermark while preserving the historical snapshot.

---

### 8. Immutable Snapshot Schema

Snapshots are stored in `public.test_psychometric_snapshots` protected by the PostgreSQL trigger `fn_prevent_test_psychometric_snapshots_mutation`:

```sql
CREATE TABLE public.test_psychometric_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mock_test_id UUID NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,
    population VARCHAR(50) NOT NULL DEFAULT 'POP_FIXED_MOCK',
    sample_size INTEGER NOT NULL DEFAULT 0,
    item_count INTEGER NOT NULL DEFAULT 0,
    cronbach_alpha DOUBLE PRECISION,
    standard_error_of_measurement DOUBLE PRECISION,
    total_score_variance DOUBLE PRECISION,
    sum_item_variances DOUBLE PRECISION,
    section_reliabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
    mcdonald_omega_research DOUBLE PRECISION,
    policy_version VARCHAR(50) NOT NULL DEFAULT 'PSYCHOMETRIC_POLICY_V1',
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### 9. Downstream Non-Mutation Principle

Psychometrics is strictly an analytical and diagnostic observer:
- **Zero Score Mutation**: Never modifies candidate marks, negative penalty calculations, or attempt scores.
- **Zero Result Mutation**: Never alters candidate ranks, percentiles, or test results.
- **Zero Reward / Certificate Mutation**: Never affects coin rewards, badges, or certificates.
- **Human Review Authority**: All quality flags and anomalies require human admin inspection.
