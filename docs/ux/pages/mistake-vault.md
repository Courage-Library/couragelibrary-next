# Mistake vault (Revision): `/mistakes`, `/mistakes/[id]`, `/mistakes/drill`

**Purpose.** Every wrong answer becomes a revision item, which can be reviewed, learnt, re-drilled and eventually mastered. It is the platform's signature loop and **already works** (KPIs, filters, list, revision health, drill, detail). UX-3 is polish plus fixes.

**User and job-to-be-done.** A student after a mock, or in their daily revision. Their job: "Show me what I keep getting wrong and help me stop."

## Today
- The data layer is rich (`MistakeService` has 10+ functions).
- **TYPES-1 B1 (uncommitted)** fixed three defects:
  - the detail page showed no options and always marked "A" as correct, because of wrong column names
  - drill compilation always failed
  - drill grading used the wrong columns
- The anonymous visitor sees the vault's empty state instead of a sign-in redirect. This should become a redirect.

## Sections (`/mistakes`)
1. h1 "Revision" with these KPI tiles:
   - due today
   - unresolved
   - revisiting
   - mastered
   - repeated (2 or more times)
2. **"Due today" call-out:** "12 questions are due. Start a 10-question drill" (primary).
3. **Tabs:** Due · All · Repeated · Bookmarked · Mastered. Filters are subject, topic, cognitive type and source (mock / practice), and sorting is recent / repeated / oldest / topic. All of these are URL-synced.
4. A list of mistake cards. Each card shows:
   - stem preview (2 lines)
   - subject › topic
   - times wrong
   - lifecycle chip
   - last seen
   - "Review"
5. Side panel (desktop):
   - weak topics, each with "Learn"
   - revision health (decay / retention risk)
   - a longitudinal trend

## Sections (`/mistakes/[id]`)
- The question in review mode, showing your answer (✗) and the correct answer (✓).
- The explanation, with "Learn this topic" (resolver documents) and "Practise similar".
- The occurrence history timeline (when and where it was wrong, response time).
- Personal note (exists), bookmark, and an override of the cognitive type.

## Sections (`/mistakes/drill`)
- A builder sheet: focus mode (Due / Unresolved / Repeated / Bookmarked / Topic), count, and subject / topic.
- A drill session in practice mode, then a summary with mastered count and coins.
- The coin award is currently not credited (`B-DRILL-REWARD-ARGS`, owner pending). The summary must not claim "+5 coins" until it is.

**Components.** Stat tile, Tabs, Select (filters), Card (mistake), Badge (lifecycle), Question renderer (review / practice), Timeline, Input (note), Sheet, Progress, Empty state.

## Data
`MistakeService`:
- `getMistakeVaultSummary`, `getPaginatedMistakesList`, `getAvailableFilterOptions`, `getRevisionHealthIntelligence`
- `getMistakeDetail`, `getMistakeDrill`, `submitMistakeDrill`
- `getBatchLearningContentForTopics` (resolver)

Also `MistakeLongitudinalIntelligenceService` and `BookmarkService`.

**States.**
- Signed out: redirect to `/auth/login?next=/mistakes` (change from today's empty state).
- Empty: "No mistakes yet. Take a mock; the questions you miss land here", with a "Take today's mock" action.
- All mastered: a celebration message without motion when reduced motion is set.

**Access tier.** Signed-in, Free.

**SEO.** noindex.

**Analytics events.** `revision_viewed`, `revision_filter_used`, `mistake_opened`, `mistake_learn_clicked`, `drill_started`, `drill_completed`, `mistake_note_saved`, `mistake_bookmarked`.

**Mobile behaviour.**
- KPI tiles scroll horizontally, and filters live in a sheet.
- The list uses "Load more".
- The bottom-nav "Revision" item carries a due-count badge.

**Dependencies.**
- Commit TYPES-1 B1.
- LOOP-1 owns "due" scheduling and the mistake-recording reliability (swallowed insert errors).
- Coins are owner-pending.

Build phase: UX-3.
