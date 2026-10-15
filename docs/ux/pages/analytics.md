# Analytics: `/analytics`

**Purpose.** Show a student's performance over time: scores, accuracy, speed, sections, topics, and how they compare. It is built on exam-engine data that exists today. It replaces the dormant `/performance` (PSYCHOMETRICS / candidate intelligence, which is quarantined), and `/performance` 308-redirects here once this page ships.

**User and job-to-be-done.** A student between mocks. Their job: "Am I improving, and where am I losing marks?"

## Sections
1. Exam switcher and range (Last 7 days · 30 days · All).
2. **Summary tiles:**
   - mocks taken
   - average score %
   - average accuracy
   - average time per question
   - best percentile (when there are enough attempts)
3. **Score trend:** a line chart of the score % per attempt, with test-type markers (sectional / full) and a table alternative.
4. **Section performance:** for each section, accuracy and time, plus how it changed against the previous 5 attempts.
5. **Topic performance:** strongest and weakest 5, plus a full table that can be sorted. The table shows attempted, accuracy and mastery, with "Learn" and "Practise" links on each row.
6. **Speed vs accuracy:** a scatter of questions by time and correctness. This is a Pro candidate.
7. **Mistake patterns:** cognitive-type breakdown, sourced from the mistake vault.

**Components.** Select, Tabs (range), Stat tile, Chart (line / bar / scatter, using tokens; every chart has a `<table>` alternative and a text summary), Table, Badge, Pro lock panel.

## Data
- Signals: `test_results`, `section_results`, and `attempt_answers` joined to `mock_questions`, `question_versions`, `questions` and the canonical topic. There are 11 submitted attempts today, all from QA users.
- **MISSING: a read model / service** (`AnalyticsService`, a new non-quarantined service over the engine tables). The SQL aggregates must be bounded by user and date range.
- Percentile comes from `AssessmentService` leaderboard data and is shown only above an attempt threshold, so new users don't see "Rank 1 of 2".
- Mastery comes from LOOP-1.

**States.**
- Fewer than 1 submitted attempt: an empty state with "Take your first mock to see analytics".
- Fewer than 3 attempts: trends are hidden, with the message "Take {n} more mocks to see your trend".

**Access tier.** Signed-in. The basic sections (1–5) are Free; 6 and the percentile detail are Pro candidates (open question 3).

**SEO.** noindex.

**Analytics events.** `analytics_viewed`, `analytics_range_changed`, `analytics_topic_action_clicked`, `pro_lock_viewed`.

**Mobile behaviour.**
- Charts become full width and can be scrolled sideways for long series. The table alternative sits behind a "View as table" toggle.
- Topics appear as a sorted list.

**Dependencies.**
- The `AnalyticsService` read model (new).
- LOOP-1 (mastery).
- Commerce (Pro split).

Build phase: UX-7.
