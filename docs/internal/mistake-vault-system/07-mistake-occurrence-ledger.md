# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 07: MISTAKE OCCURRENCE LEDGER

---

## 1. Table Specification: `user_mistake_occurrences`

The `user_mistake_occurrences` table maintains the immutable, append-only historical log of every mistake event.

```sql
CREATE TABLE public.user_mistake_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id UUID NOT NULL REFERENCES public.user_mistake_vault(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    question_version_id UUID REFERENCES public.question_versions(id) ON DELETE RESTRICT,
    attempt_answer_id UUID,
    source_context TEXT NOT NULL CHECK (source_context IN (
        'MOCK_TEST', 'CUSTOM_PRACTICE', 'QUIZ_BATTLE', 
        'FLASHCARD_REVIEW', 'MISTAKE_DRILL', 'DIAGNOSTIC_ASSESSMENT'
    )),
    source_reference_id UUID,
    selected_option_id UUID REFERENCES public.question_options(id) ON DELETE SET NULL,
    response_time_seconds INTEGER CHECK (response_time_seconds >= 0),
    inferred_cognitive_type_id TEXT NOT NULL DEFAULT 'UNCLASSIFIED' REFERENCES public.mistake_cognitive_types(id),
    heuristic_confidence_pct INTEGER NOT NULL DEFAULT 50 CHECK (heuristic_confidence_pct BETWEEN 0 AND 100),
    occurrence_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (occurrence_status IN ('ACTIVE', 'REVOKED_ERRATA', 'REVOKED_VOID', 'SUPERSEDED')),
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 2. Lineage Integrity Indexes

- `idx_umo_vault`: `(vault_id)` — Optimizes occurrence history retrieval per vault record.
- `idx_umo_qv`: `(question_version_id)` — Optimizes administrative errata impact cascades.
- `idx_umo_attempt_answer`: `(attempt_answer_id)` — Optimizes idempotent replay lookups.
- `idx_umo_status`: `(user_id, occurrence_status)` — Optimizes active vs revoked filtering in analytical queries.
