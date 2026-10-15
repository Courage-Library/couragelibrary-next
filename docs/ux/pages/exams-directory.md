# Exams directory: `/exams`

**Purpose.** Let visitors find their exam among all active exams, grouped by category. The page is generated, so it grows automatically as exams are activated (#26).

**User and job-to-be-done.** An aspirant who knows their exam ("SSC CGL"), or who knows their stream ("SSC exams after graduation"). Their job: "Find my exam and see what's available for it."

## Sections
1. Breadcrumb ("Home › Exams") and h1 "Exams we prepare you for".
2. **Search box** (client-side filter over names and aliases) plus **category chips** synced to `?category=`. The nav already links `?category=ssc|railway|banking|defence|upsc`, but today the page ignores the parameter.
3. **Category sections.** Each has an h2 and a grid of Exam cards showing:
   - exam name
   - conducting body
   - status of the current cycle (e.g. "Notification expected", "Applications open till 31 Dec")
   - counts: free mocks, syllabus topics
   - CTA "View exam"
4. **"Coming soon" group:** inactive exams that have Exam Knowledge content. Today these are SSC CHSL, MTS and GD. They link to the hub only if the hub has published modules; otherwise "Notify me".
5. **Help strip:** "Not sure which exam fits you?" links to a guide article (Content ops, later).

**Components.** Breadcrumb, Input (search), Tabs (segmented chips), Exam card, Badge (cycle status), Empty state.

## Data
- `ExamKnowledgeCandidateService.getExamsDirectory` (exams, categories, cycles).
- Mock counts per exam come from `mock_templates.exam_id`. Topic counts come from the canonical syllabus (GAP2-4). Before GAP2-4, the topic count is hidden.

**States.**
- Empty search: "No exam matches 'xyz'", with suggestions.
- A category with 0 active exams is hidden.
- Error: global.

**Access tier.** Public.

**SEO.**
- Title: "All Government Exams: SSC, Railway, Banking, Defence | Courage Library".
- JSON-LD: `ItemList` of exams and `BreadcrumbList`.
- Each category view `?category=ssc` has its canonical set to `/exams`. If category landing pages are wanted for SEO later, they become `/exams/category/[slug]`.

**Analytics events.** `exams_directory_viewed`, `exams_search_used`, `exams_category_selected`, `exam_card_clicked`.

**Mobile behaviour.**
- Chips scroll horizontally, and search is sticky under the header.
- Cards appear in a single column with compact layout, the whole card tappable.

**Dependencies.**
- Can ship in UX-2 with today's data.
- Topic counts need GAP2-4.
- Cycle status needs `exam_cycles` dates. Today they are mostly null for SSC CGL, which is a Content ops task.
