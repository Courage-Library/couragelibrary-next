# AUTH-1 Stage 1: Login and sign-up forensics and design

**Phase brief:** architect, 2026-10-20. Decision **#59** (auth strategy) is locked.

**This stage is read-only:**
- no code, setting or account was changed or created;
- no production sign-in;
- live facts come from **read-only** sources only:
  - the public Auth settings endpoint (anon key; booleans printed only);
  - a `BEGIN READ ONLY` schema query on `couragelibrary-next` (names and counts only).

**Security findings:**
- **One medium, configuration-dependent finding** (role resolution) is described only in a **local, uncommitted note** for the owner (`docs/reports/auth/AUTH1_STAGE1_LOCAL_FINDING.md`). Its fix is part of the Stage 2 plan (§2.C, step 0).
- **No high finding.**

## 1. Forensics

### 1.1 Current auth surface

| Piece | File | Behaviour today |
|---|---|---|
| Middleware | `middleware.ts` → `lib/supabase/middleware.ts` | Refreshes the session with `@supabase/ssr` (0.5.2, **PKCE** flow) on every non-static request. Redirects anonymous `/admin/*` to `/auth/login?next=<sanitizeAdminPath>`. Any `getUser()` exception counts as "no user" |
| Server client | `lib/supabase/server.ts` | `createServerSupabaseClient()` (cookie session, anon key); `createPublicServerSupabaseClient()` / `createAdminServerSupabaseClient()` (no session persistence; the admin one uses the service role, server-only) |
| Sign-in | `app/auth/login/page.tsx` + `loginAction` (`app/auth/actions.ts:14`) | `signInWithPassword`; on success `ensureProfile`, then `redirect(sanitizeRedirectPath(next) or /dashboard)`. **Returns Supabase's raw `error.message`** |
| Sign-up | `app/auth/signup/page.tsx` + `signupAction` (`:42`) | `signUp({ email, password, options.data.full_name })`; `ensureProfile` if a user object returns; **always `redirect("/dashboard")`**, even when confirmation leaves no session. **No `emailRedirectTo`**, so the confirmation link lands on the project's Site URL. **Raw `error.message` returned** |
| Sign-out | `logoutAction` (`:71`) | `signOut()`: default **global** scope (all sessions) in auth-js 2.109; redirects to `/auth/login` |
| Forgot password | `forgotPasswordAction` (`:77`) | `resetPasswordForEmail(email, { redirectTo: <siteUrl>/auth/callback?next=/auth/update-password })`. Enumeration-safe mapping for "user not found"; **but the plain success text differs from the "if an account exists…" text**, so the two outcomes remain distinguishable |
| Update password | `updatePasswordAction` (`:113`) + `/auth/update-password` | Needs the recovery session from the callback; **minimum 6 characters**; raw error returned |
| Callback | `app/auth/callback/route.ts` | `exchangeCodeForSession(code)` (PKCE), `ensureProfile`, redirect to `safeRedirectUrl(next, origin)` (default `/dashboard`). Failure → `/auth/login?error=Invalid+or+expired+code` |
| Redirect safety | `lib/auth/safe-redirect.ts` (SEC-1D) | One sanitizer (same-origin path, decoded checks, no `//`, `\`, `@`, `:`, `..`); `safeRedirectUrl` uses the URL parser. **Good; reuse unchanged** |
| Role guard | `lib/auth/require-admin.ts` | `app_metadata.role` admin / staff. Server-side `requireAdmin*` / `guardAdminAction` / `guardAdminRoute`. Also one more grant path (local note) |
| Login page messages | `app/auth/login/page.tsx:16-42` | **Displays `?error=` / `?message=` text from the URL verbatim** (escaped by React: no XSS, but anyone can put arbitrary text on our login page via a crafted link) |

**Profile creation on first sign-in:**
- **There is no database trigger on `auth.users`** (live check: 0 non-internal triggers). The app creates `user_profiles` in `UserProfileService.ensureProfile()` (`services/user-profile.service.ts:19`), called from the login action, the sign-up action and the callback.
- It runs with the **user's own session**: an upsert on `id`, allowed by RLS insert / update-own.
- **OAuth-safe?** Mostly. It needs only `id`; the name falls back to `full_name` → `name` (the Google metadata key) → the email local part → "Student". No password is needed.
- **Not idempotent in a good way:**
  - every sign-in overwrites `full_name` with the auth metadata value (a student who edits their name in a future profile page loses the edit at the next login);
  - it forces `is_active = true`.
  - `is_active` gates nothing today (only shown in admin), so this is a correctness issue, not a security one.
  - **Stage 2: insert-only** (`onConflict: 'id', ignoreDuplicates: true`), never overwrite user-edited fields.
- **Live schema:**
  - `user_profiles` columns: `id, full_name, phone, avatar_url, language_preference, is_active, created_at, updated_at`;
  - **no `role` column** (some legacy SQL functions still `SELECT role FROM user_profiles` and would simply fail, so they are no escalation path; backlog: retire them);
  - RLS: select / insert / update own row only.

**Email confirmation and recovery under PKCE (functional findings):**
- **Sign-up confirmation:** with no `emailRedirectTo`, the link redirects to the Site URL with `?code=` that nothing exchanges. The user is confirmed but not signed in and gets no feedback.
- **Recovery:** the PKCE code verifier lives in a cookie of the browser that **requested** the reset. Opening the email on another device (common: phone mail app vs desktop) fails with "Invalid or expired code".
- **Stage 2 fix** (standard @supabase/ssr pattern):
  - email templates link to **`/auth/confirm?token_hash={{ .TokenHash }}&type=<signup|recovery|email_change>&next=…`**;
  - the server calls `verifyOtp({ type, token_hash })`, which works on any device;
  - `/auth/callback` stays **only** for OAuth code exchange.

### 1.2 Supabase Auth settings

**Read-only via the public settings endpoint** (dev project = the pre-launch production project):

| Setting | Value |
|---|---|
| External providers enabled | **email only** (Google is **not** enabled) |
| `disable_signup` | **false**: public sign-up is open |
| `mailer_autoconfirm` | **false**: email confirmation is required (good) |
| Phone | `phone_autoconfirm: false`; SMS provider "twilio" configured (phone OTP is AUTH-2) |
| SAML | off |
| Passkeys | key present (value not needed) |

**Live data** (counts only):

| What | Count |
|---|---|
| `auth.identities` | 28, all provider `email` |
| `auth.mfa_factors` | 0 |
| Triggers on `auth.users` | none |

**Conflict with decision #59:** public sign-up is enabled today, but **no Terms or Privacy pages exist** (`/legal/*` is absent). **Owner action:** either set "Allow new users to sign up" OFF until the UX-2b legal pages ship, or accept the risk explicitly.

**Not readable without a management token.** The owner checks these in the dashboard; no secrets are needed:

| Setting | Where (Supabase dashboard) | What to record |
|---|---|---|
| Site URL + redirect allow-list | Authentication → URL Configuration | Site URL = production origin; the allow-list contains only `https://<prod>/auth/callback`, `https://<prod>/auth/confirm`, the Vercel preview pattern if needed, and `http://localhost:3100/**` for local gates |
| JWT expiry / refresh | Project Settings → JWT (or Auth → Sessions) | access-token lifetime (default 3600 s); refresh-token reuse interval; inactivity timeout / time-box (Pro features) |
| Rate limits | Authentication → Rate Limits | emails sent / hour, sign-ups & sign-ins / 5 min, token refresh, OTP / verify |
| SMTP | Authentication → Emails → SMTP Settings | currently default (Supabase) or custom? The default sender is rate-limited and **not for production** (#59) |
| CAPTCHA | Authentication → Attack Protection | provider (Turnstile) on / off |
| Leaked-password protection | Authentication → Attack Protection (password strength) | **available on Pro and above (HaveIBeenPwned)**; report the plan; also the minimum length / character requirements |
| MFA | Authentication → Multi-Factor | TOTP enabled (enrolment / verify) |
| Manual identity linking | Authentication → Settings ("Allow manual linking") | default off; keep off unless the account settings page needs it |
| Email templates | Authentication → Emails → Templates | confirm / reset / magic link / change-email currently default |

### 1.3 Role model impact

- **Roles come from `app_metadata.role`.** In Supabase, `app_metadata` is **writable only with the service role** (Admin API / SQL). Neither `signUp(options.data)` nor an OAuth sign-in can set it: provider claims go to `user_metadata` and `identity_data`. The guard never reads `user_metadata` (`require-admin.ts:10-11`), so **OAuth cannot set or change roles.**
- **A Google account with an admin's email:**
  - with automatic identity linking, the Google identity attaches to the **existing** user only when the emails match and Google reports the email as verified, so it becomes the **same** user (`app_metadata` unchanged);
  - if no user with that email exists, a **new** user is created with **empty `app_metadata`**: not admin by role.
  - **One additional grant path exists that does not depend on `app_metadata`:** see the **local note**. It must be closed before Google is enabled (Stage 2, step 0).
- **Staff / admin pages and actions are guarded server-side** (`requireAdminPage`, `guardAdminAction`, `guardAdminRoute`; SEC-1B / 1C). MFA (AAL2) enforcement fits exactly there (§2.D).

### 1.4 Tests and smokes that sign in (must keep working)

All of these use **QA identities with email + password**:

| Mechanism | Suites |
|---|---|
| UI form on `/auth/login` (`input[type=email]`, `input[type=password]`, `button[type=submit]`, `next` param) | `scripts/smoke/signed-in-smoke.cjs`, `scripts/e2e/student-journey.cjs`, `student-drill.cjs`, `ensure-student-fixture.cjs`, `test_ux1a_a11y`, `test_ux1b_shell_a11y`, `test_ux2b3_mistakes_practice`, `test_ux2bh_honesty`, `test_gap2_4b_editor`, `test_syl_import1`, `scripts/diag/page-timing.cjs` |
| Password grant (`/auth/v1/token?grant_type=password`) | `test_drill1.cjs` |
| `supabase.auth.signInWithPassword` | `test_sec1b_admin_authz.cjs` (+ GAP2 suites) |
| Service-role identity setup (Admin API, sets `app_metadata.role`) | `scripts/qa/ensure-qa-identities.cjs` |
| Anonymous checks on `/auth/login` | `anonymous-smoke`, `test_hotfix1`, `test_sec1d_redirects` (open-redirect vectors) |

**Contract for Stage 2:**
- the password form stays on `/auth/login` with the same input types and a submit button;
- `next` stays the only return parameter (#19);
- the password grant stays enabled;
- **staff / admin MFA must not break the gates.** Options are in §2.H.

### 1.5 AUTH-RESILIENCE (transient Supabase error treated as signed out)

**What happens:**
- `supabase.auth.getUser()` returns `{ user: null, error: AuthRetryableFetchError }` (or throws) on a network failure.
- **84 call sites** in non-admin app code (plus middleware and `components/shell/app-shell.tsx`) treat that as "anonymous".
- Seen repeatedly in local gates (`fetch failed` in the server log; a signed-in page rendered signed out; one smoke redirected to login).

**Effect for students:**
- protected pages redirect a **signed-in** student to `/auth/login` during a Supabase blip;
- the shell shows "Sign in";
- forms vanish.
- No security impact (it fails closed), but it erodes trust and inflates gate flakiness.

**Size: medium.**
- One helper, `getSessionUser()` → `{ user, state: 'signed-in' | 'signed-out' | 'unknown' }`, distinguishing `AuthRetryableFetchError` and network errors from a real "no session".
- Use it in the shell, middleware, `requireAdmin*` and the ~15 page guards that redirect to login. For `unknown`: render a "We couldn't confirm your sign-in. Retry" state (with retry), **never** a redirect or a signed-out shell.
- The remaining ~70 call sites can migrate gradually (they only read data).

**Recommendation:**
- **Fold the helper plus the shell, middleware and guards into AUTH-1 Stage 2.** The same files change for Google, and the gates need the stability.
- The long tail goes to a follow-up.

## 2. Design

### A. Screens (UX-2a look: `components/ui`, tokens, ratchet zero, English, mobile-first)

**One page each, sharing a layout component** (`components/auth/auth-card.tsx`): `/auth/login` and `/auth/signup` (kept separate: clearer copy, and the smokes and SEO already use them).

| Screen | Content (top to bottom) | States |
|---|---|---|
| `/auth/login` | h1 "Sign in"; **Continue with Google** (`ButtonLink` / `form` POST to `/auth/oauth/google`, Google "G" mark per Google's branding rules); divider "or"; `Field` Email + `Field` Password (`type=email` / `password`, `autocomplete=email` / `current-password`); "Forgot password?" link; submit "Sign in"; "New here? Create an account" | **error** (generic: "Email or password is incorrect"); **unconfirmed** ("Confirm your email first. Resend link", sent without saying whether the address exists); **locked / rate-limited** ("Too many attempts. Try again in a few minutes"); **callback error** (fixed codes only, below); **signed-in visitor** → redirect to `sanitizeRedirectPath(next) or /dashboard` |
| `/auth/signup` | h1 "Create your free account"; **Continue with Google**; "or"; Email, Password (with live rules: length plus "not a common password"); **Turnstile** widget; consent line "By continuing you agree to the Terms and Privacy Policy" (links; final wording by owner / lawyer; **page disabled until `/legal/terms` and `/legal/privacy` exist**); submit | **check-your-email** screen (`/auth/verify-email`): "We sent a link to {email}. It expires in 24 hours. Didn't get it? Resend (after 60 s)". The **same screen is shown whether or not the email already has an account** (no enumeration) |
| `/auth/forgot-password` | Email + Turnstile + "Send reset link" | always the same success text: "If an account exists for that email, we've sent a reset link." |
| `/auth/update-password` | New password + confirm, rules shown | reached only from a valid recovery session; on success sign out other sessions and go to `/auth/login?status=password-updated` |
| `/auth/confirm` (route, no UI) | `verifyOtp(token_hash, type)` → redirect | invalid / expired → `/auth/login?status=link-expired` |
| `/auth/mfa` (staff / admin) | enrol (QR + secret + 6-digit verify) and challenge (6-digit) screens | §D |

**Messages from the URL become codes, never free text:** `?status=password-updated | link-expired | signed-out | verify-sent` and `?error=oauth-cancelled | oauth-failed | link-expired`, each mapped to fixed copy (closes the §1.1 text-injection issue).

**Gates:** every screen has 44px targets, one h1, axe 0, and copy in the honesty-gate style (no counts or "thousands").

### B. Server flow

1. **OAuth start** (`POST /auth/oauth/google`, a server action or route handler):
   - `signInWithOAuth({ provider: 'google', options: { redirectTo: <origin>/auth/callback?next=<sanitizeRedirectPath(next)>, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } })`;
   - the PKCE verifier is set in an httpOnly cookie by @supabase/ssr;
   - respond `303` to the provider URL;
   - **origin from config (`siteUrl`)**, never from the `Host` header.
2. **Callback** (`GET /auth/callback`, existing):
   - require `code`; `exchangeCodeForSession(code)` (PKCE state is enforced by Supabase via the verifier);
   - handle a provider `error` / `error_description` → `?error=oauth-cancelled|oauth-failed` (fixed codes; never echo provider text);
   - `ensureProfile` becomes **insert-only**;
   - redirect via `safeRedirectUrl(next, origin)` (unchanged SEC-1D);
   - **staff / admin with AAL1** → `/auth/mfa?next=…` instead of the target.
3. **Email links** → `/auth/confirm` (`verifyOtp`), as in §1.1.
4. **Sessions:** @supabase/ssr cookies (httpOnly, `SameSite=Lax`, `Secure` in production; already the library default). The middleware keeps refreshing.
5. **Sign-out:** `signOut({ scope: 'global' })` explicitly (behaviour unchanged, now documented); also offer "Sign out of other devices" (`scope: 'others'`) on the future account page.
6. **Errors:** never return Supabase `error.message` to the client. Map to fixed messages; log the raw message server-side without email or IDs (logger redaction exists).

### C. Account linking rules and edge cases

**Step 0 (before Google is enabled): close the role-resolution finding from the local note.**

| Case | Rule / behaviour |
|---|---|
| Same **verified** email via Google and via password | **One account.** Supabase automatic identity linking attaches the Google identity to the existing user (same `id`, same `app_metadata`) |
| Existing **unconfirmed** password sign-up, then Google with the same email | Supabase removes or reconciles the unverified identity (pre-account-takeover protection). **Verify on the dashboard version in Stage 2 with a mocked provider.** The result must be a single user owned by the Google identity, with the old unverified password unusable |
| Google account with an **unverified** email | Rare (Workspace edge cases). Treat as "email not verified": do not link; show "Use a verified Google account or sign up with email" |
| User signs in with Google and later wants a password | "Set a password" on the account page (`updateUser({ password })` while signed in) |
| Deleted user re-signs up | A new `id`; `user_profiles` cascades on delete, so it starts fresh. Audit keeps the old `actor_id` (`SET NULL` behaviour, GAP2-2a) |
| Admin / staff emails | Roles never derive from the email or the provider. A Google sign-in by an admin only links to the same user; MFA is then required (§D) |
| `ensureProfile` for OAuth users | Insert-only; name from `full_name` / `name` / email local part; never overwrite user-edited fields; profile and exam goal are collected in onboarding (PROFILE-1) |

### D. MFA for admin / staff (TOTP, AAL2)

- **Enforcement point: server-side, in the existing guards.**
  - `requireAdminPage`, `guardAdminAction` and `guardAdminRoute` call `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` and require **`currentLevel === 'aal2'`** for admin / staff.
  - **Not in a layout** (#19): layouts don't run for server actions or API routes.
  - Middleware stays defence-in-depth only.
- **Flow:**
  - first admin sign-in with no factor → `/auth/mfa/enrol` (`mfa.enroll({ factorType: 'totp' })`, QR, verify);
  - later sign-ins at AAL1 → `/auth/mfa/challenge` (`challenge` + `verify`);
  - then `next`.
- **Recovery:**
  - each admin enrols **two** TOTP factors (phone app plus a second device or password-manager TOTP);
  - an owner-held break-glass procedure: a service-role script (`scripts/qa/…` pattern, audited) that unenrols a factor after out-of-band identity confirmation;
  - documented in the runbook; no SMS fallback (AUTH-2 later).
- **QA / gates:** `qa-admin` and `qa-staff` get a TOTP factor whose secret lives only in `.env.local` / CI secrets (`QA_ADMIN_TOTP_SECRET`). The gates compute the 6-digit code with a ~20-line RFC 6238 helper (Node `crypto`; **no new dependency**).
  - **Alternative for the owner:** keep a test-only bypass **off** in every deployed environment. Not recommended.

### E. Abuse

- **Cloudflare Turnstile through Supabase Auth CAPTCHA:**
  - the widget is loaded with a `<script>` tag (`challenges.cloudflare.com/turnstile/v0/api.js`, `async defer`) on **signup, forgot-password and resend-confirmation**;
  - the token is passed as `options.captchaToken`; Supabase verifies it server-side;
  - **no npm dependency**;
  - CSP: allow that script and frame origin.
- **Login:**
  - no CAPTCHA by default (friction);
  - rely on Supabase rate limits plus generic errors;
  - add Turnstile to login only after N failures if the abuse data warrants it.
- **Rate limits** (owner sets in the dashboard): sign-up / sign-in per IP per 5 min, emails / hour (custom SMTP raises the cap), OTP / verify.
- **App side:** a 60 s resend cooldown on the client, and server-side via Supabase limits.
- **No enumeration anywhere:** identical copy and timing for sign-up of an existing email, reset of an unknown email, and resend.

### F. SMTP (recommendation only; **verify current prices / limits at decision time**, my figures may be dated)

| Provider | India fit | Free tier / price (approx.) | DKIM / SPF | Notes |
|---|---|---|---|---|
| **Amazon SES (ap-south-1, Mumbai)** | in-region | ~$0.10 / 1,000 emails; starts in sandbox (production access request) | yes (Easy DKIM), custom MAIL FROM | cheapest at scale; needs an AWS account; good deliverability once warmed |
| **Zoho ZeptoMail** | Indian company, Indian data-centre option | pay-as-you-go credits (no meaningful free tier) | yes | transactional-only, simple dashboard, INR billing |
| **Brevo** | global | ~300 emails / day free | yes | easy start; shared-IP reputation on free plans |

**Recommendation:** **ZeptoMail** (INR billing, transactional focus, Indian DC) or **SES Mumbai** if the owner already uses AWS.

**DNS:**
- SPF include for the provider;
- 2048-bit DKIM CNAME / TXT;
- **DMARC** `p=none` with an `rua` report address to start, then `quarantine` after 2–4 weeks of clean reports.

**Templates** (English, brand: wordmark, violet primary, plain text alternative, no tracking pixels):

| Template | Subject | Body |
|---|---|---|
| Confirm | "Confirm your email for Courage Library" | button + expiry + "didn't sign up? ignore" |
| Reset | "Reset your Courage Library password" | button + 1-hour expiry + "didn't ask? ignore, nothing changes" |
| Email change | — | to both addresses |
| MFA-enrolled notice | "Two-step sign-in is now on for your account" | — |

All links use `{{ .TokenHash }}` → `/auth/confirm`.

### G. Privacy

**Stored at sign-up (minimum):**
- `auth.users`: email, password hash, timestamps;
- Google sign-in: provider id, email, verified flag, name, avatar URL (identity data; we use name only);
- `user_profiles`: `id`, `full_name`, `language_preference`, timestamps.
- Phone, exam and goals are **not** asked at sign-up (onboarding, PROFILE-1).

**Consent placeholder:** "By continuing you agree to Courage Library's [Terms] and [Privacy Policy]." Owner / lawyer finalise; DPDP Act 2023 notice wording; no pre-ticked boxes; separate opt-in later for marketing email.

**Audit events (server-side, no passwords or tokens):**
- `auth.signup`, `auth.signin` (method: password | google), `auth.signin_failed` (rate counter only);
- `auth.password_reset_requested` / `completed`;
- `auth.mfa_enrolled` / `challenge_failed`;
- `auth.signout_all`.
- Supabase's own `auth.audit_log_entries` stays the source of truth; the app adds only what it needs for admin views.

### H. Test plan

| Kind | Tests |
|---|---|
| Unit (offline) | callback: missing / invalid `code`, provider `error` → fixed codes; `next` sanitization (reuse the SEC-1D vectors); message-code mapping (no free text); `ensureProfile` insert-only (never overwrites `full_name`); `resolveRole` (after step 0: email match alone ≠ admin); password rules; TOTP helper (RFC 6238 test vectors) |
| Live (local build, with-server) | QA password sign-in still works (all suites in §1.4); sign-up of an existing email shows the same "check your email" screen as a new one (**no account created**: use a `.test` address and assert via the read-only identity count that nothing changed, or stub at the action layer); reset of an unknown email shows identical copy; `/auth/confirm` with a bogus `token_hash` → `link-expired`; admin page at AAL1 → MFA challenge; AAL2 → allowed |
| OAuth | no real Google accounts and no production sign-in. Unit-test the start handler (URL contains provider, PKCE challenge, sanitized `redirectTo`) and the callback with `exchangeCodeForSession` mocked; one live check that `/auth/oauth/google` 303-redirects to the provider authorize URL with the right `redirect_to` (stop before Google) |
| Security | grep / static: no client code calls `auth.admin` or writes `app_metadata`; no `error.message` returned from auth actions; AAL2 required in all three guards (SEC-1B / 1C style tests extended); enumeration tests (identical responses); Turnstile required on signup / reset (server rejects a missing token once CAPTCHA is on) |
| Smokes | the signed-in smoke gains an MFA step for qa-admin / qa-staff (TOTP from env); anonymous smoke checks the Google button and the consent links render |

### I. Owner setup list (names and places only; secrets go straight into dashboards)

1. **Google Cloud Console:**
   - APIs & Services → OAuth consent screen: External, app name "Courage Library", support email, logo, authorised domain `couragelibrary.in`, privacy / terms URLs (after the legal pages exist), scopes `openid email profile` only;
   - Credentials → Create OAuth client ID (Web): **Authorised redirect URI = the Supabase callback** `https://<project-ref>.supabase.co/auth/v1/callback` (copy it from Supabase → Auth → Providers → Google), plus the custom auth domain if one is set later;
   - copy the client ID and secret **directly into Supabase**.
2. **Supabase → Authentication:**
   - Providers → Google: enable, paste ID / secret;
   - URL Configuration: Site URL and redirect allow-list (§1.2);
   - Emails → SMTP: custom SMTP (provider host / user / pass from §F);
   - Templates: §F;
   - Attack Protection: CAPTCHA = Turnstile (secret key), leaked-password protection (if Pro), minimum password length 10;
   - Multi-Factor: TOTP on;
   - Rate limits: §E;
   - **keep "Confirm email" ON**;
   - **sign-ups OFF until the legal pages exist** (§1.2).
3. **Cloudflare → Turnstile:**
   - add the site `couragelibrary.in` (+ `localhost` for dev), Managed mode;
   - site key → app env `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; secret key → Supabase only.
4. **DNS** (the domain registrar / Cloudflare DNS): SPF TXT, DKIM CNAME / TXT from the SMTP provider, DMARC TXT `_dmarc`.
5. **Vercel env:** `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `FEATURE_GOOGLE_AUTH` (server-only flag, default off).

### J. Rollout

| Step | What | Gate |
|---|---|---|
| Stage 2a (no owner setup needed) | step 0 (role resolution); generic errors / message codes; `/auth/confirm` + `emailRedirectTo`; insert-only `ensureProfile`; `getSessionUser()` resilience helper in shell, middleware and guards; new screens (Google button hidden behind `FEATURE_GOOGLE_AUTH`); password rules | all existing suites + new auth unit / live tests |
| Stage 2b (after owner setup I-1…I-4 on a **preview / dev** project) | Google start + callback behind the flag; Turnstile on signup / reset; MFA enrol / challenge + AAL2 in guards; gates get TOTP | OAuth mocked tests; MFA live tests with QA identities |
| Stage 2c (production) | enable `FEATURE_GOOGLE_AUTH` in production **only after** the owner's Google client + legal pages + SMTP / DNS (DMARC passing); then re-open sign-ups | anonymous smoke; owner signs in once with their own Google account (owner action, not automated) |

**Migrations:**
- **none needed** for Google or MFA (Supabase-managed tables);
- optional: retire the legacy SQL functions that read `user_profiles.role` (column absent); if done, backup + ledger + rollback per the runbook.

**Rollback:** turn the flag off (Google button hidden; existing Google-linked users can still use "Forgot password" to set a password); MFA can be relaxed per role by guard config.

### Owner decisions requested

1. Approve **step 0** (local note) as the first Stage 2 change.
2. **Sign-ups:** turn them off now until the legal pages ship, or accept the risk.
3. **SMTP provider:** ZeptoMail vs SES Mumbai vs Brevo.
4. **MFA for QA identities in gates:** a TOTP secret in env (recommended) vs a bypass.
5. **Supabase plan:** confirm whether leaked-password protection is available (Pro).
6. **AUTH-RESILIENCE:** fold the helper + guards into Stage 2a (recommended).

AUTH-1 Stage 1 status: COMPLETE-AWAITING-DECISION
