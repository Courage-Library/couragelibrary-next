# DOMAIN-CUTOVER-1: move couragelibrary.in to the new app (PLAN ONLY)

Status: **PLAN**, read-only research done 2026-10-28. Nothing in DNS, Vercel, Supabase, Google, Turnstile or Razorpay has been changed.
Markers: **[OWNER]** = only the owner can do it (dashboard / account access) · **[ENG]** = a repo change, done on a GO · **[BOTH]** = owner acts, engineer verifies.
No secrets, keys or IP addresses are written in this document.

---

## 1. Current state (observed 2026-10-28)

| Host | DNS (Cloudflare, `*.ns.cloudflare.com`) | Serves | Behaviour |
|---|---|---|---|
| `couragelibrary.in` (apex) | A record → a Vercel edge IP, TTL 600 | the **legacy** Vercel project | `http` 308 → `https`; `https` **307 → `https://www.couragelibrary.in/`** |
| `www.couragelibrary.in` | CNAME → `*.vercel-dns-017.com`, TTL 600 | the **legacy** Vercel project | 200, static HTML site (`*.html`) |
| `cnts.couragelibrary.in` | CNAME → `*.vercel-dns-017.com`, TTL 299 | a **separate** Vercel project | 200. **Must keep working, untouched.** |
| `couragelibrary-next.vercel.app` | Vercel | the **new app** | `X-Robots-Tag: noindex, nofollow`; robots `Disallow: /` |

Key finding: **both sites are already on Vercel.** The cutover is mainly a *domain move between two Vercel projects*. **No DNS record has to change** if the apex A / www CNAME keep pointing at Vercel. That makes cutover and rollback fast (minutes), and TTLs matter only as a fallback.

The new app already treats `couragelibrary.in` + `www` as canonical:
- `config/site.ts:44-54`: `CANONICAL_SITE_URL = https://couragelibrary.in`, `CANONICAL_HOSTS` = apex + www.
- `next.config.ts:24-29`: noindex header on every non-canonical host.
- `app/robots.ts`: `Disallow: /` off-canonical; allow + sitemap on canonical.
- `app/sitemap.ts`, `lib/seo/metadata.ts` (`metadataBase`, `alternates.canonical`), JSON-LD: always built on `siteConfig.url`.

So **canonical / noindex / sitemap flip automatically** the moment the request host is `couragelibrary.in`. No code change is needed for that (gate CA7 covers the host matcher, `scripts/test_ca7.cjs:57-60`).

---

## 2. DNS

| Record | Action |
|---|---|
| apex `A` | **Keep** (already Vercel). If Vercel asks for its recommended record when the domain is added to the new project, use exactly what Vercel shows. **[OWNER]** |
| `www` `CNAME` | **Keep** (already Vercel), same rule. **[OWNER]** |
| `cnts` `CNAME` | **Do not touch.** It belongs to another Vercel project. |
| `MX`, `TXT` (SPF, google-site-verification, brevo-code), `_dmarc`, `*._domainkey` | **Do not touch** (section 6). |
| Cloudflare proxy | Keep the apex / www records **DNS-only (grey cloud)**, as today; an orange-cloud proxy in front of Vercel breaks certificate issuance and doubles caching. **[OWNER]** to confirm. |

TTL plan (fallback only, in case Vercel asks for a different record):
- **T-48 h [OWNER]:** lower apex `A` and `www` `CNAME` TTL to **60 s** (Cloudflare "1 min"). Leave `cnts`, MX and TXT alone.
- **T+7 d [OWNER]:** after a clean week, raise them back to Auto / 3600.

---

## 3. Vercel domain steps [OWNER]

Vercel allows a domain on **one project at a time**.
1. **Decide the primary host** (open question Q1). Recommendation: **apex `couragelibrary.in` primary, `www` → 308 to apex.** This matches `CANONICAL_SITE_URL`, which is the apex. Today the legacy site does the reverse (apex 307 → www); keeping www primary would need `CANONICAL_SITE_URL` changed in code.
2. Legacy project → Settings → Domains: **remove** `couragelibrary.in` and `www.couragelibrary.in`. **Do not** remove `cnts`; it is on its own project.
3. New project → Settings → Domains: **add** both. Set `www` to "Redirect to couragelibrary.in (308)".
4. Wait for "Valid configuration" and certificates (usually < 1 min, because DNS already points at Vercel).
5. New project → Environment Variables (Production): set **`NEXT_PUBLIC_SITE_URL=https://couragelibrary.in`**, then **Redeploy** production. Auth e-mail redirects are built from it (`app/auth/actions.ts:47-52, 119, 158`). It must be the real origin, or confirmation links point at the old host.
6. Keep `couragelibrary-next.vercel.app` as a working alias. It stays noindex, and CI uses it until step 9.10.

---

## 4. Supabase Auth (project couragelibrary-next) [OWNER]

| Setting | Now (expected) | After cutover |
|---|---|---|
| Site URL | `https://couragelibrary-next.vercel.app` | `https://couragelibrary.in` |
| Redirect URLs allow-list | the vercel.app origin | **add** `https://couragelibrary.in/**` and `https://www.couragelibrary.in/**`; **keep** `https://couragelibrary-next.vercel.app/**` for 30 days (rollback + old links); keep `http://localhost:3000/**` |
| E-mail templates | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…` (`docs/auth/email-templates/*.html`) | **No edit needed.** They follow the Site URL. Their hard-coded links (banner `https://couragelibrary.in/email/banner.png`, home, `cnts`) start working once the domain serves the new app. |
| SMTP sender | ZeptoMail `no-reply@couragelibrary.in` (`docs/auth/EMAIL_TEMPLATES.md:5`) | unchanged |

Known issue that fixes itself: `https://couragelibrary.in/email/banner.png` today goes 307 → www → **404** (BACKLOG DOMAIN-CUTOVER-1). After the cutover it must return **200 `image/png`** with the same sha256 as `public/email/banner.png`. This is a post-cutover check (section 9).

Other auth origins **[OWNER]**:
- **Google Identity Services** client: add `https://couragelibrary.in` (+ `https://www.couragelibrary.in` only if www is primary) to **Authorised JavaScript origins**. No redirect URI is used (`docs/auth/GOOGLE_SIGNIN.md:66-67`). Keep the vercel.app origin.
- **Cloudflare Turnstile** widget: add hostname `couragelibrary.in` (and `www`). Keep the vercel.app hostname (`docs/auth/TURNSTILE.md:56`).

---

## 5. SEO: canonical, robots, sitemap, legacy 301 map

Automatic on the canonical host: canonical tags, `metadataBase`, OG URLs, JSON-LD, hreflang, `robots.txt` (allow `/`, disallow `/api/ /admin/ /dashboard/`, sitemap line) and `sitemap.xml` (`app/sitemap.ts`). No code change.

**[OWNER] Google Search Console:** the domain property is already verified (a `google-site-verification` TXT exists). After cutover, submit `https://couragelibrary.in/sitemap.xml` and watch Coverage for 404 spikes.

### Legacy URL inventory
Read from the live legacy sitemaps (`/sitemap.xml` → 10 child sitemaps), 596 page URLs. The full list is in [`DOMAIN_CUTOVER_1_LEGACY_URLS.txt`](DOMAIN_CUTOVER_1_LEGACY_URLS.txt).

| Legacy section | URLs | Shape | New-app equivalent today |
|---|---:|---|---|
| `/delhi-police/**` | 231 | `/delhi-police/<Subject>/<Topic>/<page>.html` | **none.** There is no Delhi Police exam in the new app. |
| `/ssc-cgl/**` | 230 | `/ssc-cgl/<subject>/<Topic>/<page>.html` | **partial.** `ssc-cgl` is the one active exam; the master tree has 4 subjects / 32 topics. Topic-level matches go to `/learn/…`; the rest go to `/exams/ssc-cgl`. |
| `/ssc-gd/**` | 112 | `/ssc-gd/<subject>/<topic>/<page>.html` | **none live.** The `ssc-gd` exam exists but is inactive. |
| `/Blog/*.html` | 11 | blog articles | **none.** There is no blog; `/articles` is noindex. |
| top-level pages | 12 | `/`, `/about.html`, `/contact.html`, `/SSC-CGL.html`, `/SSC-Main.html`, `/SSC-GD-Syllabus.html`, `/Delhi-Police.html`, `/Railway-Main.html`, `/Banking-Main.html`, `/Defence-Main.html`, `/enroll.html`, `/free-trial.html` | `/`, `/about`, `/contact`, `/exams/ssc-cgl`, `/exams` match. Railway / Banking / Defence / Delhi Police / GD have **none**. `/enroll.html` and `/free-trial.html` → `/pricing`, which is honest while payments are off. |
| not in sitemap but live | — | `/mock/*.html`, `/dashboard.html`, `/settings.html`, `/payment-history.html`, `/notifications.html`, `/chatbot.html` | `/mock/*` → `/mock-tests`; account pages → `/dashboard` (sign-in gate). `/chatbot.html` has **none** (→ `/`). |

**Flagged, no equivalent:** about **354 URLs** (Delhi Police 231 + SSC GD 112 + Blog 11), plus the Railway / Banking / Defence / Delhi Police / GD hub pages and `/chatbot.html`. They carry the legacy site's search traffic. Redirecting them all to `/` would be treated by Google as soft-404s, and the ranking is lost.

### 301 map: proposal **[ENG on GO]**
- Implement as `redirects()` in `next.config.ts`, generated from a checked-in map file (`docs/ops/legacy-redirects.json` → build step). Every source path is matched **case-insensitively** with `%20` handled, because the legacy paths mix case and spaces.
- **Exact matches** (top-level pages, the CGL topics that exist in the master tree) → `permanent: true` (308; Google treats it as 301) to the new route.
- **No-equivalent** sections: this depends on the legacy-site decision (section 7):
  - Option A: 308 to the **same path on an archive host**. Recommended, because no content is lost.
  - Option B: 308 to the nearest hub (`/exams`, `/exams/ssc-cgl`).
  - Option C: let them 404 / 410.
- **Gate [ENG]:** a new offline test asserts every URL in `DOMAIN_CUTOVER_1_LEGACY_URLS.txt` resolves through the map to a route that exists (or to the archive host), with no redirect chains and no loops. A post-cutover smoke HEAD-checks a 40-URL sample.

---

## 6. Razorpay (NO key changes, NO live payment)

- The new app's webhook route is **`POST /api/webhooks/razorpay`** (`app/api/webhooks/razorpay/route.ts`):
  - HMAC-SHA256 of the raw body with `RAZORPAY_WEBHOOK_SECRET`, compared in constant time against `x-razorpay-signature`;
  - idempotent on `x-razorpay-event-id`;
  - events `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`.
  - Checked live: a GET on the new app returns **405** (route exists, POST only).
- **The legacy site's webhook path is unknown.** It is not in this repo. A GET on nine common paths on www (`/api/webhooks/razorpay`, `/api/razorpay-webhook`, `/api/razorpay/webhook`, `/api/webhook/razorpay`, `/api/payment-webhook`, `/api/webhook`, `/api/payments/webhook`, `/api/verify-payment`, `/api/create-order`) returned **404 for all**. The live webhook may call another host (e.g. a Supabase Edge Function) rather than couragelibrary.in.
- New app payment state: **TEST mode, flags OFF, checkout closed** (F9-B). It must not receive LIVE-mode events signed with a secret it does not have.

**[OWNER] must verify in the Razorpay dashboard (read only, change nothing):**
1. LIVE mode → Webhooks: the exact URL(s), the subscribed events, and whether the URL host is `couragelibrary.in` / `www`, or another host.
2. TEST mode → Webhooks: whether a URL for the new app exists. F9_DESIGN.md:276 says it was still to be added.
3. Whether the legacy site still takes **live payments**, and whether any payment / refund could still be in flight at cutover time.

Consequences by answer:
- **Live webhook host is not couragelibrary.in** (Edge Function, etc.): the cutover does not affect it. Nothing to do.
- **Live webhook is on couragelibrary.in at a legacy path**: after cutover that path returns **404 from the new app**. Razorpay retries, then disables the webhook. Mitigations, owner decides:
  - (a) freeze legacy checkout **24 h before** cutover so nothing is in flight;
  - (b) or keep the legacy project reachable on the archive host and the owner re-points the LIVE webhook to it (an owner dashboard change, not a key change).
  - **Do not** rewrite the legacy path into `/api/webhooks/razorpay`: the secret differs, so the signature check would reject every event. Weakening that check is not an option.
- **The path matches `/api/webhooks/razorpay`**: same secret problem. The new app would reject live events (correct, fail-closed), so the same (a)/(b) applies.

---

## 7. E-mail: untouched check

Observed records (do not change any of them):
- `MX`: `mx.zoho.in` (10), `mx2.zoho.in` (20), `mx3.zoho.in` (50), plus an extra `mx.couragelibrary.in` at **priority 0**.
- SPF: `v=spf1 include:zoho.in +all`.
- DMARC: `p=none`, aggregate reports to Brevo.
- DKIM selectors present: `zmail`, `brevo1`, `brevo2` (CNAME), `mail`, `google`.

The cutover changes **none** of these, because only Vercel project domains move.

**[OWNER] pre-existing findings, separate from the cutover, not to fix during it:**
- **SPF ends in `+all`.** That authorises *every* server on the internet to send as couragelibrary.in, which defeats SPF. It should be `~all` (then `-all`). It also does **not** include ZeptoMail (the auth-mail sender) or Brevo: check whether those pass DMARC via DKIM alignment only.
- `mx.couragelibrary.in` at priority **0** outranks Zoho. Check that it is intended. Apex and wildcard-style A/AAAA answers on `mail` / `google` / `zmail` hint at a wildcard record.
- DMARC `p=none` is monitoring only; plan the move to `quarantine` (AUTH1 Stage 1 report).

**Cutover check:** before and after, `dig MX/TXT couragelibrary.in` and `_dmarc` / `*._domainkey` give identical answers, and a test e-mail to `support@` arrives.

---

## 8. Legacy site: options (owner decides, Q3)

| Option | What | Pros | Cons |
|---|---|---|---|
| **A. Archive subdomain** (recommended) | Add `archive.couragelibrary.in` (new CNAME **[OWNER]**) to the **legacy** project. The legacy pages get a "noindex + canonical to the new hub" header or an archive banner. The new app 308s no-equivalent legacy paths to the same path there. | No content lost, rollback stays trivial, the Delhi Police / GD audiences keep their pages | Two sites to keep alive. Archive pages should eventually be retired as the new app covers those exams. |
| B. Read-only for N months, then delete | The same as A, but time-boxed (e.g. 6 months), then 410 | Clear end date | Traffic to Delhi Police / GD drops when it ends |
| C. Retire now | Remove the legacy domains; no-equivalent paths 308 to hubs or 404 | Simplest | Loses about 354 indexed pages' traffic; soft-404 risk |

The legacy site also has `/dashboard.html`, `/settings.html` and `/payment-history.html`. If legacy users still sign in there (a legacy auth project), option A must keep those working, or tell users where their account went (Q5).

---

## 9. Runbook

### Pre-cutover checklist (T-7 d … T-1 h)
1. **[OWNER]** Answer Q1–Q7 (section 11).
2. **[ENG]** On a GO: legacy redirect map + its gate (section 5); CI smoke target switch prepared on a branch (`ci-gates.yml:470,472`, `scripts/smoke/anonymous-smoke.cjs:36`; keep the vercel.app alias as a second target).
3. **[OWNER]** Razorpay checks (section 6). If needed, freeze legacy checkout 24 h before.
4. **[OWNER]** TTL 60 s on apex / www (T-48 h).
5. **[BOTH]** Snapshot "before":
   - `dig` of apex / www / cnts / MX / TXT / `_dmarc` / DKIM;
   - HEAD of `cnts`;
   - a list of the legacy project's domains (screenshot kept by the owner, **not** in the repo).
6. **[ENG]** main CI green; the latest production deploy is healthy (`/api/health` version = HEAD).
7. **[OWNER]** Pick a low-traffic window (IST late night). Announce a short maintenance note on the legacy site if wanted.

### Cutover minute (owner at the dashboards, engineer verifying)
| t | Who | Step |
|---|---|---|
| 0:00 | OWNER | Legacy project → remove `couragelibrary.in`, `www.couragelibrary.in` (**not** `cnts`) |
| 0:01 | OWNER | New project → add both; `www` → 308 to apex |
| 0:02 | OWNER | Supabase Auth: Site URL → `https://couragelibrary.in`; add the redirect URLs |
| 0:03 | OWNER | Vercel env `NEXT_PUBLIC_SITE_URL` → `https://couragelibrary.in`, then Redeploy (≈ 3–5 min build) |
| 0:03 | OWNER | Google JS origin + Turnstile hostname added (these can be done at T-1 d too; adding is harmless) |
| 0:04 | ENG | `curl -I https://couragelibrary.in/` → 200 from the new app, no `X-Robots-Tag: noindex`; `https://www.couragelibrary.in/` → 308 to apex |
| ~0:08 | ENG | After the redeploy: run the post-cutover smoke (below) |

### Rollback (< 5 min, no DNS change)
1. **[OWNER]** New project → remove apex + www (≈ 30 s).
2. **[OWNER]** Legacy project → re-add apex + www, apex → 307 to www as before (≈ 1 min; certificates are already valid).
3. **[OWNER]** Supabase Site URL → back to the vercel.app origin (the allow-list can stay).
4. Leave `NEXT_PUBLIC_SITE_URL` until the next redeploy, or revert it and redeploy. Sign-up is OFF, so the risk is small.
5. **[ENG]** Verify `curl -I` shows the legacy site; `cnts` still 200.

**Triggers:** apex not 200 from the new app after 10 min; auth confirm / reset links broken; cnts down; mail records changed; 5xx rate above 1 % on the new app.

### Post-cutover verification (smoke list)
1. Hosts:
   - `https://couragelibrary.in/` is 200 and served by the new app;
   - `www` is 308 → apex;
   - `http://` → `https`;
   - `cnts.couragelibrary.in` is 200 and unchanged.
2. SEO:
   - `robots.txt` on the apex is the canonical version (allow `/`, sitemap line);
   - `sitemap.xml` is 200 and every `<loc>` is on the apex;
   - the home page canonical is the apex;
   - no `X-Robots-Tag: noindex` on the apex;
   - the vercel.app alias **still** sends noindex.
3. E-mail assets: `https://couragelibrary.in/email/banner.png` is 200 `image/png` with the same sha256 as `public/email/banner.png` (and the other `public/email/*.png`).
4. Auth (QA account only, never the owner's):
   - the login page renders with Turnstile;
   - the Google button loads, with no origin error in the console;
   - a password-reset e-mail link opens `https://couragelibrary.in/auth/confirm?token_hash=…`;
   - no prod sign-in by the engineer; the owner does the real-account check.
5. Legacy redirects: a sample of 40 from `DOMAIN_CUTOVER_1_LEGACY_URLS.txt` → one hop to the intended target, no chains.
6. Payments: `GET /api/webhooks/razorpay` on the apex returns 405. The owner confirms in Razorpay that no live webhook deliveries are failing.
7. E-mail: MX / TXT / DMARC / DKIM answers are identical to the "before" snapshot; a test mail to `support@` arrives.
8. **[ENG]** Switch the CI prod-smoke target to the apex (one commit); the next push run is green.
9. **[OWNER]** Search Console: submit the sitemap; watch Coverage daily for 7 days.
10. T+7 d: raise TTLs; drop the vercel.app redirect URL from Supabase after 30 days.

---

## 10. Risks

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R1 | About 354 legacy pages have no new equivalent, so search traffic is lost | high / high | Archive subdomain (option A) + 308 map; Search Console watch |
| R2 | The live Razorpay webhook hits a path that 404s after cutover; in-flight legacy payments are not fulfilled | unknown / high | Owner verifies first (section 6); freeze checkout 24 h; never weaken the signature check |
| R3 | `NEXT_PUBLIC_SITE_URL` not updated, so confirm / reset e-mails point at vercel.app | medium / medium | It is in the cutover-minute table; smoke step 4 |
| R4 | `cnts` removed by mistake together with the apex / www | low / high | It is on a separate project; the step text says "not cnts"; smoke step 1 |
| R5 | Cloudflare orange-cloud enabled on apex / www, causing certificate errors | low / high | Keep DNS-only; owner confirms |
| R6 | Legacy users who sign in on `dashboard.html` lose access | unknown / medium | Q5; option A keeps it on the archive host |
| R7 | CI prod-smoke still targets vercel.app and stops covering the real domain | certain / low | Post-cutover step 8 |
| R8 | SPF `+all` (pre-existing) enables spoofing as couragelibrary.in | existing / medium | Separate owner fix (section 7), not during the cutover |

---

## 11. Open questions for the owner

- **Q1** Primary host: apex (recommended; matches the code) or www?
- **Q2** Razorpay LIVE webhook: the exact URL host + path, events, and whether the legacy site still takes live payments (section 6).
- **Q3** Legacy site fate: A archive subdomain (recommended) / B time-boxed / C retire now. If A: which subdomain name (`archive.`, `old.`)?
- **Q4** For the no-equivalent sections (Delhi Police, SSC GD, Blog, Railway / Banking / Defence hubs): archive-host 308, hub 308, or 404?
- **Q5** Do legacy users still sign in on the legacy site (its own auth / Supabase project)? If yes, what do we tell them?
- **Q6** The SPF `+all` and priority-0 `mx.couragelibrary.in`: are they intended? (A fix outside this cutover.)
- **Q7** Cutover window (date / time IST) and who holds the Vercel, Cloudflare, Supabase, Google, Turnstile and Razorpay access on the day.
