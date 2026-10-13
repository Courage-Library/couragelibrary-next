# SEC-1D: Sanitized auth redirects, login `next`, admin-only PII pages

## 1. Findings (from SEC-1C §8)

| # | Finding | Severity |
|---|---|---|
| F1 | **Open redirect** in `app/auth/callback/route.ts`: `NextResponse.redirect(`${origin}${next}`)` with an unvalidated `next`. A value like `@evil.example` makes `https://<origin>@evil.example`, and `//`-style values are also possible. | High (phishing via a trusted link) |
| F2 | The login page ignored `next`, so admin login redirects always landed on `/dashboard` | UX / consistency |
| F3 | Two copies of the admin `next` sanitizer (`require-admin.ts` and a mirror in middleware) | Maintainability |
| F4 | Staff could open pages showing PII: gamification (coin ledger with user names), billing (orders), live-test results (leaderboard) | Least privilege (decision #16 update) |

No OAuth or OTP sign-in exists (`signInWithOAuth`, `signInWithOtp` and `emailRedirectTo` are not used). The callback is used by the password-reset email (`next=/auth/update-password`) and by Supabase email confirmation.

## 2. Design: `lib/auth/safe-redirect.ts` (pure; no `server-only`; edge-safe)

- **`sanitizeRedirectPath(input, fallback = "/")`** accepts a value only if all of these hold:
  - it is a string of length 1–512;
  - the fragment is stripped;
  - it starts with exactly one `/` and contains no `//`;
  - it is **ASCII printable only**, which rejects control characters, whitespace, CR/LF/TAB and unicode lookalikes;
  - it contains no `\`, `@` or `:`;
  - it has no `.` or `..` path segments.

  The same rules are re-applied to every **percent-decoded** form (up to 3 rounds), which catches `%2F%2F`, `%5C`, `%2e%2e`, `%0d%0a`, `%00` and double encoding. An undecodable value is rejected. The result is finally normalised with `new URL(path, probe-origin)` and checked to stay on that origin. **The query string is allowed for non-admin paths** (decision).
- **`sanitizeAdminPath(input)`**: the shared sanitizer plus the `/admin` constraint, with no query. Anything else becomes `/admin`. `require-admin.ts` `sanitizeAdminNext` now just returns `sanitizeAdminPath(path)`, and middleware imports `sanitizeAdminPath` directly. **One implementation.**
- **`safeRedirectUrl(input, origin, fallback = "/")`**: resolves the sanitized path with `new URL(path, origin)` and asserts the same origin. It **never concatenates strings**.

## 3. Changes

| File | Change |
|---|---|
| `lib/auth/safe-redirect.ts` (new) | shared sanitizer (§2) |
| `app/auth/callback/route.ts` | `next` absent → `/dashboard` (unchanged behaviour); present → `safeRedirectUrl(next, origin)` (hostile → `/`); the error redirect also uses `new URL(...)` |
| `app/auth/login/page.tsx` | reads `next` (capped at 1024 chars) into a hidden form field |
| `app/auth/actions.ts` `loginAction` | after a successful sign-in, `redirect(next ? sanitizeRedirectPath(next) : "/dashboard")`. Hostile values → `/`. Admin targets still pass `requireAdminPage`, so this grants no privilege. |
| `lib/auth/require-admin.ts`, `lib/supabase/middleware.ts` | use `sanitizeAdminPath`; the middleware copy was removed |
| `app/admin/gamification/page.tsx`, `app/admin/billing/page.tsx`, `app/admin/live-tests/[id]/results/page.tsx` | `requireAdminPage({ path })`: **admin only** |
| `app/admin/gamification/actions.ts` `updateRewardPolicyAction`, `app/admin/actions.ts` `createSubscriptionPlanAction` | `guardAdminAction()`: **admin only** (gamification/billing actions; no API routes exist for either) |

- **Reports stays staff.**
- **Live-test results:** only the page was flipped, as ruled. Its five actions (evaluate / publish / recalculate / void / distribute, quarantined behind LIVE_TESTS) remain staff-callable. Recommendation: flip them with the page when LIVE_TESTS is re-enabled (Q7 precondition).
- **Not in scope:** the billing page crash (Commerce), service-role minimisation (SEC-1E), schema/RLS changes, new packages.

## 4. Tests: `scripts/test_sec1d_redirects.cjs`

**Offline: 14/14**

| Test | Result |
|---|---|
| U-01 | **42 hostile inputs** → `/` (`//evil.com`, `///`, `/\`, `\\`, `@`, `/login@evil.com`, `https:`, `http:`, `javascript:` (mixed case), `data:`, `%2F%2F`, `/%2f`, `%252F%252F`, `%5C`/`%5c`, TAB / CR-LF / header injection, `%0d%0a`, `%00`, NUL, `/..//`, `/../`, `/a/../../`, `%2e%2e`, `/./`, 601 chars, fullwidth `／／`, RTL override `%E2%80%AE`, spaces, bare host, empty, malformed `%`) |
| U-02 | non-strings → fallback; custom fallback honoured |
| U-03 | 9 valid paths preserved (query kept, fragment stripped) |
| U-04 | 512 chars accepted / 513 rejected |
| U-05 | `sanitizeAdminPath`: 50 cases |
| U-06 | `safeRedirectUrl` always same origin |
| O-01 | one implementation (require-admin delegates; middleware imports it; no duplicate regex; not `server-only`) |
| C-01 | **callback executed** with all 42 hostile values on the success path → `https://app.example/` |
| C-02 | callback: valid `next` kept, missing → `/dashboard`, bad code → same-origin login error |
| C-03 | callback source has no `origin + next` concatenation |
| C-04 | **`loginAction` executed**: 41 hostile → `/`, `/mistakes` kept, query kept, empty/absent → `/dashboard`, failed sign-in → no redirect |
| C-05 | login page carries `next` in a hidden field |
| R-01 / R-02 | the 3 pages and 2 actions are admin-only; reports stays staff |

**Live, local production build (`next start :3100`): 19/19**

| Test | Result |
|---|---|
| L-01 | qa-student `/auth/login?next=/mistakes` → lands on **/mistakes** |
| L-02 | qa-student `/auth/login?next=//evil.com` → lands on **/** (same origin) |
| L-03 | `/auth/callback?code=invalid&next=//evil.com` → 307 `/auth/login` on the same origin |
| L-04 | qa-staff `/admin/gamification`, `/admin/billing` → not-found UI, 0 data keys |
| L-05 | qa-admin → 200 / 200 |

**Updated suites:**
- SEC-1B matrix (e): `ADMIN_ONLY` adds the 2 actions; staff are FORBIDDEN on them.
- SEC-1C: `ADMIN_ONLY` adds gamification, billing and live-tests/[id]/results (now 10 admin-only pages, 24 staff).

## 5. Regressions

| Suite | Result |
|---|---|
| SEC-1C offline / live (local production build) | 22/22 / **29/29** |
| SEC-1B offline / live | 26/26 / **32/32** |
| QF-1 offline / DB | 73/73 / 15/15 |
| SEC-1A | 20/20 |
| DRIFT-1c | 41/41 |
| GAP2-1b | 13/13 |
| GAP2-2a offline / DB | 11/11 / 18/18 |
| E2E student journey (qa-student) | **13/13**; rows removed by `cleanup-student.cjs` (`E2E_KEEP_USER=1`; the first cleanup attempt hit `fetch failed` and the retry succeeded) |
| tsc / lint / build | 0 / 0 errors / OK |
| Admin UI smoke (extra, not required) | run 1: 15/16 (Content Studio queue button timeout during 12 logged Supabase network errors); run 2: **16/16** |

## 6. Baseline

`pre_sec1d` → `post_sec1d`: **NO DIFF**. Only QA sign-ins happened; the E2E rows were cleaned. No schema, RLS or grant change.

## 7. Commit plan

```
fix(sec-1d): sanitize auth redirects, honour login next, admin-only PII pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Files:
- `lib/auth/safe-redirect.ts` (new), `lib/auth/require-admin.ts`, `lib/supabase/middleware.ts`;
- `app/auth/callback/route.ts`, `app/auth/login/page.tsx`, `app/auth/actions.ts`;
- `app/admin/gamification/page.tsx`, `app/admin/gamification/actions.ts`, `app/admin/billing/page.tsx`, `app/admin/actions.ts`, `app/admin/live-tests/[id]/results/page.tsx`;
- `scripts/test_sec1d_redirects.cjs` (new), `scripts/test_sec1b_admin_authz.cjs`, `scripts/test_sec1c_admin_pages.cjs`;
- `docs/reports/sec/SEC1D_REDIRECTS_ROLES_REPORT.md`.

Production verification after deploy: callback with `next=//evil.com` stays on the origin; anonymous `/admin/gamification` → 307 login; `GET /` → 200 (§8).
