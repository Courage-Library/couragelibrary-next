# 02 — SYSTEM CONTEXT AND BOUNDARIES

> **DOCUMENTATION CLASSIFICATION:** Enterprise Architecture & Integration Context  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Boundary & External Contract Topology  

---

## 1. What is it?
The **System Context and Boundaries** specification defines the Courage Library Mock Test System's perimeter, articulating its touchpoints with external systems (authentication, notification providers, payment gateways, Supabase BaaS) and internal adjacent services (Mistake Vault, Billing, Gamification, Community).

## 2. Why does it exist?
Without explicit context boundaries, assessment platforms suffer from scope creep and architectural decay—such as payment callbacks writing directly into attempt tables, client UIs communicating directly with third-party webhooks, or gamification engines modifying assessment scoring results. This chapter formalizes the perimeter to preserve transactional integrity and zero-trust security.

---

## 3. Enterprise System Context Diagram (C4 Level 1)

```
                                  +---------------------------------------+
                                  |         ASPIRANTS / CANDIDATES        |
                                  |   (Web Browser, Mobile PWA, Desktop)  |
                                  +---------------------------------------+
                                                      |
                                                      | HTTPS / WSS / JWT
                                                      v
+---------------------------------------------------------------------------------------------------------+
|                                    COURAGE LIBRARY EDGE GATEWAY                                         |
|                                       (Next.js App Router / CDN)                                        |
+---------------------------------------------------------------------------------------------------------+
       |                                      |                                      |
       | Server Actions                       | REST API                             | Edge Auth
       v                                      v                                      v
+---------------------------------------------------------------------------------------------------------+
|                                    CORE MOCK ASSESSMENT ENGINE                                          |
|                                                                                                         |
|  [ DAILY RESOLVER ]    [ PREMIUM GENERATOR ]    [ LIVE RUNNER ]    [ AUTHORITATIVE SCORER ]             |
|  [ TIME AUTHORITY ]    [ SUBMISSION RPC ]       [ RANK ENGINE ]    [ PSYCHOMETRICS ENGINE ]             |
+---------------------------------------------------------------------------------------------------------+
       |                                      |                                      |
       | SQL / RLS                            | RPC Calls                            | DB Triggers
       v                                      v                                      v
+---------------------------------------------------------------------------------------------------------+
|                                   SUPABASE POSTGRESQL CLUSTER                                           |
|                                                                                                         |
|  * Master Schema & Auth (`auth.users`)          * 14 Core Baseline Tables (Protected)                   |
|  * Row Level Security (RLS) Policy Gates        * Immutable Snapshot & Calibration Ledgers              |
|  * Advisory Locks & Concurrency Mutexes         * Automated Mutation Prevention Triggers                |
+---------------------------------------------------------------------------------------------------------+
       |                                      |                                      |
       v                                      v                                      v
[ STRIPE / RAZORPAY ]                 [ RESEND / FCM ]                      [ ADMIN COCKPIT ]
(Payment & Subscriptions)             (Push & Notification Alerts)          (Governance & Review Queue)
```

---

## 4. Internal Subsystem Integration Contracts

```
+---------------------------------------------------------------------------------------------------------+
| UPSTREAM PRODUCERS (Inputs)       | MOCK TEST SYSTEM CORE             | DOWNSTREAM CONSUMERS (Outputs)   |
+-----------------------------------+-----------------------------------+----------------------------------+
| 1. Question Bank Repository       |                                   | 1. Candidate Result Viewer       |
|    - Questions (103 rows)         |  * Daily Mock Engine              |    - Scorecards, Section Splits  |
|    - Question Versions (103 rows) |  * Premium Quota Engine           |    - Time Analysis & Solutions   |
|    - Question Options (412 rows)  |  * Live Competition Runner        | 2. Mistake Vault System          |
|    - Correct Answers (103 rows)   |  * Common Mock Engine             |    - Auto-routed wrong answers   |
| 2. Exam Hierarchy & Patterns      |  * Server Timer Authority         | 3. Gamification CL Coin Ledger   |
|    - Exams, Cycles, Patterns      |  * Authoritative Scorer           |    - Idempotent coin settlements |
|    - Mock Templates (8 rows)      |  * Live Ranking & Percentile      | 4. Digital Certificate Vault     |
| 3. Premium Subscription Store     |                                   |    - HMAC-SHA256 verified creds  |
|    - Subscription Plans (1 row)   |                                   | 5. Achievement Badge System      |
|    - Active Entitlements          |                                   |    - 18 production badge triggers|
| 4. Scheduled Live Contests        |                                   | 6. Psychometric Review Queue     |
|    - Live Events, Seats, Windows  |                                   |    - Item quality flags & Rasch  |
+---------------------------------------------------------------------------------------------------------+
```

---

## 5. Subsystem Interaction Rules

### 1. Assessment $\to$ Mistake Vault Contract
- **Trigger**: Attempt reaches `SUBMITTED` or `EVALUATED` state.
- **Rule**: Every item where `is_answered = true` AND `is_correct = false` is sent to the `MistakeService`.
- **Payload**: `{ userId, questionVersionId, attemptId, selectedOptionKey, mistakeType }`.
- **Isolation**: If Mistake Vault insertion fails, the primary attempt submission **does NOT roll back**. Mistake logging is executed asynchronously or with soft-catch isolation.

### 2. Assessment $\to$ Gamification (CL Coins) Contract
- **Trigger**: Attempt evaluation completion.
- **Rule**: Daily/Sectional completion award = 10 CL Coins; Mixed test = 15 CL Coins; Full-length mock = 25 CL Coins.
- **Idempotency Key**: `coin_reward_att_<attempt_id>`.
- **Isolation**: Coin rewards can never alter the candidate's marks, accuracy, or rank.

### 3. Assessment $\to$ Digital Certificates Contract
- **Trigger**: Live All-India competition results published by Admin.
- **Rule**: Candidates meeting merit thresholds receive a tamper-proof certificate with HMAC-SHA256 signature.
- **Canonical Format**: `CL_CERT_V1|eventId|userId|snapshotId|certType|score|rank|percentile|policyVersion|timestamp`.

### 4. Assessment $\to$ Psychometrics Contract
- **Trigger**: Calibrated batch execution or review queue ingestion.
- **Rule**: Psychometrics strictly reads evaluated response matrices ($X_{N \times K}$) to calculate facility $p$, $r_{pbis}$, 1PL difficulty $b$, Cronbach's $\alpha$, and Test SEM.
- **Strict Invariant**: Psychometrics is a **read-only diagnostic observer**. It has zero write authority over candidate scores, test attempts, or question bank statuses.

---

## 6. What Must Never Happen
- External payment webhooks must **never** create `test_attempts` directly.
- The exam player UI must **never** connect to third-party analytics trackers that could leak question text or candidate choices in plain text.
- Downstream reward failures must **never** invalidate an authoritative candidate scorecard.
