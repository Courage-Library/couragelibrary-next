# Mock Engine & Assessment Architecture Specification
**Authoritative Assessment Engine, Computerized Adaptive Testing (CAT) & Time Authority Architecture**

---

## 1. Executive Summary & Purpose

The **Mock Engine Subsystem** provides high-concurrency, cheat-resistant, standardized test execution for Indian competitive examinations. It powers Daily Mocks, Premium Full-Length Tests, Live All-India Ranking Tests, and Computerized Adaptive Testing (CAT).

---

## 2. Assessment Modes & Capabilities

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                ASSESSMENT MODES                                        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. DAILY PRACTICE MOCKS: Topic-level 10-25 question diagnostic drills                  │
│ 2. FULL-LENGTH SECTIONAL & TIER MOCKS: Standardized exam pattern simulations           │
│ 3. LIVE ALL-INDIA COMPETITIONS: Synchronized testing windows with national leaderboards│
│ 4. COMPUTERIZED ADAPTIVE TESTING (CAT): 1-PL/2-PL IRT ability estimation engine       │
│ 5. MISTAKE RELAPSE DRILLS: Dynamic re-testing of flagged cognitive errors              │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Server-Authoritative Time Authority & Attempt Lifecycle

Client clocks are strictly untrusted. The Mock Engine enforces server-side time authority:

```
[START ATTEMPT] (/api/assessment/start)
   │ Server records started_at & authoritative duration_seconds
   ▼
[ANSWER PERSISTENCE & HEARTBEAT] (/api/assessment/save-answer)
   │ Client sends incremental answer selections with client_timestamp
   │ Server updates attempt state and validates remaining time
   ▼
[AUTO-SUBMIT ON EXPIRY] (/api/assessment/submit-attempt)
   │ Server forces submission when server_time >= started_at + duration_seconds + grace_period
   ▼
[INSTANT SCORING & COGNITIVE ANALYSIS]
   │ Deterministic scoring based on positive/negative mark values
   │ Mistakes automatically routed to candidate's Mistake Vault
   ▼
[RESULT & NATIONAL RANKING] (/mock-tests/[id]/result)
   │ Scorecards, accuracy, time per question, percentile, subject-wise diagnostics
```

---

## 4. Computerized Adaptive Testing (CAT) Engine

For diagnostic and adaptive examinations, the engine utilizes an Item Response Theory (IRT) framework:
- **Ability Estimation ($\theta$)**: Maximum Likelihood Estimation (MLE) / Expected A Posteriori (EAP) calculated after each response.
- **Item Selection**: Maximum Fisher Information criterion selecting the item providing highest measurement precision at current ability estimate $\hat{\theta}$.
- **Stopping Rules**: Standard Error threshold ($SE(\hat{\theta}) \le 0.25$) or maximum test length limit.
