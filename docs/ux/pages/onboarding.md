# Onboarding: `/onboarding/*` (writes the candidate profile, #29)

**Purpose.** In under 60 seconds, capture what personalises everything else:
- target exams
- stage
- language
- daily study time
- target year
- an optional diagnostic

It writes the **candidate profile**, which drives the dashboard, my exam home, recommendations and default filters.

**User and job-to-be-done.** A newly signed-up student, or an existing student without a profile. Their job: "Tell it what I'm preparing for once, then get a plan that fits me."

## Flow
Each step is one screen with one question, large option tiles, and a progress indicator ("Step 2 of 6"). There is a "Back" link and, after step 1, "Skip for now". Each step persists on "Continue", so a refresh resumes.

| # | URL | Question | Input | Writes |
|---|---|---|---|---|
| 0 | `/onboarding` | Welcome: "Let's set up your preparation" (name prefilled if known) | Name (optional) | `user_profiles.full_name` |
| 1 | `/onboarding/exams` | "Which exams are you preparing for?" | Search plus a multi-select of active exam cards (max 3), then ordering by priority. Preselected from the signup `next` context (e.g. coming from an SSC CGL mock). | `user_exam_goals` (`exam_id`, `priority_rank`, `is_active`) ✔ exists |
| 2 | `/onboarding/stage` | "Where are you in your preparation?" | Single choice: Just starting · Studying for some months · Revising & taking mocks · Exam is very close | **MISSING column**: `preparation_stage` |
| 3 | `/onboarding/language` | "Which language do you want to study in?" | English · हिन्दी · Both. Separately: "Exam medium" (English / Hindi). | `user_profiles.language_preference` ✔ (UI / content). **MISSING**: `exam_medium` |
| 4 | `/onboarding/time` | "How much time can you study daily?" | 30 min · 1 h · 2 h · 3 h+ (tiles) | `user_exam_goals.daily_study_minutes` ✔ (per exam; UI writes the same value to all goals) |
| 5 | `/onboarding/target` | "When is your exam?" | The exam's cycles (e.g. "SSC CGL 2026"), or "Next year" or "Not sure" | `user_exam_goals.exam_cycle_id` ✔ (only cycles that exist; 1 per exam today). **MISSING**: `target_year` for when no cycle row exists |
| 6 | `/onboarding/diagnostic` | "Want a 15-minute check to find your weak areas?" (optional) | Start diagnostic (a sectional mock flagged as a diagnostic) · Skip | **MISSING**: `diagnostic_attempt_id` (or derive it from the first attempt). A diagnostic template flag is also missing. |
| ✓ | `/dashboard?welcome=1` | Summary: "Your plan: SSC CGL 2026 · 1 h/day · English" plus "Change anytime in Settings" | — | **MISSING**: `onboarding_completed_at` (and `onboarding_version`) |

**Optional, later** (not asked at launch; collected in-context when needed):
- category (for cut-off comparisons)
- state
- phone (for library / CNTS)

**Not asked:** anything that is not used. Every field above must drive a visible personalisation.

**Components.** Progress (steps), Checkbox / Radio (card-style tiles), Exam card (compact), Input, Button, Empty state.

## Data
`user_profiles` currently has these columns:
- `full_name`
- `phone`
- `avatar_url`
- `language_preference` (all 24 profiles are `en`)
- `is_active`

`user_exam_goals` currently has these columns. It has **0 rows**, so nobody has goals today; `/mock-tests` "Add Exam" is the only writer.
- `exam_id`
- `exam_cycle_id`
- `priority_rank`
- `target_score`
- `daily_study_minutes`
- `is_active`

**Missing fields** (proposal; the schema phase decides placement, with no migration in UX-0):
- `preparation_stage`
- `exam_medium`
- `target_year`
- `onboarding_completed_at`
- `onboarding_version`
- `diagnostic_attempt_id`

These could live in a `candidate_profiles` table (1:1 with the user). This separates profile *intent* from account data, which suits the profile-drives-personalisation model. The alternative is columns on `user_profiles`.

**Rules:**
- `/auth/callback` and login currently go to the sanitised `next` or `/dashboard`.
- Add this redirect: if a signed-in student has no `onboarding_completed_at` and the target is an app page, send them to `/onboarding?next=<sanitized>`. Public pages and the console are never interrupted.
- After onboarding, go to the sanitised `next`, or `/dashboard`.

**States.**
- Resume at the first incomplete step.
- Validation: at least 1 exam is required.
- Network error: an inline retry; the step value is kept.
- Skipped steps show as "Not set" in Settings and nudge once on the dashboard.

**Access tier.** Signed-in.

**SEO.** noindex.

**Analytics events.** `onboarding_started`, `onboarding_step_viewed`, `onboarding_step_completed` (with step), `onboarding_skipped` (with step), `onboarding_completed`, `diagnostic_started`, `diagnostic_skipped`.

**Mobile behaviour.**
- Full-screen steps with a sticky bottom "Continue".
- Tiles are 2 columns at 390px.
- No header nav, just a "Save and exit" link.

**Dependencies.**
- Profile schema additions (a small migration in its own phase, before UX-3).
- A diagnostic flag on a mock template (Content ops).
- Exam list (exists).

Build phase: UX-3.
