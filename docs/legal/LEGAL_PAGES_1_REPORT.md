# LEGAL-PAGES-1: public legal pages, links and consent lines

**Date:** 2026-11-12.
**Branch:** `feat/legal-pages-1`, local only. Nothing was pushed, no PR was opened, no CI was triggered and nothing was deployed.
**Final status:** **CLOSED** for the build scope. The open items listed below are owner and release decisions, not blockers for the code.

## Source of truth

- The approved text was not at `docs/legal/LEGAL_PAGES_v1.md`. It was at `Claude outputs/LEGAL_PAGES_v1.md` (gitignored, saved 2026-11-12).
- It was copied **byte for byte** to `docs/legal/LEGAL_PAGES_v1.md` (`cmp` identical, sha256 `95ea2e7cf0a42112…`). That tracked file is now the source.
- No sentence was reworded, shortened, added or reordered.
- **Presentation choices (not text changes):**
  - The page h1 omits the document's page number: "Terms of Service", not "1. Terms of Service".
  - Section numbers ("1.1 …") are kept.
  - "{{LAST_UPDATED}}" is rendered from `LEGAL_LAST_UPDATED`.

## Inspection findings

1. **Existing legal routes.** `/terms`, `/privacy` and `/contact` existed as early drafts (`content/public-pages.ts`, with a "Draft — under legal review" notice), and `/grievance` existed separately (`content/support.ts`). All belong to this app. They were **replaced**, not duplicated: one set of legal pages now exists. `/refund-policy` was already linked from pricing (`REFUND_POLICY_PATH`) but had no page.
2. **Markdown renderer.** None is installed, and no package was added. The text is stored as **typed content objects** generated mechanically from the `.md`:
   - The generator is `scripts/content/legal-pages-1-gen.cjs`, built on a small subset parser, `scripts/lib/legal-md.cjs`, which throws on anything it does not know.
   - The output is `content/legal/legal-pages.ts`, marked "DO NOT EDIT". The gate fails if it drifts from the `.md`.
   - A small pure formatter, `lib/legal/inline.ts`, turns `**bold**`, `[text](url)`, the support email, the phone number and policy names into links without changing a character.
3. **Coins flag.** `isLessonCoinsEarnEnabled()` in `lib/coins/flag.ts` reads the env `COINS_LESSON_EARN` server-side, with no DB read and default OFF. Its own comment says it stays off "until the owner approves the coins legal text". Terms 1.5 follows it.
4. **Analytics and tracking.** **None found.** There is no Vercel Analytics or Speed Insights, GA/gtag, PostHog, Mixpanel or similar in `package.json` or the code; the grep hits were the English word "plausible". The only third-party scripts are Google Identity Services (sign-in) and Cloudflare Turnstile, both named in Privacy 2.2. So the Cookies section was built; it was not a stop.
5. **Account deletion.** **Does not exist**: no UI, no RPC, no `auth.admin.deleteUser`. The design is in `docs/legal/ACCOUNT_DELETION_DESIGN_1.md`. The interim "Delete account" mailto entry was added in Account settings.

## Files

| File | Change |
|---|---|
| `docs/legal/LEGAL_PAGES_v1.md` | The approved text, a verbatim copy (new) |
| `scripts/lib/legal-md.cjs` | Parser for that file's markdown subset; shared by the generator and the gate |
| `scripts/content/legal-pages-1-gen.cjs` | Writes `content/legal/legal-pages.ts`; `--check` reports drift |
| `content/legal/legal-pages.ts` | GENERATED text pages (do not edit) |
| `content/legal/types.ts` | Types of the generated text |
| `content/legal/index.ts` | Routes, page meta, `LEGAL_LAST_UPDATED` ("2026-XX-XX"), the Coins section filter, the grievance anchor |
| `lib/legal/inline.ts` | Inline formatting and links. The email and phone come from `content/support.ts`, so they are never retyped |
| `components/legal/legal-document.tsx` | Page renderer: one h1, "Last updated", h2 anchors, a table of contents on Terms and Privacy, tables that scroll inside themselves |
| `components/legal/consent-lines.tsx` | `AuthConsentLine` and `PaymentConsentLine`, with the exact wording and links |
| `app/(site)/terms\|privacy\|refund-policy\|shipping-policy\|contact/page.tsx` | The five routes; metadata with an apex canonical |
| `app/(site)/grievance/page.tsx` | Removed; replaced by a 308 redirect |
| `next.config.ts` | `/grievance` → `/contact#grievance-officer` (permanent, 308) |
| `components/shell` (via `content/public-pages.ts` `FOOTER_ABOUT`) | Footer legal row: Terms, Privacy, Refund Policy, Shipping Policy, Contact & Grievance |
| `content/public-pages.ts`, `content/support.ts`, `components/public/public-page.tsx` | Old draft legal content, the draft notice, `LegalPage` and the grievance page copy removed |
| `app/(site)/auth/login/login-form.tsx`, `app/(site)/auth/signup/signup-form.tsx` | Sign-in and sign-up consent line, before the Google button and before submit |
| `app/(site)/pricing/pricing-client.tsx` | Payment consent line moved **before** the Pay action, with the new wording |
| `app/(site)/checkout/[orderId]/checkout-client.tsx` | Payment consent line before the pay button |
| `app/(site)/help/page.tsx` | The grievance link points to `/contact#grievance-officer` |
| `app/(site)/settings/profile/page.tsx` | Interim "Delete account" mailto entry (no DB) |
| `app/sitemap.ts` | Lists `/terms`, `/privacy`, `/refund-policy`, `/shipping-policy` and `/contact`; `/grievance` removed |
| `lib/auth/age-gate.ts` | `/refund-policy` and `/shipping-policy` exempt from the 18+ gate (public pages) |
| `docs/legal/ACCOUNT_DELETION_DESIGN_1.md` | Deletion design (read-only phase) |
| `scripts/test_legal_pages1.cjs` | New gate LEGAL-PAGES-1, added to the CI offline list |
| `scripts/test_brand2.cjs`, `test_home1.cjs`, `test_ux2b_public.cjs`, `test_f11_support.cjs`, `test_f9b_payments.cjs` | Pins moved from the draft pages to the approved pages (details below) |

## Tests

**New gate LEGAL-PAGES-1: 10/10 PASS.** Every page is rendered to HTML in Node, offline.

| Test | What it proves |
|---|---|
| LP-01 | The generated content equals the generator output for the current `.md` |
| LP-02 | All 5 routes: one h1 equal to the page title; "Last updated"; metadata title and description; canonical `https://couragelibrary.in/<route>` |
| LP-03 | **Verbatim:** 332 text units (paragraphs, list items, table cells; Coins on and off) all appear in the rendered text, with whitespace normalised only. Negative control: changing one word ("5–7" → "5–10") is caught |
| LP-04 | Coins OFF: no "1.5 Coins", no "Coins are loyalty points", no table-of-contents entry. Coins ON: present. 1.6–1.12 keep their numbers |
| LP-05 | `/grievance` permanent redirect; the old page is gone; `id="grievance-officer"` on 5.1; Help links to the anchor |
| LP-06 | Footer: the 5 links on every page (home included). Exact consent words and links, and each line comes before its button (sign-in incl. Google, sign-up, pricing, checkout) |
| LP-07 | Sitemap has the 5 routes and not `/grievance`; robots does not block them; apex canonical; age-gate exemptions |
| LP-08 | No `[`, `]`, `{{` or `}}` in any rendered page (with Coins on and off). **RELEASE REMINDER** printed: `LEGAL_LAST_UPDATED` is still "2026-XX-XX" |
| LP-09 | Google policy link has `target="_blank" rel="noopener noreferrer"`; mailto, including the subjects the text names ("Grievance", "Privacy request"); tel; cross-links; no page links to itself; the job title is not a link |
| LP-10 | The Delete account mailto entry exists; no dependency added; no analytics package; the design doc exists |

**Existing gates updated (they pinned the drafts):**
- **BRAND2 C-10:** the generated legal text is excluded from the ad-claims scan, because its "no guarantee" lines are disclaimers; LEGAL-PAGES-1 holds that text verbatim.
- **HOME-1 H-9:** no draft titles remain; the approved titles are present.
- **UX2B P-3, P-7, P-9d and live W-5:** check `LegalDocument`, the contact mailto and "Last updated" instead of the draft notice.
- **F11 SP-01–03:** the grievance details render on `/contact` with mailto (subject Grievance) and tel; the 308 redirect; the footer and sitemap use `/contact`. The single-source check excludes only the generated legal text.
- **F9B PB-09:** `<PaymentConsentLine hrefs={legal}>` comes before `{action}`.

**Runs:**
- `node scripts/ci/run-offline-local.cjs`: **OFFLINE-LOCAL: 99/99 passed**, including TSC and LINT. One earlier run failed 2 gates (UX2B, F11) after a late formatter edit; both pins were fixed and the full list was re-run.
- `npx next build`: **OK**. The five routes are 872 B / 107 kB First Load each. They show as dynamic (ƒ) like the other pages under the shared `(site)` layout; the pages themselves read nothing except the Coins env flag.
- Playwright on the local production build (Chrome, 1280 and 360 px):
  - All 5 routes return 200 with one h1, "Last updated", the apex canonical and `index, follow`.
  - **Page horizontal overflow is 0 px at 360 px on every page.** Tables scroll inside their own box: Privacy ×3, Refund ×1 and Contact ×1 scroll at 360 px.
  - The home footer's legal row has the 5 links.
  - The sign-in, sign-up and pricing consent lines show the exact text.
  - `/grievance` returns 308 with `Location: /contact#grievance-officer`.

## Screenshots

These are not committed, because the contact pages show the Grievance Officer's name and phone (repo rule). They are local only, under `C:\Users\hp\AppData\Local\Temp\claude\01a970e602e50401\be19e66a-8f05-43ef-801c-8575fb8ec99a\scratchpad\`:
- `legal-terms-desktop.png`, `legal-terms-m360.png`
- `legal-privacy-desktop.png`, `legal-privacy-m360.png`
- `legal-refund-policy-desktop.png`, `legal-refund-policy-m360.png`
- `legal-shipping-policy-desktop.png`, `legal-shipping-policy-m360.png`
- `legal-contact-desktop.png`, `legal-contact-m360.png`
- `legal-home-footer.png`
- `legal-signin-desktop.png`, `legal-signin-m360.png`
- `legal-signup-desktop.png`, `legal-signup-m360.png`
- `legal-pricing-desktop.png`, `legal-pricing-m360.png`

**Not screenshotted:**
- **Pricing:** shown with the local server only (`PAYMENTS_ENABLED=true PRO_ENABLED=true` for that process); checkout stayed closed.
- **`/checkout/[orderId]`:** needs a signed-in order. Its consent line is covered by LP-06 only.
- **Google sign-in button:** Google sign-in is off locally, so the button did not render. LP-06 checks that the line comes before it in the code.

## Confirmations

- No DB writes and no migrations. Nothing connected to any database in this phase.
- No dependencies added (LP-10 checks `package.json`).
- No changes to payments, Razorpay, auth config, Supabase or Google Cloud settings.
  - `REFUND_POLICY_PUBLISHED` was **not** changed; see the checklist.
  - The pricing and checkout edits only move and reword the consent line.
- No analytics or tracking added, and no cookie banner.
- CNTS is untouched. No push, no PR, no CI run.

## Owner release checklist

1. **Set `LEGAL_LAST_UPDATED`** in `content/legal/index.ts` to the release date. The gate prints a reminder until then.
2. **Google OAuth consent screen:**
   - Privacy policy: `https://couragelibrary.in/privacy`
   - Terms of service: `https://couragelibrary.in/terms`
   - Home page: `https://couragelibrary.in/`; its footer links both.
   - **Caveat:** `couragelibrary.in` still serves the legacy site (backlog DOMAIN-CUTOVER-1). These URLs only show the new pages after the cutover. Until then they live at `couragelibrary-next.vercel.app/...`, which is noindex by design. Use the apex URLs only after the cutover.
3. **Razorpay website policies** (same domain caveat):
   - Terms: `/terms`
   - Privacy: `/privacy`
   - Refund & Cancellation: `/refund-policy`
   - Shipping & Delivery: `/shipping-policy`
   - Contact Us: `/contact`
4. **Checkout stays closed** while `config/payments.ts` has `REFUND_POLICY_PUBLISHED = false`. Flipping it is payment logic and was out of scope here; do it in its own change. Note: the F9-B gate's existence check for that flag looks for `app/refund-policy/page.tsx`, but the page is `app/(site)/refund-policy/page.tsx`, so update that path in the same change.
5. **Promises in the text to verify against the production flags:**
   - "a ticket from Help" (Contact, Refund 3.4, 5.2) needs `SUPPORT_TICKETS_ENABLED` on.
   - "Account settings → Delete account" needs the profiles flag on, because `/settings/profile` is a 404 otherwise.
   - "Report a problem" on questions (Terms 1.3).
   - The Coins page (1.5, only when the Coins flag is on).
6. **Name mismatch:** `content/support.ts` has `GRIEVANCE_OFFICER.name = "Jan"`, which the Help page shows, while the approved text says "Jan Mohammad". The owner should decide whether to align it; it was left as is because it is outside this phase's text.
7. **Account deletion:** the interim path is mailto plus manual handling within 30 days. Schedule the build phase from `ACCOUNT_DELETION_DESIGN_1.md`; owner decisions are needed on ticket retention, community posts and backup retention.
