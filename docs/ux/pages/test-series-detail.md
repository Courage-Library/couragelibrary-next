# Test series detail: `/exams/[examSlug]/test-series/[seriesSlug]`

**Purpose.** Show a series' tests in order, each test's state for the student, and the Free / Pro split. Starting a test goes to the existing instructions page.

**User and job-to-be-done.** A student working through a series. Their job: "What's my next test, and how am I doing across the series?"

## Sections
1. Breadcrumb ("Exams › SSC CGL › Test series › {Series}").
2. Header:
   - title, type, test count, cadence or schedule, Free / Pro badge summary
   - primary CTA, which depends on state: "Start test 1" / "Continue: Test 5" / "Next test on 18 Oct"
3. Signed in: a **series progress** strip (attempted / total, average score, best rank) and a trend sparkline of scores across the series.
4. **Test list** (ordered). Each Test card shows:
   - number, title, questions, minutes, marks, scheduled date
   - one state: *Available* / *Scheduled* (date, not startable yet) / *In progress* (Resume) / *Attempted* (score, then "View result") / *Pro-locked* (lock, then the Pro sheet) / *Expired*
5. Syllabus coverage: which subjects the series covers (from the mock sections' topics).
6. FAQ: rules, negative marking, re-attempt policy.

**Components.** Breadcrumb, Test card (all states), Progress, Stat tile, Badge, Pro lock panel (sheet), Accordion.

## Data
- Series and items: the proposed `test_series` + items model (see the catalogue spec).
- Tests: `mock_tests` (published, `lifecycle_status = PUBLISHED`).
- Student state: `test_attempts` / `test_results` by `mock_test_id`.
- Leaderboard: `AssessmentService.getTestLeaderboard`.

**States.**
- All tests attempted: "Series complete", a summary, and a recommendation for the next series.
- Scheduled tests show a countdown.
- Re-attempts follow the existing rule: one active attempt (the unique violation 23505 is surfaced as "You already have this test in progress" with a Resume action).

**Access tier.**
- Public page.
- Starting a test requires sign-in.
- Pro tests require Pro.

**SEO.** Title "{Series} for {Exam}: {N} Mock Tests". JSON-LD: `ItemList` of tests, `BreadcrumbList`. Attempt states are client and personal, and are never server-rendered into indexable HTML.

**Analytics events.** `test_series_viewed`, `test_series_start_clicked`, `test_card_clicked` (with state), `pro_lock_viewed`.

**Mobile behaviour.** The test list is a single column with a sticky primary CTA; tapping a scheduled test shows a reminder option.

**Dependencies.**
- Series model migration.
- Commerce for Pro.
- The existing engine (no change).

Build phase: UX-5.
