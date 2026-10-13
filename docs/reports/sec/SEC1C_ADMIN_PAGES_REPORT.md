# SEC-1C: Admin page authorization (layouts are not security boundaries)

> ## ⚠ SECURITY INCIDENT (pre-launch, dev data)
> Before this fix, production (build `2a978b2`) served admin page data to **anonymous** visitors and to **signed-in students**. The data sat in the RSC flight payload behind the layout's "Access Restricted" screen.
>
> | Class | Pages | What leaked (counts only; no values were printed) |
> |---|---|---|
> | **EXPOSED_PII** | `/admin/gamification`, `/admin/rewards` | 8 coin-ledger rows: `userId` + non-empty `userName` (8/8), amounts, balances |
> | **EXPOSED_PII** | `/admin/reports` | 5 question reports: `reporterUserId` (5), user-written descriptions (5), resolution notes (2) |
> | **EXPOSED_UNPUBLISHED** | `/admin/questions` | full question bank: 113 questions with statements, options and **correct-answer keys (113)**, incl. 2 archived |
> | **EXPOSED_UNPUBLISHED** | `/admin/reports` | answer keys + explanations for the 5 reported questions |
> | **EXPOSED_UNPUBLISHED** | `/admin/content` | 215 unpublished learning units/versions (`isPublished:false`), authoring-queue state (PENDING / NOT_CREATED) |
> | **EXPOSED_UNPUBLISHED** | `/admin/exams` | onboarding/readiness state of in-progress exams (IN_PROGRESS ×3, 56 readiness checks) |
>
> - **Root cause:** Next.js renders page segments independently of layouts, and many admin services read with the **service-role** client.
> - **Exposure window:** unknown, at least since these pages were deployed. Access logs were not reviewed in this phase.
> - **Fixed in this phase** (page guards + middleware). The fix is **not yet deployed**; see §10.
> - **Recommendation:** treat the dev question bank's answer keys as disclosed.

---

## 1. Exposure forensics (read-only, before any code change)

### 1a. Static inventory (app/admin)
- 34 `page.tsx` files, 2 layouts (`app/admin/layout.tsx`, `app/admin/live-tests/layout.tsx`; the latter removed in this phase, §5), no `loading.tsx` / `template.tsx` / `generateMetadata` under `app/admin`.
- Static `metadata` exports exist on 7 pages (titles only).
- **4 pages were client components**: `current-affairs`, `syllabus-reconciliation`, `live-tests/intelligence`, `live-tests/[id]/intelligence`. They fetch via SEC-1B-guarded API routes and actions.
- `components/admin`: only 2 server components (`admin-breadcrumbs`, `feature-disabled-panel`), and neither fetches data. Every other component is a client component and uses SEC-1B-guarded actions and routes.

| Page | Data source (client) | Potential sensitive data |
|---|---|---|
| `/admin` | `AdminService.getAdminOverview` (session) | counts |
| achievements | `LiveTestAchievementService.getAchievementDefinitions` (**service role**) | config (LIVE_TESTS gated) |
| adaptive | `AdminAdaptiveService.*` ×13 (**service role**) | config, audit logs (ADAPTIVE gated + old in-page check) |
| billing | `AdminService.getAdminBilling` (session) | plans/orders |
| bulk-import, categories, patterns, sections, mock-tests, mock-tests-management | `AdminService.*` (session) + `TaxonomyService.listNodesByType` | catalog + counts |
| community, descriptive, institutes | `AdminService.*` (session) | moderation flags, prompts, institutes |
| content | `AdminService.getAdminContent`, `AdminContentStudioService.*`, `CurriculumCoverageService`, `AuthoringQueueService` (session + **service role**) | unpublished learning content |
| exam-knowledge | `AdminExamKnowledgeService.*` (**service role**) | exams/cycles, knowledge drafts |
| exams | `ExamOnboardingService.getAdminExamsOverview`, `getConductingOrgs` (**service role**) | onboarding drafts |
| exams/onboarding | page-level `createAdminServerSupabaseClient` + `ExamOnboardingService`, `ExamReadinessService` (**service role**) | taxonomy, onboarding state |
| exams/[id], exams/ai-onboarding | redirect only | none |
| gamification | `GamificationService.getGamificationAdminStats` (**service role**) | **coin ledger with user names**, policies |
| live-tests, live-tests/[id]/results | page-level **service role** | events, leaderboard entries (LIVE_TESTS gated) |
| premium | `AdminPremiumService.*` (**service role**) | config, entitlements (old in-page check) |
| questions | `AdminService.getAdminQuestionsWithHierarchy` (**service role**) | **question bank incl. answers** |
| questions/factory | `AdminQuestionFactoryService.getTaxonomyTree` | taxonomy |
| reports | `AdminService.getQuestionReports` (**service role**) | **reporter ids, report text, answers** |
| rewards | `GamificationService.getAdminRewardsStudioData` (**service role**) | **coin ledger with user names**, reward config |
| schedules | `AdminService.getAdminSchedules`, `getAdminDailyMockProgram` (session) | daily program config |
| taxonomy | `TaxonomyService.listTree` (SEC-1B internal guard) | none for anon |
| users | `AdminService.getAdminUsers` (session) | PII, but empty under anon/student RLS |

### 1b/1c. Production scan (anonymous + qa-student, build `2a978b2`)
- **Method:** each `/admin/*` page was fetched with no redirects followed, and the HTML plus RSC payload were scanned for emails, QA emails, UUIDs, status/draft markers, PII keys, config keys, KPI labels and `/admin` links. Only counts were recorded.
- **Every page returned HTTP 200 with "Access Restricted" to both anonymous and student requests.** Student responses differed from anonymous ones only by the student's own navbar identity (1 own email, 2 own PII keys, which also appear on their site-wide 404).
- **Dynamic segments:** skipped in the pre-fix production scan because the id lookup failed (connection timeout, then `42P01`). After the fix, they were tested with a dummy id (§5).

| Page | UUIDs | Other signals | Classification |
|---|---|---|---|
| `/admin` | 0 | 8 KPI counts, 8 admin links | EXPOSED_COUNTS_ONLY |
| achievements, adaptive, billing, community, current-affairs, descriptive, exams/ai-onboarding, institutes, live-tests, live-tests/intelligence, premium, questions/factory, syllabus-reconciliation, taxonomy, users | 0 | none | NO_DATA |
| mock-tests-management | 0 | 12 admin links (static UI) | NO_DATA |
| bulk-import / categories / patterns / sections / mock-tests | 13 / 1 / 3 / 15 / 27 | published catalog + counts | EXPOSED_COUNTS_ONLY |
| content | 1,517 | 215 `isPublished:false`, PENDING ×215, NOT_CREATED ×215 | **EXPOSED_UNPUBLISHED** |
| exam-knowledge | 8 | exams/cycles incl. `is_active` | EXPOSED_CONFIG |
| exams | 23 | IN_PROGRESS ×3, 56 readiness check sets | **EXPOSED_UNPUBLISHED** |
| exams/onboarding | 79 | taxonomy + conducting orgs | EXPOSED_CONFIG |
| gamification | 21 | `userId`+`userName` ×8, coin policies ×5 | **EXPOSED_PII** + config |
| questions | 1,216 | 113 questions, correct-answer keys ×113, archived ×2 | **EXPOSED_UNPUBLISHED** |
| reports | 40 | `reporterUserId` ×5, descriptions ×5, notes ×2, answer keys/explanations ×5 | **EXPOSED_PII** + unpublished |
| rewards | 33 | `userId`+`userName` ×8, reward cost/stock ×6 | **EXPOSED_PII** + config |
| schedules | 50 | daily program templates ×7, `LIVE_ACTIVE` | EXPOSED_CONFIG |

No email values and no phone values appeared in any anonymous payload.

### 1d. Other layout-only protected areas
`find app -name layout.tsx` gives only `app/layout.tsx` (root, no auth) and the two admin layouts. **No other area relies on a layout for authorization.** Student areas authorize in their pages or services. Non-admin findings are in §8.

### 1e. Next.js version
Installed **next 15.5.23** (`package.json` `^15.2.0`). That is ≥ 15.2.3, so it is **patched** for the middleware-bypass advisory (`x-middleware-subrequest`, CVE-2025-29927). Middleware is defence in depth only; the page guards stand on their own.

## 2. Guard design (`lib/auth/require-admin.ts`)

- `requireAdminPage(opts?: { allowStaff?: boolean; path?: string }): Promise<AdminContext>`
  - Same session-only identity (`auth.getUser()`) and the same `resolveRole` as `requireAdmin` (`app_metadata.role`, plus `ADMIN_EMAILS` until SEC-1). It never accepts a user id.
  - **Anonymous or session error** → `redirect("/auth/login?next=<sanitized>")`.
  - **Signed in without a permitted role** → `notFound()`.
  - **Allowed** → `{ userId, role, userEmail }`. This is a superset of the specified `{ userId, role }`; the email is used only for the sidebar and header display, which avoids a second session lookup.
- `sanitizeAdminNext(path)`: only `^/admin(/[A-Za-z0-9_\-[\]/]*)?$`, with no `//`, no `\`, no `..`, no query and no fragment. Anything else becomes `/admin`. That rules out an open redirect.
- **Deviations from the locked text:**
  1. The login route is `/auth/login`; `/login` does not exist in this app.
  2. The login page does not consume `next` yet; changing that is a UI change and out of scope (§8). The redirect still carries a sanitized `next`.
- The anonymous redirect is normally served by the middleware first (§4). The page guard is the authoritative check.

## 3. Page inventory and role per page

Every page calls `await requireAdminPage(...)` as its first statement, and every page now has `export const dynamic = "force-dynamic"`. All 34 are ƒ (dynamic) in the build.

| Page | Role | Change |
|---|---|---|
| `/admin` | staff | guard |
| achievements, billing, bulk-import, categories, community, content, descriptive, exam-knowledge, exams, exams/[id], exams/ai-onboarding, exams/onboarding, gamification, institutes, live-tests, live-tests/[id]/results, mock-tests, mock-tests-management, patterns, questions, questions/factory, reports, schedules, sections | staff | guard (+ `force-dynamic` where missing) |
| current-affairs, syllabus-reconciliation | staff | client view moved to `*-client.tsx`; `page.tsx` is now a guarded server wrapper |
| **premium** | **admin** | guard; old in-page `checkIsAdminOrStaff` block removed |
| **adaptive** | **admin** | guard → ADAPTIVE gate; old in-page block removed |
| **rewards**, **taxonomy** (structural editor), **users** | **admin** | guard |
| **live-tests/intelligence**, **live-tests/[id]/intelligence** (drill-down) | **admin** | client view moved; guarded server wrapper → LIVE_TESTS gate |

- **Quarantined pages** (adaptive, achievements, live-tests/**): the guard runs first and the feature gate immediately after. So a disabled feature still makes **zero data calls**; DRIFT-1c confirms this.
- **`app/admin/layout.tsx`:** now calls `requireAdminPage({ allowStaff: true })` and uses its email. Its "Access Restricted" branch became unreachable and was removed; denied users get the not-found page.
- **`dynamic`:** the `[id]` pages pass their static parent as `next` (`/admin/exams`, `/admin/live-tests`).

## 4. Middleware (`lib/supabase/middleware.ts`)

- `updateSession` already called `auth.getUser()` for every matched path. It now uses the result:
  - `/admin` or `/admin/*` with **no user** (or a lookup error) → `307 /auth/login?next=<sanitized>`;
  - refreshed auth cookies are copied onto the redirect.
- **No role logic** in middleware. `/api/admin/*` is untouched (routes keep their 401 JSON), and the behaviour for every other path is unchanged.
- **Fail-closed side effect:** when Supabase is unreachable from the server, a signed-in admin is also sent to login. Observed once locally; the live tests retry ≤ 3 times.

## 5. Tests: `scripts/test_sec1c_admin_pages.cjs`

**Offline: 22/22**

| Area | Result |
|---|---|
| Static S-01…S-07 | 34 pages found. Guard is the first awaited call in every page and the layout (none use `generateMetadata`). Admin-only pages never pass `allowStaff`, the rest do. All `force-dynamic`. No client `page.tsx`. Middleware: login redirect, no role decision, `/api/admin` untouched. No data-fetching server component in `components/admin`. |
| Guard unit U-01…U-09 | anonymous → login with `next`; session error → login; 14 bad `next` values → `/admin`; student → notFound; `user_metadata.role=admin` → notFound; staff on admin-only page → notFound; staff on staff page → allowed; admin → allowed; options-only signature |
| Execution P-* (flags ON, recording mocks) | **every page actually executed**: anonymous 34/34 REDIRECT, student 34/34 NOT_FOUND, user_metadata-admin 34/34 NOT_FOUND, **all with zero service/DB calls before the denial**; staff: 7 admin-only pages NOT_FOUND with zero calls, 27 staff pages pass; admin: 34 pass; layout: anon → redirect, student → notFound, staff/admin → render |
| Mutation check | moving the guard below `getQuestionReports()` in one page made S-02 and all three P-* denial tests fail (reverted) |

**Live** against a **local production build** (`next start :3100`): **29/29** after ruling A (first run 27/29, see below). The dev server was not used for this run because it restarted on its memory threshold mid-run.

| Test | Result |
|---|---|
| L-01 anonymous, 34 paths | **PASS**: all 307 → `/auth/login?next=/admin…`; body has no emails, UUIDs, KPIs, admin links, status markers or RSC payload |
| L-02 anonymous `/api/admin` | **PASS**: 401 uniform JSON |
| L-03a qa-student, 34 paths: no admin data | **PASS**: not-found UI; nothing beyond the student's own site 404 (0 foreign UUIDs, 0 foreign emails, 0 data keys) |
| L-03b qa-student: not-found response (re-specified by ruling A) | **PASS**: 34/34 return HTTP 200 with the not-found digest + "Page Not Found" UI + `noindex`, and no admin data. First run asserted HTTP 404 and failed (§10). |
| L-04a qa-staff | **PASS**: 27 staff pages allowed; 7 admin-only pages denied with no admin data (only the staff member's own email in the shared layout) |
| L-04b qa-staff: admin-only → not-found response (ruling A) | **PASS**: 7/7. The re-run exposed that `app/admin/live-tests/layout.tsx` (a LIVE_TESTS gate) never rendered its children, so staff on the two admin-only intelligence pages saw the "feature not enabled" panel instead of not-found. No data leaked. The layout was **removed**: all 4 live-tests pages already gate themselves (guard → gate). |
| L-05 qa-admin, 34 paths | **PASS** (one network-induced login redirect retried) |

Production live checks were not run, because nothing was deployed (§10).

## 6. Regressions

| Suite | Result |
|---|---|
| SEC-1B offline / `--live` | 26/26 / **32/32** |
| QF-1 offline / DB | 73/73 / 15/15 |
| SEC-1A | 20/20 |
| DRIFT-1c | 39/39 → **41/41** after the live-tests layout removal: the two intelligence wrappers gained gate tests, and the layout test became a static "gated server wrapper only" check (harness: `requireAdminPage` stubbed as an authorized admin and asserted called exactly once, so the gate's zero-call check still runs behind the guard) |
| GAP2-1b offline | 13/13 |
| GAP2-2a offline / DB | 11/11 / 18/18 |
| E2E student journey (qa-student, local production build) | **13/13**. E2E-13 updated: a student on `/admin` now sees the not-found page instead of "Access Restricted". Rows created by the run were removed by `cleanup-student.cjs` with `E2E_KEEP_USER=1`; qa-student had 0 activity rows beforehand. |
| tsc / lint / build | 0 errors / 0 errors (existing warnings only) / OK; 34 admin routes ƒ |
| Admin UI smoke (qa-admin + qa-staff, local production build) | **16/16 in a single run**. The staff premium step is now "staff `/admin/premium` → not-found page, no premium UI"; the action-level denial is still covered by SEC-1B L-06. Screenshots: `docs/reports/sec/sec1c/`. |

## 7. Baseline

`pre_sec1c` → `post_sec1c` (137 tables + content fingerprints + functions + triggers + storage + ledger): **NO DIFF**. Only QA sign-ins happened; the E2E rows were cleaned. No schema, RLS or grant change.

## 8. Other findings (not fixed; outside this phase)

1. **Open redirect in `app/auth/callback/route.ts`:** `next` is used unvalidated in `${origin}${next}`. A value like `@evil.example` produces `https://<origin>@evil.example`. Recommend the same allow-list approach.
2. **`/admin/billing` crashes for authorized users** (pre-existing): `getAdminBilling()` returns an array, but the page reads `billing.orders` / `billing.plans`, so the error boundary renders.
3. **Staff pages that show PII to staff** (allowed by decision #16, worth a review): gamification (coin ledger with names), reports (reporter ids, report text), live-tests results (leaderboard, quarantined), billing (orders).
4. **The login page ignores `next`**, so after login the user lands on the default page, not the admin page they asked for.
5. **Denied 200 responses carry static page `metadata` titles**, e.g. "Premium Control Center | Admin Studio". These are titles only, with no data.

## 9. Commit plan

Message (only if CLOSED):
```
fix(sec-1c): page-level admin authorization; layouts are not security boundaries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Files:
- `lib/auth/require-admin.ts`, `lib/supabase/middleware.ts`;
- `app/admin/layout.tsx`, all 34 `app/admin/**/page.tsx`;
- 4 renames to `*-client.tsx` (current-affairs, syllabus-reconciliation, live-tests/intelligence, live-tests/[id]/intelligence);
- deleted `app/admin/live-tests/layout.tsx` (redundant gate that masked the page guard; §5);
- `scripts/test_sec1c_admin_pages.cjs`, `scripts/test_drift1c_features.cjs`, `scripts/e2e/student-journey.cjs`;
- `docs/reports/sec/SEC1C_ADMIN_PAGES_REPORT.md`, `docs/reports/sec/sec1c/*.png` (16).

Never `.env*`, backups, CA files or scratch.

## 10. Status: ruling needed on the HTTP status for denied signed-in users

- **The security property holds everywhere:** no admin data reaches anonymous users, students, or staff on admin-only pages. Anonymous users get a real 307.
- **What fails:** signed-in users who are denied get **HTTP 200** (not-found UI, `noindex`, 404 digest), not **404**.
- **Cause:** the root `app/loading.tsx` wraps every route below the root layout, including `/admin`, in a Suspense boundary. The shell and headers (200) are therefore sent before the admin layout or page can call `notFound()`. Any guard that runs in a layout or page behaves this way; only code before streaming (middleware) or outside that boundary can set the status.

**Options:**

| Option | Change | Real 404 | Trade-off |
|---|---|---|---|
| **A** (recommended) | Accept the 200 not-found response for denied signed-in users; change L-03b/L-04b to assert the not-found digest plus no data (already covered by L-03a/L-04a) | no | None for security; status semantics only |
| **B** | Middleware also checks the role it already has (shared pure `resolveRole` moved out of the `server-only` module) and rewrites denied `/admin/*` to a 404 | yes | Contradicts the locked rule "no role checks in middleware"; the page guard stays authoritative |
| **C** | Move `app/loading.tsx` (and the root routes) into a `(site)` route group, or give `/admin` its own root layout, so `/admin` is outside the root Suspense boundary | yes | Large file move across `app/` (no URL change); regression risk |

(Superseded by §10a.)

## 10a. Architect ruling

- **Option A accepted.** Denied signed-in users receive HTTP 200 + not-found UI + `noindex`, because of the root `app/loading.tsx` streaming boundary. The security property is that no admin data is sent, proven by L-03a/L-04a and the offline P-* execution tests.
- **L-03b / L-04b re-specified:** a denied response must be a 404, or a 200 carrying the not-found digest + "Page Not Found" UI + `noindex`, and no admin data. SEC-1C now passes 22/22 offline and **29/29 live** (local production build).
- **Incident INC-1 recorded** (see the banner at the top of this report).
- **The dev answer keys for the 113 questions are treated as disclosed:** review or rotate them before any launch mock uses them.

SEC-1C STATUS: CLOSED (ruling A)
