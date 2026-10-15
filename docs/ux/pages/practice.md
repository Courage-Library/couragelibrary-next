# Practice: `/practice` and `/practice/[examSlug]/[topicSlug]`

**Purpose.** Untimed or lightly timed question practice by topic, with instant feedback. It feeds mastery and the mistake vault. It replaces today's placeholder "Adaptive Practice Arena", whose two buttons have no action.

**User and job-to-be-done.** A student who wants to drill a topic or subject. Their job: "Give me 10 good questions on Percentage now and tell me right away if I'm wrong."

## Sections (hub `/practice`)
1. Exam switcher (from the profile) and a "Quick start" row:
   - "Weak topics" (top 3)
   - "Continue last practice"
   - "Mixed revision (due mistakes)" (links to the drill)
2. **Subjects to topics browser.** Uses the exam's syllabus order, and shows per topic: question count, my accuracy, mastery chip, and "Practise".
3. **Custom set builder** (sheet):
   - subject / topics
   - number of questions (10 / 20 / 30)
   - difficulty
   - "only unseen" / "include mistakes"
   - timed or untimed

## Sections (session `/practice/[examSlug]/[topicSlug]`, or `/practice/session/[id]` for custom sets)
- One question at a time, with the Question renderer in **practice mode**. After the student answers, it reveals right or wrong with ✓ / ✗, the explanation, and "Learn this topic".
- A progress bar ("Question 4 of 10"), plus "Skip" and "End session".
- At the end, a compact summary with accuracy and time, and a "Mistakes added to Revision: 3" line.
- Next actions: "Practise again", "Learn topic" and "Next topic".

**Components.** Select, Course/topic node (practice variant), Sheet, Question renderer (practice), Progress, Result summary (compact), Badge, Empty state.

## Data
- Questions: published current versions by `canonical_topic_id`. These are 111 published questions across 4 subjects and 36 topics today, which is thin; about 3 per topic.
- **MISSING: a practice-session service** (server-side selection, answer evaluation server-side as in mocks, so answers are never sent to the client before the student answers).
  - The `custom_practice_sessions` table exists with 0 rows.
  - The evaluation must reuse the question-answer protection proven in E2E-07: students cannot read `question_answers`.
- Mistakes are written through `MistakeService.recordExamMistakes` with `source_context = 'PRACTICE'`.
- Mastery is updated by LOOP-1.

**States.**
- A topic with fewer than 10 questions shows "Only {n} questions yet"; the student can still practise.
- 0 questions: the topic is hidden.
- Signed out: the hub is browsable, but starting a session needs sign-in.

**Access tier.** Signed-in. Free, with an optional daily cap (open question).

**SEO.** The hub is noindex, since it is personal. The public topic practice entry point lives on the course topic page.

**Analytics events.** `practice_hub_viewed`, `practice_started` (topic / custom), `practice_answer_submitted`, `practice_completed`, `practice_abandoned`.

**Mobile behaviour.**
- The session is full screen.
- The answer button is sticky at the bottom, and the explanation expands inline below the options.

**Dependencies.**
- The practice-session service (new; it fits LOOP-1).
- GAP2-4 (topic order per exam).
- Content ops: question volume. Recommend at least 30 questions per topic before promoting practice.

Build phase: UX-6.
