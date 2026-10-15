# Dashboard: `/dashboard`

**Purpose.** The student's daily starting point. It shows what to do today (driven by the candidate profile), where they stand, and continues where they left off.

**User and job-to-be-done.** A returning student. Their job: "Tell me what to do today and let me start in one tap."

## Today
`DashboardService.getStudentDashboardData` reads 8 sources. Two panels are always empty in production because their queries fail:
- the **mastery** panel: `user_topic_mastery` legacy columns, tracked as `TYPES-1:B-DSH-MASTERY`
- the **recommendations** panel: `daily_study_recommendations` legacy columns, tracked as `B-DSH-RECOMMENDATIONS`

The mistakes count also fails (`B-DSH-VAULT-STATUS`). All three belong to LOOP-1.

## Sections
1. **Greeting bar:**
   - "Good morning, {first name}"
   - exam switcher (from the profile's goals)
   - countdown "{N} days to {exam} {cycle}", only when the date is known
   - streak chip
2. **Today's plan** (the hero). These are 3 to 5 task cards sized to `daily_study_minutes`. Each card has a type icon, title, estimated minutes and a "Start" action, and is checked off when completed. The types are:
   - *Revise:* "12 mistakes due today" (from revision health)
   - *Learn:* the weakest topic's next document
   - *Practise:* 10 questions on the weakest topic
   - *Test:* today's daily mock
   - *Current affairs:* today's quiz (when CA exists)

   Source: LOOP-1 recommendations. **Fallback rules until LOOP-1 lands:** due mistakes, then today's daily mock, then the course "Continue" topic.
3. **Continue where you left off:** an in-progress test (Resume), the last document, or the last practice.
4. **Your progress** (stat tiles):
   - mocks taken this week
   - average accuracy (trend)
   - topics mastered / total (course)
   - mistakes resolved

   These link to Analytics.
5. **Weak topics:** the top 3 by mastery (low), each with "Learn" and "Practise". Hidden until there is enough data (at least 1 mock).
6. **Upcoming:** next scheduled series test and exam dates.
7. **Pro touchpoint** (non-Pro only, one at most, dismissable).

**First-run variant** (no attempts yet; `?welcome=1`):
- "Your plan starts with a 15-minute check" (diagnostic or the free daily mock)
- course overview
- "How Courage Library works", in 3 steps

**Components.** Exam switcher (Select), Task card (Card + Checkbox state), Stat tile, Progress, Test card, Course/topic node (compact), Empty state, Toast.

## Data
- `DashboardService` is refactored onto live columns (LOOP-1):
  - `user_topic_mastery(canonical_topic_id, mastery_score)`
  - `daily_study_recommendations(action_type, priority_rank, status, learning_document_id, topic_id)`
  - the vault by `lifecycle_status IN ('UNRESOLVED','REVISITING')`
- Profile (`user_exam_goals`, candidate profile).
- `user_streaks`, `coin_wallets` (exist and work).
- In-progress attempts (`test_attempts`): there are 17 `in_progress` rows today. Stale ones need an expiry rule so "Resume" doesn't list abandoned tests forever.

**States.**
- Unauthenticated: redirect to `/auth/login?next=/dashboard` (exists).
- No profile: redirect to onboarding.
- No data: the first-run variant.
- A partial failure of one panel shows that panel's inline error; the page never fails as a whole.

**Access tier.** Signed-in. Free, with Pro extras inside panels.

**SEO.** noindex. The page also needs a meta robots tag; robots.txt only has `/dashboard/`.

**Analytics events.** `dashboard_viewed`, `plan_task_started` (with type), `plan_task_completed`, `continue_clicked`, `weak_topic_action_clicked`, `exam_switched`.

**Mobile behaviour.**
- The bottom nav shows Home as active.
- Today's plan comes first, as full-width cards with the "Start" button on the right.
- The stats sit in a 2×2 grid.

**Dependencies.**
- Can ship now with the fallback rules (UX-3), after the profile schema exists.
- The full plan needs LOOP-1 and the course needs GAP2-4.

Build phase: UX-3 (shell plus fallback), then UX-6 (LOOP-1 plan).
