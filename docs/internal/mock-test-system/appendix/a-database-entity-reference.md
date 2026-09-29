# Appendix A — Database Entity & Schema Reference

This reference catalogs all relational entities across the Courage Library Assessment System, detailing primary keys, foreign key constraints, indexes, and nullability rules.

---

## 1. Core Assessment & Blueprint Entities

### `mock_templates`
Blueprint definitions for exam cycles and patterns.
- `id` (UUID, PK): Unique template identifier.
- `exam_id` (UUID, FK -> `exams.id`): Target exam category (e.g., SSC CGL, RRB NTPC).
- `title` (TEXT, NOT NULL): Human-readable template title.
- `pattern_type` (TEXT, NOT NULL): `'daily_mock'`, `'full_length'`, `'sectional'`, `'speed_drill'`.
- `total_marks` (NUMERIC(6,2), NOT NULL): Sum of maximum marks across all sections.
- `duration_minutes` (INT, NOT NULL): Total allotted time.
- `blueprint_config` (JSONB, NOT NULL): Section specifications, question counts, negative marks.
- `created_at` (TIMESTAMPTZ, DEFAULT NOW()).

### `mock_tests`
Concrete, scheduled, or dynamically assembled test instances.
- `id` (UUID, PK): Concrete test instance identifier.
- `template_id` (UUID, FK -> `mock_templates.id`, NULLABLE): Source template if generated from blueprint.
- `title` (TEXT, NOT NULL): Test title displayed on candidate dashboard.
- `type` (TEXT, NOT NULL): `'daily_mock'`, `'premium_custom'`, `'live_competition'`, `'adaptive_cat'`.
- `total_questions` (INT, NOT NULL): Total question count.
- `total_marks` (NUMERIC(6,2), NOT NULL): Maximum possible score.
- `duration_seconds` (INT, NOT NULL): Allocated runtime duration.
- `is_ephemeral` (BOOLEAN, DEFAULT FALSE): Set true for dynamic user-generated custom mocks.
- `created_at` (TIMESTAMPTZ, DEFAULT NOW()).

### `mock_sections`
Logical subject subdivisions within a test instance.
- `id` (UUID, PK): Section identifier.
- `mock_test_id` (UUID, FK -> `mock_tests.id`, NOT NULL): Parent test instance.
- `title` (TEXT, NOT NULL): Section name (e.g., "Quantitative Aptitude").
- `order_index` (INT, NOT NULL): Display sequence in exam player.
- `duration_seconds` (INT, NULLABLE): Sectional timer limit if strict sectional timing is enforced.
- `correct_marks` (NUMERIC(4,2), NOT NULL): Marks awarded per correct response.
- `penalty_marks` (NUMERIC(4,2), NOT NULL): Marks deducted per incorrect response.

### `mock_questions`
Mapping table linking test instances/sections to immutable question versions.
- `id` (UUID, PK): Unique link record.
- `mock_test_id` (UUID, FK -> `mock_tests.id`, NOT NULL).
- `mock_section_id` (UUID, FK -> `mock_sections.id`, NOT NULL).
- `question_id` (UUID, FK -> `questions.id`, NOT NULL).
- `question_version_id` (UUID, FK -> `question_versions.id`, NOT NULL): Frozen immutable version link.
- `position` (INT, NOT NULL): 1-based question number within the test paper.

---

## 2. Question Bank & Versioning Entities

### `questions`
Root entity for authoring, tagging, and taxonomy.
- `id` (UUID, PK): Root question ID.
- `subject_id` (UUID, NOT NULL), `topic_id` (UUID, NOT NULL), `subtopic_id` (UUID, NULLABLE).
- `difficulty_level` (TEXT, NOT NULL): `'easy'`, `'medium'`, `'hard'`.
- `created_by` (UUID, FK -> `auth.users.id`).
- `created_at` (TIMESTAMPTZ, DEFAULT NOW()).

### `question_versions`
Immutable snapshot containing question content, diagrams, and solution text.
- `id` (UUID, PK): Unique version ID.
- `question_id` (UUID, FK -> `questions.id`, NOT NULL): Parent question container.
- `version_number` (INT, NOT NULL): Sequential version counter ($1, 2, 3\dots$).
- `content_markup` (TEXT, NOT NULL): Question text with LaTeX KaTeX markup.
- `explanation_markup` (TEXT, NOT NULL): Step-by-step solution.
- `is_active` (BOOLEAN, DEFAULT TRUE): Active version used for new test assemblies.
- `created_at` (TIMESTAMPTZ, DEFAULT NOW()).

### `question_options`
Individual answer choices belonging to an immutable question version.
- `id` (UUID, PK): Option UUID.
- `question_version_id` (UUID, FK -> `question_versions.id`, NOT NULL).
- `option_key` (TEXT, NOT NULL): `'A'`, `'B'`, `'C'`, `'D'`.
- `content_markup` (TEXT, NOT NULL): Option text / formula.
- `is_correct` (BOOLEAN, NOT NULL): Authoritative answer flag (never sent to client during exam).

---

## 3. Runtime Attempt & Scoring Entities

### `test_attempts`
Active candidate exam execution state machine.
- `id` (UUID, PK): Unique attempt session.
- `user_id` (UUID, FK -> `auth.users.id`, NOT NULL).
- `mock_test_id` (UUID, FK -> `mock_tests.id`, NOT NULL).
- `template_id` (UUID, FK -> `mock_templates.id`, NULLABLE).
- `status` (TEXT, NOT NULL): `'in_progress'`, `'completed'`, `'abandoned'`, `'timed_out'`.
- `started_at` (TIMESTAMPTZ, NOT NULL DEFAULT NOW()).
- `completed_at` (TIMESTAMPTZ, NULLABLE).
- `allocated_duration_seconds` (INT, NOT NULL).
- `active_tab_token` (UUID, NULLABLE): Anti-multi-tab concurrency token.

### `attempt_answers`
Candidate response ledger with monotonic sequence ordering.
- `id` (UUID, PK): Record ID.
- `attempt_id` (UUID, FK -> `test_attempts.id`, NOT NULL).
- `question_id` (UUID, FK -> `questions.id`, NOT NULL).
- `selected_option_id` (UUID, FK -> `question_options.id`, NULLABLE).
- `is_marked_for_review` (BOOLEAN, DEFAULT FALSE).
- `time_spent_seconds` (INT, DEFAULT 0).
- `client_sequence_id` (BIGINT, NOT NULL DEFAULT 1).
- `updated_at` (TIMESTAMPTZ, DEFAULT NOW()).
- **Unique Constraint**: `UNIQUE (attempt_id, question_id)`.

### `test_results`
Immutable evaluated student scorecard.
- `id` (UUID, PK): Result record.
- `attempt_id` (UUID, FK -> `test_attempts.id`, UNIQUE, NOT NULL).
- `user_id` (UUID, FK -> `auth.users.id`, NOT NULL).
- `mock_test_id` (UUID, FK -> `mock_tests.id`, NOT NULL).
- `raw_score` (NUMERIC(6,2), NOT NULL): Computed $+M, -M$ mark.
- `max_marks` (NUMERIC(6,2), NOT NULL).
- `correct_count` (INT, NOT NULL), `wrong_count` (INT, NOT NULL), `unattempted_count` (INT, NOT NULL).
- `accuracy_percentage` (NUMERIC(5,2), NOT NULL).
- `all_india_rank` (INT, NULLABLE), `percentile` (NUMERIC(5,2), NULLABLE).
- `created_at` (TIMESTAMPTZ, DEFAULT NOW()).

---

## 4. Psychometrics & Calibration Entities

### `adaptive_item_calibrations`
Calibrated 1PL Rasch difficulty and classical parameters.
- `id` (UUID, PK).
- `question_id` (UUID, FK -> `questions.id`, NOT NULL).
- `difficulty_b` (NUMERIC(6,4), NOT NULL): Rasch $b_i \in [-3.0, +3.0]$.
- `facility_p` (NUMERIC(5,4), NOT NULL): Classical $p \in [0.0, 1.0]$.
- `point_biserial_r` (NUMERIC(5,4), NOT NULL): Corrected $r_{\text{pbis}} \in [-1.0, +1.0]$.
- `sample_size` (INT, NOT NULL): Number of candidate responses evaluated.
- `evidence_watermark` (TEXT, NOT NULL): SHA-256 integrity hash.
- `calibrated_at` (TIMESTAMPTZ, DEFAULT NOW()).
- **Unique Constraint**: `UNIQUE (question_id)`.

### `adaptive_item_distractor_analytics`
Option-level performance diagnostics.
- `id` (UUID, PK).
- `question_id` (UUID, NOT NULL), `option_id` (UUID, NOT NULL).
- `selection_frequency` (NUMERIC(5,4), NOT NULL): Proportion selecting this option.
- `distractor_point_biserial` (NUMERIC(5,4), NOT NULL): Option correlation $r_{\text{dist}}(k)$.
- `quality_flag` (TEXT, NOT NULL): `'FUNCTIONAL'`, `'UNATTRACTIVE'`, `'AMBIGUOUS'`.
