# Phase 5C Architecture: Live Mock Test Runner Integration

## 1. Overview & Objectives

**Phase 5C** integrates the Live/All-India Mock Test Runner into Courage Library. It enables registered candidates to enter live test rooms during authoritative event windows, take exams with server-authoritative countdown timers, save answers with sequence-order sync and offline resilience, and submit tests with auto-submit protection upon expiry.

### Core Guarantees & Non-Negotiables
1. **Engine Reuse**: Does NOT build a separate exam engine. Reuses standard Mock Test schema (`test_attempts`, `attempt_answers`, `mock_tests`, `mock_sections`, `mock_questions`, `question_versions`, `question_options`).
2. **Registration != Attempt Invariant**: Registration does not create attempts. An attempt is created atomically only when the candidate enters the live room.
3. **One Candidate + One Live Event = One Attempt**: Idempotent entry guaranteed via `uq_test_attempts_live_event_user` constraint and transactional locking.
4. **Server-Authoritative Timing**: Timers countdown towards `effective_end_at = event_end_at + authorized_extension`. Client system clocks cannot manipulate exam duration.
5. **Late-Join Policy**: Joins within `late_join_cutoff_minutes` receive proportionally reduced remaining time; joins past cutoff are rejected with `LATE_JOIN_WINDOW_EXPIRED`.
6. **Zero Answer-Key Leakage**: Zero correct options, 0 explanations, and 0 scoring keys are exposed via API or player payloads before Phase 5D publication.
7. **Sequence Number Persistence**: Out-of-order/stale client writes are safely ignored using monotonic `sequence_number` tracking.
8. **Dual-Tab Race Protection & Expiry Auto-Submit**: Submissions are synchronized with `BroadcastChannel` and transactional RPC locking; past-expiry interactions auto-submit attempts.

---

## 2. Database Schema & RPC Functions

### 2.1 Database Migration
Migration: `supabase/migrations/20260909000046_phase5c_live_test_runner_rpc.sql`

Key components:
- `attempt_answers.sequence_number` column (integer default 0) with index `idx_attempt_answers_attempt_seq`.
- Unique index `uq_test_attempts_live_event_user` on `test_attempts(live_event_id, user_id)` where `live_event_id IS NOT NULL`.

### 2.2 Core RPC Functions

#### 1. `fn_start_or_resume_live_test_attempt`
- **Security**: `SECURITY DEFINER`, verifies `auth.uid()`.
- **Validation**:
  - Verifies event exists, status is `LIVE` or `SCHEDULED`, current time is within `[event_start_at - early_access, event_end_at]`.
  - Checks candidate registration exists and is `CONFIRMED` or `ATTENDED`.
  - Rejects joins past `late_join_cutoff_minutes` with code `LATE_JOIN_WINDOW_EXPIRED`.
- **Concurrency & Idempotency**:
  - Atomically locks `live_test_registrations` row (`FOR UPDATE`).
  - Upserts/finds `test_attempts` linked to `live_event_id` and `mock_test_id`.
  - Transitions registration status from `REGISTERED` to `ATTENDED`.
  - Computes `effective_end_at = event_end_at + authorized_extension`.
- **Snapshot & Question Delivery**:
  - Fetches sections and questions tied to immutable `question_versions`.
  - Strips all `is_correct`, `explanation`, and scoring fields.

#### 2. `fn_save_live_test_answer`
- **Security**: `SECURITY DEFINER`, verifies attempt ownership.
- **Validation**:
  - Checks attempt status is `in_progress`.
  - Checks current timestamp against `effective_end_at + grace_period_seconds`.
  - If expired, automatically triggers submission (`status = 'auto_submitted'`) and returns `ATTEMPT_EXPIRED`.
- **Sequence Protection**:
  - Checks existing answer `sequence_number`.
  - If `p_sequence_number < existing.sequence_number`, ignores write and returns `is_stale: true`.
  - Upserts into `attempt_answers` using `uq_attempt_answers_attempt_question`.

#### 3. `fn_submit_live_test_attempt`
- **Security**: `SECURITY DEFINER`, verifies attempt ownership.
- **Validation**:
  - Checks attempt is `in_progress`.
  - If already submitted, returns `ALREADY_SUBMITTED` idempotently.
- **State Transition**:
  - Updates `test_attempts` status to `submitted` or `auto_submitted`, records `submitted_at` and `time_spent_seconds`.
  - Returns submission confirmation with `submitted_at`. Does NOT evaluate scores or ranks (deferred to Phase 5D).

---

## 3. Candidate Experience & UI Components

### 3.1 Live Exam Entry
- Route: `/live-tests/[slug]/take`
- Server-side validation checks authentication, registration status, event state, and late-join cutoff.
- Unauthorized or expired access renders clear error alerts with navigation back to `/live-tests/[slug]`.

### 3.2 Live Player Interface (`LiveTestPlayerClient`)
- Features:
  - **Server Timer Sync**: Calculates remaining seconds based on server-provided `effective_end_at`, ticking down in real-time.
  - **Section & Question Navigator**: Color-coded palette for Answered, Marked for Review, Visited, and Unvisited states.
  - **Offline Sync Queue**: Optimistic UI state updates with background queue retrying on network recovery.
  - **Multi-Tab Sync**: `BroadcastChannel('courage_live_test_<id>')` detects duplicate tabs and broadcasts submission events.
  - **Auto-Submission**: When timer hits 0, auto-submits candidate attempt immediately.

### 3.3 Submission Screen
- Route: `/live-tests/[slug]/submitted`
- Clean confirmation card displaying:
  - Event title and completion timestamp.
  - Official notification: *"Your submission has been securely recorded. Results will be available when published."*
  - Action buttons: "Back to Live Tests" and "Go to Dashboard".

---

## 4. Security & Anti-Cheat Controls

| Vector | Mitigation |
|---|---|
| **Answer-Key Snooping** | Stripped at PostgreSQL RPC layer before payload reaches client. |
| **Clock Manipulation** | End time fixed to server timestamp `effective_end_at`. |
| **Late Joining** | Hard rejection at RPC level after cutoff time. |
| **Concurrent Attempts** | Unique DB index + transactional row-level lock. |
| **Out-of-Order Packets** | Monotonic sequence number filtering. |
| **Stale Submission** | Auto-submit trigger on any post-expiry interaction. |

---

## 5. Frozen State & Next Phase

Phase 5C is **Production Certified & Frozen**.
Phase 5D (Result Engine & National Rank Computation) remains completely untouched and ready for next phase initiation.
