# 17 — SUBMISSION & AUTO-SUBMIT RECONCILIATION

> **DOCUMENTATION CLASSIFICATION:** Submission Protocol & Idempotency Specification  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Submission & Evaluation Gateway  

---

## 1. What is it?
The **Submission & Auto-Submit Engine** handles the final transition of a test attempt from `IN_PROGRESS` to `SUBMITTED`—processing candidate-initiated manual submissions, timer-expiry auto-submissions, and backend cron reconciliations with complete idempotency and zero score loss.

## 2. Manual Submit vs Automatic Expiry Submit

```
+---------------------------------------------------------------------------------------------------------+
| DIMENSION         | MANUAL CANDIDATE SUBMIT           | AUTOMATIC EXPIRY AUTO-SUBMIT             |
+-------------------+-----------------------------------+------------------------------------------+
| Trigger           | Candidate clicks "Submit Test"    | Visual timer reaches 00:00:00            |
| Confirmation      | Renders Summary Modal             | Bypasses modal, immediately flushes      |
| Buffer Flush      | Synchronous flush of all answers  | Emergency flush of local storage buffer  |
| Completion Reason | `'MANUAL_SUBMIT'`                 | `'TIMER_EXPIRED'`                        |
| State Transition  | `IN_PROGRESS` -> `SUBMITTED`      | `IN_PROGRESS` -> `AUTO_SUBMITTED`        |
+---------------------------------------------------------------------------------------------------------+
```

---

## 3. Atomic Submission RPC Implementation

```sql
CREATE OR REPLACE FUNCTION public.fn_submit_test_attempt(
    p_attempt_id UUID,
    p_user_id UUID,
    p_submission_reason VARCHAR DEFAULT 'MANUAL_SUBMIT'
)
RETURNS JSONB AS $$
DECLARE
    v_attempt RECORD;
    v_result JSONB;
BEGIN
    -- 1. Acquire row lock on attempt
    SELECT * INTO v_attempt
    FROM public.test_attempts
    WHERE id = p_attempt_id AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'ATTEMPT_NOT_FOUND');
    END IF;

    -- 2. Idempotency Check
    IF v_attempt.status IN ('SUBMITTED', 'AUTO_SUBMITTED', 'EVALUATED') THEN
        RETURN jsonb_build_object(
            'success', true, 
            'already_submitted', true, 
            'status', v_attempt.status,
            'attempt_id', v_attempt.id
        );
    END IF;

    -- 3. Transition to SUBMITTED
    UPDATE public.test_attempts
    SET 
        status = CASE WHEN p_submission_reason = 'TIMER_EXPIRED' THEN 'AUTO_SUBMITTED' ELSE 'SUBMITTED' END,
        completed_at = NOW(),
        submission_metadata = jsonb_build_object('reason', p_submission_reason, 'submitted_at', NOW())
    WHERE id = p_attempt_id;

    -- 4. Trigger Authoritative Scoring Evaluation
    PERFORM public.fn_evaluate_test_attempt(p_attempt_id);

    RETURN jsonb_build_object('success', true, 'attempt_id', p_attempt_id, 'status', 'EVALUATED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 4. Concurrency & Network Race Handling

### 1. Rapid Double-Clicking
- The submission button is instantly disabled on first click.
- If two network requests bypass UI disabling, the database row-level `FOR UPDATE` lock processes Request 1, transitions status, and causes Request 2 to return `already_submitted = true` cleanly.

### 2. Tab Stagger Race
- Candidate opens the test in Tab A and Tab B. Candidate submits in Tab A.
- Tab B tries to submit 10 seconds later.
- Tab B receives `already_submitted = true` and immediately redirects to the completed result page.

---

## 5. What Must Never Happen
- An attempt submission must **never** fail silently without notifying the client.
- An attempt must **never** be locked in `SUBMITTED` state without triggering the Authoritative Scorer.
