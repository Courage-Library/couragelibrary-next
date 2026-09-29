# 00 — SYSTEM BOOK OVERVIEW & READING GUIDE

> **DOCUMENTATION CLASSIFICATION:** Production Architecture Reference & Engineering System Book  
> **LIFECYCLE STATUS:** Authoritative & Frozen  
> **SYSTEM LAYER:** Platform Meta-Architecture  

---

## 1. What is it?
The **Courage Library Mock Test System Architecture Bible** is the canonical, full-depth technical and product specification for the assessment engine powering Courage Library. It articulates every architectural layer, database transaction, mathematical formulation, security boundary, user interface invariant, and failure recovery protocol across all assessment modalities (Daily Mocks, Premium Test Series, Live Competitions, and Computerized Adaptive Testing).

## 2. Why does it exist?
High-stakes competitive exam assessment platforms in India (handling SSC, Banking, Railways, and State PSC formats) possess unique complexities:
1. **Zero-Tolerance Scoring Integrity**: Score penalties, negative marking rules, and sectional timing must be deterministic and immune to client manipulation.
2. **High-Concurrency Seat Locking & Synced Timers**: Live All-India events require thousands of candidates to start, stream answers, and submit simultaneously without clock drift or database deadlocks.
3. **Immutable Historical Reproducibility**: When answer keys undergo errata adjustments months after an examination, past candidate scorecards and audit trails must be verifiable without corrupting past states.
4. **Multi-Disciplinary Coupling**: Assessment connects downstream to gamification (CL Coins), digital credentials (HMAC-SHA256 certificates), 18-badge achievement triggers, candidate performance intelligence (longitudinal SMA3), and psychometric item quality diagnostics (1PL Rasch calibration & Cronbach Alpha).

Without this comprehensive System Book, architectural contracts risk being violated during feature expansions, edge-case regressions can corrupt candidate trust, and new engineers cannot grasp the strict boundaries governing authoritative scoring versus diagnostic psychometrics.

---

## 3. Business & Technical Purpose

### Business Purpose
To provide millions of aspirants across India with a standardized, hyper-realistic, cheat-proof testing environment that faithfully mirrors official government commission exam patterns (TCS iON interfaces) while delivering deep diagnostic insights into topic weaknesses, time efficiency, and percentile standing.

### Technical Purpose
To define a decoupled, event-driven, ACID-compliant, Row Level Security (RLS)-guarded architecture where:
- The browser client is treated as completely untrusted.
- PostgreSQL database functions (`SECURITY DEFINER` RPCs) act as atomic transaction boundaries.
- Psychometrics, gamification, and intelligence operate strictly downstream as non-mutating observers.
- Every state transition is idempotent, audited, and mathematically reproducible.

---

## 4. Architectural Layers & Narrative Flow

The platform operates across 9 distinct execution and intelligence tiers:

```
[ LAYER 1: CURRICULUM & QUESTION REPOSITORY ]
Exams -> Exam Cycles -> Exam Patterns -> Sections -> Topics -> Master Question Bank (v1, v2)

[ LAYER 2: BLUEPRINT & INSTANCE GENERATION ]
Mock Templates -> Blueprint Matrix -> Curated / Dynamic Mock Tests -> Section & Question Linkages

[ LAYER 3: ACCESS & QUOTA GATEWAYS ]
Calendar Week Schedule (Daily) | Entitlement Periods & Row-Locked Quotas (Premium) | Seat Reservation (Live)

[ LAYER 4: RUNTIME EXAM PLAYER & TIME AUTHORITY ]
Server-Authoritative Timers -> Anti-Tamper State Machine -> Non-Auto-Advancing Palette -> Batch Answer Sync

[ LAYER 5: ATTEMPT SUBMISSION & RECOVERY ]
Manual Submit / Expiry Auto-Submit -> Multi-Tab Lock -> Sequence Validation -> Idempotent Completion RPC

[ LAYER 6: AUTHORITATIVE EVALUATION & SCORING ]
Positive / Negative Scoring Matrix -> Decimal Mark Aggregation -> Mistake Vault Routing

[ LAYER 7: LIVE MERIT RANKING & PERCENTILES ]
Standard Competition Rank (1,2,2,4) -> Exact Percentile Integration -> Immutable Publication Snapshots

[ LAYER 8: DOWNSTREAM SETTLEMENT & CREDENTIALS ]
CL Coin Ledger Settlement -> HMAC-SHA256 Digital Certificates -> 18-Badge Achievement Ledger

[ LAYER 9: PSYCHOMETRICS & ADMINISTRATIVE GOVERNANCE ]
1PL Rasch Calibration (JMLE) -> Cronbach's Alpha & Test SEM -> Diagnostic Quality Review Queue
```

---

## 5. How to Read This Book by Role

### For Backend & Database Engineers
- **Focus Areas**: Chapters [04](./04-assessment-domain-model.md), [06](./06-question-bank-and-versioning.md), [08](./08-attempt-lifecycle.md), [15](./15-timer-and-time-authority.md), [17](./17-submission-and-auto-submit.md), [31](./31-rls-and-database-authority.md), [32](./32-concurrency-idempotency-and-integrity.md), [33](./33-api-service-rpc-architecture.md), [34](./34-database-architecture.md), [Appendix A](./appendix/a-database-entity-reference.md), [Appendix B](./appendix/b-api-rpc-reference.md).
- **Core Takeaway**: Master the `SECURITY DEFINER` RPC contracts, PostgreSQL advisory locks for quota decrements, immutable trigger functions on snapshots, and Row Level Security isolation.

### For Frontend & Mobile Engineers
- **Focus Areas**: Chapters [13](./13-common-mock-engine.md), [14](./14-exam-player-ui.md), [15](./15-timer-and-time-authority.md), [16](./16-answer-persistence-and-navigation.md), [39](./39-mobile-and-responsive-behavior.md).
- **Core Takeaway**: Understand why option selection must **never auto-advance**, how localStorage staging reconciles with debounced server persistence, how the visual timer calculates drift against `started_at + authorized_duration`, and why answer keys are never sent to the browser during an attempt.

### For Psychometricians & Data Scientists
- **Focus Areas**: Chapters [18](./18-scoring-engine.md), [22](./22-question-psychometrics.md), [23](./23-test-reliability.md), [24](./24-candidate-performance-intelligence.md), [Appendix C](./appendix/c-formula-reference.md).
- **Core Takeaway**: Master the difference between raw scoring ($+M, -M$) and latent ability $\theta$, the 1PL Rasch JMLE calibration loop, corrected point-biserial $r_{pbis}$, distractor attractor dynamics, Cronbach's $\alpha$, and the mathematical distinction between $\text{TEST\_SEM} = \sigma_{\text{test}} \sqrt{1 - \alpha}$ and $\text{CONDITIONAL\_ITEM\_INFORMATION\_SE} = 1/\sqrt{I(\theta)}$.

### For Product Managers & Operations
- **Focus Areas**: Chapters [01](./01-product-vision-and-scope.md), [05](./05-exam-cycle-pattern-blueprint.md), [09](./09-daily-mock-system.md), [10](./10-premium-mock-system.md), [11](./11-live-all-india-testing.md), [20](./20-mistake-vault.md), [25](./25-gamification-and-cl-coins.md), [28](./28-premium-entitlement-and-quota.md), [29](./29-admin-control-plane.md).
- **Core Takeaway**: Understand the weekly calendar matrix for Daily Mocks, quota consumption models (0 quota on generation, 1 on start), Live event registration lifecycles, errata dispute workflows, and admin governance boundaries.

### For AI Coding Agents & System Modifiers
- **Focus Areas**: Read Chapters [41](./41-historical-reproducibility.md) and [42](./42-frozen-contracts-and-non-negotiables.md) **before touching a single line of code**.
- **Core Takeaway**: Understand the 12 immutable architectural commandments that must never be broken, refactored, or bypassed.

---

## 6. Implementation Lifecycle State Definitions

Throughout this book, every architectural component, API, database table, and formula is labeled with its exact implementation status:

| Status Label | Formal Definition | Modification Policy |
| :--- | :--- | :--- |
| `PRODUCTION` / `FROZEN` | Fully implemented, covered by automated test suites, certified against live production runtime gates, and actively serving candidates. | **STRICTLY FROZEN.** Zero breaking modifications allowed. Any enhancements must be 100% additive. |
| `IMPLEMENTED` | Written in production codebase, passed static typechecks, pending final phase runtime gate integration. | Additive refactoring permitted under explicit test verification. |
| `EXPERIMENTAL` / `QUARANTINED` | Scaffolding or mathematical structures exist in codebase, but explicitly isolated from candidate-facing authority (e.g., McDonald's $\omega$). | Strictly non-authoritative. Gated behind admin/research flags. |
| `FUTURE` / `PROPOSED` | Fully designed and mathematically specified in architecture documentation, scheduled for subsequent production phases (e.g., 2PL/3PL IRT models). | Do not implement in current phase until explicit authorization. |

---

## 7. What Must Never Happen in Courage Library

```
[ !CRITICAL SYSTEM INVARIANTS - ZERO TOLERANCE VIOLATIONS! ]
1. NEVER send correct answer keys, solutions, or explanation text to the client during an active test attempt.
2. NEVER trust client-reported time taken, client clock timestamps, or client-calculated scores.
3. NEVER allow selecting an option in the question palette to automatically advance the question.
4. NEVER mutate or overwrite an existing question version record once attempts have been recorded against it.
5. NEVER allow psychometric quality flags or Rasch ability estimations to alter a candidate's authoritative score or live rank.
6. NEVER mix Computerized Adaptive Testing (CAT) attempts into classical norm-referenced reliability or ranking calculations.
7. NEVER deduct Premium quota upon test generation; quota deduction MUST occur atomically upon the first start attempt.
8. NEVER delete historical test psychometric snapshots or certificate ledgers during errata recalculations.
```
