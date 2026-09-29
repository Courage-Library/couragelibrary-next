# Question Bank Architecture Specification
**Authoritative Question Repository, Cognitive Metadata, Versioning & Psychometrics Architecture**

---

## 1. Executive Summary & Purpose

The **Question Bank Subsystem** is Courage Library's centralized repository of authentic examination items, previous year questions (PYQs), and high-yield simulation questions. Every item in the question bank is uniquely identified, version-controlled, mapped to the canonical curriculum taxonomy, enriched with cognitive mistake metadata, and monitored by real-time Item Response Theory (IRT) psychometrics.

---

## 2. Core Relational Data Model

### 2.1 Questions & Versioning (`public.questions` & `public.question_versions`)
- **`questions`**: `id`, `topic_id`, `subtopic_id`, `question_type` (`SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `NUMERICAL`, `DESCRIPTIVE`), `difficulty_level` (`EASY`, `MEDIUM`, `HARD`), `source_type` (`PYQ`, `ORIGINAL_SIMULATION`), `year`, `tier`, `current_version_id`, `is_active`.
- **`question_versions`**: `id`, `question_id`, `version_number`, `question_text`, `options` (JSON array of `{ id, text, isCorrect, explanation }`), `solution_text`, `solution_mdx`, `created_at`.

### 2.2 Cognitive Metadata & Error Mapping
Every question includes pre-classified cognitive error mappings to support the Mistake Vault:
- **Primary Cognitive Trap**: Conceptual confusion, miscalculation, misreading question premise, time panic, edge-case omission.
- **Trap Explanations**: Specific diagnostic feedback for each incorrect distractor option.

### 2.3 Question Reporting & Errata Workflow (`public.question_reports`)
Candidates can flag suspected errata during mock attempts (`/api/assessment/report-question`):
- **Report Statuses**: `PENDING_REVIEW`, `ACCEPTED_ERRATA`, `REJECTED_VALID`, `RESOLVED`.
- **Errata Correction**: When an erratum is accepted, a new immutable `question_version` is created; existing historical test attempt scores are preserved with audit logs.

---

## 3. Item Psychometrics & Calibration

The system evaluates item quality using empirical attempt data:
- **Facility Index ($p$-value)**: Proportion of candidates answering correctly ($0.0 \le p \le 1.0$).
- **Discrimination Index ($D$-value)**: Point-biserial correlation between item performance and overall test score ($D \ge 0.30$ indicates high quality).
- **Time Distribution**: Average time spent by correct vs. incorrect candidates.
- **Distractor Efficiency**: Frequency of selection for each incorrect option to identify ineffective distractors.
