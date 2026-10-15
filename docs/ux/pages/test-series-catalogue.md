# Test series catalogue: `/test-series` and `/exams/[examSlug]/test-series`

**Purpose.** Show the test series available per exam. A test series is a packaging of published mock tests (order, schedule, Free / Pro tier) over the existing exam engine (#28). There is no second engine.

**User and job-to-be-done.** An aspirant who wants regular, exam-like practice. Their job: "Pick a series that matches my exam stage and know what I get free."

## Sections
1. Breadcrumb and h1 ("Test series" / "SSC CGL test series").
2. Exam filter chips (global page only). Signed-in students default to their target exams.
3. **Series cards.** Each card shows:
   - title and type (full-length / sectional / daily / PYQ, from `test_series.series_type`)
   - number of tests and the date range or cadence ("7 tests every week")
   - Free tests count vs Pro tests count
   - next scheduled test
   - for a signed-in student: progress ("4 / 20 attempted")
   - CTA "View series"
4. **"Free practice"** block: today's daily mock and the free full mock. This keeps the existing `/mock-tests` value proposition.
5. **What's in Pro** (touchpoint only).

**Components.** Breadcrumb, Tabs (chips), Card (series), Badge (type, Free / Pro), Progress (bar), Test card.

## Data
- `test_series` currently has these columns: `exam_id`, `title`, `series_type`, `is_premium`, `is_active`, `display_order`, `metadata`. It has **0 rows**.
- `mock_tests.series_id` links tests to a series.

**Missing columns** (proposed; owned by Commerce / Content ops, no migration in UX-0):
- `slug`
- `description`
- `status` / `published_at` (publish lifecycle, like other content)
- `access_tier` (FREE / PRO / MIXED) instead of a single boolean
- `starts_on` / `ends_on`, cadence
- `sort_order` per test (or `series_items(series_id, mock_test_id, position, scheduled_for, access_tier)`)

**Today.**
- `/mock-tests` acts as the de-facto catalogue.
- It lists 8 published free mocks for SSC CGL: 6 daily sectionals and 2 full-length.
- The page labels daily sectionals as "Full-Length Mock Tests" with a "Start Full Mock" CTA. This is a taxonomy confusion that series packaging fixes.

**States.**
- No series for the exam: show the "Free practice" block only, with "Test series for {exam} open soon".
- Signed out: no progress.

**Access tier.** Public catalogue.

**SEO.** Title "{Exam} Test Series {Year}: Free & Pro Mock Tests | Courage Library". JSON-LD: `ItemList`, `BreadcrumbList`.

**Analytics events.** `test_series_catalogue_viewed`, `test_series_card_clicked`, `test_series_filter_used`.

**Mobile behaviour.** Single column with chips scrolling horizontally.

**Dependencies.**
- `test_series` publish model and series items (Commerce / Content ops migration, its own phase).
- Pro tier needs Commerce.

Build phase: UX-5. Meanwhile, UX-3 relabels `/mock-tests` correctly.
