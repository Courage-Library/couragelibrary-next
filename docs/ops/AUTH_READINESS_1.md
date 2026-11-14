# AUTH-READINESS-1: sign-up and sign-in readiness for the couragelibrary.in cutover

**Status: OPEN.** Seven blocking items: the owner's dashboard checks and decisions in sections 2 and 3, and the
owner's DNS changes. No code change is needed for any of them.

Read-only report, 2026-11-14 (main `c77acb6`, live on the production host). Nothing was changed: no code, no database
write, no dashboard change, no production sign-in. No secrets, keys, hosts or project refs are written here.

**How each state was established:**
- **code:** read from the repository.
- **public:** anonymous HTTPS GETs of the production deployment (`couragelibrary-next.vercel.app`), and the Supabase
  public `auth/v1/settings` endpoint (the same anonymous call the sign-up page makes).
- **db:** read-only counts inside one rolled-back read-only transaction. Only counts were printed; no emails or ids.
- **dns:** public DNS lookups.
- **owner:** cannot be seen from outside a dashboard; the owner must check it.

Builds on `docs/ops/DOMAIN_CUTOVER_1_PLAN.md` (rulings Q1 apex primary + www → 308, Q3 no legacy subdomain, Q5 no
account migration) and `docs/ops/EMAIL_DNS_FIX_1_PROPOSAL.md`.

## 1. Findings table

| # | Item | Where it lives | Current state | Owner verifies (click path) | Needed for cutover |
|---|---|---|---|---|---|
| 1a | App sign-up switch | `lib/auth/signup-availability.ts`: Vercel env `AUTH_SIGNUP_ENABLED=false` forces "closed"; otherwise follows Supabase | **public:** `/auth/signup` shows the **open sign-up form** on production today. So `AUTH_SIGNUP_ENABLED` is not `false` | Vercel → project → Settings → Environment Variables → Production → `AUTH_SIGNUP_ENABLED` | **yes** (see blocker B1) |
| 1b | Supabase "Allow new users to sign up" | Supabase dashboard | **public:** `disable_signup = false`, so sign-ups are **allowed** at the project level | Supabase → Authentication → Sign In / Providers → User Signups → "Allow new users to sign up" | **yes** |
| 2a | Email confirmation required | Supabase; the code assumes it is on (`app/(site)/auth/actions.ts` signupAction) | **public:** `mailer_autoconfirm = false`, so **confirmation is required** ✔ · **db:** 0 unconfirmed users | Supabase → Authentication → Sign In / Providers → Email → "Confirm email" = on | yes (already OK) |
| 2b | Password policy | App: `lib/auth/messages.ts` `isAcceptablePassword`: ≥ 8 characters, a letter and a digit (sign-up and reset). Supabase has its own rule | App rule present ✔; Supabase rule unknown | Supabase → Authentication → Sign In / Providers → Email → "Minimum password length" ≥ **8**; "Password requirements" no stricter than letters + digits (otherwise the app's form accepts what Supabase rejects; that still shows a fixed "weak password" message) | yes (verify) |
| 2c | Leaked-password protection | Supabase (Pro plan) | owner | Supabase → Authentication → Attack Protection → "Prevent use of leaked passwords" = on | no (recommended) |
| 2d | Auth rate limits | Supabase | owner. The app maps a rate-limit error to a fixed "too many attempts" message | Supabase → Authentication → Rate Limits: emails sent per hour (with custom SMTP; size it for the launch day), sign-ups/sign-ins per 5 min per IP, token verifications | **yes** (verify the email limit) |
| 3a | SMTP provider | Supabase SMTP settings; `docs/auth/EMAIL_TEMPLATES.md`: ZeptoMail, sender `no-reply@couragelibrary.in` | owner (configured earlier per the doc) | Supabase → Authentication → Emails → SMTP Settings: "Enable custom SMTP" on, the ZeptoMail host, sender `no-reply@couragelibrary.in`, sender name "Courage Library". ZeptoMail console → Mail Agents → the agent → Domains: `couragelibrary.in` **Verified** (DKIM + bounce CNAME) | **yes** |
| 3b | SPF / DKIM / DMARC | DNS (Cloudflare) | **dns, today, unchanged since 2026-10-29:** SPF `include:zoho.in +all` (allows any sender); stray `MX 0 mx.couragelibrary.in` before Zoho; DMARC `p=none`. ZeptoMail's SPF/DKIM not visible at common selectors | Cloudflare → `couragelibrary.in` → DNS: steps 1–3 of `EMAIL_DNS_FIX_1_PROPOSAL.md` (DKIM verified for every sender, SPF → `~all` with the real senders, remove `MX 0`). Then one test reset to the QA account: headers show `dkim=pass` and `dmarc=pass` | **yes** (deliverability: sign-up needs the confirmation email) |
| 3c | Branded templates | `docs/auth/email-templates/*.html` (5: confirm signup, invite, magic link, change email, reset), paste-ready in `docs/email-assets/SUPABASE_TEMPLATES.md`; gate `scripts/test_auth1_2b2.cjs` | code ✔: every link is `{{ .SiteURL }}/auth/confirm?token_hash=…`; images and links only on `https://couragelibrary.in`. Whether they are pasted: owner | Supabase → Authentication → Emails → Templates: each of the 5 has the branded body and subject (`Verify your email`, `Reset your password`, …), and none uses `{{ .ConfirmationURL }}` | **yes** (verify) |
| 3d | Template images | `public/email/{banner,strip-main,strip-cnts}.png` | code ✔. **public:** `https://couragelibrary.in/email/banner.png` still goes 307 → www (legacy) → 404 until the domain moves; it fixes itself at cutover | after cutover: open `https://couragelibrary.in/email/banner.png` → image | yes (self-fixing) |
| 4a | Google provider | Supabase provider; app flag `AUTH_GOOGLE_ENABLED` + `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (`lib/auth/google-flag.ts`) | **public:** Supabase `external.google = true`; the production login page renders the Google button, so the flag is on and a well-formed client id is present | Supabase → Authentication → Sign In / Providers → Google: enabled, the web client id under "Client IDs", "Skip nonce check" **off** | yes (already on) |
| 4b | Google origins (not redirect URI) | `docs/auth/GOOGLE_SIGNIN.md`: Google Identity Services popup + `signInWithIdToken` (`app/(site)/auth/google-actions.ts`). **No redirect URI is used** | owner | Google Cloud console → APIs & Services → Credentials → OAuth 2.0 Client IDs → the web client → **Authorised JavaScript origins**: add `https://couragelibrary.in` (keep the vercel.app origin for rollback; `www` not needed, it always redirects) | **yes** |
| 4c | OAuth consent screen | Google Cloud | owner. Privacy and terms exist on the new app (**public:** `/privacy` 200, `/terms` 200), so they will be at `https://couragelibrary.in/privacy` and `/terms` after the move | Google Cloud console → Google Auth Platform → Branding: app name "Courage Library", home `https://couragelibrary.in`, privacy `https://couragelibrary.in/privacy`, terms `https://couragelibrary.in/terms`, authorised domain `couragelibrary.in` → Audience: publishing status **In production** ("Publish app"). Basic scopes only (openid, email, profile) | **yes** (while "Testing", only listed test users can use Google) |
| 5a | Supabase Site URL | Supabase. Every email link is built from it (`{{ .SiteURL }}`) | owner (per the cutover plan: currently the vercel.app origin) | Supabase → Authentication → URL Configuration → Site URL = `https://couragelibrary.in` (at the cutover minute) | **yes** |
| 5b | Redirect URL allow-list | Supabase. The app sends `emailRedirectTo` / `redirectTo` = `NEXT_PUBLIC_SITE_URL` + `/auth/confirm?next=…` | owner | Same page → Redirect URLs: `https://couragelibrary.in/**`, `https://www.couragelibrary.in/**`, keep `https://couragelibrary-next.vercel.app/**` (30 days, rollback) | **yes** |
| 5c | `NEXT_PUBLIC_SITE_URL` | Vercel env; `config/env.ts`, used in `confirmUrl()` | owner (not visible anonymously) | Vercel → Settings → Environment Variables → Production: `NEXT_PUBLIC_SITE_URL=https://couragelibrary.in`, then **Redeploy** (it is inlined at build) | **yes** |
| 5d | `/auth/callback`, `/auth/confirm` on any host | `app/(site)/auth/callback/route.ts`, `confirm/route.ts` | code ✔: both build every redirect from the request's own origin and sanitise `next` (SEC-1D); failures → `/auth/login?m=link-expired` | none | yes (OK) |
| 6 | Turnstile | Cloudflare widget; app flag `AUTH_CAPTCHA_ENABLED` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (`lib/auth/captcha.ts`); Supabase verifies the token | **public:** the widget renders on `/auth/login`, `/auth/signup` and `/auth/forgot-password`, so the flag is **on** in production. **If the widget does not list `couragelibrary.in`, every sign-in, sign-up and reset fails on the new domain** | Cloudflare → Turnstile → the widget → Settings → Hostname Management: add `couragelibrary.in` (and `www.couragelibrary.in`, harmless); keep the vercel.app host. Supabase → Authentication → Attack Protection → CAPTCHA protection on, provider Turnstile | **yes** |
| 7a | Profile row | `services/user-profile.service.ts` `ensureProfile`: insert-only, on every sign-in path (password, Google, email links) | code ✔ · **db:** 28 users, 28 profiles, 0 users without a profile. No trigger on `auth.users`; the row is created by the app on the first sign-in | none | yes (OK) |
| 7b | Auto username | migration 134 (`trg_user_profiles_auto_username`, `aspirant_` + 6 digits) | **db:** ledger 134 APPLIED; trigger present; 28/28 profiles have an auto username | none | yes (OK) |
| 7c | **18+ consent** | `lib/auth/age-gate.ts`: flag `AGE_GATE_ENABLED` (needs migration 109); sign-up checkbox + `/confirm-age` gate in the middleware. Owner decision AGE-18: the site is **18+ only** | **db:** 109 APPLIED. **public:** the production sign-up form has **no 18+ checkbox**, so the flag is **off**. **db:** 0 profiles with an 18+ confirmation | Vercel → Environment Variables → Production: `AGE_GATE_ENABLED=true` → Redeploy. Then `/auth/signup` shows the 18+ checkbox; existing users are sent to `/confirm-age` once | **yes** (blocker B1) |
| 7d | Welcome / onboarding | `lib/onboarding/*`: flag `ONBOARDING_ENABLED` (migration 091); the first sign-in may go to `/onboarding` once | **db:** 091 APPLIED. Flag state: owner (not visible anonymously). No welcome email exists (none in the templates) | Vercel → Environment Variables → `ONBOARDING_ENABLED` (decide on/off) | no (owner's choice) |
| 7e | Error states | `lib/auth/messages.ts`: fixed codes only (no provider text, no account enumeration): missing-fields, invalid-email, weak-password, age-required, signup-closed, captcha-required/failed, rate-limited, email-not-confirmed, link-expired, google-* | code ✔ | none | yes (OK) |
| 7f | Redirect after login | `postLoginTarget()`: sanitised `next` or `/dashboard`; the age gate (middleware) runs first; onboarding once if on | code ✔ | none | yes (OK) |
| 8a | **Admin / staff MFA** | `lib/auth/mfa.ts`, `docs/auth/ADMIN_MFA.md`: TOTP; env `ADMIN_MFA_REQUIRED` + DB `security_settings.admin_mfa_required` (098) | **db:** 2 admins + 1 staff; **0 of 3 have a verified authenticator**; DB flag `false`. 2 of the 3 privileged accounts are QA test-domain accounts (used by CI) | Each admin: sign in → `/admin/mfa` → "Set up authenticator app" → scan → code (and a second device). Then Vercel `ADMIN_MFA_REQUIRED=true` → Redeploy | **yes** for the real admin's enrolment (B6); switching the flag on needs a CI decision first (see B6) |
| 8b | Test / QA accounts leaking publicly | `user_profiles.profile_public`, `leaderboard_opt_in` | **db:** 3 test-domain accounts; 0 public profiles, 0 leaderboard opt-ins; 0 public profiles overall | none now. Before launch: decide whether the QA **admin / staff** accounts keep their roles on production | no (OK today) |
| 9a | Cookies on apex + www | `lib/supabase/server.ts`, `middleware.ts`: `@supabase/ssr` 0.5.2 defaults, **host-only** cookies (no `domain`), path `/`, SameSite Lax, 400-day max-age | code: fine **because** ruling Q1 makes `www` a 308 to the apex, so every session lives on the apex. A session from the vercel.app host does not carry over (expected) | Vercel → Settings → Domains: `www.couragelibrary.in` = "Redirect to couragelibrary.in (308)" | **yes** (with the www redirect) |
| 9b | Sign-out clears everything | `logoutAction`: `signOut({ scope: "global" })` (every session of the user), Supabase cookies cleared; `updatePasswordAction` also signs out globally | code ✔. Two non-session cookies stay: the single-use Google nonce (httpOnly) and the onboarding "prompted" marker. Both are harmless | none | yes (OK) |
| 10a | Legacy Supabase project | the tools target only `NEXT_PUBLIC_SUPABASE_URL`; `next.config.ts` image host | code ✔: the one hard-coded Supabase storage host is **the current project** (compared without printing it) | none | yes (OK) |
| 10b | Old domain / legacy host | the legacy Vercel project still holds apex + www | **public:** apex → 307 → www; www serves the legacy static site (`/auth/login` there = 404). Code: two cosmetic `couragelibrary.com` strings (`app/(site)/courses/[slug]/learn/course-player-client.tsx` placeholder video URL; `services/exam-onboarding/exam-onboarding.service.ts` audit fallback actor) | the domain move itself (`DOMAIN_CUTOVER_1_PLAN.md` §3) | **yes** (the move) · the two strings: no |

## 2. Blocking for cutover (in order)

1. **B1: registration is open today without the 18+ gate.** Production shows the sign-up form (item 1a/1b), but
   `AGE_GATE_ENABLED` is off (7c), so anyone can register now on the vercel.app host without confirming 18+.
   Recommendation: set `AUTH_SIGNUP_ENABLED=false` now, until cutover. At cutover set `AGE_GATE_ENABLED=true` first,
   then open sign-up. Owner decision.
2. **B2: email deliverability.** Sign-up requires the confirmation email (2a), so it must arrive.
   - ZeptoMail domain verified (DKIM + bounce) (3a);
   - SPF `+all` → `~all` with the real senders, and remove the stray `MX 0` (3b);
   - Supabase email rate limit sized for launch (2d).
3. **B3: templates confirmed in Supabase.** The 5 branded templates are pasted, with no `{{ .ConfirmationURL }}`
   (3c).
4. **B4: Turnstile hostname.** `couragelibrary.in` (+ www) added to the widget (6). Otherwise every auth form fails
   on the new domain, because the flag is on.
5. **B5: Google.** JavaScript origin `https://couragelibrary.in` (4b), and the consent screen **In production** with
   privacy/terms/home on `couragelibrary.in` (4c).
6. **B6: admin MFA.** The real admin account enrols an authenticator, plus a second device (8a). Turning
   `ADMIN_MFA_REQUIRED` on locks out CI's QA admin / staff accounts unless they get a TOTP path or lose their roles.
   Owner decision: (a) enrol now and switch the flag on after a CI plan, or (b) remove the roles from the QA accounts
   on production and switch on.
7. **B7: the cutover minute itself** (`DOMAIN_CUTOVER_1_PLAN.md` §9), in its order:
   - domains moved, with www → 308 apex (9a, 10b);
   - Supabase Site URL + Redirect URLs (5a, 5b);
   - `NEXT_PUBLIC_SITE_URL` + Redeploy (5c);
   - then the checks in section 4.

## 3. Can be done after launch

- DMARC `p=none` → `quarantine` → `reject` after about 2 weeks of clean reports; SPF `-all` later
  (`EMAIL_DNS_FIX_1_PROPOSAL.md` steps 5–6).
- Leaked-password protection (2c), if not already on.
- The DB MFA flag `security_settings.admin_mfa_required` (098: RLS predicates require AAL2) after the env flag has run
  cleanly.
- Onboarding (`ONBOARDING_ENABLED`) and a welcome email: product choices (7d).
- Remove the two `couragelibrary.com` strings (10b).
- Hardening: the session cookies carry no explicit `Secure` attribute (`@supabase/ssr` defaults; HTTPS only in practice).
  Consider setting `cookieOptions.secure` in production.
- The `EMAIL-DNS` prod-smoke check proposed in `EMAIL_DNS_FIX_1_PROPOSAL.md` §5.
- Remove `https://couragelibrary-next.vercel.app/**` from the Redirect URLs after 30 days.

## 4. Owner actions (click paths)

**Before the cutover (T-7 d … T-1 d):**
1. **Vercel** → couragelibrary-next → Settings → Environment Variables → Production:
   - decide B1: `AUTH_SIGNUP_ENABLED=false` now;
   - check `ONBOARDING_ENABLED`;
   - Save → Deployments → latest → Redeploy.
2. **Supabase** → Authentication → Sign In / Providers:
   - User Signups → note "Allow new users to sign up";
   - Email → "Confirm email" on, "Minimum password length" ≥ 8, "Password requirements" no stricter than letters +
     digits;
   - Google → enabled, client id listed, "Skip nonce check" off.
3. **Supabase** → Authentication → Attack Protection:
   - CAPTCHA protection on (Turnstile);
   - "Prevent use of leaked passwords" on.
4. **Supabase** → Authentication → Rate Limits: the emails-per-hour limit sized for launch day; note the sign-up /
   sign-in limits.
5. **Supabase** → Authentication → Emails:
   - SMTP Settings: custom SMTP on, ZeptoMail, sender `no-reply@couragelibrary.in`;
   - Templates: the 5 branded templates and subjects as in `docs/email-assets/SUPABASE_TEMPLATES.md`.
6. **ZeptoMail** → Mail Agents → the agent → Domains → `couragelibrary.in`: DKIM and bounce domain "Verified".
7. **Cloudflare** → `couragelibrary.in` → DNS, per `EMAIL_DNS_FIX_1_PROPOSAL.md`:
   - DKIM for every sender;
   - SPF `+all` → `~all` with the real senders;
   - delete `MX 0 mx.couragelibrary.in`;
   - then one password reset to the QA account: `spf`/`dkim`/`dmarc` = pass in the headers.
8. **Cloudflare** → Turnstile → the widget → Settings → Hostname Management: add `couragelibrary.in` and
   `www.couragelibrary.in`; keep the vercel.app host.
9. **Google Cloud console:**
   - APIs & Services → Credentials → the web OAuth client → Authorised JavaScript origins: add
     `https://couragelibrary.in`;
   - Google Auth Platform → Branding: home / privacy / terms on `couragelibrary.in`, authorised domain
     `couragelibrary.in`;
   - Audience → "Publish app" (In production).
10. **Admin MFA:** sign in as the real admin → `/admin/mfa` → "Set up authenticator app" → scan → code; repeat on a
    second device. Decide B6 (QA accounts) before setting `ADMIN_MFA_REQUIRED=true`.

**At the cutover minute** (`DOMAIN_CUTOVER_1_PLAN.md` §9):

11. **Vercel:**
    - the legacy project → Settings → Domains → remove apex + www (not `cnts`);
    - the new project → Settings → Domains → add both, `www` → "Redirect to couragelibrary.in (308)".
12. **Supabase** → Authentication → URL Configuration:
    - Site URL `https://couragelibrary.in`;
    - Redirect URLs `https://couragelibrary.in/**`, `https://www.couragelibrary.in/**` (keep the vercel.app one).
13. **Vercel** → Environment Variables → Production:
    - `NEXT_PUBLIC_SITE_URL=https://couragelibrary.in`;
    - `AGE_GATE_ENABLED=true`;
    - then open sign-up (`AUTH_SIGNUP_ENABLED` removed or `true`);
    - Redeploy.
14. **Check (anonymous + your own test account; the engineer checks anonymously only):**
    - `https://couragelibrary.in/auth/signup` shows the form, the 18+ checkbox and Turnstile;
    - a sign-up with a fresh test mailbox → the email from `no-reply@` arrives in the inbox (not spam) → the link opens
      `https://couragelibrary.in/auth/confirm…` → `/dashboard`;
    - "Forgot password?" works on another device;
    - "Continue with Google" works with a non-test Google account;
    - `https://www.couragelibrary.in/auth/login` → 308 to the apex;
    - sign-out returns to `/auth/login?m=signed-out`, and `/dashboard` then asks to sign in.

## 5. Evidence (read-only, 2026-11-14)

- **Supabase public settings:** `disable_signup=false`, `mailer_autoconfirm=false`, providers on: email, google;
  anonymous users off; phone off.
- **Production pages (anonymous, `c77acb6`):**
  - `/auth/signup`: sign-up form yes, 18+ checkbox no, Turnstile yes, Google no (the Google button is on the login
    page only, by design);
  - `/auth/login`: Turnstile yes, Google yes;
  - `/auth/forgot-password`: Turnstile yes;
  - `/privacy` 200, `/terms` 200.
- **Domains:** `couragelibrary.in` → 307 → www; `www.couragelibrary.in/` 200 (legacy site); `www…/auth/login` 404.
- **Database (counts only):**
  - ledger 091 / 098 / 109 / 134 / 139 APPLIED;
  - `security_settings.admin_mfa_required=false`; admins 2, staff 1, verified TOTP 0 / 0; privileged test-domain
    accounts 2;
  - users 28: test-domain 3, unconfirmed 0, created in the last 30 days 0;
  - profiles 28: auto username 28, public 0, 18+ confirmed 0;
  - users without a profile 0; trigger `trg_user_profiles_auto_username`.
- **DNS:** SPF `v=spf1 include:zoho.in +all`; MX `0 mx.couragelibrary.in`, `10/20/50` Zoho; DMARC `p=none`.
