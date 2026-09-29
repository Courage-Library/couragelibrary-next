# Appendix F — Complete Production Certification & Testing Checklist

This checklist details the automated test assertions across all certified production phases of the Courage Library Assessment System.

---

## 1. Test Suite Execution Summary

```
Total Test Suites:       9
Total Assertions:        385+
TypeScript Compiler:     0 Errors (tsc --noEmit)
Baseline 14 Tables:      100% Exact Match (0 Row Loss)
Historical Migrations:   Untouched & Certified
Overall Gate Status:     ALL GATES PASS (CERTIFIED & FROZEN)
```

---

## 2. Phase-by-Phase Assertion Matrix

### Phase 4D: Adaptive CAT Core & 1PL Engine (72 Checks)
- [x] Fisher Information calculation across $\theta \in [-3, 3]$.
- [x] Newton-Raphson ability estimate updates ($\hat{\theta}$).
- [x] Item exposure control algorithm.
- [x] Stopping rules (Standard Error threshold $< 0.28$ or Max Items $= 30$).
- [x] Isolation of CAT response logs from classical norm cohorts.

### Phase 5A–5B: Daily Mock & Live Registration (48 Checks)
- [x] 1-attempt per IST day mutex via PostgreSQL advisory locks.
- [x] Timezone conversion integrity (UTC to IST `+05:30`).
- [x] Live test registration window boundaries ($T_{\text{reg\_start}}, T_{\text{reg\_end}}$).
- [x] Seat allocation and duplicate registration prevention.

### Phase 5C: Live Test Runner & Resiliency (38 Checks)
- [x] Monotonic answer sequence resolution ($S_2 > S_1$).
- [x] Single-tab session mutex eviction.
- [x] Auto-submit timeout handling with 30s grace period.
- [x] Background sweeper cron (`fn_sweep_expired_test_attempts`).

### Phase 5E.6.1: Data Contracts & Foundation (62 Checks)
- [x] TypeScript interface contracts for psychometrics engine.
- [x] Serialization & deserialization of calibration payloads.
- [x] Error handling & input sanitization boundaries.

### Phase 5E.6.2: Additive Schema Migrations (43 Checks)
- [x] Foreign key constraints on `adaptive_item_calibrations`.
- [x] Row-Level Security policies on psychometric tables.
- [x] Zero mutation of 14 protected baseline tables.

### Phase 5E.6.3: Item Classical Stats & 1PL Calibration (30 Checks)
- [x] Facility Index $p$-value computation with omission handling.
- [x] 1PL JMLE Newton-Raphson difficulty calibration ($b_i$).
- [x] Extreme score handling ($p = 0.0$ and $p = 1.0$).
- [x] Deterministic convergence on synthetic benchmark cohorts.

### Phase 5E.6.4: Discrimination & Distractor Analytics (42 Checks)
- [x] Direct Pearson equivalence for corrected point-biserial ($r_{\text{pbis}}$).
- [x] Distractor correlation $r_{\text{dist}}(k)$ against criterion score excluding focal item.
- [x] Distractor classification flags (`FUNCTIONAL`, `UNATTRACTIVE`, `AMBIGUOUS`).

### Phase 5E.6.5: 1PL Information & 61-pt ICC Engine (36 Checks)
- [x] Item Information $I_i(\theta) = P_i(\theta)(1 - P_i(\theta))$.
- [x] Verification of peak information $I_i = 0.25$ at $\theta = b_i$.
- [x] 61-point grid generation over $\theta \in [-3.0, +3.0]$ with $\Delta\theta = 0.1$.

### Phase 5E.6.6: Section & Test Reliability Engine (52 Checks)
- [x] Cronbach's Alpha ($\alpha$) computation with sample variance.
- [x] Standard Error of Measurement ($\text{SEM}_{\text{test}} = s_X \sqrt{1 - \alpha}$).
- [x] Section-level reliability breakdown.
- [x] McDonald's $\omega$ quarantined as `EXPERIMENTAL_RESEARCH`.
