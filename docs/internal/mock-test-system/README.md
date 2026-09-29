# COURAGE LIBRARY — MOCK TEST SYSTEM
# INTERNAL SYSTEM BOOK & PRODUCT ARCHITECTURE BIBLE

> **CONFIDENTIAL & PROPRIETARY — COURAGE LIBRARY ENGINEERING & PRODUCT TEAM**  
> **Classification:** Internal Engineering Reference / System Architecture Bible  
> **Status:** Authoritative Production Reference (Phases 3A–3V, 4A–4D.7, 5A–5E.6 Certified & Frozen)  
> **Target Audience:** Backend Engineers, Frontend Engineers, Full-Stack Architects, Product Managers, Technical Interviewers, AI Autonomous Coding Agents  

---

## 1. Executive Master Overview

The **Courage Library Mock Test System** is a distributed, high-concurrency, psychometrically grounded assessment engine purpose-built for high-stakes Indian competitive examinations (SSC CGL, CHSL, MTS, CPO, Banking IBPS/SBI, Railways RRB, and State PSCs). 

It powers the complete lifecycle of competitive preparation across four distinct testing modalities:
1. **Daily Mock System**: Free daily scheduled occurrences enforcing strict calendar-week uniqueness and routine habituation.
2. **Premium Mock System**: Curated full-length/sectional/PYQ papers and on-demand dynamic test generation (Weak Area, Topic, Challenge, Mistake Revision, Personalized) backed by transactional entitlement quotas.
3. **Live All-India Competitions**: Synchronized nationwide competitive events featuring real-time seat reservation, server-authoritative synchronized countdowns, anti-tamper answer streaming, deterministic merit ranking, and cryptographically verifiable digital certificates.
4. **Computerized Adaptive Testing (CAT)**: Psychometrically isolated 1PL/Rasch $\theta$-ability tracking with Fisher Information item selection.

```
+----------------------------------------------------------------------------------------------------+
|                                    COURAGE ASSESSMENT ECOSYSTEM                                    |
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+-----------------------+     +-----------------------+     +----------------------------------------+
|   QUESTION BANK &     | --> |   EXAM CYCLES &       | --> |   BLUEPRINTS & GENERATORS              |
|   VERSIONING (v1, v2) |     |   TIER PATTERNS       |     |   (Curated / Dynamic Instances)        |
+-----------------------+     +-----------------------+     +----------------------------------------+
                                                                                 |
                                                                                 v
+----------------------------------------------------------------------------------------------------+
|                                 STANDARDIZED TEST INSTANCES                                         |
|              [Daily Mocks]     [Premium Series]     [Live Competitions]     [Adaptive CAT]         |
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
|                                   EXAM PLAYER & RUNTIME ENGINE                                     |
|     * Server-Authoritative Timer        * Anti-Tamper State Machine       * Non-Auto-Advancing Palette |
|     * Local & Remote Persistence Batches * Offline Resilience Buffer       * Hardware Watermarking  |
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
|                                 AUTHORITATIVE SCORING & RESULTS                                    |
|     * Positive Marks (+M)               * Negative Penalties (-M)         * Zero-Score Omissions   |
|     * Standard Competition Ranks (1,2,2,4)* Exact Percentile Integration   * Mistake Vault Routing  |
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
|                                 DOWNSTREAM INTELLIGENCE & REWARDS                                  |
|     * CL Coin Wallet Settlement         * HMAC-SHA256 Certificates        * 18-Badge Achievement Ledger|
|     * Longitudinal SMA3 Analytics       * Rasch Calibration (JMLE)        * Test SEM & Cronbach Alpha|
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
|                             ADMIN CONTROL PLANE & HUMAN GOVERNANCE                                 |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Table of Contents & Document Map

| Chapter | Document Title | Primary Scope & Architectural Responsibility |
| :---: | :--- | :--- |
| **00** | [`00-system-book-overview.md`](./00-system-book-overview.md) | Reading guide, system principles, and engineering invariants. |
| **01** | [`01-product-vision-and-scope.md`](./01-product-vision-and-scope.md) | Business rationale, candidate personas, exam domains, and competitive moat. |
| **02** | [`02-system-context-and-boundaries.md`](./02-system-context-and-boundaries.md) | External boundaries, subsystem integrations, and explicit non-goals. |
| **03** | [`03-product-architecture.md`](./03-product-architecture.md) | Hierarchical product layers from Exam Category down to Question Version. |
| **04** | [`04-assessment-domain-model.md`](./04-assessment-domain-model.md) | Core relational entities, foreign keys, cardinality, and RLS ownership. |
| **05** | [`05-exam-cycle-pattern-blueprint.md`](./05-exam-cycle-pattern-blueprint.md) | Exam patterns, tier structures, sectional timing, and blueprint distribution. |
| **06** | [`06-question-bank-and-versioning.md`](./06-question-bank-and-versioning.md) | Immutable question versioning, options, explanations, and PYQ lineages. |
| **07** | [`07-test-template-and-test-instance.md`](./07-test-template-and-test-instance.md) | Template blueprints vs frozen runtime instances vs candidate attempts. |
| **08** | [`08-attempt-lifecycle.md`](./08-attempt-lifecycle.md) | Attempt state transitions: `IN_PROGRESS` $\to$ `SUBMITTED` $\to$ `EVALUATED`. |
| **09** | [`09-daily-mock-system.md`](./09-daily-mock-system.md) | Weekly recurring calendar matrix, IST resolution, and single-attempt locks. |
| **10** | [`10-premium-mock-system.md`](./10-premium-mock-system.md) | 8 test modalities, transactional quota verification, and atomic start RPC. |
| **11** | [`11-live-all-india-testing.md`](./11-live-all-india-testing.md) | Scheduled events, reservation locks, synchronized start, and extension rules. |
| **12** | [`12-adaptive-testing.md`](./12-adaptive-testing.md) | CAT engine, 1PL Fisher Information item selection, and ability tracking. |
| **13** | [`13-common-mock-engine.md`](./13-common-mock-engine.md) | Shared assessment runtime, section tabs, question palette, and manual Next rule. |
| **14** | [`14-exam-player-ui.md`](./14-exam-player-ui.md) | Question rendering, LaTeX/KaTeX math, option key bindings, and watermarking. |
| **15** | [`15-timer-and-time-authority.md`](./15-timer-and-time-authority.md) | Server vs client time authority, clock tampering prevention, and auto-submit. |
| **16** | [`16-answer-persistence-and-navigation.md`](./16-answer-persistence-and-navigation.md) | Local storage staging, debounced sync, sequence tracking, and crash recovery. |
| **17** | [`17-submission-and-auto-submit.md`](./17-submission-and-auto-submit.md) | Manual submit, timer expiry auto-submit, double-click idempotency locks. |
| **18** | [`18-scoring-engine.md`](./18-scoring-engine.md) | Authoritative scoring: $+M_{\text{correct}}$, $-M_{\text{penalty}}$, decimal marks, accuracy. |
| **19** | [`19-result-and-analysis-system.md`](./19-result-and-analysis-system.md) | Scorecard, subject-wise analytics, time distribution, and solution review. |
| **20** | [`20-mistake-vault.md`](./20-mistake-vault.md) | Automated routing of wrong answers, mistake tagging, and revision drills. |
| **21** | [`21-question-reporting-and-errata.md`](./21-question-reporting-and-errata.md) | Candidate dispute lifecycle, admin errata review, and immutable recalculation. |
| **22** | [`22-question-psychometrics.md`](./22-question-psychometrics.md) | Facility index $p$, point-biserial $r_{pbis}$, distractor analytics, 1PL Rasch calibration. |
| **23** | [`23-test-reliability.md`](./23-test-reliability.md) | Cronbach's Alpha ($\alpha$), Test SEM, Section Alpha, McDonald's $\omega$ quarantine. |
| **24** | [`24-candidate-performance-intelligence.md`](./24-candidate-performance-intelligence.md) | Longitudinal trend SMA3, topic mastery matrices, and strength/weakness vectors. |
| **25** | [`25-gamification-and-cl-coins.md`](./25-gamification-and-cl-coins.md) | CL Coin ledger, idempotency keys, completion rewards, and anti-inflation. |
| **26** | [`26-certificates.md`](./26-certificates.md) | Cryptographic HMAC-SHA256 digital certificates and public verification portal. |
| **27** | [`27-achievements-and-badges.md`](./27-achievements-and-badges.md) | 18 production achievement triggers, idempotent unlock ledger, and medal tiers. |
| **28** | [`28-premium-entitlement-and-quota.md`](./28-premium-entitlement-and-quota.md) | Active subscription periods, plan hierarchy, and multi-tier quota isolation. |
| **29** | [`29-admin-control-plane.md`](./29-admin-control-plane.md) | Admin cockpit, live monitor, psychometric queue, and audit trail ledger. |
| **30** | [`30-security-architecture.md`](./30-security-architecture.md) | Zero-trust client boundary, answer key non-exposure, and payload encryption. |
| **31** | [`31-rls-and-database-authority.md`](./31-rls-and-database-authority.md) | Row Level Security policies across candidate, staff, and service-role tiers. |
| **32** | [`32-concurrency-idempotency-and-integrity.md`](./32-concurrency-idempotency-and-integrity.md) | Row-level locking, advisory locks, sequence validation, and trigger guards. |
| **33** | [`33-api-service-rpc-architecture.md`](./33-api-service-rpc-architecture.md) | Server actions, REST endpoints, SECURITY DEFINER PostgreSQL RPC contracts. |
| **34** | [`34-database-architecture.md`](./34-database-architecture.md) | Complete PostgreSQL schema architecture, foreign key graph, and index topology. |
| **35** | [`35-end-to-end-workflows.md`](./35-end-to-end-workflows.md) | 14 step-by-step transaction flow diagrams from discovery to reward settlement. |
| **36** | [`36-failure-recovery.md`](./36-failure-recovery.md) | Network partition handling, tab crash recovery, and auto-submit reconciliation. |
| **37** | [`37-analytics-and-observability.md`](./37-analytics-and-observability.md) | Candidate telemetry, test operational metrics, and error boundary reporting. |
| **38** | [`38-performance-and-scalability.md`](./38-performance-and-scalability.md) | Read/write load patterns, query indexing plans, and connection pool sizing. |
| **39** | [`39-mobile-and-responsive-behavior.md`](./39-mobile-and-responsive-behavior.md) | Viewport adaptations, bottom navigation bar, and low-latency touch targets. |
| **40** | [`40-testing-and-production-certification.md`](./40-testing-and-production-certification.md) | Multi-tier test matrix, regression scripts, and production runtime gates. |
| **41** | [`41-historical-reproducibility.md`](./41-historical-reproducibility.md) | Bit-for-bit audit reproducibility, watermark hashing, and immutable snapshots. |
| **42** | [`42-frozen-contracts-and-non-negotiables.md`](./42-frozen-contracts-and-non-negotiables.md) | 12 sacred architectural laws that must never be broken or refactored. |
| **43** | [`43-future-roadmap.md`](./43-future-roadmap.md) | Future architectural evolutions: 2PL/3PL IRT, multidimensional CAT, offline PWA. |
| **44** | [`44-glossary.md`](./44-glossary.md) | Authoritative vocabulary, mathematical acronyms, and platform terminology. |
| **45** | [`45-interview-ready-architecture-notes.md`](./45-interview-ready-architecture-notes.md) | Technical deep-dives, trade-off analyses, and system design rationales. |
| **46** | [`46-architecture-decision-records.md`](./46-architecture-decision-records.md) | 14 Architecture Decision Records (ADRs) capturing core design choices. |
| **Appendix A** | [`appendix/a-database-entity-reference.md`](./appendix/a-database-entity-reference.md) | Master entity reference table of all database tables, columns, and constraints. |
| **Appendix B** | [`appendix/b-api-rpc-reference.md`](./appendix/b-api-rpc-reference.md) | Comprehensive API and PostgreSQL RPC contract dictionary. |
| **Appendix C** | [`appendix/c-formula-reference.md`](./appendix/c-formula-reference.md) | Mathematical reference book with step-by-step worked examples. |
| **Appendix D** | [`appendix/d-state-machine-reference.md`](./appendix/d-state-machine-reference.md) | State machine diagrams and transition matrices for all lifecycle entities. |
| **Appendix E** | [`appendix/e-security-checklist.md`](./appendix/e-security-checklist.md) | Security audit verification checklist for production compliance. |
| **Appendix F** | [`appendix/f-testing-checklist.md`](./appendix/f-testing-checklist.md) | Automated testing checklist across all certified phase suites. |
| **Appendix G** | [`appendix/g-production-baseline.md`](./appendix/g-production-baseline.md) | Certified 14 core baseline table counts and frozen record state. |

---

## 3. Core System Principles & Invariants

```
========================================================================================
                          THE 12 ARCHITECTURAL COMMANDMENTS
========================================================================================
1. SERVER IS TIME AND SCORING AUTHORITY: Client-side clocks, timers, scores, and answer
   keys are completely untrusted. All calculations are executed server-side in DB RPCs.
2. IMMUTABLE QUESTION VERSIONING: An attempt links to a specific question_version_id.
   Future errata creates a new version; historical attempts never mutate.
3. MANUAL ADVANCEMENT IS MANDATORY: Selecting an option NEVER auto-advances to the next
   question. The candidate must explicitly click 'Save & Next'.
4. ONE ATTEMPT PER DAILY OCCURRENCE: A candidate can only attempt a scheduled Daily Mock
   once per unique IST calendar date occurrence.
5. ZERO-LEAK CLIENT SECURITY: The frontend never receives correct option keys or 
   explanations during an active attempt.
6. TRANSACTIONAL QUOTA CONSUMPTION: Premium test generation consumes 0 quota; starting
   the attempt atomically checks and decrements quota via PostgreSQL row locks.
7. REGISTRATION != ATTEMPT: In Live competitions, reserving a seat is distinct from 
   initiating an attempt.
8. DETERMINISTIC LIVE MERIT RANKING: Standard competition rank (1,2,2,4) uses strict merit:
   Score DESC -> Accuracy DESC -> Correct DESC -> Time Taken ASC -> Candidate UUID ASC.
9. PSYCHOMETRICS IS DIAGNOSTIC ONLY: Quality flags, Rasch calibrations, and Cronbach Alphas
   never autonomously alter candidate scores, ranks, rewards, or question lifecycles.
10. ADAPTIVE CAT IS ISOLATED: Adaptive CAT sessions are strictly quarantined from linear 
    classical test reliability and norm-referenced ranking calculations.
11. TEST SEM != ITEM INFORMATION SE: Aggregate score-scale error (sigma * sqrt(1 - alpha))
    is mathematically distinct from Rasch latent ability error (1 / sqrt(I(theta))).
12. IMMUTABLE HISTORICAL REPRODUCIBILITY: Errata recalculations create superseding 
    versioned snapshots with SHA-256 evidence watermarks without mutating historical records.
========================================================================================
```

---

## 4. Implementation Status Matrix

| Subsystem | Certified Phase | Implementation Status | Core Source Files |
| :--- | :---: | :---: | :--- |
| **Daily Mock Engine** | Phase 3R | **PRODUCTION & FROZEN** | `services/assessment.service.ts`, `app/actions/daily-mock-actions.ts` |
| **Premium Quota & Generator** | Phase 3S–3V | **PRODUCTION & FROZEN** | `services/premium-generator.service.ts`, `services/premium-entitlement.service.ts` |
| **Adaptive CAT Foundation** | Phase 4A–4D.7 | **PRODUCTION & FROZEN** | `services/adaptive/`, `services/admin-adaptive.service.ts` |
| **Live Competition Foundation** | Phase 5A | **PRODUCTION & FROZEN** | `services/live-test-foundation.service.ts`, `types/live-test.ts` |
| **Live Registration & Seat Lock**| Phase 5B | **PRODUCTION & FROZEN** | `services/live-test-registration.service.ts`, `20260909000045_...` |
| **Live Test Runner & Streaming** | Phase 5C | **PRODUCTION & FROZEN** | `services/live-test-runner.service.ts`, `20260909000046_...` |
| **Live Result & Ranking Engine** | Phase 5D | **PRODUCTION & FROZEN** | `services/live-test-result.service.ts`, `20260909000047_...` |
| **Coin Rewards & Settlement** | Phase 5E.1 | **PRODUCTION & FROZEN** | `services/live-test-reward.service.ts`, `20260909000048_...` |
| **HMAC Certificates** | Phase 5E.2 | **PRODUCTION & FROZEN** | `services/live-test-certificate.service.ts`, `20260909000049_...` |
| **18-Badge Achievements** | Phase 5E.3 | **PRODUCTION & FROZEN** | `services/live-test-achievement.service.ts`, `20260909000050_...` |
| **Candidate Intelligence** | Phase 5E.4 | **PRODUCTION & FROZEN** | `services/candidate-intelligence.service.ts` |
| **Admin Competition Intelligence**| Phase 5E.5 | **PRODUCTION & FROZEN** | `services/admin-competition-intelligence.service.ts` |
| **Psychometric Foundation** | Phase 5E.6.1 | **PRODUCTION & FROZEN** | `types/psychometrics.ts` |
| **Psychometric Schema & RLS** | Phase 5E.6.2 | **PRODUCTION & FROZEN** | `supabase/migrations/20260910000051_...` |
| **Classical Stats & 1PL Rasch** | Phase 5E.6.3 | **PRODUCTION & FROZEN** | `services/psychometrics.service.ts` |
| **Point-Biserial & Distractors**| Phase 5E.6.4 | **PRODUCTION & FROZEN** | `services/psychometrics.service.ts` |
| **1PL Information & ICC Curves**| Phase 5E.6.5 | **PRODUCTION & FROZEN** | `services/psychometrics.service.ts` |
| **Test & Section Reliability** | Phase 5E.6.6 | **PRODUCTION & FROZEN** | `services/psychometrics.service.ts`, `phase5e6_section_test_reliability.md` |
| **McDonald's Omega** | Phase 5E.6.6 | **EXPERIMENTAL / QUARANTINED** | `types/psychometrics.ts` (Explicit non-authoritative tag) |
| **2PL / 3PL IRT Models** | Phase 6 (Future) | **FUTURE ROADMAP** | Documented in Chapter 43 |

---

## 5. Master Baseline Table Inventory (14/14 Intact)

```
+------------------------------------------------------------------------------------+
| TABLE NAME              | CERTIFIED COUNT | INTEGRITY GUARANTEE                    |
+-------------------------+-----------------+----------------------------------------+
| mock_tests              | 8 rows          | Baseline test definitions intact       |
| mock_sections           | 14 rows         | Baseline sectional partitions intact   |
| mock_questions          | 350 rows        | Baseline question linkages intact      |
| mock_templates          | 8 rows          | Blueprint generation templates intact  |
| test_attempts           | 31 rows         | Authoritative historical records intact|
| test_results            | 10 rows         | Authoritative scoring evaluations intact|
| attempt_answers         | 200 rows        | Candidate response audit rows intact   |
| questions               | 103 rows        | Master question entity records intact  |
| question_versions       | 103 rows        | Versioned immutable question text intact|
| question_options        | 412 rows        | 4 options per question version intact  |
| question_answers        | 103 rows        | Correct answer keys intact             |
| subscription_plans      | 1 row           | Production monetization tier intact    |
| coin_wallets            | 5 rows          | Candidate gamification balances intact |
| coin_ledger             | 8 rows          | Idempotent coin reward audit ledger    |
+------------------------------------------------------------------------------------+
```
