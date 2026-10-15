# Course path and player: `/exams/[examSlug]/course[/subjectSlug[/topicSlug]]`

**Purpose.** Show the exam's canonical syllabus as a learning path (#27), from syllabus nodes to topics. Each topic gathers four things in one place:
- learning documents (resolved via `LearningResolverService`)
- topic practice
- a topic quiz
- progress

The path is generated from the canonical syllabus, so it covers every exam with no hand-built pages.

**User and job-to-be-done.** An aspirant studying systematically, or one sent here from a mistake ("Learn this topic"). Their job: "Know what to study next, study it, and check I've got it."

## Pages and sections

### A. Course overview: `/exams/[examSlug]/course`
1. Breadcrumb ("Exams › SSC CGL › Course") and h1 "SSC CGL Course".
2. Summary:
   - subjects, topics, documents, questions
   - signed in: overall progress ring and **"Continue: {topic}"** (the last topic in progress, or the next not-started topic)
3. **Subject list.** Each subject is an expandable node showing:
   - name, number of topics, weightage tier chip (from `exam_syllabus_nodes.weightage_tier`), progress
   - when expanded: its topics as Course/topic nodes, ordered by syllabus `display_order`
   - each topic shows a status (not started / in progress / mastered), a "Pro" chip if all its documents are Pro, and its expected questions in the exam (`expected_questions_min–max`)
4. Side panel (desktop): "How to use this course", plus a link to "Take a full mock to find your weak topics".

### B. Subject page: `/exams/[examSlug]/course/[subjectSlug]`
1. Breadcrumb, subject h1, progress, topic list (same nodes as above).
2. Practice the whole subject (mixed quiz).

### C. Topic page: `/exams/[examSlug]/course/[subjectSlug]/[topicSlug]`
1. Breadcrumb, topic h1, "Asked {min–max} questions in {exam}", and the topic's mastery for a signed-in student.
2. **Learn:** the topic's documents, ordered by `LEARNING_DOCUMENT_TYPE_ORDER`:
   - concept lesson → summary → common traps → worked examples → formula sheet → PYQ deep dive
   - each shows minutes and a Free / Pro badge
   - the document opens the player (D)
3. **Practise:** "Practise 10 questions" (topic practice, instant feedback), with an optional difficulty selector.
4. **Quiz:** "Topic quiz: 15 questions, timed" (feeds mastery; results saved).
5. **Your mistakes in this topic** (signed in): count, plus a link to `/mistakes?topic=`.
6. Previous / next topic within the syllabus order.

### D. Document player: `/articles/[docSlug]?exam=&topic=`
This is the existing article page with exam context added:
- The breadcrumb reflects the course, and a "Next in this topic" footer is added.
- The canonical stays `/articles/[docSlug]`.
- Reading-width layout with a table of contents, plus "Mark as done" (writes an ACT-1 event).
- PRO documents for non-PRO viewers render the Pro lock panel. The body is never loaded; the resolver already enforces this.

**Components.** Breadcrumb, Course/topic node, Progress (ring and bar), Badge (weightage, Free / Pro), Card, Button, Pro lock panel, Question renderer (practice / quiz), Result summary (quiz compact), Empty state.

## Data
| Content | Source |
|---|---|
| Syllabus tree | GAP2-4: `exam_syllabus_versions` (active, finalised) → `exam_syllabus_nodes` (tree, weightage, expected questions) → `exam_syllabus_canonical_mappings` → `canonical_taxonomy_nodes` (slugs) |
| Documents | `LearningResolverService.resolveForTopics(topicIds)` (batch; servable only; `is_locked` for Pro) |
| Practice / quiz | Question bank by `canonical_topic_id` (published; current published version, as QF-1 already enforces for drills). **A practice-session service is MISSING** (`custom_practice_sessions` table exists, 0 rows). |
| Progress and mastery | `user_topic_mastery` (canonical_topic_id, mastery_score), maintained by LOOP-1. Document completion events come from ACT-1 (`learning_activity_events` drift noted in GAP2-2b). |

**Today.**
- Syllabus versions and nodes: 0.
- Canonical nodes: 4 subjects and 36 topics.
- Published questions: 111, spread across those subjects.
- Published documents: 0.

**States.**
- Signed out: progress hidden; the CTA "Sign in to track progress" appears once, at the top.
- A topic with 0 documents shows "Lessons for this topic are being written", and Practise remains if there are at least 10 questions.
- A topic with 0 documents and fewer than 10 questions is hidden from the public path (thin content), and shown greyed to signed-in students with "Coming soon".
- Pro-locked documents use the Pro lock panel.

**Access tier.**
- Overview, subject and topic pages are public (SEO).
- Free documents are public.
- Pro documents are Pro.
- Practice and quiz need sign-in (they write attempts).

**SEO.**
- `Course` JSON-LD on the overview: `hasCourseInstance` online, provider Courage Library.
- Topic pages: title "{Topic} for {Exam}: Concepts, Practice Questions & Quiz", `BreadcrumbList`.
- Indexing is subject to the thin-content rule in IA §3.

**Analytics events.** `course_viewed`, `course_continue_clicked`, `subject_expanded`, `topic_viewed`, `document_opened`, `document_completed`, `pro_lock_viewed`, `practice_started`, `quiz_started`, `quiz_completed`.

**Mobile behaviour.**
- Subjects are full-width accordions.
- Topic pages stack in the order Learn → Practise → Quiz, with a sticky "Continue" bar.
- The player keeps reading width and a top progress bar.

**Dependencies.**
- **GAP2-4** (hard blocker).
- Content ops (published documents).
- A practice-session service (new; it fits LOOP-1).
- ACT-1 events.

Build phase: UX-4.
