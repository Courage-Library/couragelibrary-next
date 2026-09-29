# 06 — QUESTION BANK & VERSIONING ARCHITECTURE

> **DOCUMENTATION CLASSIFICATION:** Content Architecture & Versioning Specification  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Core Question Repository  

---

## 1. What is it?
The **Question Bank & Versioning Architecture** is the immutable data model that decouples the abstract pedagogical concept of a question from its textual, mathematical, graphical, and key-answer representations across time.

## 2. Why does it exist?
In competitive examination platforms, question content and answer keys are subject to errata disputes and syllabus updates:
- **Scenario A**: An exam board challenges a question wording. The author updates the text for grammatical clarity.
- **Scenario B**: An official answer key is corrected from Option A to Option C after candidate challenges.

If a platform updates the single existing row for that question in the database:
1. Every candidate who took that test previously will have their historical scorecard corrupted upon review.
2. The exact text and options the candidate saw during their live attempt are lost forever.
3. Legal/audit compliance is broken because the historical attempt cannot be reconstructed bit-for-bit.

Courage Library enforces **Immutable Question Versioning**: a question row is permanent, while each editorial revision or errata resolution generates a brand-new `question_versions` row.

---

## 3. Relational Schema & Linkage Topology

```
+----------------------------------------------------------------------------------------------------+
|                               MASTER QUESTION & VERSION TOPOLOGY                                   |
+----------------------------------------------------------------------------------------------------+

     [ public.questions ] (Master Entity)
     * id: UUID (Permanent Identifier)
     * topic_id: UUID
     * subject_id: UUID
     * default_difficulty: 'EASY' | 'MEDIUM' | 'HARD'
     * is_active: BOOLEAN
     * created_at: TIMESTAMPTZ
            │
            │ 1-to-Many
            ▼
     [ public.question_versions ] (Immutable Snapshot)
     * id: UUID (Unique Version Identifier)
     * question_id: UUID (FK -> questions.id)
     * version_number: INTEGER (1, 2, 3...)
     * question_text: TEXT (Markdown / LaTeX)
     * explanation_text: TEXT
     * language: 'en' | 'hi'
     * created_at: TIMESTAMPTZ
            │
            ├─────────────────────────────────────────┐
            │ 1-to-Many                               │ 1-to-1
            ▼                                         ▼
     [ public.question_options ]               [ public.question_answers ]
     * id: UUID                                * id: UUID
     * question_version_id: UUID               * question_version_id: UUID
     * option_key: 'A'|'B'|'C'|'D'             * correct_option_key: 'A'|'B'|'C'|'D'
     * option_text: TEXT                       * answer_explanation: TEXT
```

---

## 4. Question Versioning in Action: The Errata Lifecycle

```
====================================================================================================
                        HISTORICAL IMMUTABILITY DURING ERRATA RESOLUTION
====================================================================================================

T1 (June 1, 2024): Question #101 Created
   - questions.id = 'q_101'
   - question_versions.id = 'qv_v1' (version_number = 1)
   - question_text = "What is the capital of Australia?"
   - question_options = [A: Sydney, B: Melbourne, C: Canberra, D: Brisbane]
   - question_answers = correct_option_key = 'C'

T2 (June 15, 2024): 1,000 Candidates Attempt Mock Test #5
   - mock_questions links to 'qv_v1'
   - attempt_answers store 'qv_v1' and candidate selections.

T3 (July 1, 2024): Typo Corrected / Clarification Added
   - Author updates explanation.
   - Database creates 'qv_v2' (version_number = 2) linked to 'q_101'.
   - 'qv_v1' remains 100% UNTOUCHED in the database.

T4 (July 15, 2024): Future Mock Tests Link to 'qv_v2'
   - New candidates attempt the test with 'qv_v2'.
   - Candidates from June 15 viewing their past scorecard see 'qv_v1' EXACTLY as it was on June 15.
====================================================================================================
```

---

## 5. Previous Year Question (PYQ) Lineage Tracking

Questions originating from official government papers contain explicit provenance metadata in `public.question_sources`:
- `exam_name`: "SSC CGL"
- `tier`: 1
- `year`: 2023
- `shift_date`: "2023-07-14"
- `shift_number`: 2
- `official_question_number`: 47

This provenance allows the Premium Mock Generator to assemble 100% authentic PYQ Simulation papers matching exact official shift rosters.

---

## 6. What Must Never Happen
- A SQL `UPDATE` or `DELETE` statement must **never** be executed on `question_versions`, `question_options`, or `question_answers` if any `attempt_answers` reference that `question_version_id`.
- The client-side exam player must **never** receive `question_answers` rows during an active attempt.
- Dynamic question generators must **never** select questions marked `is_active = false`.
