# IMPECCABLE-1 — design audit with the Impeccable skill (reviewer only)

2026-11-02 · owner-approved trial · LOCAL, read-only · nothing applied until the owner / architect approve the list.

> ⚠️ DEGRADED: Impeccable's own detector did not run (its engine binary is not shipped and would be downloaded and
> executed by the launcher — refused, see §1). Assessment A (design review) ran as an isolated sub-agent; Assessment B
> was replaced by our own browser evidence (axe-core, touch-target, overflow, image and lab LCP / CLS checks).

## 1. Install / provenance

| Item | Finding |
|---|---|
| Source | Paul Bakaus' official repo `github.com/pbakaus/impeccable` (named in its launchers). Skill `version: 4.6.0`, launcher `scripts/VERSION` 0.1.15 |
| Licence | Apache 2.0 (SKILL.md front matter). **No LICENSE / NOTICE file was copied** — redistributing it without the licence text does not meet Apache 2.0 §4(a) |
| Where it is | **Already present at PROJECT level and tracked in the public repo**: `.claude/skills/impeccable/` (57 files, 2.3 MB), added by `bf2672b` (UX-T0, 2026-10-19). Nothing was installed or re-installed for this audit |
| Files | `SKILL.md`, 46 `reference/*.md` prompt files, `scripts/` (launchers `impeccable` / `impeccable.cmd`, `live-browser*.js`, `modern-screenshot.umd.js`, `command-metadata.json`, a font index) |
| Scripts / network | The launchers run a platform binary from `bin/` — **not shipped** — else **download it from the repo's GitHub releases** and execute it. `live-browser.js` (550 kB) is injected into pages and talks to a local server only. **No script was run.** The skill's prompts were read as data; nothing in them overrides our rules |
| API keys / accounts | None required, none used |

**Proposal (owner ruling needed):** move the skill out of the public repo to user level (`~/.claude/skills/`) — or, if it
stays, add its LICENSE / NOTICE — and never run its launcher (pin `IMPECCABLE_BIN` nowhere; the detector stays off).

## 2. Method

- Pages: `/`, `/exams`, `/exams/ssc`, `/exams/ssc-cgl`, `/auth/login`, `/admin/exams` (QA admin, local test account) —
  local production build of main `157f839`, widths 390 and 1280, full-page captures (kept outside the repo).
- Assessment A: Impeccable `critique` (Nielsen heuristics, cognitive load, personas, P0–P3), isolated sub-agent, given the
  screenshots, PRODUCT.md, DESIGN.md and R1–R13. It did not see Assessment B.
- Assessment B: Impeccable `audit` dimensions measured in the browser: axe-core 4 (WCAG 2.0 / 2.1 / 2.2 A + AA + best
  practice), targets < 48 px, horizontal overflow, images without alt, text < 12 px, lab LCP / CLS (unthrottled).
- Limits: the home sections below the categories are reveal-on-scroll (never revealed in a full-page capture — see A-4);
  admin was judged on the first viewport; login error states, the closed sign-up page and real touch were not exercised.

## 3. Scores

**Audit health (Impeccable `audit`)** — 14 / 20, *Good*

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 2 | Login: Password label not tied to its input (WCAG 1.3.1 / 4.1.2, level A), no h1; 40 px inputs |
| 2 | Performance | 3 | Budgets met (/ 109 kB, CLS 0); exam hub LCP 5.2 s at 390 even unthrottled locally |
| 3 | Theming | 3 | Tokens on the new shell; legacy palette classes remain on login and admin exams; DESIGN.md is stale |
| 4 | Responsive | 3 | No overflow anywhere; many < 48 px targets on the hub, login and admin |
| 5 | Implementation integrity | 3 | Coherent honesty system (real states, sources, dates); two legacy islands (login, admin exams) |

**Design health (Impeccable `critique`, Assessment A)** — home 20/28 · exams 20/28 · category 17/28 · exam hub 25/36 ·
login 25/40 · admin exams 23/36 (n/a heuristics excluded per its mode rule). Strengths it named: honesty designed in
(coming-soon states, "no dates published", official sources, "as of" dates, non-affiliation note); the hub's
"At a glance" table; a consistent shell (solid header, navy footer, breadcrumbs, one blue-700 primary).

## 4. Findings and verdicts

Severity is Impeccable's (P0 blocking · P1 major / WCAG AA · P2 minor · P3 polish). Verdict = ours against #84 (colour v3),
#85 (admin English), #86 (solid header, navy footer, honest images), R1–R13, budgets (/ ≤ 110 kB, LCP, CLS 0, axe,
48 px), honesty (no fake stats / urgency), English UI (#82).

| ID | Page · width | What (Impeccable) | Sev | Its fix | Verdict |
|---|---|---|---|---|---|
| A-1 | Login · both | Password `<label>` has no `htmlFor` (verified `login-form.tsx:86`); no h1 (axe); inputs 40 px; 16 px-tall text links; legacy components, 12 px slate labels | P1 | Rebuild on `components/ui` fields + tokens | **ACCEPT** — WCAG level A + R10 48 px; keep the BRAND-2 card (see A-12) |
| A-2 | Login | "Create an account" shown while sign-up is OFF | P1 | Check availability; say "Sign-up opens soon" | **ADAPT** — /auth/signup already shows an honest closed card; hide the link when closed (UX-FIX-1 rule: no start action to a closed sign-up) and offer "Explore exams" |
| A-3 | Admin exams · 1280 | "Manage Examination" action clipped past the card edge; 10–11 px mono text (65 nodes < 12 px measured) | P1 | Stack / shorten actions; ≥ 12 px | **ACCEPT** — #85 plain admin English ("Manage"), no text < 12 px |
| A-4 | Home · both | Below-the-fold sections hidden (opacity 0) until scrolled into view; JS work on low-end phones | P2 | Drop the reveal or animate transform only | **ADAPT** — keep the motion (≤ 200 ms, reduced-motion safe) but never hide content: visible by default, transform-only entrance |
| A-5 | Exam hub · both | "Exam guides" wall: 24 equal cards, near-duplicate titles, a date on every card; guide links 25–28 px tall | P2 | Title lists per group, collapsible on phones, one date per group, merge duplicates | **ADAPT** — grouping, ≥ 48 px rows and one date per group: yes. Merging guides is content work → owner / content review, never by renaming |
| A-6 | Exam hub | Mock list in no visible order (weekday names); nothing says where to start | P2 | Full-length first, then sectional; "Start here"; 3 + "Show all" on phones | **ADAPT** — order by a rule (full-length first, then by date) — no invented "recommended" label (R12); "Show all" on phones yes |
| A-7 | Category SSC | Lede promises "CGL, CHSL, MTS, GD and more" but no GD card; card drops the /exams chips | P2 | Reuse the /exams card; lede from data | **ACCEPT** — honesty (R12): copy must come from published data |
| A-8 | Home hero | Phone mock 120 px wide at 390 — the real screen is unreadable; the product's difference isn't shown | P2 | Readable crop of a real result / mistake screen, or "SSC CGL · 8 free mocks" shortcut | **ADAPT** — a readable crop of a REAL screen (#86 honest images) inside / ≤ 110 kB and LCP; **REJECT** the exam-specific shortcut (owner rule: no exam-specific content on home) |
| A-9 | Admin exams · 390 | Breadcrumb twice, wrapped tabs, "Ctrl K" hint on touch, 3 stacked stat tiles | P2 | One breadcrumb, scrolling tabs, hide hint on touch, inline stats | **ACCEPT** — lower priority (admin is desktop-first) |
| A-10 | Shell · /exams, category, hub, login | Header actions point to the page you are on ("Explore exams" on /exams, "Sign in" on login) | P2 | Active state or hide | **ACCEPT** — `aria-current` + quieter style (R4: one primary per screen) |
| A-11 | Admin exams | Jargon + Title Case ("Examination Management Hub", "canonical examinations", "Published Knowledge Modules") | P3 | Plain labels, sentence case | **ACCEPT** — #85 / R9 plain English |
| A-12 | Login | Title Case ("Email Address", "Sign In"), "••••••••" placeholder, glass card + cyan glow | P3 | Sentence case; quieter | **ADAPT** — sentence case + no fake-password placeholder: yes. **REJECT** removing the glass card / glow — BRAND-2 approved surface |
| B-1 | /exams, category · both | Coming-soon exam name links 25–28 px tall | P2 | (measured) | **ACCEPT** — R10 48 px hit areas |
| B-2 | Breadcrumbs · 1280 | "Home" / "Exams" links 20 px tall (below the WCAG 2.2 24 px minimum) | P2 | (measured) | **ACCEPT** — ≥ 24 px, 48 px hit area via padding |
| B-3 | Exam hub · 390 | LCP 5.2 s locally without throttling (dynamic page) | P2 | Optimise | **ACCEPT** — profile first; the "static hub + client CTA" candidate already noted in PERF-HOME-1 |
| B-4 | Admin exams | axe `heading-order` (h3 under the card without h2) | P3 | (measured) | **ACCEPT** |
| B-5 | All | Skip links 32 × 24 px | — | (measured) | **REJECT** — focus-only skip links; not a touch target |
| M-1 | Category, hub | Non-affiliation disclaimer appears twice (body + footer) | P3 | Keep one | **ADAPT** — keep both until the owner rules (legal wording) |
| M-2 | /exams · 1280 | One live card in a 3-column grid looks unfinished | P3 | — | **ADAPT** — span / centre the single live card; never pad with fake cards |
| M-3 | Home | Cyan accent bar on section headings | P3 | Check R13 | **REJECT** — allowed small saturated accent (C-1 / C-14, R13) |
| M-4 | Exam hub | Empty "Exam cycle" box has the weight of real content | P3 | One line | **ACCEPT** |
| M-5 | Admin | Mono uppercase stat labels as decoration | P3 | One text line | **ADAPT** — admin polish, low priority |
| M-6 | DESIGN.md | Token summary still says violet / cyan primary; contradicts R4 / R13 (blue-700) | P3 | `document` | **ACCEPT** — update DESIGN.md (docs only) |

Personas (Assessment A): the first-time Hindi-first aspirant on a 360–390 px Android hits the unreadable hero screen, a
~6,200 px hub with long Title Case guide names, "Tier 1 (CBE)" never glossed (R9 says gloss once) and reveal JS on a slow
CPU; the returning student has no "Continue" in the public header (R5) and no next-mock hint; the admin operator meets
the clipped action and 10–11 px slugs.

## 5. Top 10 accepted improvements (ranked by impact)

1. **Login accessibility** (A-1): label ↔ input, an h1, 48 px fields and links, `components/ui` + tokens, sentence case (A-12).
2. **Exam hub targets and order** (A-6, B-1, A-5 rows): 48 px rows for mocks and guides, full-length first, "Show all" on phones.
3. **Category page honesty** (A-7): lede built from published data; reuse the /exams card with its live chips.
4. **No link to a closed sign-up from login** (A-2): hide "Create an account" while closed; offer "Explore exams".
5. **Never-hidden reveal** (A-4): content visible by default; transform-only entrance.
6. **Admin exams cards** (A-3, B-4, A-11): no clipped actions, no text < 12 px, plain sentence-case labels.
7. **Exam guides grouped** (A-5): groups, one "as of" date per group, collapsible on phones (merging duplicates → content review).
8. **Header current-page state** (A-10): `aria-current` and a quieter style for the action that points to the current page.
9. **Readable real screen in the hero** (A-8): a real, readable crop inside the 110 kB / LCP budget (#86).
10. **Exam hub LCP at 390** (B-3): profile the 5.2 s; static hub + client CTA candidate.

Also (housekeeping, not ranked): breadcrumbs ≥ 24 px (B-2), gloss "CBE" once (R9), one-line empty cycle state (M-4),
DESIGN.md update (M-6), admin 390 chrome (A-9).

**STOP** — nothing is applied until the owner / architect approve this list.
