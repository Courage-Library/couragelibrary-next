# 34 — DATABASE ARCHITECTURE & MASTER SCHEMA TOPOLOGY

> **DOCUMENTATION CLASSIFICATION:** Database Architecture & Physical Schema Topology  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Relational Storage & Index Topology  

---

## 1. What is it?
The **Database Architecture & Master Schema Topology** documents the physical PostgreSQL tables, foreign key constraints, primary key strategies, indexing plans, and immutable trigger functions supporting the Courage Library assessment platform.

## 2. Table Indexing & Query Optimization Matrix

```
+------------------------------------+-------------------------------------------+-----------------------------------+
| TABLE NAME                         | INDEX DEFINITIONS                         | OPTIMIZED ACCESS PATTERN          |
+------------------------------------+-------------------------------------------+-----------------------------------+
| `public.test_attempts`             | `idx_attempts_user_status` (`user_id`,    | Candidate dashboard active attempt|
|                                    | `status`, `started_at` DESC)              | lookup & history queries.         |
+------------------------------------+-------------------------------------------+-----------------------------------+
| `public.attempt_answers`           | `idx_attempt_answers_composite`           | Batch response upserts & score    |
|                                    | (`attempt_id`, `question_version_id`)     | evaluation joins.                 |
+------------------------------------+-------------------------------------------+-----------------------------------+
| `public.question_versions`         | `idx_qv_question_id_ver` (`question_id`,  | Latest question version retrieval |
|                                    | `version_number` DESC)                    | during test generation.           |
+------------------------------------+-------------------------------------------+-----------------------------------+
| `public.mock_questions`            | `idx_mock_questions_section`              | Exam player question roster       |
|                                    | (`mock_section_id`, `order_index` ASC)    | rendering order.                  |
+------------------------------------+-------------------------------------------+-----------------------------------+
| `public.test_psychometric_snap`    | `idx_test_psych_snap_calc`                | Historical reliability audit &    |
|                                    | (`mock_test_id`, `calculated_at` DESC)    | paper health analytics.           |
+------------------------------------+-------------------------------------------+-----------------------------------+
| `public.psychometric_review_queue` | `idx_review_queue_status_sev`             | Admin triage cockpit pending flag |
|                                    | (`review_status`, `severity`, `created_at`)| queries.                          |
+------------------------------------+-------------------------------------------+-----------------------------------+
```

---

## 3. Immutability Trigger Architecture

```sql
-- Mutation Prevention Trigger Function
CREATE OR REPLACE FUNCTION public.fn_prevent_test_psychometric_snapshots_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'test_psychometric_snapshots records are strictly immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

-- Trigger Attachment
DROP TRIGGER IF EXISTS trg_prevent_test_psychometric_snapshots_mutation ON public.test_psychometric_snapshots;
CREATE TRIGGER trg_prevent_test_psychometric_snapshots_mutation
BEFORE UPDATE OR DELETE ON public.test_psychometric_snapshots
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_test_psychometric_snapshots_mutation();
```

---

## 4. What Must Never Happen
- Foreign keys without indexes must **never** be added on high-volume transactional tables (prevents table-locking during cascades).
- Migration files must **never** contain destructive `DROP TABLE` or `TRUNCATE` statements against the 14 certified baseline tables.
