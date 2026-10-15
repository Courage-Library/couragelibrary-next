# Courses catalogue: `/courses`

**Purpose.** List the course of every active exam whose canonical syllabus is finalised. A course is the exam's syllabus learning path (#27); it is not the dormant courses/modules/lessons model.

**User and job-to-be-done.** An aspirant comparing what they can study here. Their job: "Is there a structured course for my exam, and how big is it?"

## Sections
1. Breadcrumb and h1 "Courses: a complete syllabus path for your exam".
2. Category chips, the same as the exams directory.
3. **Course cards**, one per exam with a finalised syllabus. Each card shows:
   - exam name
   - subjects and topic count
   - learning documents available (Free / Pro split)
   - practice questions available
   - "Your progress" (signed-in)
   - CTA: "Open course" (to `/exams/[slug]/course`)
4. "Courses being prepared": active exams without a finalised syllabus, with a "Notify me" action.
5. An explainer of how a course works: Learn, then Practise, then Quiz, then Revise.

**Components.** Breadcrumb, Tabs (chips), Card (course variant), Progress (ring), Badge (Free / Pro counts), Empty state.

## Data
- A GAP2-4 syllabus service lists exams that have an active finalised `exam_syllabus_versions` row plus node counts.
- `LearningResolverService.resolveForTopics` provides document counts in batch. It uses one query and has no N+1.
- Question counts by canonical topic come from `questions` (published).
- Progress comes from a LOOP-1 / ACT-1 progress read model.

**Today.**
- There are 0 syllabus versions and 0 published learning documents (2 archived).
- The old `/courses` (1 course, "free-masterclass") is DORMANT behind `FEATURE_COURSES`, and the route returns 404.

**States.**
- Zero courses: an empty state ("Courses open soon. Meanwhile, take free mocks") with a link to `/mock-tests`. Never render a page of empty cards.
- Content thresholds: a course is listed only if it has at least 1 subject where every topic is mapped, plus at least 1 published document or at least 50 questions.

**Access tier.** Public catalogue; progress is shown to signed-in users.

**SEO.** Title "Online Courses for SSC, Railway & Banking Exams | Courage Library". JSON-LD: `ItemList` of `Course`.

**Analytics events.** `courses_catalogue_viewed`, `course_card_clicked`, `course_notify_requested`.

**Mobile behaviour.** Single-column cards with a progress ring on the right.

**Dependencies.**
- **GAP2-4** (syllabus finalised and mapped).
- Content ops (published learning documents).
- LOOP-1 / ACT-1 (progress).

**Routing decision.** `/courses` (this catalogue) takes over the path from the dormant old catalogue. The old `/courses/[slug]` and `/learn` stay behind `FEATURE_COURSES`. Build phase: UX-4.
