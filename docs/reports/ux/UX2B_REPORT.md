# UX-2b: public pages in the UX-2a look

**Phase brief:** architect, 2026-10-21 (CI-1 finalise + UX-2b).
**Rules:** #55 design system (components/ui, tokens, 1200 px, design ratchet zero), English only, honest claims (#46 / #51), mobile-first, a11y AA.
**Loop #65 (CI-first):** offline gates locally; CI runs the live gates on push; the phase closes only when the owner reports CI green.

## 1. Forensics (read-only, before building)

| Area | Found |
|---|---|
| Routes | `/exams`, `/exams/[slug]`, `/pricing`, `/premium` existed. `/about`, `/cnts`, `/contact`, `/privacy`, `/terms` did not. |
| `/exams` | legacy components (`max-w-7xl`, slate / blue palette); listed active exams only; BreadcrumbList JSON-LD hard-coded the **wrong domain** (`couragelibrary.com`, not `.in`) |
| `/exams/[slug]` | any non-active exam → 404 (no coming-soon hub). The same wrong-domain JSON-LD was on the hub, cycle and module pages. Its published syllabus section already reads the read model (`fn_exam_syllabus_read_model`). |
| `/pricing` | no metadata of its own (no canonical); payments-OFF view already honest (UX-2b.H) |
| `/premium` | signed-in "Premium Practice Hub" with an unbacked meta description ("AI-balanced dynamic generators, full-length simulations…") |
| Nav / footer | every link already worked. About, Contact, Privacy and Terms were deliberately omitted until UX-2b. |
| Sitemap | static `/`, `/exams`, `/current-affairs`, `/practice`, `/mock-tests`, `/flashcards` plus DB reads (active exams, published guides / articles / CA). `/pricing` and the new pages were missing. |
| Exams in the DB | `ssc-cgl` **active**. `ssc-chsl`, `ssc-mts`, `ssc-gd` inactive; `qa-syllabus-test` inactive (internal). Live counts come from the existing landing read (UX-2a L-10: 1 active exam, 8 published mocks, 24 published guides at the last local run). |
| Documented facts | "Learn Smarter. Prepare Independently." (`PRODUCT.md`); physical library in Kanpur (`FOUNDER_BRIEF.md`); **"since August 2024" appears in no project document**: it comes from the owner's brief (already flagged in the UX-2a report). CNTS: Classes 5–8 and Junior 5–6 / Senior 7–8 appear only in this brief; older docs describe CNTS differently (owner to confirm). Library facilities: only pitch-deck text marked unverified, so **none are listed**. |
| Copy issues | "thousands" only in a code comment (signup). Unbacked: "Fact-checked news intelligence" (CA month metadata), "guaranteed" (live-test rules), "No events recorded" plus internal "draft review" wording (CA date / month empty states), retry-screen duplicate heading (UX-2b.A11Y-1). |

## 2. What was built

| Item | Change |
|---|---|
| Copy | **All copy in one file:** `content/public-pages.ts` (reproduced in §4). Shared server components: `components/public/public-page.tsx` (`PublicPageHeader` with breadcrumb plus BreadcrumbList JSON-LD on the site URL, `PublicSection`, `LegalPage`) and `components/public/coming-soon-hub.tsx`. Design-system components and tokens only. |
| 1. `/exams` | rebuilt as a directory from the DB. Active exams are full cards with **live** counts through the existing bounded landing read; a failed read shows the no-number fallback. SSC CHSL / SSC MTS appear as honest "Coming soon" cards linking to their hubs, and only while inactive. |
| 2. `/exams/[slug]` | an inactive exam **listed** as coming soon (CHSL, MTS) gets an honest hub: badge, "nothing is published yet", what we plan to add, links back. Metadata is **noindex**. Unlisted inactive exams (SSC GD, the QA exam) still return 404. The SSC CGL hub is unchanged apart from the JSON-LD domain fix (also on the cycle and module pages). The published syllabus section keeps reading the read model. |
| 3. `/pricing` | own metadata plus canonical; headline "Free during early access. Pro coming soon." added under the h1 of the payments-off view. No prices; Free lists only the 3 live features; Pro "Opening soon / Pricing announced soon". The payments-ON markup (shown only if `PAYMENTS_ENABLED=true`) is unchanged and pinned by the UX-2b.H snapshot. |
| `/premium` | permanent redirect (308) to `/pricing` in `next.config.ts`; page and loading UI removed. |
| 4. `/about` | the library story, the mission, the learning loop, early-access status. No team names or photos. |
| 5. `/cnts` | what CNTS is (Classes 5–8; Junior 5–6, Senior 7–8); "Registrations open soon"; parent-led registration. No form, no prices, no dates. |
| 6. `/contact` | mailto `support@couragelibrary.in`; Kanpur, Uttar Pradesh. No form. |
| 7. `/privacy`, `/terms` | plain-English **drafts** of what the platform actually does (checked in code): sign-up data, activity data, sign-in cookies only (no analytics or advertising scripts exist), processors Supabase / Vercel / email provider, no data selling, student activity not sent to AI services (AI is used only by admin authoring tools), no payments today, deletion by email. Both show **"Draft — under legal review"**. |
| 8. Copy fixes | CA month metadata; CA date / month empty states now say "Nothing published for …" / "We have not published current affairs for this date / month." (literally true, #51); live-test rule "One registration per candidate."; signup comment reworded; **UX-2b.A11Y-1**: the retry screen's sr-only h1 now reads "We couldn't check your sign-in" (no duplicate heading). |
| 9. Header / footer / sitemap | footer column "Courage Library" (About, CNTS, Contact) and a "Legal" bar (Privacy (draft), Terms (draft)); header unchanged. Sitemap adds `/pricing`, `/about`, `/cnts`, `/contact`, `/privacy`, `/terms`. Coming-soon hubs are never listed (only active exams are). |
| SEO | per-page title, description, canonical and OG through `constructMetadata`. Organization JSON-LD unchanged. Breadcrumb JSON-LD now on the correct domain. |

**Public sign-up must stay OFF** until the privacy and terms drafts are approved by the owner / a lawyer.

## 3. Gates

**New gate `scripts/test_ux2b_public.cjs`:**
- Offline: 12/12 (P-1 … P-9d).
- `--live`: W-1 … W-5, added to CI's live job as `UX2B-LIVE`. Offline runs in CI as `UX2B-OFFLINE`. Listed in `PERMANENT_GATES.md`.

**Local offline run (the CI offline job list): all PASS.**

| Gate | Result |
|---|---|
| TSC, LINT, BUILD | pass |
| CI-SUPPORT | 14/14 |
| NO-PERSONAL-DATA, NO-LOCAL-ONLY, NO-RUNTIME-DB | pass |
| DESIGN-RATCHET | 8/8 |
| UX1B-SHELL | pass |
| QF1-OFFLINE | 73/73 |
| SEC1B / 1C / 1D | pass |
| QBKEY1, DRILL1, SYLIMPORT1, READERS (offline), EDITOR | pass |
| UX2A-OFFLINE | 10/10 |
| UX2B-OFFLINE | 12/12 |
| TYPES1-OFFLINE | pass |
| AUTH1-OFFLINE | pass |
| the three `--self-test` gates | pass |

**CI bug found and fixed (introduced in `221898e`):**
- `run-quiet` treated a **wrapped gate's** `--self-test` flag as its own. In CI, `REFSCAN-SELFTEST`, `NPD-SELFTEST` and `LOCAL-ONLY-SELFTEST` therefore ran run-quiet's self-test instead of their gate and passed vacuously.
- Now only run-quiet's own options (before `--`) are read.
- New CI-support check **C-14** proves a wrapped gate receives its flag; it fails against the old code.

**Gate updates (deliberate, each narrower or equal):**
- UX-2a L-2: the "unbuilt UX-2b routes" list now holds only `/legal`, and it also scans `content/public-pages.ts`.
- CA routes: empty-state pins follow the new wording.
- `signed-in-smoke`: `/premium` now expects the pricing heading (follows the 308).
- `test_auth1`: guard list without the removed premium page.

**Local live runs were not possible:** the precheck was NO-GO (two foreign `next` servers running, 0.7 GB free memory, net-probe 95%). Under loop #65 the live gates run in CI. **axe and the 360 / 1440 px screenshots are taken against production after the deploy (§5).**

## 4. Full copy for owner review

Generated from `content/public-pages.ts` (exact shipped strings).

### /exams

- **Title (meta):** Exams
- **Description (meta):** Government exams on Courage Library: free mock tests, exam guides and the syllabus for SSC CGL. SSC CHSL and SSC MTS are coming soon.
- **h1:** Exams
- **Lead:** Choose the exam you are preparing for. Everything available today is free during early access.
- **Section:** Available now — active exams as cards: title, category, live badges ("N free mock tests" / "Mock tests coming soon", "N exam guides", "Syllabus available" / "Syllabus coming soon"), "Open exam"
- **Section:** Coming soon — SSC CHSL, SSC MTS: "Not published yet. See what we plan to add." · "See what's planned"
- **Fallback (data read failed):** We couldn't load the exam list just now. You can still open SSC CGL directly. · button "Open SSC CGL"

### /exams/ssc-chsl and /exams/ssc-mts (coming-soon hubs, noindex)

- **Title (meta):** "SSC CHSL (coming soon)" / "SSC MTS (coming soon)"
- **Description (meta):** SSC CHSL is coming soon to Courage Library. Nothing is published for it yet.
- **Badge:** Coming soon
- **h1:** SSC CHSL / SSC MTS
- **Lead:** We are preparing SSC CHSL on Courage Library. Nothing is published for it yet, so there is nothing to study here today.
- **What we plan to add:**
  - An exam guide: pattern, eligibility and what is asked
  - The syllabus as a checklist
  - Full-length mock tests with a review of every answer
  - Mistake Vault practice from the questions you get wrong
- **Note:** These will appear here only once they are published.
- **Available now:** buttons "Explore SSC CGL", "All exams"

### /pricing (payments off)

- **Title (meta):** Plans and pricing
- **Description (meta):** Courage Library is free during early access. Pro is coming soon, and there is nothing to pay today.
- **h1:** Plans and pricing (unchanged)
- **Headline (new):** Free during early access. Pro coming soon.
- **Unchanged:** "Courage Library is free during early access. Pro is not open yet, and there is nothing to pay today." · Free card (3 live features) · Pro: "Opening soon", "Pricing announced soon"
- **/premium:** permanent redirect (308) to /pricing

### /about

- **Title (meta):** About Courage Library
- **Description (meta):** Courage Library began as a physical study library in Kanpur, Uttar Pradesh. Learn Smarter. Prepare Independently.
- **h1:** About Courage Library
- **Lead:** Learn Smarter. Prepare Independently.
- **Where we started:** Courage Library began as a physical study library in Kanpur, Uttar Pradesh, open since August 2024: a quiet, focused place where aspirants come to study every day.
- **What we are building:** This platform is built by the same people. It is for students who prepare on their own and want honest feedback: real exam-style practice, a clear view of where marks were lost, and a simple way to fix those mistakes.
- **How Courage Library works — One simple loop, repeated until the exam day.:**
  - Explore: Understand your exam: pattern, eligibility and what is asked.
  - Learn: Study one topic at a time, in plain language.
  - Practice: Answer questions on that topic and check yourself.
  - Mock: Take a full-length test under real exam timing.
  - Analyze: Review every answer and see which sections cost you marks.
  - Diagnose: Your wrong answers are saved in your Mistake Vault.
  - Master: Drill those mistakes until you get them right, again and again.
- **Where we are today:** We are in early access. SSC CGL is available now, and more exams are on the way. Everything available today is free.
- **Buttons:** "Explore exams" → /exams, "Contact us" → /contact

### /cnts

- **Title (meta):** Courage National Talent Search (CNTS)
- **Description (meta):** The Courage National Talent Search is a talent search for school students in Classes 5 to 8. Registrations open soon.
- **h1:** Courage National Talent Search (CNTS)
- **Lead:** A talent search for school students in Classes 5 to 8, run by Courage Library.
- **Registrations open soon:** (notice) Registration is not open yet. There is nothing to fill in or pay today.
- **Who it is for:**
  - Junior: Classes 5 and 6
  - Senior: Classes 7 and 8
- **Registration by parents:** When registration opens, a parent or guardian will register the student. Students do not sign up on their own.
- **Details:** The test format, the dates and how results are shared will be announced on this page before registration opens.
- **Questions:** Write to us and we will reply by email. support@couragelibrary.in

### /contact

- **Title (meta):** Contact
- **Description (meta):** Contact Courage Library by email. Kanpur, Uttar Pradesh.
- **h1:** Contact us
- **Lead:** Please reach us by email. We reply from the same address.
- **Email:** support@couragelibrary.in (mailto)
- **Write to us for:**
  - Help with your account or signing in
  - A question about an exam or a mock test
  - Reporting a mistake in a question
  - A request to see or delete your data
- **Location:** Kanpur, Uttar Pradesh

### /privacy (DRAFT)

- **Title (meta):** Privacy policy (draft)
- **Description (meta):** How Courage Library handles your data: what we collect, why, who processes it for us, and how to ask for deletion. Draft under legal review.
- **h1:** Privacy policy
- **Notice (always shown):** **Draft — under legal review** — This page describes how the platform works today. It is a draft and will be finalised before public registration opens.
- **Who we are**
  - Courage Library, Kanpur, Uttar Pradesh. You can reach us at support@couragelibrary.in.
- **What we collect**
  - When you create an account: your email address, the name you enter, and a password. The password is stored only as a secure hash by our sign-in provider; we never see it.
  - When you use the platform: your test attempts and answers, scores, the questions saved in your Mistake Vault, your drills and bookmarks, and study activity such as streaks and reward coins.
  - When you visit: our hosting provider keeps standard technical logs, such as IP address and browser type, to run and protect the service.
- **Cookies**
  - We use cookies only to keep you signed in. We do not use advertising or analytics cookies.
- **How we use your data**
  - To run your account and show your results, progress and mistakes
  - To keep the service working and secure
  - To reply when you write to us
- **Who processes it for us**
  - Supabase: database and sign-in
  - Vercel: website hosting
  - Our email provider: sign-in and password-reset emails
  - We do not sell your data and we do not share it for advertising.
  - Your answers and activity are not sent to AI services.
  - We do not take payments today.
- **Your choices**
  - To see, correct or delete your data, email support@couragelibrary.in from the address on your account. We will delete your account and personal data, except where the law requires us to keep something.
- **School students**
  - Courage Library is not yet open to school students. If we open CNTS registration, a parent or guardian will register the student, and this policy will be updated before that happens.
- **Changes**
  - If this policy changes, we will update this page.

### /terms (DRAFT)

- **Title (meta):** Terms of use (draft)
- **Description (meta):** The terms for using Courage Library during early access. Draft under legal review.
- **h1:** Terms of use
- **Notice (always shown):** **Draft — under legal review** — This page describes how the platform works today. It is a draft and will be finalised before public registration opens.
- **About these terms**
  - By using Courage Library you agree to these terms. Please read them with the privacy policy.
- **Your account**
  - Use your own email address and keep your password safe.
  - One person per account.
  - You are responsible for what happens under your account.
- **Early access**
  - Courage Library is free during early access. Features may change, pause or be removed while we build the platform. We will say on the pricing page before anything becomes paid.
- **Fair use**
  - Do not copy, sell or republish our questions, tests or guides.
  - Do not use bots or scripts to collect content.
  - Do not try to break into accounts or the service.
- **Our content**
  - We prepare questions and exam guides carefully, but mistakes can happen. Always check exam rules and dates with the body that conducts the exam. If you find a mistake, tell us and we will fix it.
  - Courage Library is an independent platform. It is not connected with any government department or exam-conducting body.
- **Ending your use**
  - You can stop using Courage Library and ask us to delete your account at any time. We may suspend an account that breaks these terms.
- **Responsibility**
  - We work to keep the platform accurate and available, but we cannot promise exam results. To the extent the law allows, Courage Library is not responsible for losses that come from using the platform.
- **Governing law**
  - To be confirmed in legal review.
- **Contact**
  - Questions about these terms: support@couragelibrary.in.

### Footer (all pages)

- **Column "Courage Library":** About → /about, CNTS → /cnts, Contact → /contact
- **Bottom bar:** Privacy (draft) → /privacy, Terms (draft) → /terms

## 5. Visual review (production)

Screenshots at 360 and 1440 px, and an axe scan of each new page, are added here after the deploy (anonymous, read-only).

SCREENSHOTS_PLACEHOLDER

## 6. OWNER REVIEW checklist

- [ ] **Facts:** "open since August 2024" (About; already on the landing). Confirm the date.
- [ ] **CNTS:** Classes 5–8, Junior = Classes 5–6, Senior = Classes 7–8, parent-led registration, "Registrations open soon". Confirm. Older docs describe CNTS as an all-India test for aspirants and students; this page follows your new brief.
- [ ] **About:** no facilities listed (only unverified pitch-deck text exists). Add facilities only if you confirm them.
- [ ] **Privacy / Terms drafts** (§4) to the owner / a lawyer. Points to confirm:
  - the processors list;
  - the email provider name (ZeptoMail / Brevo per decision #60);
  - the data-deletion process;
  - governing law and jurisdiction (left "to be confirmed");
  - school-student wording.
  - **Keep public sign-up OFF until approved.**
- [ ] **`/premium` retirement:** the old Premium Practice Hub is no longer reachable (308 → `/pricing`). Confirm that is intended.
- [ ] **Coming-soon hubs:** only SSC CHSL and SSC MTS. SSC GD (inactive) stays 404 and is not shown. Confirm, or add GD to the list.
- [ ] **Pricing headline:** "Free during early access. Pro coming soon."
- [ ] **CA empty states:** "Nothing published for {date / month}" / "We have not published current affairs for this date / month."
- [ ] **Visual review** on production at 360 and 1440 px (§5): header, footer (new column and legal bar), each new page.
- [ ] **CI result** for this push (live job includes `UX2B-LIVE`).

UX-2b status: AWAITING-CI-AND-OWNER-REVIEW
