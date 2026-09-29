# Appendix B — API & PostgreSQL RPC Reference Dictionary

This reference catalogs all PostgreSQL Stored Procedures (`SECURITY DEFINER` RPCs) and Next.js Server Actions powering the Courage Library Assessment System.

---

## 1. PostgreSQL Stored Procedures (RPCs)

### 1. `fn_start_daily_mock`
- **Purpose**: Atomically initiates a Daily Free Mock attempt while enforcing the 1-attempt per IST calendar day limit.
- **Security**: `SECURITY DEFINER`, accessible only to authenticated candidates.
- **Signature**:
  ```sql
  fn_start_daily_mock(
      p_user_id UUID,
      p_template_id UUID,
      p_ist_date DATE
  ) RETURNS JSONB
  ```
- **Return Payload**:
  ```json
  {
    "success": true,
    "attempt_id": "8f3b2a10-...",
    "allocated_duration_seconds": 900,
    "started_at": "2026-09-10T06:30:00.000Z",
    "server_now": "2026-09-10T06:30:00.000Z"
  }
  ```
- **Error Codes**: `ERR_DAILY_MOCK_ATTEMPT_LIMIT_EXCEEDED`, `ERR_TEMPLATE_NOT_FOUND`.

---

### 2. `fn_save_attempt_answer`
- **Purpose**: Monotonically saves or updates a candidate's response for question $Q_i$, handling out-of-order sequence resolution and attempt expiration verification.
- **Signature**:
  ```sql
  fn_save_attempt_answer(
      p_attempt_id UUID,
      p_question_id UUID,
      p_selected_option_id UUID,
      p_time_spent_seconds INT,
      p_sequence_id BIGINT,
      p_is_marked_for_review BOOLEAN DEFAULT FALSE
  ) RETURNS JSONB
  ```
- **Logic**:
  - Validates `status = 'in_progress'` and `NOW() <= started_at + duration + 30s grace`.
  - Discards packet if `p_sequence_id <= stored_sequence_id`.
  - Updates `time_spent_seconds` incrementally.

---

### 3. `fn_submit_test_attempt`
- **Purpose**: Atomically finalizes an exam attempt, grades responses, inserts `test_results`, ingests errors into Mistake Vault, and triggers gamification rewards.
- **Signature**:
  ```sql
  fn_submit_test_attempt(
      p_attempt_id UUID,
      p_submission_source TEXT DEFAULT 'manual'
  ) RETURNS JSONB
  ```
- **Return Payload**:
  ```json
  {
    "success": true,
    "result_id": "4e1c9d20-...",
    "raw_score": 74.50,
    "max_marks": 100.00,
    "accuracy_percentage": 82.78,
    "correct_count": 39,
    "wrong_count": 8,
    "unattempted_count": 3
  }
  ```

---

### 4. `fn_sweep_expired_test_attempts`
- **Purpose**: Background pg_cron job sweeping abandoned attempts where time has expired without client submit.
- **Signature**: `fn_sweep_expired_test_attempts() RETURNS TABLE (closed_count INT)`
- **Concurrency**: Operates using `SELECT ... FOR UPDATE SKIP LOCKED` to prevent deadlocks across worker nodes.

---

### 5. `fn_credit_gamification_coins`
- **Purpose**: Idempotently awards CL Coins for academic milestones and exam completions.
- **Signature**:
  ```sql
  fn_credit_gamification_coins(
      p_user_id UUID,
      p_amount INT,
      p_idempotency_key TEXT,
      p_reference_type TEXT,
      p_reference_id UUID
  ) RETURNS JSONB
  ```

---

## 2. Next.js Server Action API Endpoints

### 1. `startExamAction`
- **Path**: `actions/exam.actions.ts -> startExamAction`
- **Request**:
  ```typescript
  interface StartExamRequest {
    testId?: string;
    templateId?: string;
    modality: 'daily_mock' | 'premium_custom' | 'live_test' | 'adaptive_cat';
  }
  ```
- **Response**: Sanitized question bundle. All `is_correct`, `solution_markup`, and psychometric parameters are stripped.

---

### 2. `syncAnswerBatchAction`
- **Path**: `actions/exam.actions.ts -> syncAnswerBatchAction`
- **Request**:
  ```typescript
  interface SyncBatchRequest {
    attemptId: string;
    mutations: Array<{
      questionId: string;
      selectedOptionId: string | null;
      timeSpentSeconds: number;
      sequenceId: number;
      isMarkedForReview: boolean;
    }>;
  }
  ```

---

### 3. `getExamResultAction`
- **Path**: `actions/result.actions.ts -> getExamResultAction`
- **Request**: `{ attemptId: string }`
- **Response**: Comprehensive result bundle including full question explanations, sectional breakdown, time benchmarks, and mistake vault links.
