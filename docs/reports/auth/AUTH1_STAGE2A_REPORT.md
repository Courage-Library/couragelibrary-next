# AUTH-1 Stage 2a: role source, insert-only profiles, cross-device confirm, error hygiene, session resilience

**Phase brief:** architect ruling, 2026-10-20 — decisions **#60.1–#60.6** and the Stage 2a build. Stage 1 (`bc4f520`) was accepted and is pushed with this stage. The Stage 1 local finding note stays untracked.

**Rules held:**
- no migrations;
- no Supabase setting changes;
- no accounts created;
- no new npm dependencies;
- live gates ran only through `scripts/live/with-server.cjs`.

This report contains no emails, keys, hosts or tokens.

## 0. Step 0: who is admin or staff today (read-only inventory)

Every account that **any** path treated as admin or staff (the `app_metadata` role, or the former `ADMIN_EMAILS` email match), by label only:

| Label | Role | Role held in `app_metadata` | Relies only on the email match |
|---|---|---|---|
| owner (personal-domain account) | admin | yes | no |
| qa-admin | admin | yes | no |
| qa-staff | staff | yes | no |
| other | — | — | none found |

- **Local `ADMIN_EMAILS`:** empty. No account matched it.
- **Grants made:** none. No account relied only on the email match, so the admin API was not used and no `admin_audit_logs` row was written (actor `system:auth-1` was not needed).
- **Production `ADMIN_EMAILS`:** cannot be read from here (it is a Vercel environment value). After this deploy the variable is ignored. Any account that was admin in production *only* through it loses admin access.
  - The owner's account holds `app_metadata.role = admin`, so the owner is not affected.
  - **OWNER TO RUN:** delete `ADMIN_EMAILS` from Vercel.

## 1. What changed

### a. Roles only from `app_metadata` (#60.1)

- `lib/auth/require-admin.ts`: `resolveRole` reads `app_metadata.role` only (`admin` / `staff`; anything else is no role). The `ADMIN_EMAILS` fallback and `configuredAdminEmails` are removed. `user_metadata` never granted anything and still doesn't.
- `services/admin.service.ts`: the admin user list shows the role from `resolveRole` (it previously used `ADMIN_EMAILS` or `user_metadata.role` for display).
- **Test updates** (they encoded the removed grant):
  - `test_sec1a_containment` S1-6 now asserts that an `ADMIN_EMAILS` match is **not** admin.
  - `test_sec1b_admin_authz` U-01 asserts `resolveRole(student) === null` with `ADMIN_EMAILS` set.

### b. `ensureProfile` is insert-only

`services/user-profile.service.ts`: `upsert(…, { onConflict: "id", ignoreDuplicates: true })`, which is `INSERT … ON CONFLICT (id) DO NOTHING`. It then reads the stored row.
- It writes only `id`, `full_name` and `language_preference`, and only for a new row.
- A name the student edited survives the next sign-in.
- A deactivated profile (`is_active = false`) stays deactivated.
- It never writes `is_active` or `updated_at`.

### c. `/auth/confirm` (cross-device email links)

`app/auth/confirm/route.ts`:
- **Preferred path:** `?token_hash=…&type=…` → `verifyOtp`. This works on any device, because it needs no PKCE verifier cookie.
  - Accepted types: `signup`, `email`, `recovery`, `email_change`, `invite`. Anything else fails.
- **Legacy path:** `?code=…` → `exchangeCodeForSession`, so links already sent with the default templates keep working on the device that requested them.
- **Target:** `next` passes through the SEC-1D sanitizer (`safeRedirectUrl`, #20). **Recovery always lands on `/auth/update-password`**; its `next` is ignored.
- **Failure** (invalid, expired or used hash; unknown type; oversize input; any throw) → `/auth/login?m=link-expired`.
- `ensureProfile` runs after a successful non-recovery confirmation.

`app/auth/actions.ts`:
- sign-up sets `emailRedirectTo = <site>/auth/confirm?next=/dashboard`;
- reset sets `redirectTo = <site>/auth/confirm?next=/auth/update-password`.

`/auth/callback` is kept for OAuth / PKCE:
- a provider `error` → `?m=oauth-failed`;
- a failure → `?m=link-expired` (it used to put free text in `?error=`).

**OWNER TO PASTE — Supabase dashboard → Authentication → Email Templates.** Replace only the link URL in each template; the wording may stay.

| Template | Link (`href`) |
|---|---|
| Confirm signup | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard` |
| Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` |
| Change email address | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/dashboard` |
| Magic link (only if ever enabled) | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard` |
| Invite user (only if used) | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/dashboard` |

**OWNER TO CHECK — Authentication → URL Configuration:**
- **Site URL** is the production origin.
- **Redirect URLs** include `<production origin>/auth/confirm` and `http://localhost:3100/auth/confirm` (local gates). Keep the existing `/auth/callback` entries.

Until the templates are pasted, the default `{{ .ConfirmationURL }}` links still work through the legacy `code` path on the requesting device.

### d. Error hygiene (no enumeration, no provider text)

- `lib/auth/messages.ts` is the only source of auth texts:
  - `AUTH_NOTICES`: URL notices, `?m=CODE`;
  - `AUTH_ERRORS`: action errors;
  - `mapAuthError`: provider error → fixed code, unknown → `generic`;
  - `isAccountExistenceError`.
- **Login page:** renders a notice only for an allow-listed `?m=` code. An unknown code, `__proto__`, free text, `?error=` and `?message=` render nothing.
- **Identical answers:**

  | Action | Outcomes that get the same answer |
  |---|---|
  | Sign-up | new address, already-registered address ("check your email") |
  | Reset | existing address, unknown address, provider failure ("check your email") |
  | Login | wrong password, unknown account ("Email or password is incorrect"; rate limiting and "confirm your email" excepted) |

- Provider `error.message` is never returned or redirected. The server log records only `code`, `status` and `name`.
- **Password rule (#60.5), mirrored now:** at least 8 characters with letters and digits. It applies to sign-up and update-password (client `minLength=8` and server-side), and is checked before Supabase is called. The dashboard setting is Stage 2b.
- **Login during a Supabase outage:** a transient error (retryable fetch error, status 0 / 5xx) returns `generic` ("Something went wrong on our side…"), not "incorrect password". It does not depend on the account, so it reveals nothing.
  - Found in the live runs: the server log showed `AuthRetryableFetchError` answered as invalid credentials.
- **Sign-out:** explicit `signOut({ scope: "global" })` (same as the auth-js default, now documented) → `?m=signed-out`.

### Sign-up off with an honest page (#60.2)

- `app/auth/signup/page.tsx` (server) asks `getSignupAvailability()`:
  - `AUTH_SIGNUP_ENABLED=false` (server env) → closed;
  - otherwise the project's public `disable_signup` setting, cached for 60 s;
  - unreadable → the form is shown, and the action still answers with the honest `signup-closed` code if Supabase refuses.
- **Closed:** a "Registrations open soon" card with a sign-in link. No form.
- **Open:** the unchanged form (`app/auth/signup/signup-form.tsx`). After submitting, the form is replaced by the "check your email" notice.
- The signup code stays working for re-enabling. No hardcoded switch.

### e. Tri-state session (AUTH-RESILIENCE, #60.6)

- `lib/auth/session-state.ts` (pure, edge-safe) exports `getSessionState(client)` / `classifyAuthResult()` → `user | none | error`:
  - `error` = could not ask Supabase (retryable fetch error, status 0 / 5xx, abort / timeout, network messages, or a thrown error);
  - `none` = no or invalid session.
- `lib/auth/session.ts` exports `getServerSession()` (server-only).
- **Retry UI:** `components/auth/session-unavailable.tsx` provides:
  - `SessionUnavailable`: design-system `EmptyState`, "Connection problem", `role="status"`, retry;
  - `SessionUnavailableBanner`: design-system `Alert`.
  - `/auth/unavailable` hosts the retry page for admin guards; its retry link is sanitized.
- **Where it is used:**

  | Caller | On `error` | On `none` |
  |---|---|---|
  | App shell | banner, anonymous navigation, no user data | as before |
  | Middleware | no login redirect (the page guard decides) | anonymous `/admin/*` → login, as before |
  | Page guards (dashboard, performance, achievements, certificates, premium, store, wallet, mock take, live take, live result) | retry UI, **no data, no redirect** | login redirect, as before |
  | Admin guards (fail closed) | `requireAdmin` throws `UNAUTHORIZED`; `requireAdminPage` redirects to `/auth/unavailable?next=<admin path>` — never allowed, never sent to login | as before |

- **Auth request timeout:** `lib/supabase/auth-fetch.ts` limits Supabase Auth requests (`/auth/v1/`) on the session clients to 5 s (§2.2). A stalled Auth endpoint becomes "error", not an endless wait.
- **Test update:** `test_sec1c_admin_pages` U-02 asserted the old "error → login" redirect. It now asserts the #60 contract: denied → `/auth/unavailable?next=%2Fadmin`.
- **Ratchet:** raw `auth.getUser()` call sites outside the helper.
  - Counted: code lines (not comments) in `app/`, `components/`, `lib/`, `services/`.
  - Excluded: `session-state.ts` and the app shell, which classifies its single call.
  - Same method on `bc4f520`: **82** sites (83 including the shell). After this stage: **70**.
  - The baseline is 70 and may only go down (`node scripts/test_auth1.cjs --count --list`).

### f. Unchanged

- The password grant (`signInWithPassword`).
- The form field names: `email`, `password`, `next`, `fullName`, `confirmPassword`.
- QA sign-in, the smokes and E2E work as before.

## 2. Gates (all on the FINAL build unless stated)

**New gate:** `scripts/test_auth1.cjs`. It is listed in `docs/testing/PERMANENT_GATES.md`.

**Offline: 32/32**

| Area | Checks |
|---|---|
| Role source | A-1…A-5 |
| Profile insert-only | B-1…B-3 |
| `/auth/confirm` + callback | C-1…C-8: valid / invalid / expired / bad-type / oversize; recovery override; 12 open-redirect vectors × 3 entry points |
| Messages | D-1…D-9: mapping; `?m=` allow-list; identical sign-up / reset / login answers; outage → generic; no provider text; sign-up closed page |
| Session | E-1…E-6: tri-state; 10 page guards on a simulated failure → retry UI, 0 redirects, 0 data calls; signed-out still redirects; admin guards fail closed; middleware |
| Ratchet | F-1: 70 ≤ 70 |

**Live (`--live`, with-server): 8/8**

| Check | What it covers |
|---|---|
| L-1 | bogus `token_hash` → `link-expired` |
| L-2 | valid generated `token_hash` (qa-student, no email sent) → session cookie and `/performance`; reuse → `link-expired` |
| L-3 | open redirect with a valid token stays on the origin |
| L-4 | profile unchanged by the sign-in |
| L-5 | `?m=` allow-list in the browser |
| L-6 | identical login error for a real and an unknown account |
| L-7 | QA password sign-in plus `next` |
| L-8 | `/auth/unavailable` retry link sanitized |

**Resilience (`--resilience`, Supabase blackholed): R-1…R-8**
- refuse: 8/8;
- hang: 8/8.
- Details in §2.2.

### 2.1 Fresh budget (architect ruling): live gates on the final build

**Before each attempt** (scratchpad precheck, read-only):
- port 3100 free;
- no orphan `next start`;
- no stuck own DB sessions (idle-in-transaction or active > 60 s: 0 / 0);
- `net-probe --n=3`: 100%.

| Gate | Attempt 1 | Attempt 2 |
|---|---|---|
| `test_auth1 --live` | **PASS 8/8** | — |
| cleanup → E2E journey → lineage → DRILL-1 → **`student-drill`** → cleanup | **PASS**: journey 13/13, lineage 6/6, DRILL-1 11/11, drill 4/4 | — |
| `ensure-student-fixture` → **`student-mistake` smoke** | FAIL: network window (see below) | **PASS** (fixture created; smoke all passed) |
| Signed-in smoke: staff-content | PASS | — |
| UX-2a landing | PASS 18/18 | — |
| UX-1b shell a11y | PASS 75/75 | — |
| UX-1a a11y | PASS 25/25 | — |
| Signed-in smokes: student-pages, admin-pages | FAIL: network window | **PASS** (student-pages: 2 vacuous warnings, as before) |
| UX-2b.3 | FAIL: network window | **PASS 28/28** |
| UX-2b.H | FAIL: server exit during the gate | **PASS 39/39** (4 vacuous: no published current-affairs articles) |
| CA routes | skipped (server down) | **PASS 6/6** |

**The attempt 1 network window.** The server log shows `UND_ERR_CONNECT_TIMEOUT` and many auth aborts.
- **The 5 s auth timeout fired** (`AbortError`). Signed-in pages correctly showed "Connection problem" instead of the dashboard: the student-pages smoke saw the retry heading, and `/admin/taxonomy` → `/auth/unavailable`.
- **That is the intended behaviour** under a > 5 s Auth stall. On this Wi-Fi it turns multi-second TLS spikes into retry screens instead of slow pages.
- **Then the server exited** (§2.2).
- **Attempt 2 was clean.**

**Regression, offline (final build)**

| Gate | Result |
|---|---|
| SEC-1A | 19/20 (S1-7 pre-existing, §3) |
| SEC-1B | 26/26 |
| SEC-1C | 22/22 (U-02 updated, §1.e) |
| SEC-1D | 14/14 |
| SEC-HOTFIX-4 RLS | 9/9 |
| TYPES-1 | 9/9 |
| TYPES-1 close | 3/3 |
| SECDEF ratchet | 6/6 |
| No runtime DB | 5/5 |
| QA identity guard | 8/8 |
| Design ratchet | 8/8 |
| UX-1b shell | 7/7 |
| CI support (`with-server` changed) | 10/10 |
| no-personal-data | OK, 1389 files |
| tsc | 0 errors |
| lint | 0 errors, 230 warnings (= baseline) |
| build | OK |

**Earlier attempts (superseded).** On the previous build, the first budget ended BLOCKED: `student-drill` failed 3 network-caused attempts. That led to the crash check below.

### 2.2 Crash check and deterministic resilience (architect ruling, 2026-10-20)

**What happened in attempt 3:**
- The local server stopped accepting connections after a middleware `getUser` "fetch failed" trace.
- **Windows:** the Application and System event logs (11:40–12:05 UTC) show no node.exe crash or WER event, so it was not a native crash.
- **Server log:** no `uncaughtException` / `unhandledRejection`, and no exit line.
- **Runner:** it kills the server only in its final `cleanup()`, which did not run until the end. The runner did not kill it mid-run.
- **Can't tell exit from hang:** the runner recorded neither the server's exit nor its liveness.
- **Fix to the runner** (`scripts/live/with-server.cjs`):
  - logs an unexpected server exit immediately (time, code, signal);
  - after every gate, checks the process is alive and still accepts TCP connections;
  - when the server is down, stops and marks the remaining gates SKIP (server down).
- **Health path:** new `--health-path=<path>` (default `api/health`). It is given without the leading slash, because Git Bash's MSYS conversion rewrote `/auth/login` into a Windows path; that cost a few diagnostic runs.

**Deterministic outage, no Wi-Fi needed:**
- **Why a preload:** the Supabase URL is inlined into the server bundle at build time, so it cannot be overridden at runtime.
- **The preload:** `scripts/live/supabase-blackhole.cjs` is test-only. It loads through `NODE_OPTIONS`, is active only in `next start` with `AUTH1_BLACKHOLE` set, and is never deployed. It blackholes every Supabase connection in the server process at two layers:
  - Node's global `fetch` (server components, routes, actions);
  - `tls.connect` / `net.connect`, needed because the middleware's edge-sandbox fetch has its own undici.
- **Modes:**
  - `refuse`: immediate ECONNREFUSED;
  - `hang`: the connection is accepted by a silent local listener and never answered.
- **Harness gap found on the way:** the first refuse run sent admin pages to login. The middleware's fetch was not intercepted yet, so the fake token reached real Supabase and was rejected as invalid ("none"). The socket layer closed that gap. With it, the middleware's outage path is exercised and the check passes.
- **The visitor:** presents a well-formed but never-validated session cookie (a fake token, never sent anywhere).
- **New gate `test_auth1 --resilience=<mode>` (R-1…R-8):**
  - 60 requests (10 concurrent × 6) across a public page (with and without a session), 3 student pages, 2 admin pages, an admin API, a student API and the sign-up page;
  - plus 3 login server-action submissions in a browser.

**Root cause found, and fixed:**
- supabase-js puts **no timeout** on its fetches.
- **Control run:** hang mode on a build with the new auth timeout disabled.
  - **48 of 60 requests unanswered at 30 s:** student pages, admin pages, both APIs, the signed-in public page.
  - The login action never answered either.
  - The process stayed up (R-8 passed).
- An Auth endpoint that accepts and never answers therefore **hangs every signed-in request, including the middleware**. It does not crash the process. This matches attempt 3's "login page never rendered within 120 s".
- **Fix:** `lib/supabase/auth-fetch.ts` aborts Supabase **Auth** requests (`/auth/v1/`, no caller signal) after **5 s**. It is used by the session clients (`createServerSupabaseClient`, the middleware client). Data requests and the service-role client are unchanged. auth-js reports the abort as `AuthRetryableFetchError` → tri-state "error" → retry UI / admin denied.

**Results on the final build:**

| Mode | Result | Slowest response | Server still up |
|---|---|---|---|
| refuse | R-1…R-8: 8/8 | 7.3 s | yes |
| hang | R-1…R-8: 8/8 | 13.1 s (three sequential 5 s auth timeouts at most) | yes |

In both modes:
- student pages: retry UI, 200, no redirect, no identity rendered;
- admin pages → `/auth/unavailable?next=…`;
- APIs → 401 JSON;
- no stack or provider text in any response;
- the login action → "Something went wrong", not "incorrect password".

**The process exit itself:**
- **Attempt 3** (first budget): the port closure was not reproduced. Neither outage mode closes the port under 60+ concurrent requests.
- **Fresh-budget attempt 1:** the new runner caught it.
  - **What the runner recorded:** `SERVER EXITED UNEXPECTEDLY at 13:45:16 UTC: code 4294967295 (0xFFFFFFFF = -1), signal null`, during the UX-2b.H gate, after a network window with connect timeouts.
  - **Not an app or Next exit:**
    - the server log has no fatal error, uncaught exception or unhandled rejection;
    - Next 15 installs `uncaughtException` / `unhandledRejection` handlers that log and keep running;
    - no `process.exit(-1)` exists in Next or the Supabase packages;
    - the runner kills the server only in its final cleanup.
  - **Windows:** no crash or WER event for node.exe. The only activity in that window was Microsoft Store app updates (GamingApp, Store, Camera), with System Restore / VSS at 19:11–19:14 local, 1–4 min before. That does not prove a link.
  - **Conclusion:** a termination from outside the app's JavaScript (OS / environment level). Not reproducible on demand.
- **Forensics, now permanent:** `scripts/live/server-diag.cjs` is preloaded into every `with-server` run. It writes to the server log:
  - memory every 30 s;
  - the stack of any `process.exit` / `reallyExit`;
  - the exit code;
  - Node warnings.
  - It also writes a Node diagnostic report on a fatal error (`--report-on-fatalerror`).
  - The next occurrence will show either a JS exit stack or, if there is none, prove an external kill.
- **Fresh-budget attempt 2** (15 min, forensics on): heap steady at 120–140 MB with no growth, handles 3–18, no exit.

**Follow-up (not in scope):** data reads (PostgREST) still have no timeout. A hanging database endpoint would still hang the pages that read data, though not the auth paths. Proposed: a separate phase with per-read budgets, like the landing page's.

## 3. Pre-existing and noted

- `test_sec1a_containment` S1-7 ("could not load legacy addresses from git history") fails before and after this stage (19/20 on `bc4f520`). It depends on history removed by PUBLIC-HARDEN-1.
- `test_phase3h4_2_production_boundary_verification` crashes before and after (`Cannot find module 'server-only'`). It cannot run outside Next; noted, not changed.
- **EOL:** all committed files were checked byte by byte and contain no CR.
  - `git diff --stat` and `git diff --ignore-cr-at-eol --stat` differ by 2 lines in 3 files. HEAD, the working copy and the diff of those files contain no CR byte, so this is an xdiff line-matching artefact of the ignore flag, not a line-ending change.

**Follow-ups (not in this stage):**
- **UX-2b.A11Y-1:** the retry screen has a screen-reader-only h1 and a visible h2 with the same text ("Connection problem"). Give the h1 distinct text. It was deferred so the final build stayed the one the gates passed on.
- **Data reads have no timeout:** PostgREST reads still have no time limit (§2.2). Proposed: a separate phase with per-read budgets.
- **Auth timeout and slow networks:** the 5 s auth timeout turns > 5 s Auth stalls into the retry screen. That is right for production, but it makes local gates on this Wi-Fi show retry screens during spikes. CI on a stable network (CI-1) remains the long-term fix.

## 4. OWNER TO RUN

1. **Delete `ADMIN_EMAILS` from Vercel** (all environments). It is now ignored; nothing else reads it.
2. **Turn public sign-up off:** Supabase dashboard → Authentication → Sign In / Providers → "Allow new users to sign up" off. The page switches to "Registrations open soon" within 60 s.
3. **Paste the email templates** in §1.c and check the redirect URLs.
4. **Production signed-in smokes:**
   - sign in as qa-student and qa-admin;
   - open `/dashboard`, `/performance`, `/admin`;
   - sign out (`?m=signed-out` notice);
   - after the templates are pasted, run a password reset on a phone for an address you own: the link should open `/auth/update-password` on that device.

AUTH-1 Stage 2a status: CLOSED
