# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 29: CONCURRENCY & IDEMPOTENCY

---

## 1. Idempotency Guarantees

In mobile and high-latency web environments, network retries can result in duplicate ingestion calls.

- **Attempt Answer Deduplication**: `fn_record_mistake_occurrence` checks `attempt_answer_id` against `user_mistake_occurrences`.
- If an occurrence already exists, the function immediately returns `idempotent_replay: true` without creating duplicate records or double-incrementing counters.

---

## 2. Row Locking for Race Prevention

To prevent concurrent test submissions from corrupting streak counters:
```sql
SELECT id, lifecycle_status INTO v_vault_id, v_status
FROM public.user_mistake_vault
WHERE user_id = p_user_id AND question_id = p_question_id
FOR UPDATE;
```
The `FOR UPDATE` clause serializes concurrent modifications on the same candidate question profile.
