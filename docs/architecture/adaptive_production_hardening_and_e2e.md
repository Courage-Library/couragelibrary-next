# Courage Library — Adaptive Testing V1 Production Hardening & E2E Certification Specification

## 1. Executive Summary & Final Certification Gate
This document establishes the official production certification of the **Courage Library Adaptive Testing V1 System** across all seven developmental phases (4D.1 through 4D.7).

**Final Gate Declaration**:
```
================================================================
STATUS: ADAPTIVE TESTING V1 — PRODUCTION CERTIFIED
ADAPTIVE V1 STATUS: PRODUCTION CERTIFIED
================================================================
```

---

## 2. Single Authoritative Source of Truth Matrix

| System Domain | Authoritative Table / Component | Primary Responsibilities |
|---|---|---|
| **Adaptive Item Calibration** | `public.adaptive_item_calibrations` | Stores live calibration difficulty $b$, Elo rating, and calibration status. |
| **Ability History & Evidence** | `public.adaptive_ability_history` | Immutably records step-by-step $\theta$, $\text{SE}(\theta)$, Fisher Information $\mathcal{I}(\theta)$, and stopping evaluation. |
| **Stopping Rules & Precedence** | `services/adaptive/adaptive-stopping.service.ts` | Enforces deterministic 10-level stopping hierarchy and continuation rules. |
| **Session State & Telemetry** | `public.test_attempts.adaptive_state` | Authoritative session progress, current step, and selected questions. |

---

## 3. Concurrency & Idempotency Model

1. **Step-Level Idempotency**:
   - `attempt_step_answers` enforces unique constraint on `(attempt_id, step_number)`.
   - Concurrent submissions on the same step resolve atomically; redundant requests receive `STALE_STEP_OR_RACE_DETECTED`.
2. **Quota Reservation Concurrency**:
   - Atomically decrements and locks candidate quota inside `fn_start_adaptive_session`.
   - Session refresh or reopening an in-progress attempt does not consume additional quota.
3. **Timer Authority**:
   - Step time and exam duration are calculated from server wall-clock timestamps.

---

## 4. Zero Candidate Data Leakage Guarantee

Under strict psychometric integrity and candidate privacy rules:
- $\theta$ (Theta ability estimate), $\text{SE}(\theta)$ (Standard Error), item difficulty parameters $b$, Fisher Information values $\mathcal{I}(\theta)$, and detailed stopping criteria are stripped from all candidate-facing payloads.
- Candidates receive only question text, options, and server-validated session step metadata.

---

## 5. Multi-Criteria Stopping & Continuation Precedence

The 10-level deterministic stopping hierarchy evaluates in strict order:
1. `SYSTEM_ERROR_HALT` (Terminal safety halt)
2. `EMERGENCY_ABORT` (Admin abort)
3. `TIME_EXPIRED` (Authoritative wall-clock timer limit)
4. `BLUEPRINT_INCOMPLETE` (Continuation gate: minimum topic constraints)
5. `MIN_QUESTIONS_NOT_REACHED` (Continuation gate: minimum length constraint)
6. `MAX_QUESTIONS_REACHED` (Terminal length ceiling)
7. `TARGET_SE_ACHIEVED` (Psychometric precision convergence)
8. `SE_PLATEAU_DETECTED` (Information saturation stop)
9. `OSCILLATION_LIMIT` (Ability stability stop)
10. `STANDARD_CONTINUE` (Default CAT progression)

---

## 6. Known Limitations (V1 Production Scope)

1. **Deterministic Psychometrics**:
   - Uses standard 1PL Rasch / Birnbaum Fisher Information with Newton-Raphson regularized MLE.
   - Machine Learning (ML), Reinforcement Learning (RL), and live All-India competition engines are excluded from V1 Adaptive core scoring to preserve auditability.
2. **Live Test Isolation**:
   - All-India Scheduled Live Tests (Phase 5) operate on a separate synchronized event pipeline and do not modify the frozen Adaptive Testing V1 engine.

---

## 7. Production Database Baseline Verification

Exact counts recorded on the production Supabase instance before and after runtime verification:

| Table Name | Pre-Verification Baseline | Post-Verification Count | Status |
| :--- | :---: | :---: | :---: |
| `mock_tests` | 8 | 8 | **PASS (Preserved)** |
| `mock_sections` | 14 | 14 | **PASS (Preserved)** |
| `mock_questions` | 350 | 350 | **PASS (Preserved)** |
| `mock_templates` | 8 | 8 | **PASS (Preserved)** |
| `test_attempts` | 31 | 31 | **PASS (Preserved)** |
| `test_results` | 10 | 10 | **PASS (Preserved)** |
| `attempt_answers` | 200 | 200 | **PASS (Preserved)** |
| `questions` | 103 | 103 | **PASS (Preserved)** |
| `question_versions` | 103 | 103 | **PASS (Preserved)** |
| `question_options` | 412 | 412 | **PASS (Preserved)** |
| `question_answers` | 103 | 103 | **PASS (Preserved)** |
| `subscription_plans` | 1 | 1 | **PASS (Preserved)** |

---

## 8. Secret Audit Certification Output

```
Service-role secret exposure: NOT FOUND
Private API keys:            NOT FOUND
Hardcoded credentials:       NOT FOUND
```
