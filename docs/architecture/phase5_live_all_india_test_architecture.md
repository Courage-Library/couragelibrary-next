# COURAGE LIBRARY — PHASE 5 ARCHITECTURE SPECIFICATION
## LIVE / ALL-INDIA TEST INFRASTRUCTURE & EVENT SYSTEM

```
================================================================
DOCUMENT STATUS: APPROVED ARCHITECTURE SPECIFICATION (WITH 8 AMENDMENTS)
CURRENT PHASE: PHASE 5A — FOUNDATION
================================================================
```

---

## 1. Executive Summary

The **Courage Library Live / All-India Test Infrastructure** provides the architectural foundation for conducting scheduled, high-concurrency national examinations across thousands of simultaneous candidates. The system is designed to simulate authentic high-stakes competitive examinations (e.g., SSC CGL All-India Live Mock, IBPS PO National Championship, RRB NTPC Mega Event, Defence Services Live Challenge) with server-authoritative scheduling, synchronized start/stop windows, cheat deterrence, atomic scoring, and asynchronous national ranking & percentile computation.

### Architectural Tenet: Single Common Engine
**We do NOT build a second examination engine.** Live Tests reuse the existing, battle-tested Common Mock Engine, Result Engine, Gamification (CL Coins) Engine, and Mistake Vault. Adaptive Testing V1 remains a completely separate, frozen, and specialized track. Live Tests wrap the Common Mock Engine with event-driven scheduling, registration gates, thundering-herd isolation, and decoupled post-event ranking pipelines.

---

## 2. Existing Architecture Reuse Map

| Domain | Existing Component / Entity | Reuse Strategy |
| :--- | :--- | :--- |
| **Assessment Delivery** | `components/assessment/question-renderer.tsx`, `question-palette.tsx`, `assessment-timer.tsx` | **REUSE (100%)**: Identical UI/UX, option selection, manual navigation, full-screen lock, and candidate watermark. |
| **Test Configuration** | `mock_tests`, `mock_sections`, `mock_questions` | **REUSE (100%)**: Paper template, section structure, question ordering, and marking schemes. |
| **Attempt Storage** | `test_attempts`, `attempt_answers` | **EXTEND**: Existing attempt tables store candidate live attempts linked via `live_test_instance_id`. |
| **Scoring Engine** | `test_results`, `section_results`, `ResultEngineService` | **REUSE (100%)**: Server-side scoring, negative marking, accuracy calculation, and section breakdowns. |
| **Rewards & Coins** | `GamificationService`, `cl_coin_transactions` | **REUSE (100%)**: Atomic, idempotent CL Coin distribution upon result publication. |
| **Mistake Vault** | `MistakeService`, `mistake_vault` | **REUSE (100%)**: Automated extraction and review tracking of incorrect live questions. |
| **Access & Quota** | `PremiumEntitlementService`, `fn_check_premium_access_and_quota` | **REUSE (100%)**: Entitlement checks for Premium events with zero quota double-consumption. |
| **Timezone Utilities**| `lib/assessment/timing.ts` | **REUSE (100%)**: Asia/Kolkata (`UTC+05:30`) formatted server-authoritative timestamps. |
| **Adaptive V1** | `AdaptiveStateService`, `AdaptiveCATSelectionService`, etc. | **ISOLATED (0% Interference)**: Frozen and preserved without modification. |

---

## 3. Goals and Non-Goals

### Goals
1. **High Concurrency & Load Smoothing**: Support 10,000+ registered candidates and 10,000+ simultaneous active examinees with controlled attempt-start concurrency and decoupled batch ranking.
2. **Strict Server-Authoritative Timing**: Wall-clock window enforcement (`start_at` to `end_at` in `Asia/Kolkata`) preventing client clock manipulation, post-expiry answers, and resurrection.
3. **Question Set Immutability**: Cryptographically freeze question versions, options, keys, and mark schemes prior to event start (`READY` state).
4. **Decoupled Ranking Pipeline**: Separate instantaneous candidate finalization ("Submission Received") from asynchronous global ranking snapshot computation.
5. **Masked Leaderboard Privacy**: Render competitive podium and leaderboards with candidate privacy masking (`R*** S*****`).
6. **Robust Admin Controls**: Centralized `/admin/live-tests` control center with emergency freeze, extension, and cancellation powers.

### Non-Goals
1. **No Adaptive Testing in Live Mocks**: Live tests are fixed-blueprint linear tests so every candidate faces the exact same paper.
2. **No Synchronous Global Recalculation**: Ranks will NOT be recomputed on every individual question submission.
3. **No Secondary Engine**: No duplicate mobile or desktop test runners.
4. **No Regional Rankings in V1.0**: Focus exclusively on All-India National Ranking in V1.0; regional/institutional segmentation deferred to V1.1.

---

## 4. Entity Model & Architectural Invariants

### Architectural Invariant: `REGISTRATION != ATTEMPT`
Registration represents candidate reservation, seat allocation, and entitlement validation (e.g., 1,00,000 pre-registrations). An Attempt is the actual runtime examination instance created only when the candidate enters the test during the live window (e.g., 10,000 active starts).

```
+---------------------------+       1:N       +-----------------------------+
|    live_test_events       | <-------------> |   live_test_registrations   |
| (Definition, Schedule,    |                 | (Candidate pre-registration |
|  Status, Eligibility)     |                 |  & entitlement reservation) |
+---------------------------+                 +-----------------------------+
             | 1:1
             v
+---------------------------+       1:N       +-----------------------------+
|    live_test_instances    | <-------------> |        test_attempts        |
| (Frozen Question Snapshot |                 | (Candidate test session,    |
|  & SHA-256 Hash)          |                 |  reused core table)         |
+---------------------------+                 +-----------------------------+
             | 1:1                                           |
             v                                               v
+---------------------------+       1:N       +-----------------------------+
| live_test_ranking_snapshot| <-------------> | live_test_leaderboard_entry |
| (Batch computed post-event|                 | (Ranked, percentile-indexed |
|  national ranking master) |                 |  public/private records)    |
+---------------------------+                 +-----------------------------+
```

---

## 5. Capacity Targets vs Database Throughput (Amendment 1)

```
10,000+ Registered Candidates
        ↓
10,000+ Simultaneous Active Candidates
        ↓
Controlled Start Concurrency (e.g., 1,000–3,000 starts/sec burst)
        ↓
Lightweight Transactional Attempt Creation
        ↓
Common Mock Engine Execution
```

**Capacity Targets**:
- **Registered Candidates**: 10,000+
- **Simultaneous Active Examinees**: 10,000+
- **Expected Start Concurrency Burst**: 1,000 to 3,000 attempt starts/sec with client jitter and pre-warmed question caching.
- **Answer Sync Throughput**: Batched background writes.
- **Actual Upper Limits**: Evaluated and benchmarked rigorously during Phase 5H Staged Load Testing.

---

## 6. Two-Layer Answer Synchronization Architecture (Amendment 2)

```
[Candidate Selects Option]
            │
            ▼
[Layer 1: Immediate LocalStorage Persistence]  <--- Instant UI response & crash protection
            │
            ▼
[Layer 2: Debounced Server Synchronization]
  - Batches pending changes with sequence/version numbers
  - Transmits via background REST/RPC every 5–15 seconds
  - Server validates session and writes to attempt_answers
  - Returns Server ACK with latest sync version
            │
            ▼
[Test Submission]
  - Final submission atomically flushes any un-ACKed pending local answers
  - Server confirms full receipt before marking attempt as 'submitted'
```

---

## 7. State Machines & Live Event Lifecycle

```
[DRAFT] ──> [SCHEDULED] ──> [REGISTRATION_OPEN] ──> [REGISTRATION_CLOSED]
                                                          │
[PUBLISHED] <── [RESULTS_READY] <── [PROCESSING] <── [GRACE_PERIOD] <── [LIVE] <── [READY]
```

### State Definitions
- `DRAFT`: Event configured by Admin; mock test linked.
- `SCHEDULED`: Scheduled for future registration.
- `REGISTRATION_OPEN`: Candidates can register; capacity and quotas verified.
- `REGISTRATION_CLOSED`: Registration window closed (e.g. 30m prior to start).
- `READY`: 15 minutes before start. `live_test_instances` generated and paper frozen with SHA-256 hash.
- `LIVE`: Examination window open. Candidates can start/resume tests.
- `GRACE_PERIOD`: 5-minute network drain window after official finish for pending in-flight packets.
- `PROCESSING`: Auto-finalization sweep completed; asynchronous batch ranking engine executing.
- `RESULTS_READY`: Ranks & percentiles computed; held for admin sign-off.
- `PUBLISHED`: Scorecards, national ranks, solutions, and leaderboards publicly live.

---

## 8. Ranking Mathematics & Performance-First Tie-Breaking (Amendment 4)

The national ranking engine applies a strict, merit-first deterministic tie-break:

$$\text{Candidate } A \succ \text{Candidate } B \iff$$

1. **Total Final Score**: $\text{Score}_A > \text{Score}_B$ (Higher marks wins)
2. **Accuracy Percentage**: $\text{Accuracy}_A > \text{Accuracy}_B$ (Higher accuracy wins)
3. **Number of Correct Answers**: $\text{Correct}_A > \text{Correct}_B$ (More correct questions wins)
4. **Time Taken**: $\text{Time}_A < \text{Time}_B$ (Faster completion wins)
5. **Deterministic Stable Tie-Break**: $\text{Candidate UUID}_A < \text{Candidate UUID}_B$ (Cryptographic tie-break; no public/user-editable fields).

---

## 9. Percentile Mathematics & Population Rules (Amendment 5)

$$P = \left( \frac{N_{\text{below}} + (0.5 \times N_{\text{equal}})}{N_{\text{total}}} \right) \times 100$$

### Population Invariants
- **$N_{\text{total}}$**: Total number of valid, non-disqualified candidates who submitted or were auto-submitted.
- **Self-Inclusion**: Candidate is included in $N_{\text{total}}$ and counts towards $N_{\text{equal}}$.
- **Single Participant**: $P = \frac{0 + (0.5 \times 1)}{1} \times 100 = 50.00\%$.
- **All Tied**: $P = \frac{0 + (0.5 \times N)}{N} \times 100 = 50.00\%$.
- **Disqualified / Cancelled Attempts**: Excluded from $N_{\text{total}}$ and ranking population.
- **Incomplete / Auto-Submitted Attempts**: Included in $N_{\text{total}}$ to maintain national percentile integrity.

---

## 10. Privacy-Safe Watermarking (Amendment 6)

The candidate watermark displays session context without exposing raw client IP addresses:

```
COURAGE LIBRARY LIVE ASSESSMENT
Candidate: R*** S***** (ID: #8921)
Event: SSC CGL All-India Mega Mock #01
Session Ref: e7b2-9a01
```
*(Raw client IP, user agent, and device fingerprints are stored securely in backend server audit tables only).*

---

## 11. Strict Emergency Extension Hierarchy (Amendment 7)

### A. Event-Level Extension
- Extends `event_end_at` for all active candidates (e.g. +10 minutes due to national CDN outage).
- Extends the overall grace period and processing window.

### B. Candidate-Level Extension
- Extends time for a specific candidate experiencing local technical difficulties.
- Requires:
  1. Specific administrative authorization (`p_user_id`, `p_event_id`, `p_additional_minutes`).
  2. Mandatory audit log entry with justification reason.
  3. Immutable record of `old_expiry` $\to$ `new_expiry`.

---

## 12. Leaderboard Visibility Policy: Strictly Hidden During Exam

- **During Examination**: Leaderboard is **hidden**. Candidates see only: *"Your test is in progress."*
- **Post-Submission**: Candidates see: *"Submission received. Results will be published at [Time]."*
- **Post-Publication (`PUBLISHED`)**: All-India Scorecard, Rank, Percentile, Podium, and Leaderboard become visible.

---

## 13. Security Threat Model

| Threat | Attack Vector | Architectural Defense |
| :--- | :--- | :--- |
| **T1: Answer Leakage** | Scraping questions/answers before test | Payload omits correct options & explanations until `result_publish_at`. |
| **T2: Timer Tampering** | Manipulating local clock | Server-authoritative timing: $\min(\text{start} + \text{dur}, \text{event\_end\_at})$. |
| **T3: Multi-Attempt** | Concurrent start requests | Unique constraint `(event_id, user_id)` guarantees 1 attempt. |
| **T4: Late Resubmission**| Sending answers post-expiry | Server validates expiry on every sync and finalization. |
| **T5: PII Scraping** | Leaderboard scraping | Leaderboard renders masked names (`A*** K****`) only. |
