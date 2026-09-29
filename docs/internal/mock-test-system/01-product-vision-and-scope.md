# 01 — PRODUCT VISION AND SCOPE

> **DOCUMENTATION CLASSIFICATION:** Product & System Architecture  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Strategic Platform Domain  

---

## 1. What is it?
The **Courage Library Mock Test System** is the comprehensive assessment and examination simulation engine designed to serve millions of aspirants preparing for Indian government and public sector competitive examinations. It replicates the exact operational conditions, sectional constraints, marking rules, and user experience of national recruitment agencies—including the Staff Selection Commission (SSC), Institute of Banking Personnel Selection (IBPS), Railway Recruitment Boards (RRB), State Public Service Commissions (State PSCs), and National Testing Agency (NTA).

## 2. Why does it exist?
India’s public sector examinations are among the most competitive in the world, often featuring millions of candidates competing for thousands of vacancies (acceptance rates $< 0.1\%$). In these exams:
- Speed, accuracy, and negative marking discipline are as vital as subject knowledge.
- Real exam interfaces (specifically TCS iON Web Assessment engines) feature unique question palette navigation, sectional lockings, and non-auto-advancing response models.
- Standard generic quiz apps fail aspirants by offering simplistic multiple-choice quizzes that lack sectional time limits, negative penalty mathematics, longitudinal trend diagnostics, or tamper-proof All-India ranking.

Courage Library was engineered to bridge this gap, providing an enterprise-grade, pedagogically authoritative, and psychometrically calibrated assessment platform.

---

## 3. Business & Technical Purpose

### Business Purpose
1. **Candidate Empowerment & Habituation**: Provide daily free access to high-quality tests to build test-taking stamina, time management, and examination discipline.
2. **Monetization via Premium Modalities**: Offer deep specialization through curated full-length test series, topic drills, challenge papers, and dynamic personalized test generators backed by subscription plans.
3. **National Benchmarking**: Host All-India Live Competitions where candidates benchmark their performance against real cohorts under strict synchronized conditions.
4. **Retention & Gamification**: Fuel continuous engagement through CL Coin rewards, 18-tier milestone achievements, and verifiable digital certificates.

### Technical Purpose
1. **High Concurrency with Zero Drift**: Support synchronized burst traffic during live competitions with sub-second answer persistence and centralized time authority.
2. **Immutable Question Versioning & Audit Integrity**: Ensure every attempt points to an unalterable question version, allowing transparent errata dispute resolution without historical record corruption.
3. **Decoupled Architecture**: Maintain a clean boundary where authoritative scoring remains strictly isolated from downstream gamification, performance intelligence, and diagnostic psychometrics.

---

## 4. Supported Examination Domains & Pattern Matrix

```
+-----------------------------------------------------------------------------------------------+
| EXAM CATEGORY  | EXAM CODES COVERED              | CORE PATTERN CHARACTERISTICS               |
+----------------+---------------------------------+--------------------------------------------+
| SSC EXAMS      | SSC CGL (Tier 1 & Tier 2),     | Combined composite time, +2 / -0.5 (T1),   |
|                | CHSL, MTS, CPO, GD Constable   | +3 / -1.0 (T2), sectional modules.        |
+----------------+---------------------------------+--------------------------------------------+
| BANKING EXAMS  | IBPS PO/Clerk, SBI PO/Clerk,   | Strict sectional timing (e.g. 20 min/sec), |
|                | RRB Officer/Assistant, RBI     | Section switching locks, +1 / -0.25.       |
+----------------+---------------------------------+--------------------------------------------+
| RAILWAY EXAMS  | RRB NTPC (CBT 1 & CBT 2),      | 90-120 min composite, 100-120 questions,   |
|                | Group D, ALP/Technician         | +1 / -0.33 (1/3rd negative marking).       |
+----------------+---------------------------------+--------------------------------------------+
| DEFENCE & PSC  | CDS, NDA, AFCAT, State PCS      | Multi-paper sessions, variable weights,    |
|                | Prelims (BPSC, UPPSC, MPPSC)   | Bilingual Hindi/English delivery.          |
+----------------+---------------------------------+--------------------------------------------+
```

---

## 5. Candidate Personas & Journey Paths

```
+----------------------------------------------------------------------------------------------------+
|                                    CANDIDATE PERSONA JOURNEYS                                      |
+----------------------------------------------------------------------------------------------------+
                                                  |
         +----------------------------------------+----------------------------------------+
         |                                        |                                        |
         v                                        v                                        v
[ 1. FREE ASPIRANT ]                   [ 2. SERIOUS SUBSCRIBER ]              [ 3. TOP COMPETITOR ]
* Attempts Daily Scheduled Mock        * Purchases Premium Exam Pass          * Registers for Live Contests
* Receives basic score & accuracy      * Generates Weak Area & Topic Tests    * Syncs with All-India cohort
* Earns Daily CL Coin rewards          * Re-drills questions in Mistake Vault * Wins Podium Gold medals
* Tracks weekly streak                 * Deep longitudinal SMA3 analytics     * Collects verified certificates
```

---

## 6. System Boundaries & Explicit Non-Goals

### What Courage Library Mock Test System IS:
- A server-authoritative, immutable, psychometrically monitored competitive examination testing platform.
- A high-concurrency assessment runner with resilient client-side caching and debounced server syncing.
- An All-India merit ranking and cryptographic digital credential issuance system.

### What Courage Library Mock Test System IS NOT (Explicit Non-Goals):
1. **NOT a Content Authoring Tool**: Question authoring, LaTeX editing, translation workflows, and bulk importing take place in upstream administrative authoring tools.
2. **NOT a Generic Learning Management System (LMS)**: Does not replace structured video courses or long-form static reading; mock testing is strictly an evaluative and diagnostic practice instrument.
3. **NOT an Auto-Scoring Subjective AI**: Descriptive essay or interview evaluations are handled in dedicated review modules; the Mock Test System is 100% deterministic objective scoring.
4. **NOT an Autonomous Question Deprecator**: Psychometric quality flags highlight statistical anomalies (e.g., negative discrimination), but **never automatically delete or deactivate questions** without human review.

---

## 7. Current Implementation Status
- **Daily Mock System**: `PRODUCTION` & `FROZEN` (Phase 3R)
- **Premium Mock System**: `PRODUCTION` & `FROZEN` (Phases 3S–3V)
- **Live Competition System**: `PRODUCTION` & `FROZEN` (Phases 5A–5E.5)
- **Adaptive Testing (CAT)**: `PRODUCTION` & `FROZEN` (Phases 4A–4D.7)
- **Psychometrics & Reliability**: `PRODUCTION` & `FROZEN` (Phases 5E.6.1–5E.6.6)
