# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 24: QUESTION VERSIONING & CONTENT LINEAGE

---

## 1. The Question Versioning Imperative

In competitive exam prep platforms, question content frequently undergoes minor editorial revisions (e.g., fixing typographical errors, clarifying option phrasing, or upgrading explanation diagrams). 

If a mistake record merely links to a mutable `question_id`, historical performance analytics become invalid if the question fundamentally changes later.

```mermaid
erDiagram
    QUESTIONS ||--|{ QUESTION_VERSIONS : has_history
    QUESTION_VERSIONS ||--o{ USER_MISTAKE_OCCURRENCES : binds_provenance
    QUESTION_VERSIONS {
        uuid id PK
        uuid question_id FK
        integer version_number
        text question_text
        jsonb options_data
        uuid correct_option_id
        boolean is_current
        timestamptz created_at
    }
    USER_MISTAKE_OCCURRENCES {
        uuid id PK
        uuid vault_id FK
        uuid question_version_id FK
        text occurrence_status
    }
```

---

## 2. Immutability & Foreign Key Constraints

1. **Foreign Key Protection**:
   ```sql
   ALTER TABLE public.user_mistake_occurrences
   ADD CONSTRAINT fk_umo_qv
   FOREIGN KEY (question_version_id)
   REFERENCES public.question_versions(id)
   ON DELETE RESTRICT;
   ```
   The `ON DELETE RESTRICT` constraint prevents any question version that has associated candidate mistake occurrences from being accidentally dropped.

2. **Automatic Version Resolution**:
   When `fn_record_mistake_occurrence` is invoked without an explicit `p_question_version_id`, it deterministically selects the currently active version:
   ```sql
   SELECT id INTO v_target_version_id
   FROM public.question_versions
   WHERE question_id = p_question_id AND is_current = true
   ORDER BY version_number DESC
   LIMIT 1;
   ```
