# Appendix D — Complete State Machine Reference

This appendix catalogs all formal finite state machines (FSMs) across the Courage Library Assessment System.

---

## 1. Test Attempt Lifecycle FSM (`test_attempts.status`)

```mermaid
stateDiagram-v2
    [*] --> InProgress: fn_start_test_attempt / fn_start_daily_mock
    
    InProgress --> InProgress: fn_save_attempt_answer (monotonic sequence sync)
    InProgress --> Completed: fn_submit_test_attempt (Manual Submit)
    InProgress --> Completed: fn_submit_test_attempt (Client Timeout Auto-Submit)
    InProgress --> TimedOut: fn_sweep_expired_test_attempts (Server Cron Sweeper)
    InProgress --> Abandoned: User Explicit Abandon / Cancel

    Completed --> [*]: Scorecard Generated & Mistake Ingest
    TimedOut --> [*]: Scorecard Generated & Mistake Ingest
    Abandoned --> [*]: Incomplete / Zero Marks Recorded
```

### State Invariants:
- `completed` and `timed_out` are terminal sink states.
- Once an attempt transitions out of `in_progress`, all subsequent `fn_save_attempt_answer` calls are rejected with `ERR_ATTEMPT_CLOSED`.

---

## 2. Exam Player Question Palette State Machine (5 UI States)

```mermaid
stateDiagram-v2
    [*] --> NotVisited: Test Initialized
    
    NotVisited --> NotAnswered: Candidate navigates to question
    
    NotAnswered --> Answered: Selects option & clicks "Save & Next"
    NotAnswered --> MarkedForReview: Clicks "Mark for Review & Next" (No option selected)
    NotAnswered --> AnsweredAndMarked: Selects option & clicks "Mark for Review & Next"
    
    Answered --> NotAnswered: Clicks "Clear Response" & "Save & Next"
    Answered --> AnsweredAndMarked: Clicks "Mark for Review" while option selected
    
    MarkedForReview --> Answered: Selects option & clicks "Save & Next"
    MarkedForReview --> AnsweredAndMarked: Selects option & clicks "Mark for Review & Next"
    
    AnsweredAndMarked --> MarkedForReview: Clicks "Clear Response"
    AnsweredAndMarked --> Answered: Clicks "Save & Next" (Clears review flag)
```

### Scoring Evaluation at Submission:
- `Answered` $\implies$ Evaluated for Marks ($+M$ if correct, $-M$ if wrong).
- `AnsweredAndMarked` $\implies$ **Evaluated for Marks** ($+M$ if correct, $-M$ if wrong, matching NTA/TCS standard).
- `MarkedForReview` (No option selected) $\implies$ Treated as Unattempted ($0.0$ Marks).
- `NotAnswered` / `NotVisited` $\implies$ Treated as Unattempted ($0.0$ Marks).

---

## 3. Live All-India Test 14-Stage Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Scheduled: Test Created in Admin
    Scheduled --> RegistrationOpen: Clock reaches T_reg_start
    RegistrationOpen --> RegistrationClosed: Clock reaches T_reg_end
    RegistrationClosed --> TestLive: Clock reaches T_start
    TestLive --> GraceSubmission: Clock reaches T_end (120s buffer)
    GraceSubmission --> WindowClosed: T_end + 120s expired
    WindowClosed --> PreliminaryScoring: Batch Raw Scoring Triggered
    PreliminaryScoring --> DisputesOpen: Results draft compiled (24h dispute window)
    DisputesOpen --> KeysFrozen: Admin resolves all reported errata
    KeysFrozen --> RankingEngine: Single-pass dense ranking executed
    RankingEngine --> PercentilesComputed: Continuous percentile window query
    PercentilesComputed --> ResultsPublished: Public scorecards & solutions released
    ResultsPublished --> CertificatesMinted: Batch HMAC-SHA256 certificates minted
    CertificatesMinted --> Archival: Ingest into historical psychometric bank
    Archival --> [*]
```

---

## 4. Question Dispute & Errata Resolution Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Reported: Candidate files dispute via exam UI
    Reported --> UnderReview: Assigned to Subject Matter Expert (SME)
    
    UnderReview --> Rejected: Dispute invalid (Original key verified correct)
    UnderReview --> UpheldKeyChange: SME agrees key was incorrect (e.g., A -> C)
    UnderReview --> UpheldItemDropped: SME agrees item was ambiguous / defective
    
    UpheldKeyChange --> Rescored: fn_rescore_test_instances executed
    UpheldItemDropped --> Rescored: fn_rescore_test_instances (Full marks or pro-rata)
    
    Rejected --> Closed: Audit logged & candidate notified
    Rescored --> Closed: Revision logged in test_result_revisions
    Closed --> [*]
```

---

## 5. Mistake Vault Item Mastery Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Unresolved: Ingested upon exam submission (Wrong answer)
    
    Unresolved --> Practicing: Candidate launches Mistake Drill
    
    Practicing --> Unresolved: Candidate answers incorrectly in drill
    Practicing --> ReviewPending: Candidate answers correctly once
    
    ReviewPending --> Mastered: Candidate answers correctly in spaced repetition (Day 3 & Day 7)
    ReviewPending --> Unresolved: Candidate answers incorrectly in spaced review
    
    Mastered --> Archived: 30 days without relapse
    Mastered --> Unresolved: Question answered incorrectly in a future full mock
```
