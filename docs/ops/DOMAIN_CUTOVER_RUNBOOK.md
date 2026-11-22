# DOMAIN-CUTOVER runbook: move the new app to couragelibrary.in

**Status: OPEN.** DOMAIN-CUTOVER-0 is read-only: an inventory plus this runbook (2026-11-22, main `ee48129`). Nothing
was changed in DNS, Vercel, Supabase, Razorpay, GitHub settings, e-mail or code.

Builds on `docs/ops/DOMAIN_CUTOVER_1_PLAN.md` (2026-10-28; owner rulings Q1, Q3, Q4, Q5) and on the AUTH-READINESS-1
report (`docs/ops/AUTH_READINESS_1.md` on the local branch `docs/auth-readiness-1`, 2026-11-14, not yet on main). Where
the two disagree, **this file is current**.

Markers:
- **[OWNER]** — a dashboard action (Vercel, Cloudflare, Supabase, Google, Turnstile, Razorpay, GitHub settings).
- **[ENG]** — a code change by Claude Code. Done only on a GO and released per the release runbook.
- **[BOTH]** — the owner acts and the engineer verifies.

No secrets, keys, IPs, hosts of other services or project refs are written here. Values are masked (`[ip]`, `*.`),
and Supabase projects are compared as sha256 prefixes only.

---

## 1. What was checked (read-only, 2026-11-22)

| Area | How | Result |
|---|---|---|
| DNS | public resolvers (1.1.1.1, 8.8.8.8) | NS = Cloudflare (`*.ns.cloudflare.com`). Apex `A` → 1 record (Vercel). `www` and `cnts` → CNAME `*.vercel-dns-017.com`. **Unchanged since 2026-10-28.** |
| Apex / www | anonymous HTTPS | `http://couragelibrary.in` → 308 https → **307 `https://www.couragelibrary.in/`** → 200 "Courage Library — Coming soon". The legacy project still holds apex + www. |
| Legacy pages | anonymous GETs | `/about.html`, `/SSC-CGL.html`, `/enroll.html` → 200 (still served behind the "Coming soon" home). The sitemap index now lists **9** child sitemaps (10 on 2026-10-28). The 596-URL inventory (`DOMAIN_CUTOVER_1_LEGACY_URLS.txt`) must be refreshed before the redirect map is built. |
| Legacy payments | anonymous GET of `/enroll.html` (prefix only) | It loads Razorpay Checkout with a **LIVE** key (`rzp_live_` prefix seen; value not read). **The legacy site can still take live payments.** |
| Legacy data | the Supabase host in the legacy page vs the new app's env, compared as sha256 prefixes | **Different projects.** The legacy site uses its own (legacy) Supabase project. The new app and every tool use only the `NEXT_PUBLIC_SUPABASE_URL` project. The database tools refuse any other project (sha256 ref lock, `scripts/db/gen-types.cjs`). No connection to the legacy project was made. |
| `cnts.couragelibrary.in` | anonymous GET | 200; a **separate** Vercel project. It must stay untouched. |
| New app | anonymous GETs | `https://couragelibrary-next.vercel.app/` → 200 with `X-Robots-Tag: noindex, nofollow` (off-canonical, as designed). `/email/banner.png` → 200. `POST`-only webhook `/api/webhooks/razorpay` → `GET` 405. |
| Sign-up (AUTH-READINESS B1) | anonymous GET of `/auth/signup` | **Still open, without the 18+ checkbox** (the form and Turnstile render). Unchanged since 2026-11-14. |
| GitHub settings | `gh secret list` / `gh variable list` (**names only**) | Secrets: `CRON_SECRET`, `PAYMENTS_RECONCILE_ENABLED`. Variables: **none**. Missing: `RECONCILE_URL`, `EMAILS_URL`, `PAYMENTS_EMAILS_ENABLED`. **Finding F1:** `PAYMENTS_RECONCILE_ENABLED` was created as a **secret**. The workflow gate reads a repository **variable** (`vars.PAYMENTS_RECONCILE_ENABLED`), so the reconcile job never runs. That is safe today, because payments are closed. |
| Mail DNS | public resolvers | Unchanged: SPF `v=spf1 include:zoho.in +all`; MX `0 mx.couragelibrary.in` + Zoho 10/20/50; DMARC `p=none` (reports to Brevo). ZeptoMail bounce CNAME present; ZeptoMail DKIM not found at common selectors (EMAIL-KYC-1). |

---

## 2. Inventory: everything that depends on the site's own URL

Values are masked; **new** is the value after the cutover. "Who": OWNER (dashboard) or ENG (code, on a GO).

| # | Item | Where | Current (masked) | New | Who | Risk if missed |
|---|---|---|---|---|---|---|
| **Domain and hosting** |||||||
| 1 | Apex `couragelibrary.in` | Vercel (legacy project) | legacy project; 307 → www | new project, **primary** (Q1) | OWNER | the site does not move |
| 2 | `www.couragelibrary.in` | Vercel (legacy project) | legacy project, primary | new project, **308 → apex** | OWNER | duplicate host, cookie split |
| 3 | `cnts.couragelibrary.in` | its own Vercel project | 200 | **unchanged** | — (do not touch) | CNTS down |
| 4 | DNS apex `A` / `www` CNAME | Cloudflare | Vercel; DNS-only (grey) per the plan | **unchanged** (use exactly what Vercel shows if it asks) | OWNER | certificate / routing failure |
| 5 | `couragelibrary-next.vercel.app` | Vercel alias | production URL used by CI | **keep** as a noindex alias (rollback, CI) | — | — |
| **App URLs** |||||||
| 6 | `NEXT_PUBLIC_SITE_URL` | Vercel env (Production) | not visible anonymously; expected the vercel.app origin | `https://couragelibrary.in`, then **Redeploy** | OWNER | auth and Pro e-mail links point at vercel.app (`app/(site)/auth/actions.ts:48-49`, `lib/email/pro-email-server.ts:111`) |
| 7 | Canonical / `metadataBase` / OG / JSON-LD / hreflang / sitemap / robots | code: `config/site.ts` `CANONICAL_SITE_URL` (the apex) + `isCanonicalHost` | already the apex; flips automatically on the canonical host (noindex off, robots allow, sitemap) | no change | — | — (gate CA7) |
| 8 | Sitemap `/` + `/hi` with hreflang | `app/sitemap.ts` | already on the apex | no change | — | — |
| **Supabase Auth (project couragelibrary-next)** |||||||
| 9 | Site URL | Supabase → Authentication → URL Configuration | expected the vercel.app origin (not visible) | `https://couragelibrary.in` | OWNER | confirm / reset e-mails open vercel.app |
| 10 | Redirect URL allow-list | same page | expected the vercel.app origin | **add** `https://couragelibrary.in/**`, `https://www.couragelibrary.in/**`; **keep** the vercel.app origin 30 days + localhost | OWNER | sign-in links refused |
| 11 | Auth e-mail templates | Supabase → Emails → Templates (5, from `docs/email-assets/SUPABASE_TEMPLATES.md`) | links = `{{ .SiteURL }}/auth/confirm?...` | no edit (they follow the Site URL) | OWNER confirms pasted (AUTH-READINESS B3) | wrong links |
| 12 | Template images | `https://couragelibrary.in/email/{banner,strip-main,strip-cnts}.png` | 307 → www → **404** today | 200 `image/png` after cutover (self-fixing) | ENG verifies | broken images in mails |
| 13 | `/auth/callback`, `/auth/confirm` | code | origin-relative, `next` sanitised | no change | — | — |
| 14 | Google sign-in | Google Cloud → Credentials → OAuth client → **Authorised JavaScript origins** (no redirect URI used) | vercel.app origin | **add** `https://couragelibrary.in`; keep vercel.app | OWNER (B5) | Google button fails on the domain |
| 15 | Google consent screen | Google Auth Platform | owner | In production; home / privacy / terms on the apex | OWNER (B5) | consent warning |
| 16 | Turnstile widget hostnames | Cloudflare → Turnstile | vercel.app | **add** `couragelibrary.in` (+ `www`); keep vercel.app | OWNER (B4) | **every auth form fails** on the domain |
| 17 | Sign-up gate | Vercel env `AUTH_SIGNUP_ENABLED`, `AGE_GATE_ENABLED` | sign-up **open**, no 18+ gate (B1) | `AGE_GATE_ENABLED=true` before sign-up opens on the domain | OWNER (B1) | under-18 sign-ups (owner rule AGE-18) |
| 18 | Admin MFA | `ADMIN_MFA_REQUIRED` + DB flag | off; 0 of 3 privileged accounts enrolled | owner decision (B6) | OWNER | admin account takeover |
| **Payments** |||||||
| 19 | Razorpay LIVE webhook | Razorpay dashboard (LIVE) | **unknown host / path** (Q2). The legacy `/enroll.html` takes LIVE checkout | unchanged in DOMAIN-CUTOVER-1; moved only in **PAY-1 B8** | OWNER (read only now) | legacy payments lost if the webhook is on the apex |
| 20 | Razorpay LIVE keys | legacy site | in the legacy page (prefix only seen) | the new app gets LIVE keys only in PAY-1 B8 (`RAZORPAY_LIVE_APPROVED`, production deploy only) | OWNER, B8 | — |
| 21 | Razorpay TEST webhook | Razorpay (TEST) | to be added for B7 (Preview alias) | unchanged by the cutover | OWNER (B7 run sheet) | — |
| **Cron (DOMAIN-CUTOVER-2)** |||||||
| 22 | `RECONCILE_URL` | GitHub secret | **missing** | `https://couragelibrary.in/api/cron/reconcile` | OWNER | reconcile never runs |
| 23 | `PAYMENTS_RECONCILE_ENABLED` | GitHub | a **secret** (wrong kind, F1) | a repository **variable** = `true` (and delete the secret) | OWNER | the gate is always false |
| 24 | `EMAILS_URL`, `PAYMENTS_EMAILS_ENABLED` | GitHub | missing (EMAIL-KYC-1) | `https://couragelibrary.in/api/cron/emails` + variable `true` | OWNER (after EMAIL-KYC-1) | no reminders |
| 25 | Vercel cron `/api/cron/finalize-attempts` | `vercel.json` | relative path, runs on production | no change (follows the project) | — | — |
| **E-mail / DNS** |||||||
| 26 | ZeptoMail app mail | EMAIL-KYC-1 (backlog) | not set up | app-mail agent, token, `EMAIL_APP_ENABLED` | OWNER | no receipts / reminders |
| 27 | SPF `+all` | Cloudflare TXT | `include:zoho.in +all` | `~all` with the real senders | OWNER (EMAIL-DNS-FIX-1) | spoofing |
| 28 | `MX 0 mx.couragelibrary.in` | Cloudflare | priority 0, resolves via the wildcard to the web host | delete | OWNER | replies to support tried at the web host first |
| 29 | DMARC | Cloudflare | `p=none` | quarantine after ~2 weeks of clean reports | OWNER, later | — |
| **Hard-coded URLs in code / CI** |||||||
| 30 | Prod smoke | `.github/workflows/ci-gates.yml:628,630` (`wait-for-deploy`, `anonymous-smoke`) | `https://couragelibrary-next.vercel.app` | the apex (+ keep the alias as a noindex check) | ENG (after DOMAIN-CUTOVER-1) | CI stops covering the real domain |
| 31 | Anonymous smoke host rule | `scripts/smoke/anonymous-smoke.cjs:38` ("couragelibrary-next only as the site URL") | vercel.app | parameterised on the base URL | ENG | false FAIL |
| 32 | B7 production check | `scripts/live/test_pay1_b7.cjs:36` `PROD` | vercel.app | the apex | ENG | S1 checks the wrong host |
| 33 | SEO canon seed health URL | `scripts/content/seo-topic-canon-1-seed.cjs:24` | vercel.app | the apex | ENG | script reads the alias (harmless) |
| 34 | Canonical host gate | `scripts/test_ca7.cjs:60` | correct (vercel.app → false) | no change | — | — |
| 35 | Legacy 301 map | — | **NOT BUILT** (Q4 ruled 2026-10-29) | `redirects()` from a checked-in map + its gate | ENG (blocker) | ~600 legacy URLs → 404, search traffic lost |

---

## 3. Phases (separate releases)

| Phase | What | Who | Depends on |
|---|---|---|---|
| **DOMAIN-CUTOVER-1** | the domain moves to the new app; auth origins; `NEXT_PUBLIC_SITE_URL`; legacy 301 map live; CI smoke on the apex | OWNER (dashboards) + ENG (map, smoke) | §4 pre-checks; AUTH-READINESS B1–B5; Q2 answered |
| **DOMAIN-CUTOVER-2** | cron URLs (`RECONCILE_URL`, later `EMAILS_URL`) on the apex; fix F1 | OWNER | DC-1 done and stable |
| **EMAIL / DNS** | EMAIL-KYC-1 (ZeptoMail app mail) + EMAIL-DNS-FIX-1 (SPF `~all`, drop `MX 0`, DMARC later) | OWNER | independent; SPF + MX before launch, EMAIL-KYC-1 within 4 weeks of launch |
| **PAY-1 B7** | end-to-end with TEST keys on the Preview (run sheet in `docs/payments/PAY_1_DESIGN.md` §15) | OWNER clicks, ENG verifies | can run before or after DC-1. After DC-1, S1 checks the apex (item 32) |
| **PAY-1 B8 (payments cutover)** | Razorpay LIVE keys + LIVE webhook move to the new app; legacy checkout off | **owner-present only** | DC-1, B7 green, Q2 answered, the legacy checkout frozen |

Order: **EMAIL/DNS fixes (SPF, MX) → DC-1 → DC-2 → B7 (if not done) → B8.** EMAIL-KYC-1 runs in parallel.

---

## 4. DOMAIN-CUTOVER-1: pre-checks (all must be true)

| # | Check | Who | How verified |
|---|---|---|---|
| P1 | **Q2 answered:** the Razorpay LIVE webhook URL (host + path), events, and whether the legacy site still takes live payments (it loads LIVE checkout today). If the webhook host is the apex: freeze the legacy checkout 24 h before (plan §6) | OWNER | owner answer recorded here |
| P2 | Legacy URL inventory refreshed (the sitemap now has 9 children) + the **301 map built and gated**: every legacy URL → one hop to an existing route, no chains or loops (Q4: closest hub) | ENG on a GO | new offline gate green; released before the cutover (it is inert until the domain moves) |
| P3 | CI smoke switch prepared on a branch (items 30–33), not merged | ENG | branch ready |
| P4 | AUTH-READINESS B1: `AGE_GATE_ENABLED=true` before sign-up is open on the domain (or `AUTH_SIGNUP_ENABLED=false` until then) | OWNER | `/auth/signup` shows the 18+ checkbox (or the closed message) |
| P5 | B2 / B3: the auth mail sends: Supabase SMTP (ZeptoMail) verified, the 5 templates pasted, the rate limit sized; SPF `~all` and `MX 0` removed (EMAIL-DNS-FIX-1 steps 2–3) | OWNER | a QA password-reset mail arrives; `dig` shows the new SPF / MX |
| P6 | B4 / B5 done **before** the minute (adding is harmless): Turnstile hostnames + Google JS origin + consent screen | OWNER | owner confirms |
| P7 | B6 admin MFA: decided and applied | OWNER | owner confirms |
| P8 | Apex / www stay **DNS-only** (grey cloud) in Cloudflare; TTL 60 s at T-48 h (fallback only) | OWNER | screenshot kept by the owner (not in the repo) |
| P9 | "Before" snapshot: `dig` apex / www / cnts / MX / TXT / `_dmarc` / DKIM; HEAD of cnts | ENG | saved outside the repo |
| P10 | main CI green; production `/api/health` version = HEAD; no CI dispatch queued | ENG | `gh run list` |
| P11 | Window (IST late night) + who holds which dashboard on the day (Q7) | OWNER | owner answer |

## 5. DOMAIN-CUTOVER-1: the cutover (owner at the dashboards, engineer verifying)

Expected downtime: **zero to ~1 minute** for the apex (Vercel moves the domain between projects; DNS does not change).
A brief window where `NEXT_PUBLIC_SITE_URL` still points at vercel.app ends with the redeploy (step 4). Sign-in itself
keeps working throughout, because cookies are host-only and nobody is signed in on the apex yet.

| Step | Who | Action | Verify (ENG, anonymous only) | Roll back this step |
|---|---|---|---|---|
| 1 | OWNER | Legacy Vercel project → Domains → remove `couragelibrary.in` + `www.couragelibrary.in` (**not** `cnts`) | apex shows Vercel "no deployment" briefly; `cnts` 200 | re-add both to the legacy project |
| 2 | OWNER | New project → Domains → add both; `www` → **Redirect (308) to `couragelibrary.in`** | apex 200 from the new app; `www` 308 → apex; `http://` → https; TLS valid | remove from the new project; step 1 rollback |
| 3 | OWNER | Supabase → URL Configuration: Site URL → `https://couragelibrary.in`; add the apex + www redirect URLs (keep vercel.app + localhost) | (owner) settings saved | Site URL back to the vercel.app origin (the allow-list may stay) |
| 4 | OWNER | Vercel env (Production) `NEXT_PUBLIC_SITE_URL=https://couragelibrary.in` → **Redeploy** (≈ 3–5 min) | `/api/health` version = HEAD; the auth page's confirm link base (QA reset mail) is the apex | revert the env + redeploy (or leave it: sign-up behaviour unchanged) |
| 5 | ENG | Post-cutover smoke (§6) | all green | trigger table below |
| 6 | ENG | Merge + release the CI smoke switch (P3) | next push run green, prod-smoke on the apex | revert that commit |

**Rollback of the whole cutover (< 5 min, no DNS change):** new project → remove apex + www; legacy project → re-add
(apex → 307 www as before); Supabase Site URL → the vercel.app origin; verify `curl -I` shows the legacy site and `cnts`
200. Possible only while the legacy project exists (Q3: paused, not deleted, for 1–2 months).

**Rollback triggers:** apex not 200 from the new app 10 min after step 2; auth confirm / reset links broken; Turnstile
or Google failing on the apex; `cnts` down; mail DNS changed; the new app's 5xx rate above 1 %; Razorpay reports
failing LIVE webhook deliveries.

## 6. Post-cutover checks (DOMAIN-CUTOVER-1)

Run by ENG, anonymous only; the owner does the real-account sign-in check.
1. **Hosts:** apex 200 (new app); `www` 308 → apex; `http` → https; `cnts` 200 unchanged; the vercel.app alias still
   `X-Robots-Tag: noindex`.
2. **SEO:**
   - no noindex header on the apex; `robots.txt` allows `/` with the sitemap line;
   - `/sitemap.xml` lists `/` and `/hi` on the apex with hreflang;
   - canonical of `/` = the apex, of `/hi` = `/hi`.
3. **Landing:** `/` and `/hi` H1s; the language switch; no 404 among the internal links (`scripts/live/test_landing1_pages.cjs` logic against the apex, read-only).
4. **E-mail assets:** `https://couragelibrary.in/email/{banner,strip-main,strip-cnts}.png` 200 `image/png`, same sha256 as `public/email/*`.
5. **Auth (QA account only):**
   - the login / sign-up / forgot pages render with Turnstile;
   - the Google button loads with no origin error;
   - a QA password-reset mail's link opens `https://couragelibrary.in/auth/confirm?...`.
6. **Legacy redirects:** a 40-URL sample from the refreshed inventory → one hop to the intended route, no chains.
7. **Payments:**
   - `GET /api/webhooks/razorpay` on the apex → 405;
   - production checkout still closed (`/pricing` loads no Razorpay script — `test_pay1_b7.cjs s1` against the apex);
   - the owner confirms no failing LIVE deliveries in Razorpay.
8. **Mail DNS:** MX / TXT / DMARC / DKIM identical to the "before" snapshot (or to the EMAIL-DNS-FIX-1 target).
9. **[OWNER] Search Console:** submit `https://couragelibrary.in/sitemap.xml`; watch Coverage daily for 7 days.
10. **T+1 d [OWNER]:** pause (not delete) the legacy Vercel project; delete after 1–2 months (Q3). **T+7 d:** TTLs back
    to Auto. **T+30 d:** remove the vercel.app origin from the Supabase redirect list.

## 7. DOMAIN-CUTOVER-2: cron URLs (after DC-1 is stable)

| Step | Who | Action | Verify | Roll back |
|---|---|---|---|---|
**Amended by the owner at DOMAIN-CUTOVER-2 (2026-11-22):** both URLs are repository **variables** (public URLs, not
secrets), the switches stay `false` until their phases, and each job is proven once with a **probe** run.

| Step | Who | Action | Verify | Roll back |
|---|---|---|---|---|
| 1 | OWNER | GitHub → Settings → Secrets and variables → Actions → **Variables**: create `PAYMENTS_RECONCILE_ENABLED` = `false`; **Secrets**: delete the secret of the same name (F1). Set it to `true` only at PAY-1 B8 | `gh variable list` / `gh secret list` (names) | — |
| 2 | OWNER | **Variables**: `RECONCILE_URL` = `https://couragelibrary.in/api/cron/reconcile`, `EMAILS_URL` = `https://couragelibrary.in/api/cron/emails`. `CRON_SECRET` unchanged (it must equal the Vercel `CRON_SECRET`). The workflows refuse any other URL before the bearer is sent | names + public values | delete the variables |
| 3 | ENG | Run each workflow once by hand with **probe = true** (allowed only while its switch is off) → HTTP 200 and `skipped` (`CHECKOUT_CLOSED` / `EMAIL_OFF`); any other answer fails the run. Precondition: checkout closed (anonymous `/pricing`) and e-mail off in Vercel (names only) | the run logs | — |
| 4 | OWNER (after EMAIL-KYC-1) | Variable `PAYMENTS_EMAILS_ENABLED` = `true` | run `payments-emails` once → 200 counts only | variable `false` |

The jobs call the **apex**, never the vercel.app alias, so they run on the production deployment that owns the domain.

## 8. Payments cutover (PAY-1 B8, owner-present only — not part of this runbook's execution)

Outline only; B8 gets its own plan:
1. Q2 answered; the legacy checkout frozen and nothing in flight.
2. B7 green on the Preview.
3. Razorpay LIVE: the owner adds the new webhook `https://couragelibrary.in/api/webhooks/razorpay` (own secret),
   disables the legacy one.
4. Vercel Production env: LIVE keys + webhook secret + `RAZORPAY_LIVE_APPROVED=true` + `PAYMENTS_ENABLED` /
   `PRO_ENABLED`. This happens only after code that reads them is deployed (DEPLOY-BEFORE-ACTIVATE). A live key opens
   checkout only on the production deployment (B7 guard).
5. DC-2 step 1 (reconcile on).
6. One owner purchase + refund on live (owner-run), then monitoring.

Never touched in DC-0 / DC-1 / DC-2: the Razorpay LIVE webhook and keys.

## 9. Gates and smokes that change their base URL (ENG, after DC-1)

| File | Line | Change |
|---|---|---|
| `.github/workflows/ci-gates.yml` | 628 (`wait-for-deploy.cjs`), 630 (`anonymous-smoke.cjs`) | base → `https://couragelibrary.in`; keep a second, cheap alias check: the vercel.app alias still sends noindex |
| `scripts/smoke/anonymous-smoke.cjs` | 38 | the "site URL only" rule takes the base URL instead of the literal vercel.app origin |
| `scripts/live/test_pay1_b7.cjs` | 36 | `PROD` → the apex |
| `scripts/content/seo-topic-canon-1-seed.cjs` | 24 | health URL → the apex |
| `scripts/test_ca7.cjs` | 60 | no change (the host matcher is already right) |

**New post-cutover checks (to add to prod-smoke):**
- apex 200 without noindex;
- `www` 308 → apex;
- alias noindex;
- `/email/banner.png` sha256;
- `/sitemap.xml` on the apex with `/hi`;
- a 10-URL legacy-redirect sample (one hop);
- `GET /api/webhooks/razorpay` 405;
- `cnts` 200 (read-only GET);
- the EMAIL-DNS check proposed in `EMAIL_DNS_FIX_1_PROPOSAL.md` §5 (SPF not `+all`, no `MX 0`, DMARC present).

## 10. Open questions for the owner

See the DOMAIN-CUTOVER-0 report; they are numbered there and recorded here once answered.

---

## 11. Owner answers and the GO (2026-11-22)

- **Q1:** the Razorpay LIVE webhook points at couragelibrary.in (legacy). Legacy `/enroll.html` must stop taking
  payments. The webhook and keys are NOT changed today (PAY-1 B8). Before Stage C the owner checks Razorpay LIVE →
  Payments for the last 7 days; any captured / authorised payment not settled in the legacy system = STOP. Record the
  exact legacy webhook path; after the cutover the new app must not answer 500 on it (404 / ignored is acceptable
  while LIVE checkout is closed).
- **Q2:** build the redirect map now.
- **Q3:** `AGE_GATE_ENABLED=true` before the cutover (matches the live 18+ legal text until AGE-CONSENT-1); sign-up
  stays open; verified on the vercel.app host first.
- **Q4:** SMTP + templates, Turnstile, Google origin / consent and admin MFA are believed done; verify them in Stage B.
- **Q5:** fix SPF (`+all` → `~all`) and delete `MX 0 mx.couragelibrary.in` in Stage B.
- **Q6:** at DOMAIN-CUTOVER-2 (not today).
- **Q7:** today; the owner holds every dashboard.
- **Q8:** apex and www stay DNS-only; confirm in Stage B.
- **Q9:** the AUTH-READINESS-1 report and this runbook ship in Stage A.

## 12. Stage A record (code, 2026-11-22)

- **Legacy redirect map:**
  - `lib/seo/legacy-redirects.ts`, spread into `next.config.ts` `redirects()` as permanent 308s;
  - 33 rules: 17 exact pages, 15 section prefixes and one ".html" fallback to `/exams`;
  - Next.js matches them case-insensitively, and `%20` paths match the section wildcards.
- **The URL list** was re-read from the 9 legacy sitemaps: the same 596 URLs as 2026-10-28
  (`DOMAIN_CUTOVER_1_LEGACY_URLS.txt`, unchanged).
- **Gate LEGACY-REDIRECTS** (`scripts/test_legacy_redirects.cjs`, CI offline) checks with Next's own matcher that
  every URL gets one hop to an existing route, with no chain, no loop and no shadowed new route. 11 negative controls.
- **Local production build check:** all 596 URLs give one 308 hop (the legacy `/` is served directly), and the
  targets return 200.
  - The targets: `/exams/ssc-cgl` 231, `/exams/police` 232, `/exams/ssc` 114, `/exams` 11, `/pricing` 2, `/about`,
    `/contact`, and `/exams/{banking,railway,defence}`.
  - A category page can answer 500 locally when its database read times out over the hotspot (`CATEGORY_READ_FAILED`,
    by design: never a cached 404); production answers 200.
- **Smoke base URL is a parameter:**
  - prod-smoke reads the repository variable `PROD_SMOKE_URL` (default: the vercel.app alias) — set it to
    `https://couragelibrary.in` at cutover step 6, with no code change;
  - the anonymous smoke now checks X-Robots-Tag per host (noindex off-canonical, none on the canonical host) and a
    5-URL legacy redirect sample;
  - `scripts/live/test_pay1_b7.cjs` reads `B7_PROD_URL`, and the SEO seed script reads `PROD_BASE_URL`.

## 13. Correction (owner, 2026-11-22) and Stage B record

**Q1 corrected:** the Razorpay LIVE webhook is **`https://cnts.couragelibrary.in/api/payments/webhook`** (Enabled, 3
events, last updated 2026-10-20). It is on the **CNTS** project, NOT on the apex / www.
- The apex / www cutover does not touch it; `cnts.couragelibrary.in` stays untouched.
- No legacy webhook path exists on the apex / www, so no new-app path check is needed. Inventory row 19 and §4 P1 are
  superseded by this.
- **How legacy `/enroll.html` payments worked** (read from its public page, masked): it creates orders through an
  Edge Function `create-razorpay-order` on the **legacy** Supabase project, opens Razorpay Checkout (LIVE key), and
  calls `send-enrollment-email` there. Payments are recorded by the legacy / CNTS side, never by the apex.
- After the cutover `/enroll.html` → 308 `/pricing` (closed checkout), so **the legacy enrol page stops taking
  payments** (owner Q1). The legacy Edge Functions and the CNTS webhook are left as they are; the legacy project is
  never connected to.
- Razorpay LIVE, last 7 days: **0 payments** (none captured, authorised, failed or refunded); nothing pending.

| Check | Result |
|---|---|
| P1 Razorpay (no pending payment; webhook host) | **PASS** — 0 payments in 7 days; webhook on cnts (untouched) |
| P2 legacy 301 map + gate | **PASS** — Stage A (`3612e5a`), 596 URLs, live on the alias |
| P3 smoke switch prepared | **PASS** — `PROD_SMOKE_URL` variable (set at step 6) |
| P4 age gate | **PASS** — `AGE_GATE_ENABLED=true` (owner); `/auth/signup` on the alias shows the required 18+ checkbox (`ageConfirmed`), Turnstile renders |
| P5 auth mail (SMTP, templates, confirm, rate limit) | **PASS** — owner: custom SMTP ZeptoMail, 5 templates on `{{ .SiteURL }}/auth/confirm?token_hash=…`, confirm email on, 100/h |
| P5 SPF / MX (Q5) | **PASS** — 1.1.1.1 + 8.8.8.8: `v=spf1 include:zoho.in ~all`; MX = Zoho 10 / 20 / 50 only; DMARC, `bounce-zem`, `cnts` unchanged |
| P5 ZeptoMail | **PASS** — owner: DKIM + bounce verified |
| P6 Turnstile + Google | **PASS** (owner; re-checked on the domain after the cutover) |
| P7 admin MFA | **PASS** — owner: authenticator + backup enrolled, `ADMIN_MFA_REQUIRED=true` |
| P8 grey cloud | **PASS** — apex / www answer `server: Vercel`, no `cf-ray` |
| P9 "before" snapshot | **PASS** — saved outside the repo |
| P10 CI green, health = HEAD | **PASS** — push run 44949725266 green; `/api/health` 3612e5a |
| P11 window + access | **PASS** — now; the owner holds every dashboard |

## 14. Stage C record — DOMAIN-CUTOVER-1 executed (2026-11-22, owner at the dashboards)

| Step | Owner action | Verified (anonymous) |
|---|---|---|
| 1 | legacy project: apex + www removed (`cnts` untouched) | apex / www → 404 `DEPLOYMENT_NOT_FOUND`; `cnts` 200 (CNTS site) |
| 2 | couragelibrary-next: apex added (primary), `www` → 308 to apex | `http` → 308 https; apex 200, TLS valid, new H1, canonical apex, no noindex; `www` → 308 apex (path kept); `/hi`, `/exams` 200; `cnts` 200 |
| 3 | Supabase Site URL → apex; redirect URLs + apex / www (vercel.app, localhost kept) | `/auth/login` (Turnstile + Google script), `/auth/signup` (18+ checkbox + Turnstile), `/auth/forgot-password` 200; `/auth/confirm` without a token → `/auth/login?m=link-expired` |
| 4 | `NEXT_PUBLIC_SITE_URL=https://couragelibrary.in` (Production) + Redeploy | health 3612e5a after the rebuild |
| 5 | — | §6 checks: pages 200; robots canonical (allow `/`, sitemap line); canonical + hreflang on `/` and `/hi`; sitemap 74 URLs all on the apex incl. `/hi`; 20 random legacy URLs → one 308, targets 200; `/email/{banner,strip-main,strip-cnts}.png` 200 `image/png`, sha256 = repo; webhook route `GET` 405; anonymous smoke on the apex all passed; CLS `/` 0.0000 / 0.0004, `/hi` 0.0821 / 0.0650 (phone / desktop), unchanged |
| 6 | repository variable `PROD_SMOKE_URL=https://couragelibrary.in` | the next push run's prod-smoke targets the apex |

**Deviation (accepted, better):** once the apex became the project's primary production domain, Vercel serves the
`couragelibrary-next.vercel.app` alias as a **308 to `https://couragelibrary.in`** (every path) instead of a noindex
copy. So the alias can never be indexed. Post-cutover check "alias stays noindex" becomes "alias → 308 apex". The
Supabase redirect list keeps the vercel.app origin for 30 days anyway (old e-mail links).

**Rollback:** not used. Ready until the legacy project is removed: §5 (< 5 min, no DNS change).

**Still to do (owner unless noted):**
- **T+1 d:** pause (not delete) the legacy Vercel project; delete after 1–2 months (Q3).
- **T+7 d:** Search Console — submit `https://couragelibrary.in/sitemap.xml`, watch Coverage daily.
- **T+30 d:** remove `https://couragelibrary-next.vercel.app/**` from the Supabase redirect list.
- **Optional now:** a password reset to the owner's own account opens `https://couragelibrary.in/auth/confirm?...`.
- **Next phases:** DOMAIN-CUTOVER-2 (cron variables / URLs, Q6), PAY-1 B7 (B7 production check: `B7_PROD_URL=https://couragelibrary.in`), PAY-1 B8 (LIVE payments; the LIVE webhook is on cnts), EMAIL-KYC-1, AGE-CONSENT-1, DMARC tightening after ~2 weeks of clean reports.

## 15. DOMAIN-CUTOVER-2 record — scheduled jobs on the apex (2026-11-22, owner at GitHub)

**Settings (GitHub → Actions; names, public values only):**

| Name | Store | Value |
|---|---|---|
| `PAYMENTS_RECONCILE_ENABLED` | variable | `false` (secret of the same name deleted, F1); `true` only at PAY-1 B8 |
| `RECONCILE_URL` | variable | `https://couragelibrary.in/api/cron/reconcile` |
| `EMAILS_URL` | variable | `https://couragelibrary.in/api/cron/emails` |
| `PAYMENTS_EMAILS_ENABLED` | — | not set (EMAIL-KYC-1) |
| `CRON_SECRET` | secret | masked, unchanged (the only secret either workflow reads) |
| `PROD_SMOKE_URL` | variable | `https://couragelibrary.in` (DC-1 step 6) |

Vercel Production (owner, names only): `EMAIL_APP_ENABLED` not set, `ZEPTOMAIL_TOKEN` not set. Checkout closed (anonymous
`/pricing`: "Pro is not open yet … nothing to pay today").

**Workflow fix (c5c26a7):** both workflows read the URL from secrets; now from `vars`, pinned to the apex before the
bearer is sent; `CRON_SECRET` is the only secret. New manual **probe** (dispatch only, switch off only): must answer
`skipped`, else the run fails. Gated in PAY-1 B4 / B5 (+ 6 negative controls each). Offline 116/116; push run
44967066339 green (prod-smoke on the apex).

**Verification:**
- `payments-reconcile` probe, run 44968033491: HTTP 200 `{"ok":true,"skipped":"CHECKOUT_CLOSED"}` — no read, no write.
- `payments-emails` probe, run 44968103927: HTTP 200 `{"ok":true,"skipped":"EMAIL_OFF"}` — no read, no e-mail.
- Anonymous on the apex: `POST` with no / a wrong bearer → **401** on both routes; `GET` → 405.

**Prod-smoke warnings (3, all pre-existing before the cutover):** the mock-link warning is a smoke matcher gap
(backlog SMOKE-MOCK-LINK-1); the two current-affairs warnings are a sitemap gap (backlog SITEMAP-CA-1). No release blocker.

**Status:** DOMAIN-CUTOVER-2 CLOSED.
