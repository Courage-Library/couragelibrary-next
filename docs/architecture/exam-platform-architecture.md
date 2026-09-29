# Exam Platform & Multi-Exam Architecture Specification
**Authoritative Multi-Exam Platform, Governance & Cycle Management Architecture**

---

## 1. Domain Overview & Multi-Exam Vision

Courage Library is engineered to support dozens of concurrent recruitment examinations spanning central and state commissions. The platform treats every examination as an **evergreen entity** linked to one or more temporal **recruitment cycles**, while preserving a global, shared **canonical curriculum taxonomy**.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       MULTI-EXAM DOMAIN HIERARCHY                                      │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                        │
│                           ┌─────────────────────────────────────────────────┐                          │
│                           │        GOVERNMENT RECRUITMENT DOMAIN            │                          │
│                           │  (CENTRAL_GOVT, DEFENCE, BANKING, STATE_PSC...) │                          │
│                           └─────────────────────────────────────────────────┘                          │
│                                                     │                                                  │
│                                                     ▼                                                  │
│                           ┌─────────────────────────────────────────────────┐                          │
│                           │               EXAMINATION ENTITY                │                          │
│                           │     (e.g., SSC CGL, UPSC CSE, IBPS PO, CDS)     │                          │
│                           │          - slug, title, conducting_org_id       │                          │
│                           └─────────────────────────────────────────────────┘                          │
│                                                     │                                                  │
│                                                     ▼                                                  │
│                           ┌─────────────────────────────────────────────────┐                          │
│                           │            TEMPORAL RECRUITMENT CYCLES          │                          │
│                           │         (e.g., Cycle 2026, Cycle 2025)          │                          │
│                           │    - milestone dates, vacancies, status         │                          │
│                           └─────────────────────────────────────────────────┘                          │
│                                                     │                                                  │
│                         ┌───────────────────────────┴───────────────────────────┐                      │
│                         ▼                                                       ▼                      │
│      ┌─────────────────────────────────────┐         ┌─────────────────────────────────────┐           │
│      │      EXAM KNOWLEDGE DOCUMENTS       │         │        SYLLABUS & CURRICULUM        │           │
│      │   (24 Cycle/Timeless Modules:       │         │  (Projects Global Canonical Subjects│           │
│      │    Overview, Pattern, Dates...)     │         │   & Topics with Exam Weightages)    │           │
│      └─────────────────────────────────────┘         └─────────────────────────────────────┘           │
│                                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Entities & Relational Data Model

### 2.1 Conducting Authority (`public.conducting_orgs`)
Represents the official government recruitment agency or statutory commission.
- **Fields**: `id`, `name`, `slug`, `official_website`, `description`, `created_at`, `updated_at`.
- **Examples**: Staff Selection Commission (SSC), Union Public Service Commission (UPSC), Railway Recruitment Boards (RRB), Institute of Banking Personnel Selection (IBPS).

### 2.2 Examination (`public.exams`)
Represents the evergreen competitive examination.
- **Fields**: `id`, `title`, `slug` (unique), `domain`, `description`, `conducting_org_id`, `category_id`, `is_active`, `created_at`, `updated_at`.
- **Lifecycle Invariant**: An exam remains in draft (`is_active = false`) during onboarding until verified by the 14-Dimension Readiness Gate.

### 2.3 Recruitment Cycle (`public.exam_cycles`)
Represents a specific edition or recruitment year of an examination.
- **Fields**: `id`, `exam_id`, `cycle_year` (integer), `cycle_label` (e.g., "2026 Notification"), `notification_date`, `application_start_date`, `application_end_date`, `exam_start_date`, `exam_end_date`, `total_vacancies`, `status` (`DRAFT`, `UPCOMING`, `APPLICATION_OPEN`, `EXAM_ONGOING`, `COMPLETED`, `ARCHIVED`), `created_at`, `updated_at`.
- **Relational Integrity**: Foreign key to `exams(id)` with cascade/restrict protection.

### 2.4 Examination Patterns (`public.exam_patterns`)
Defines the official tier/stage structure for the examination.
- **Fields**: `id`, `exam_id`, `name` (e.g. "Tier 1 Computer Based Examination"), `tier_name` ("Tier 1"), `duration_minutes`, `total_questions`, `total_marks`, `negative_mark_value`, `is_active`.

### 2.5 Posts & Cadres (`public.exam_posts`)
Defines recruitment posts, cadre classifications, and pay scales offered under the exam.
- **Fields**: `id`, `exam_id`, `post_name`, `post_code`, `department`, `classification_group` ("Group B Gazetted", "Group B Non-Gazetted", "Group C"), `pay_level`, `grade_pay`, `is_gazetted`, `is_active`, `display_order`.

---

## 3. Relationship to Canonical Curriculum & Knowledge Base

```
                                GLOBAL CANONICAL CURRICULUM
                         ┌───────────────────────────────────────┐
                         │   SUBJECTS (Quant, Reasoning...)      │
                         │   TOPICS (Percentage, Syllogism...)   │
                         │   SUBTOPICS & LEARNING UNITS          │
                         └───────────────────────────────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       │ (Projections via exam_syllabi & exam_topics)
                       ▼                                           ▼
            EXAMINATION: SSC CGL                       EXAMINATION: IBPS PO
        ┌───────────────────────────┐              ┌───────────────────────────┐
        │ Syllabus Projection       │              │ Syllabus Projection       │
        │ - Quant: High Weightage   │              │ - Quant: High Weightage   │
        │ - Reasoning: High Depth   │              │ - Reasoning: High Depth   │
        │ - General Awareness: High │              │ - Banking Awareness: High │
        │                           │              │                           │
        │ Knowledge Base (24 Modules│              │ Knowledge Base (24 Modules│
        │ - ssc-cgl-exam-overview   │              │ - ibps-po-exam-overview   │
        │ - ssc-cgl-exam-pattern    │              │ - ibps-po-exam-pattern    │
        │ - ssc-cgl-important-dates │              │ - ibps-po-important-dates │
        └───────────────────────────┘              └───────────────────────────┘
```

1. **Zero Curriculum Duplication**: Global subjects (`Quantitative Aptitude`, `Reasoning`, `English Comprehension`, `General Awareness`) and canonical topics exist once in `public.subjects` and `public.topics`. Examinations project and assign specific weightages to canonical topics via `exam_topics` rather than inventing duplicate subject trees.
2. **Unified Dynamic Modules**: Every onboarded exam automatically inherits access to all 24 canonical modules in `ExamModuleRegistry`.
3. **Candidate Hub Routing**: Candidate navigation follows a clean, predictable URL structure:
   - `/exams/[slug]` $\rightarrow$ Comprehensive Exam Hub & Timeless Modules
   - `/exams/[slug]/[moduleSlug]` $\rightarrow$ Specific Timeless Knowledge Module (e.g. `/exams/ssc-cgl/exam-pattern`)
   - `/exams/[slug]/cycle/[cycleYear]` $\rightarrow$ Specific Recruitment Cycle Hub
   - `/exams/[slug]/cycle/[cycleYear]/[moduleSlug]` $\rightarrow$ Cycle-Specific Module (e.g. `/exams/ssc-cgl/cycle/2026/important-dates`)

---

## 4. Multi-Exam Governance & Isolation Invariants

- **Draft Isolation**: Any exam with `is_active = false` is strictly excluded from candidate search indexes, candidate directory pages, and SEO sitemaps.
- **Cross-Exam Boundary Protection**: Test fixtures and newly onboarded examinations cannot mutate or cross-reference the canonical records of established production exams (e.g., SSC CGL 2026 baseline `a51ea811-6ffd-48fc-bf84-1e47ffd9934c`).
- **Transactional Consistency**: Deleting or archiving a draft exam cycle cascades cleanly across associated uncommitted drafts without corrupting published knowledge snapshots.
