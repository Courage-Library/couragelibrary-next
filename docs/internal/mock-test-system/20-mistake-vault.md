# 20 — MISTAKE VAULT & TARGETED REVISION REPOSITORY

> **DOCUMENTATION CLASSIFICATION:** Pedagogical Remediation & Revision Engine  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Error Routing & Weak Area Remediation  

---

## 1. What is it?
The **Mistake Vault** is the automated error capture and targeted revision repository that archives every incorrect question response across all test attempts, tracks mistake categories (Silly Mistake, Conceptual Gap, Time Pressure), and drives the **Mistake Revision Test Generator**.

## 2. Why does it exist?
In competitive exams, repeated mistakes are the primary cause of failure. Candidates who review their errors once in a solution window forget them within 7 days. The Mistake Vault ensures that every question answered incorrectly is converted into an active revision ticket that remains open until the candidate re-attempts and solves it correctly in a dedicated revision drill.

---

## 3. Automated Error Routing Pipeline

```
+----------------------------------------------------------------------------------------------------+
|                               MISTAKE VAULT ROUTING & REVISION PIPELINE                            |
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
[ STEP 1: ASSESSMENT SUBMISSION & SCORING ]
Candidate completes test -> Scorer identifies all items where `is_answered = true` AND `is_correct = false`.
                                                  |
                                                  v
[ STEP 2: MISTAKE VAULT INGESTION RPC ]
Database executes bulk upsert into `public.mistake_vault`:
* `user_id`: Candidate UUID
* `question_version_id`: Exact immutable version failed
* `attempt_id`: Source attempt
* `selected_option_key`: Incorrect option chosen
* `status`: 'UNRESOLVED'
* `error_count`: Increments if question was previously failed
                                                  |
                                                  v
[ STEP 3: MISTAKE VAULT WORKBENCH ]
Candidate browses mistakes by Subject, Topic, or Exam.
Can tag error reason: [Conceptual Gap] [Calculation Error] [Misread Question].
                                                  |
                                                  v
[ STEP 4: MISTAKE REVISION TEST GENERATION ]
Candidate clicks "Generate Mistake Revision Test" -> Premium Generator pulls 20 unresolved vault questions.
                                                  |
                                                  v
[ STEP 5: AUTOMATED RESOLUTION ]
Upon achieving correct answers in the revision drill, vault status transitions to 'RESOLVED'.
```

---

## 4. Database Schema: `public.mistake_vault`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
- `question_version_id UUID NOT NULL REFERENCES public.question_versions(id)`
- `source_attempt_id UUID NOT NULL REFERENCES public.test_attempts(id)`
- `status VARCHAR(30) DEFAULT 'UNRESOLVED' CHECK (status IN ('UNRESOLVED', 'IN_REVISION', 'RESOLVED'))`
- `error_count INTEGER NOT NULL DEFAULT 1`
- `user_notes TEXT`
- `created_at TIMESTAMPTZ DEFAULT now()`
- `resolved_at TIMESTAMPTZ`

---

## 5. What Must Never Happen
- A mistake record must **never** be deleted when a question version receives errata; it is marked resolved or updated with version lineage.
- Candidates must **never** be able to see other candidates' Mistake Vault records (guarded by `user_id = auth.uid()` RLS).
