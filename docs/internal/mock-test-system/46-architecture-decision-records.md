# 46 — Architecture Decision Records (ADRs)

This document catalogs the 14 foundational Architecture Decision Records (ADRs) that govern the Courage Library Assessment System.

---

## ADR-001: PostgreSQL RPCs as Primary Transaction Authority
- **Status**: ACCEPTED & FROZEN
- **Context**: High-stakes exams require strict multi-row atomicity (e.g. verifying time limits, marking status completed, calculating scores, deducting quotas).
- **Decision**: All assessment state transitions must occur within PostgreSQL Stored Procedures (`SECURITY DEFINER` RPCs) rather than distributed application-tier ORM queries.
- **Consequences**: Zero risk of partial state writes; RLS policies cannot be bypassed; API server is purely a stateless routing layer.

---

## ADR-002: Monotonic Sequence Numbering for Out-of-Order Packet Resolution
- **Status**: ACCEPTED & FROZEN
- **Context**: Mobile candidates on intermittent networks may dispatch answer clicks that arrive out of order at the API gateway.
- **Decision**: The client attaches a strictly monotonic `sequence_id` to every mutation on question $Q_i$. The database applies the update only if $\text{incoming.sequence\_id} > \text{stored.sequence\_id}$.
- **Consequences**: Stale HTTP requests are safely ignored without needing distributed vector clocks.

---

## ADR-003: Immutable `question_versions` and WORM Result Architecture
- **Status**: ACCEPTED & FROZEN
- **Context**: Editing question typos or updating solutions must never invalidate or alter scores of historical student attempts.
- **Decision**: All question edits generate a new `question_versions` row. `test_results` rows are Write-Once-Read-Many (WORM). Rescoring produces auditable revisions in `test_result_revisions`.
- **Consequences**: Guarantees 100% forensic historical reproducibility across multiple years.

---

## ADR-004: Decoupling Scoring Engine from Psychometrics Engine
- **Status**: ACCEPTED & FROZEN
- **Context**: Scoring computes marks for student report cards; psychometrics computes statistical properties of questions.
- **Decision**: Scoring is synchronous and authoritative at submission. Psychometrics runs asynchronously or on demand without write permission to candidate scores.
- **Consequences**: Statistical model calibration failures can never crash or delay candidate result generation.

---

## ADR-005: 1-Attempt Daily Mock Mutex via `pg_advisory_xact_lock`
- **Status**: ACCEPTED & FROZEN
- **Context**: Candidates must be limited to exactly 1 attempt per Daily Mock per IST calendar day, even during rapid multi-tab clicks.
- **Decision**: Use `pg_advisory_xact_lock(hashtext('daily_mock_' || user_id || '_' || ist_date))` inside `fn_start_daily_mock`.
- **Consequences**: Serializes concurrent requests per user/day without locking unrelated rows or tables.

---

## ADR-006: Server-Monotonic Absolute Time Authority
- **Status**: ACCEPTED & FROZEN
- **Context**: Candidates can alter local device clocks or manipulate JavaScript `setInterval` timers.
- **Decision**: The server stores `started_at` in UTC. Remaining time is calculated as `Duration - (NOW() - started_at)`.
- **Consequences**: Client clock tampering has 0.000% impact on allocated exam duration.

---

## ADR-007: IndexedDB Mirroring for Offline-First Client Resiliency
- **Status**: ACCEPTED & FROZEN
- **Context**: Network drops or browser crashes mid-exam can cause panic and data loss.
- **Decision**: The exam player maintains a local IndexedDB mirror that buffers all answer mutations and unacknowledged sync packets.
- **Consequences**: Zero answer loss during disconnections; seamless crash recovery upon page reload.

---

## ADR-008: 1PL JMLE Rasch Calibration for Phase 5 Psychometrics
- **Status**: ACCEPTED & FROZEN
- **Context**: Question difficulty calibration requires a stable, mathematically tractable model for moderate cohort sizes ($N \ge 30$).
- **Decision**: Adopt 1PL Joint Maximum Likelihood Estimation (JMLE) with Newton-Raphson iteration for item difficulty ($b_i$) and 61-point ICC generation.
- **Consequences**: Stable convergence on real-world Indian test cohorts without requiring large-sample MCMC simulation.

---

## ADR-009: Direct Pearson Equivalence for Distractor Discrimination
- **Status**: ACCEPTED & FROZEN
- **Context**: Distractor point-biserial formulas must correlate option selection against the total score excluding the focal item.
- **Decision**: Implemented an optimized single-pass algorithm mathematically proven equivalent to Pearson correlation $r(X_k, Y_{(i)})$ where $Y_{(i)} = Y_{\text{total}} - Y_i$.
- **Consequences**: Eliminates self-correlation distortion; ensures rigorous distractor quality classification.

---

## ADR-010: Test SEM vs Item Info SE Strict Separation
- **Status**: ACCEPTED & FROZEN
- **Context**: Classical Test Theory SEM and IRT conditional Standard Error are frequently conflated.
- **Decision**: Explicitly separate $\text{SEM}_{\text{test}} = s_X \sqrt{1 - \alpha}$ (aggregate test score precision) from $SE(\hat{\theta}) = 1/\sqrt{I(\theta)}$ (conditional latent ability error).
- **Consequences**: Psychometric reports deliver statistically valid confidence intervals across all reporting views.

---

## ADR-011: Quarantining McDonald's $\omega$ as Experimental Research
- **Status**: ACCEPTED & FROZEN
- **Context**: Factor-analytic reliability ($\omega$) can produce non-converged matrices or $NaN$ values on small samples.
- **Decision**: Quarantine McDonald's $\omega$ under `EXPERIMENTAL_RESEARCH`. Maintain Cronbach's $\alpha$ as the primary production reliability metric.
- **Consequences**: 100% production reliability pipeline uptime without risk of non-convergence exceptions.

---

## ADR-012: Manual Next Supremacy in Exam Player Navigation
- **Status**: ACCEPTED & FROZEN
- **Context**: Accidental touch clicks on mobile screens can trigger unintended navigation if option selection auto-advances.
- **Decision**: Enforce explicit candidate action ("Save & Next", "Mark for Review", or Palette click) to change questions.
- **Consequences**: Eliminates unintended skipping; matches NTA, SSC, and TCS iON exam standards.

---

## ADR-013: SHA-256 Forensic Evidence Watermarks for Calibration Snapshots
- **Status**: ACCEPTED & FROZEN
- **Context**: Psychometric parameters and exam scores must be verifiable in the event of legal or academic challenges.
- **Decision**: Compute a deterministic SHA-256 hash over calibration input datasets and result payloads, stored in snapshot tables.
- **Consequences**: Provides tamper-evident forensic proofs for all historical assessment records.

---

## ADR-014: Staggered Jitter Submission Storm Mitigation for Live Tests
- **Status**: ACCEPTED & FROZEN
- **Context**: 100,000 candidates submitting at the exact same second can exhaust database connection pools.
- **Decision**: Apply a deterministic client jitter $\delta = \text{hash}(\text{user\_id}) \pmod{2500}\text{ms}$ to auto-submissions, coupled with a two-phase async ranking pipeline.
- **Consequences**: Flattens concurrency spikes, guaranteeing sub-second submission response times under massive load.
