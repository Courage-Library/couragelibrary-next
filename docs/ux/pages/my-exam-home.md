# My exam home: `/my/[examSlug]`

**Purpose.** The personal counterpart of the public exam hub. It shows everything for one target exam in one place: the course with progress, the test series with progress, mistakes for this exam, readiness, and exam dates.

**User and job-to-be-done.** A student preparing for more than one exam, or one who wants a focused view. Their job: "How ready am I for SSC CGL, and what's left?"

## Sections
1. Header:
   - exam name and cycle
   - countdown
   - a **readiness meter**: a composite of syllabus coverage, accuracy and mock trend, from `user_exam_readiness`. It is shown only once it is computed, with an explanation of how it is calculated.
   - "Exam info" link to the public hub
2. **Course progress:** subject rows, each with a progress bar plus "Continue: {topic}" (GAP2-4).
3. **Tests:** next test in the series, last 3 results (score trend), "All tests".
4. **Revision:** mistakes for this exam's subjects (unresolved / revisiting / mastered), "Revise due".
5. **Syllabus coverage heatmap:** topics coloured by mastery, with a table alternative.
6. **Exam updates:** latest announcements (Exam Knowledge).

**Components.** Progress (bars, ring), Stat tile, Test card, Course/topic node, Table, Badge, Breadcrumb ("My exams › SSC CGL").

## Data
- Profile goal (`user_exam_goals`).
- `user_exam_readiness`: the table exists. Its `overall_readiness_pct` and `predicted_score` are read by the dashboard; who writes them is a LOOP-1 item.
- Course progress (GAP2-4 + LOOP-1).
- `test_results`, mistakes filtered by subjects in the exam's syllabus (GAP2-4 mapping).

**States.**
- Exam not in the profile: show "Add to my exams" (adding writes the profile) rather than a 404.
- No attempts: first-run cards.
- Readiness not computed: hidden, with an explanation of what unlocks it.

**Access tier.** Signed-in.

**SEO.** noindex.

**Analytics events.** `my_exam_viewed`, `my_exam_section_clicked`, `readiness_info_opened`.

**Mobile behaviour.** Sections stack, and the heatmap becomes a list sorted by weakest first.

**Dependencies.** GAP2-4 (syllabus to filter by exam), LOOP-1 (readiness, mastery), UX-5 (series).

Build phase: UX-6.
