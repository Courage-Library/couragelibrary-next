# 11 — LIVE ALL-INDIA TESTING & COMPETITION ARCHITECTURE

> **DOCUMENTATION CLASSIFICATION:** High-Concurrency Event & Live Assessment Specification  
> **LIFECYCLE STATUS:** Production & Frozen (Phases 5A–5E.5 Certified)  
> **SYSTEM LAYER:** Live Competition Infrastructure  

---

## 1. What is it?
The **Live All-India Testing Architecture** powers synchronized, scheduled nationwide examination events where thousands of aspirants register in advance, wait for a synchronized start window, compete under strict server-authoritative time limits, stream answers in real-time, and receive merit ranks, percentile scores, CL Coin podium rewards, and HMAC-verified digital certificates.

## 2. The 14-Stage Live Competition Lifecycle

```
[ STAGE 01: EVENT CREATION & PAPER FREEZE ]
Admin creates Live Event -> Links frozen Mock Test -> Defines Registration Window, Live Window & Buffer.

[ STAGE 02: CANDIDATE REGISTRATION (SEAT RESERVATION) ]
Candidate clicks Register -> RPC acquires capacity lock -> Assigns registration ticket.

[ STAGE 03: SYNCHRONIZED COUNTDOWN & LOBBY ]
Candidates enter lobby -> Server sends UTC countdown -> Visual lock disables test entry until START_TIME.

[ STAGE 04: ATTEMPT INITIALIZATION & SEAT CONSUMPTION ]
Window opens -> Candidate clicks Start -> Atomic RPC transitions registration to 'ATTEMPTED'.

[ STAGE 05: RUNTIME STREAMING & ANSWER BATCH SYNC ]
Candidate answers questions -> Staged locally -> Batched sync every 5 seconds with sequence counter.

[ STAGE 06: SERVER-AUTHORITATIVE TIMER EXPIRY ]
Countdown hits 00:00:00 -> Server automatically triggers `auto_submit_live_attempt`.

[ STAGE 07: SUBMISSION INGESTION & LOCK ]
Attempt status set to 'SUBMITTED' -> All further answer modifications strictly rejected by RLS.

[ STAGE 08: AUTHORITATIVE SCORING EVALUATION ]
Background workers execute Authoritative Scorer -> Calculates raw score, accuracy, and time spent.

[ STAGE 09: RESULT FREEZE (RESULT_LOCKED STATE) ]
Scores calculated but hidden from candidates until the official live event window closes.

[ STAGE 10: DETERMINISTIC MERIT RANKING & PERCENTILE INTEGRATION ]
Postgres RPC calculates Standard Competition Rank (1, 2, 2, 4) and continuous percentile.

[ STAGE 11: IMMUTABLE PUBLICATION SNAPSHOT ]
Admin publishes leaderboard -> Creates frozen, versioned snapshot in `live_test_publication_snapshots`.

[ STAGE 12: PODIUM REWARDS & COIN SETTLEMENT ]
Automated settlement awards Podium 1st (1,000 CL), 2nd (500 CL), 3rd (250 CL), and participation rewards.

[ STAGE 13: CRYPTOGRAPHIC HMAC-SHA256 CERTIFICATES ]
Issues verifiable digital certificates with tamper-proof signatures.

[ STAGE 14: 18-BADGE ACHIEVEMENT EVALUATION ]
Triggers live achievement unlocks (e.g. `PODIUM_GOLD`, `TOP_10_PERCENT`).
```

---

## 3. Registration $\ne$ Attempt Architecture

```
+----------------------------------------------------------------------------------------------------+
|                         REGISTRATION vs ATTEMPT SEPARATION OF CONCERNS                             |
+----------------------------------------------------------------------------------------------------+

[ 1. LIVE TEST REGISTRATION ]
* Table: `public.live_test_registrations`
* Purpose: Reserve seat capacity, track pre-event demand, send notification reminders.
* Mutability: Can be CANCELLED by candidate before the event start window.
* Invariant: Having a registration does NOT mean the candidate attempted the test.

[ 2. LIVE TEST ATTEMPT ]
* Table: `public.test_attempts` (with `test_type = 'LIVE_COMPETITION'`)
* Purpose: Active exam execution session.
* Mutability: Unidirectional state machine (`IN_PROGRESS` -> `SUBMITTED` -> `EVALUATED`).
* Invariant: Can only be created during the open live test window by a registered candidate.
```

---

## 4. Live Ranking & Merit Ordering Mathematics

### Merit Ordering Tie-Breaker Chain:
$$\text{Score } \downarrow \implies \text{Accuracy } \downarrow \implies \text{Correct Answers } \downarrow \implies \text{Time Taken } \uparrow \implies \text{Candidate UUID } \uparrow$$

1. **Total Net Score (DESC)**: Primary ranking criterion.
2. **Accuracy Percentage (DESC)**: Reward accuracy and penalize guessing.
3. **Correct Answers Count (DESC)**: Candidate with more positive marks ranks higher.
4. **Time Taken (ASC)**: Candidate who completed faster ranks higher.
5. **Candidate UUID (ASC)**: Deterministic backend tie-breaker (never exposed as a merit factor).

### Standard Competition Rank (1, 2, 2, 4 Method):
If two candidates tie on all merit criteria, they share the same rank, and the next candidate receives the rank corresponding to their absolute position.

### Exact Continuous Percentile Formula:
$$P = \left(\frac{N_{\text{below}} + 0.5 \times N_{\text{equal}}}{N_{\text{total}}}\right) \times 100$$

where:
- $N_{\text{total}}$: Total number of evaluated candidates in the competition.
- $N_{\text{below}}$: Number of candidates strictly below this candidate's merit score.
- $N_{\text{equal}}$: Number of candidates tied with this candidate (including self, so $N_{\text{equal}} \ge 1$).

---

## 5. Worked Percentile Examples

| Candidate | Score | Rank | $N_{\text{below}}$ | $N_{\text{equal}}$ | $N_{\text{total}}$ | Calculation | Percentile ($P$) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :---: |
| Alice | 180.0 | 1 | 9 | 1 | 10 | $\frac{9 + 0.5(1)}{10} \times 100$ | **95.0%** |
| Bob | 165.0 | 2 | 7 | 2 | 10 | $\frac{7 + 0.5(2)}{10} \times 100$ | **80.0%** |
| Charlie | 165.0 | 2 | 7 | 2 | 10 | $\frac{7 + 0.5(2)}{10} \times 100$ | **80.0%** |
| David | 150.0 | 4 | 6 | 1 | 10 | $\frac{6 + 0.5(1)}{10} \times 100$ | **65.0%** |
| ... | ... | ... | ... | ... | ... | ... | ... |
| Jack (Last)| 40.0 | 10 | 0 | 1 | 10 | $\frac{0 + 0.5(1)}{10} \times 100$ | **5.0%** |

---

## 6. What Must Never Happen
- Live scorecards must **never** be revealed to candidates while the competition window is still active.
- Candidates who registered but never started the test must **never** be included in the merit leaderboard or receive a rank.
- A live event must **never** mutate historical publication snapshots during errata recalculations.
