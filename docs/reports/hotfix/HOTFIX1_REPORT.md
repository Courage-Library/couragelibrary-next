# HOTFIX-1: public diagnostics, login redirects, permanent QA identity guard

> **STATUS: see the status line at the end.**
> - **Scope:** remove the public developer diagnostics, fix the dead `/login` redirects, protect the permanent QA identities, and restore qa-student.
> - **Not included:** no DB schema changes, no packages.
> - **TYPES-1 B1** work was stashed for the whole hotfix (`stash@{0}`: "TYPES-1 B1 WIP (held for architect review)", plus a patch backup outside the repo) and restored afterwards. B1 is not part of this hotfix.

## 1. Root cause: how qa-student was deleted during TYPES-1 B1

**What happened (2026-10-15, B1 gate run):**
1. The B1 E2E journey ran correctly as the permanent identity:
   `E2E_STUDENT_EMAIL=qa-student@courage-library.test E2E_STUDENT_PASSWORD_KEY=QA_STUDENT_PASSWORD E2E_KEEP_USER=1 … node scripts/e2e/student-journey.cjs`
2. E2E-11 failed (2 of 3 mistakes visible), so I ran the cleanup in order to re-run the journey:
   `E2E_STUDENT_EMAIL=qa-student@courage-library.test node scripts/e2e/cleanup-student.cjs`
   **This command omitted `E2E_KEEP_USER=1`.**
3. `scripts/e2e/cleanup-student.cjs` (SEC-1B version) has two modes:
   - Without `E2E_KEEP_USER=1`, it deletes the journey data and then also the user's `user_profiles` row (step `if (!KEEP_USER) … DELETE FROM public.user_profiles`). After commit, it calls `admin.auth.admin.deleteUser(uid)`.
   - With `E2E_KEEP_USER=1`, it keeps both.
4. Output: `deleted: {…, "user_profiles":1, "auth.users":1}`. qa-student (auth user and profile) was deleted.

**Why it was possible:**
- **No guard tied deletion to the permanent-identity list.** The only protection was an opt-in environment flag. Protection depended on the operator remembering `E2E_KEEP_USER=1` on a *second* command; it had been set on the journey command but not on the cleanup.
- The script treated "the configured student" as disposable by default, a default inherited from the throwaway-student design that predates SEC-1B.
- My own follow-up existence check was also wrong. `findUser()` in `scripts/e2e/_e2e-env.cjs` ignores its argument and always uses `E2E_STUDENT_EMAIL`. A separate full listing later confirmed that qa-student was gone, while qa-admin and qa-staff were intact.

**Impact:**
- The qa-student identity was lost. It held no `admin_audit_logs` rows (only qa-admin writes those), so nothing became orphaned.
- B1's live gates and the UX-0 signed-in screenshots were blocked.
- No other identity or data was affected.

## 2. Guard (prevents recurrence)

| Piece | Behaviour |
|---|---|
| `scripts/qa/qa-identity-guard.cjs` | Parses every backticked e-mail in `docs/testing/QA_IDENTITIES.md` (qa-admin, qa-staff, qa-student, W2 reviewer). It fails closed if none are parsed. `assertDeletable(email)` refuses a protected or unknown e-mail. `guardedDeleteUser(admin, id)` re-reads the e-mail **by id** from Auth (so a protected user cannot be deleted by passing its id) and fails closed when it can't verify. |
| `scripts/e2e/cleanup-student.cjs` | For a protected `E2E_STUDENT_EMAIL` without `E2E_KEEP_USER=1` it **refuses before connecting to anything** (exit 1). With the flag, data-only cleanup still works. It re-checks the user it found, and the auth deletion goes through `guardedDeleteUser`. |
| Other callers | A search of `scripts/`, `lib/`, `services/` and `app/` found **one** real `auth.admin.deleteUser` call (cleanup-student). The only other hit is a mock in `test_sec1b_admin_authz.cjs`. G-07 keeps it that way. |
| `scripts/test_qa_identity_guard.cjs` | 7 unit tests, no network: every permanent identity refused (including case and whitespace variants, and by id through a mocked admin client, where `deleteUser` is never reached); a non-listed id reaches `deleteUser` exactly once; fail-closed on lookup failure; cleanup-student ordering; no direct `deleteUser` anywhere. |

**Live evidence.** `E2E_STUDENT_EMAIL=qa-student@courage-library.test node scripts/e2e/cleanup-student.cjs` printed `REFUSED: E2E_STUDENT_EMAIL is a permanent QA identity…` and exited 1. (qa-student did not exist at that moment, and the refusal happens before any lookup.)

## 3. Public home page diagnostics removed

`app/page.tsx` previously rendered all of the following publicly:
- a "Phase 1B — Architectural Foundation" badge
- a "Supabase Connection State" card with "Target Project: couragelibrary-next", environment, Supabase URL configured state and auth-probe latency (via `HealthService.checkSystemHealth()`)
- "Next-Gen Architecture Pillars"

It is now a neutral holding section:
- brand name, plus the tagline "Learn Smarter. Prepare Independently."
- links to `/exams` and `/auth/login`
- the existing Organization JSON-LD

The page makes no HealthService call. It is a server component with no DB access. UX-1 and UX-2 rebuild it (see `docs/ux/pages/landing.md`). `/api/health` is unchanged; it is monitoring, not public HTML.

**Note.** The HTML still contains `couragelibrary-next` as part of the **site URL** (`https://couragelibrary-next.vercel.app` in the canonical, OG and JSON-LD tags, from `siteConfig.url`). That is the public deployment domain, not the Supabase project ref or a diagnostic. The production custom domain is a separate owner item. The smoke test checks the actual Supabase ref by sha256 comparison and never prints it.

## 4. Login redirects

These 4 pages redirected anonymous visitors to the non-existent `/login`:

| Page | Old target | Flag |
|---|---|---|
| `/achievements` | `/login?redirect=…` | LIVE_TESTS |
| `/certificates` | `/login?redirect=…` | LIVE_TESTS |
| `/live-tests/[slug]/result` | `/login?next=…` | LIVE_TESTS |
| `/performance` | `/login?redirect=…` | PSYCHOMETRICS |

**Fix:**
- New `loginRedirectPath(next)` in `lib/auth/safe-redirect.ts`. It returns `/auth/login?next=<encodeURIComponent(sanitizeRedirectPath(next))>` (the SEC-1D sanitizer), and hostile values fall back to `/`. All 4 pages use it; dynamic segments are encoded.
- `config/site.ts` `routes.auth` now points to `/auth/login` and `/auth/signup` (it was `/login` and `/register`).
- **Static test** `scripts/test_hotfix1.cjs`:
  - H-01: no `"/login"` / `"/register"` route reference in app, components, lib, services or config
  - H-02: the 4 pages use the helper
  - H-03: 8 helper cases, including `https://evil`, `//evil`, `/%2F%2Fevil`, `..`, `undefined`
  - H-04: home page content

**Important for the production check.** All 4 pages call `requireFeatureOrNotFound(…)` **before** the auth check, and LIVE_TESTS and PSYCHOMETRICS are off in production. So anonymous production requests correctly get **not-found** (dormant modules, DRIFT-1c), not the login redirect. The redirect was therefore verified on a **local production build with `FEATURE_LIVE_TESTS=true FEATURE_PSYCHOMETRICS=true`**. Anonymous GETs only: 4/4 went to `/auth/login?next=…`. In production, the smoke asserts not-found and never `/login`.

## 5. Gates

Run on a clean tree with B1 stashed.

| Gate | Result |
|---|---|
| tsc | 0 errors |
| lint (`npm run lint`) | 0 errors |
| build | OK |
| `test_qa_identity_guard` | 8/8 (G-08 added with the findUser fix) |
| `test_hotfix1` | 4/4 |
| SEC-1C offline | 22/22 |
| SEC-1D offline | 14/14 |
| Local smoke, flags on | 16/16 (home clean, no ref, health 200, anon /admin 307, the 4 redirects) |
| SEC-1C live / SEC-1D live | 29/29 / 19/19 (see §6) |

## 6. qa-student restore and live gates

**Restore.**
- The owner ran `node scripts/qa/ensure-qa-identities.cjs`.
- A read-only check by e-mail, with the fixed `findUser`, shows: qa-student exists with no `app_metadata` role; qa-admin has `admin`; qa-staff has `staff`.
- The identity has a new auth user id. It wrote no admin audit rows, so nothing references the old id.

**`findUser()` fix.**
- `scripts/e2e/_e2e-env.cjs` `findUser(email = EMAIL)` now forwards to the pure `scripts/e2e/find-user.cjs` `findUserByEmail(admin, email)`.
- The lookup is case-insensitive and paginated.
- It is fail-closed: a list error throws, and a page-limit overflow throws instead of answering "not found".
- Guard test G-08 covers it: pagination, a different argument finds a different user, an absent user returns null, an error throws, and `_e2e-env` forwards the argument. The guard test is now **8/8**.

**Live gates** (local production build `http://localhost:3100`, default flags):

| Suite | Result |
|---|---|
| SEC-1C live | **29/29** |
| SEC-1D live | **19/19** |

The earlier 27/29 and 17/19 failed only on the missing qa-student sign-in.

**Status: all gates pass, so HOTFIX-1 is committed and pushed. Production smoke: see §7.**

## 7. Production verification (`ac909e3`, https://couragelibrary-next.vercel.app)

The new home page was live 100 s after the push. Smoke results (anonymous GETs):

| Check | Result |
|---|---|
| `GET /` | 200 |
| No "Supabase", "Connection State", "Phase 1B", "Auth Probe", "Target Project" or "Production" text | ✔ |
| `couragelibrary-next` appears only as the site URL | ✔ |
| **No Supabase project ref in the HTML** (sha256-compared, never printed) | ✔ |
| Tagline and the `/exams` and `/auth/login` links | ✔ |
| `GET /api/health` | 200 |
| Anonymous `/admin` | **307 → `/auth/login?next=%2Fadmin`** |
| Anonymous `/achievements`, `/certificates`, `/live-tests/[slug]/result`, `/performance?exam=…` (flags off) | **not-found, never `/login`** (architect ruling) |

**Follow-up evidence.** The E2E journey run as qa-student (`E2E_KEEP_USER=1`, local production build of `ac909e3`) passed **13/13**, including E2E-11 at 3/3 mistakes visible. The B1 run's E2E-11 failure was therefore transient, during network errors. Afterwards the data-only cleanup ran with `E2E_KEEP_USER=1`, and the identity was kept.

## STATUS: **CLOSED**
