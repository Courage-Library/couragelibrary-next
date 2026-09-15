# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 06: MISTAKE VAULT DATA MODEL

---

## 1. Table Specification: `user_mistake_vault`

The `user_mistake_vault` table stores aggregate candidate profiles at the question level.

```sql
CREATE TABLE public.user_mistake_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    total_mistakes_count INTEGER NOT NULL DEFAULT 1 CHECK (total_mistakes_count >= 0),
    consecutive_correct_in_remediation INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_correct_in_remediation >= 0),
    lifecycle_status TEXT NOT NULL DEFAULT 'UNRESOLVED' CHECK (lifecycle_status IN ('UNRESOLVED', 'REVISITING', 'MASTERED')),
    primary_cognitive_type_id TEXT NOT NULL DEFAULT 'UNCLASSIFIED' REFERENCES public.mistake_cognitive_types(id),
    user_override_cognitive_type_id TEXT REFERENCES public.mistake_cognitive_types(id),
    user_custom_notes TEXT,
    first_mistake_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_mistake_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_practiced_at TIMESTAMPTZ,
    mastered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_question_mistake UNIQUE (user_id, question_id)
);
```

---

## 2. Performance Indexes

- `idx_umv_user_status`: `(user_id, lifecycle_status)` — Optimizes filtered candidate dashboard queries.
- `idx_umv_user_topic`: `(user_id, topic_id)` — Optimizes topic weakness aggregations.
- `idx_umv_user_last_mistake`: `(user_id, last_mistake_at DESC)` — Optimizes chronological feed sorting.
