# HOME-1: Landing page redesign + exam categories (Phase A: audit + proposal)

**Status:** PROPOSAL. No code changed. Awaiting owner approval (STOP).
**Branch:** `feat/home-1` (LOCAL-FIRST: nothing pushed).
**Evidence:** a local production build of main 84458a7. Screenshots in `E:/CourageLibrary-Backups/home-1/audit/` (outside the repo): `home-<width>-full.png`, one per section, plus `home-390-menu-open.png` / `home-768-menu-open.png`. Raw numbers are in `audit.json` in the same folder.

**Sources read:**
- `docs/ux/DESIGN_RULES.md` (R1–R13, #84 colour v3: primary blue-700 `#1D4ED8`, cyan accent, gradient for brand moments only, no yellow / amber);
- `docs/ux/DESIGN_SYSTEM.md`;
- `docs/ux/pages/landing.md`;
- `docs/reports/ux/UX0_DISCOVERY_REPORT.md` (§1e candidate profile);
- BRAND-2 fonts (Poppins headings, Inter body, Noto Sans Devanagari);
- #81 (images: AI illustrations only, never fake people or logos);
- #82 (UI in English only).

**Gap:** the "Phase 1: Who our users are" research doc is not in the repo. Proposal question Q1 asks for it. Until then this proposal assumes what the brief states: aspirants on low-end Android phones, often on slow or metered data, preparing on their own (self-study) for SSC / Police / Defence / Railway / Banking exams.

---

## 1. How it was measured

| What | How |
|---|---|
| Widths | 390 / 768 / 1280 / 1440. Each section was captured on its own, plus the full page and the open mobile menu. |
| Accessibility | axe-core, all impacts. |
| Performance | **Lighthouse is not installed locally**; installing it needs a package download, which the owner has not approved. The same Core Web Vitals were measured in Chrome through Playwright / CDP using a **low-end Android profile**: 390 px viewport, 4× CPU slowdown, Slow 4G (1.4 Mbps, 562 ms RTT), cold cache. |
| JS budget | `next build` route table: `/` first-load JS. The budget is 110 kB. |
| Images | Every `<img>`, CSS background image and inline SVG, by section; transfer sizes from the network log. |

### Headline numbers (today)

| Metric | Value | Verdict |
|---|---|---|
| `/` first-load JS | **107 kB** (shared 102 kB) | within budget (3 kB headroom) |
| axe violations | **0** at all 4 widths | pass |
| Horizontal overflow | none at any width | pass |
| LCP (low-end profile) | **2.7–3.3 s** (two runs); the LCP element is the hero paragraph (text) | borderline; the target is < 2.5 s |
| FCP | 1.9–2.6 s | ok for the profile |
| CLS | **0.0005** | excellent |
| Bytes on the wire (cold) | JS 135 KB, CSS 29 KB, fonts **64 KB**, images 52 KB (one logo), HTML 25 KB; 21 requests | fonts are the 2nd-largest cost |
| Page length at 390 px | **≈ 6,450 px**; hero 1,166 px, "How it works" 1,310 px, "What you get" 1,256 px, footer 1,004 px | long for a phone |

---

## 2. Section-by-section audit

Problems are tagged with the rule they break. "OK" lists what to keep.

| # | Section (390 / 1440 height) | Problems | OK, keep |
|---|---|---|---|
| 0 | **Header**: floating glass pill (76 / 76 px) | <ul><li>Header primary CTA is **"Explore SSC CGL"**: exam-specific (breaks the owner's home rule) and also shown in the mobile menu and the final CTA.</li><li>Brand mark is a gradient dot + text. The real logo PNG (245×229) is used only by the player / admin.</li><li>Desktop nav "Exams · Mock tests · Learn ▾ · Current affairs · Pricing": no categories entry.</li><li>Mobile menu: "Learn" holds only **"Mistake drills"** (with local flags it links to `/practice`: a label / route mismatch).</li><li>3 menu targets are 44 px (R10 asks ≥ 48).</li><li>Min font 12 px (the dropdown caption).</li></ul> | Glass pill is distinctive; sticky; `aria-expanded` / dialog menu is accessible (focus trap, Esc). |
| 1 | **Hero** (1,166 / 674 px) | <ul><li>**Too tall on mobile:** the CTA sits at ≈ 500 px and the hero continues to 1,166 px because of the embedded "How it works" card.</li><li>The **card repeats section 2** (3 of 7 steps, then all 7 again right below): duplication, about 60 words wasted.</li><li>Body copy is 37 words. It is accurate but long for the LCP element on slow phones (the LCP is this paragraph).</li><li>CTA "Explore SSC CGL" is exam-specific. White pill on gradient is correct per R4 (hero variant).</li><li>Check-mark line in 14 px bold on the gradient; the "Free during early access" line is small (14 px).</li><li>No visual anchor (illustration) at any width; the desktop right column is the step card.</li></ul> | H1 "Learn Smarter. Prepare Independently." (matches the brief), cyan second line on blue (brand moment), white-pill primary, honest "Free during early access. No card needed." |
| 2 | **How Courage Library works**: 7 steps (1,310 / 444 px) | <ul><li>**7 steps is a lot.** The brief proposes 5 (Learn → Practice → Mock → Analyze → Revise).</li><li>At 390 px it is a 1,310 px vertical list.</li><li>Step cards at 1440 are narrow (7 columns): 14 px text in about 110 px wide cards, line breaks every 2–3 words.</li><li>Icons are decorative only; nothing is clickable (R5: the steps could link to the matching pages).</li></ul> | Clear verbs; numbered; English only. |
| 3 | **Exams** (625 / 530 px) | <ul><li>**Exam-specific content on home:** an SSC CGL card with counts and chips, plus SSC CHSL / MTS "Coming soon". The owner rule says categories only.</li><li>Logo slot: the 512×512 WebP (≈ 52 KB) is shown at 30 px and lazy-loaded, so it was still empty in the first full-page capture.</li><li>When the data read fails, the whole section becomes "The exam list could not be loaded right now", seen once in the audit (network). A category grid would be static-ish and would not depend on that read.</li><li>1 small target ("All exams" link height).</li></ul> | Honest live counts; "Coming soon" is truthful (R12). |
| 4 | **What you get**: 7 feature cards (1,256 / 669 px) | <ul><li>**3 of 7 cards are "Coming soon"** (Syllabus tracker, Daily current affairs, Courses): visual noise on the first visit. The brief's list is lessons, PYQ practice, mocks, Mistake Vault, current affairs, English / Hindi content.</li><li>"Daily current affairs: Coming soon" conflicts with the **Current affairs** link in the header.</li><li>Min font 12 px (status chips).</li><li>140 words.</li></ul> | Status chips are honest; the cards align on a grid. |
| 5 | **Plans** (314 / 251 px) | <ul><li>Free vs Pro is a single text block, with no side-by-side comparison of what is free and what Pro will add.</li><li>Min font 12 px (chip).</li></ul> | Honest: "Free during early access. Pro coming soon"; nothing to pay today (payments are off). |
| 6 | **Trust** (586 / 395 px) | <ul><li>Text only, with no image of the real library. #81 forbids fake people, but a **real photo of our own library** is allowed (owner's photo; open question Q6).</li><li>The icon tile is decorative.</li></ul> | **Real story, no fake numbers** (R12): "a physical study library in Kanpur… open since August 2024". Keep. |
| 7 | **Final CTA** (189 / 176 px) | "Take your first mock test today" + **"Explore SSC CGL"**: exam-specific. | Gradient band = brand moment; one CTA. |
| 8 | **Footer** (1,004 / 374 px) | <ul><li>**1,004 px tall on mobile** (single column of 4 lists).</li><li>**13 links under 44 px tall** at 768–1440 (36 px), 4 at 390: R10 asks ≥ 48.</li><li>No exam categories.</li><li>**No "not affiliated" line** in the footer. It is shown on exam pages only.</li><li>"Privacy (draft)" / "Terms (draft)" are honest but should stay low-key.</li></ul> | Real contact e-mail and city; clean 4-column desktop layout. |

**Cross-cutting:**
- Typography sizes in use: 12 / 14 / 16 / 18 / 22 / 27.8 / 36 / 60 px. The 12 px chips should become 13–14 px.
- Colour is consistent with v3: blue-700 primary, cyan accent on the hero line, gradient only in the hero, the final CTA and the brand dot. No amber / yellow found.
- English only (R9) holds.
- Dark mode: N/A (backlog DARK-MODE-1).

---

## 3. Image inventory

| Asset | Where | File | Natural | Rendered (390 / 768 / 1280 / 1440) | Transfer | Verdict |
|---|---|---|---|---|---|---|
| SSC logo | Exams card | `/media/logos/orgs/<id>/<sha>.webp` (same-origin, LOGO-MEDIA-1) | 512×512 WebP | 30×30 at all widths (in a 32 px box) | ≈ 52 KB | **Oversized ≈ 16×.** If logos stay in lists, serve a 64 px variant (≈ 2–3 KB); the upload pipeline can write a `-64.webp` sibling. On the new home, exams leave the page anyway. |
| Brand logo | not on home | `public/images/logo.png` | 245×229 PNG, 7.3 KB | not rendered (wordmark used instead) | 0 | Keep for now. Also the PWA manifest icon, which is **not square** (245×229): needs proper 192 / 512 square icons (BRAND-LOGO, owner + designer). |
| Gradient | header pill, hero, final CTA, footer dot | CSS `linear-gradient` | — | — | 0 | Keep (brand moments only, per R13). |
| Icons | all sections | inline SVG (lucide), 3–7 per section | vector | 16–24 px | in JS | Keep. |
| Fonts | global | Poppins 600/700, Inter, Noto Sans Devanagari (no preload) | — | — | **64 KB** | Keep, but see BUILD-FONT-1 (self-host) and drop unused weights. |

**No raster illustrations or photos today.** The page is light on bytes; the cost is length and repetition, not images.

**Images for the new design (#81):**
- 5 category icons: owner-uploaded through the admin, AI-made, simple flat; ≤ 6 KB WebP each at 64 px.
- Optionally ONE hero illustration: AI, no people's faces, ≤ 30 KB WebP. It must not be the LCP element on mobile: hidden below 768 px or placed after the text.
- Optionally one real photo of the Kanpur library for Trust: the owner's own photo, ≤ 40 KB WebP, lazy.

---

## 4. Exam categories: a proper entity

### 4.1 Today (read-only check)
`exams.category` is free text (NOT NULL) with inconsistent values:

| exam | category today | active |
|---|---|---|
| ssc-cgl | Staff Selection Commission (SSC) | yes |
| ssc-chsl | Staff Selection | no |
| ssc-mts | Staff Selection | no |
| ssc-gd | National Recruitment | no |
| qa-syllabus-test | Internal QA | no |

There is no categories table, and the Categories page was folded into Exams (ADMIN-IA-1). `/exams` shows cards with a category caption only.

### 4.2 Schema proposal (migration, own number, standard process + backup first)

```
exam_categories
  id             uuid pk
  slug           text unique, ^[a-z0-9-]{2,40}$      -- e.g. ssc, police, defence, railway, banking
  name           text 2..60                           -- "SSC", "Police", "Defence", "Railway", "Banking"
  short_desc     text ≤ 140, nullable                 -- one line under the tile (English, R9)
  display_order  int not null                          -- tile order on home / exams
  is_active      boolean default true                  -- inactive = hidden from public, kept for history
  icon_sha256    text null, icon_alt text null
  icon_path      text GENERATED ('categories/' || id || '/' || icon_sha256 || '.webp')  -- like conducting_orgs.logo_path
  created_at / updated_at
  CHECK (icon_sha256 IS NULL) = (icon_alt IS NULL)
exams.category_id uuid FK → exam_categories (NOT NULL after the backfill; exams.category text kept read-only for one
  release, then dropped)
```

- **RLS:** anon / authenticated read `is_active` rows; no client writes.
- **Writes:** `fn_category_upsert` / `fn_category_icon_set` / `fn_category_icon_remove`. They are INVOKER, service_role only, audited (`EXAM_CATEGORY_*`), exactly like `fn_logo_set`. No new SECURITY DEFINER.
- **Icons:** the same safe pipeline as logos:
  - PNG / JPG / WebP only, no SVG;
  - browser resize to 512 + server sniff and re-encode;
  - alt text required;
  - stored in the existing `org-logos` bucket under a `categories/` prefix;
  - served same-origin at `/media/logos/categories/…` (the existing rewrite; no storage host in HTML).
  - Reuse `LogoDrawer` with a new mode.
- **Slug collision:** `/exams/<category>` and `/exams/<exam>` share one route segment. Proposal: one shared slug namespace, enforced by a trigger on both tables (a category slug may not equal an exam slug and vice versa). The route checks the category first, then the exam. Existing exam slugs (`ssc-cgl`, …) do not collide with `ssc`, `police`, `defence`, `railway`, `banking`. Open question Q3.

### 4.3 Backfill mapping (owner reviews; nothing runs before approval)

| exam | → category |
|---|---|
| ssc-cgl, ssc-chsl, ssc-mts, ssc-gd | **SSC** (GD is SSC-conducted: "National Recruitment" is replaced) |
| qa-syllabus-test (internal, inactive) | **SSC**, still hidden (QA exam) — or an inactive "Internal" category (Q4) |

Seed categories: SSC (1), Police (2), Defence (3), Railway (4), Banking (5), all active.
- Police, Defence, Railway and Banking have 0 exams today. Their tiles say "Coming soon" honestly (R12), or are hidden until they have an active exam (Q5).
- Police has a body (UPPBPB) with 0 exams.

### 4.4 Admin flow
`/admin/exams` gains a **Categories** tab: Exams · Categories · Knowledge · Cycles · Notes.
- **Grid:** a card grid like Conducting bodies (icon 64 px, name, "N exams", status chip, missing icon first) plus an "Add category" card.
- **Drawer:** name; slug (auto, editable before first save); one-line description; order (up / down buttons, keyboard-accessible); active toggle; icon (drag-drop, preview at tile size 64 / 48, alt text auto "<Name> icon").
- **Actions:** one primary "Save". Deactivating a category that still has active exams is refused with a message.
- **Exam create / edit:** a required category select. The wizard step 1 adds it next to the conducting body.
- **Staff:** read-only. Admin-only writes.
- **Today:** "Categories without an icon" stat.

### 4.5 Category page `/exams/<category>`
- **Header:** category icon + name (inline, like LOGO-PLACEMENT) and the one-line description.
- **List:** that category's exams as cards (logo 32 px + name + honest chips), active first, then "Coming soon".
- **Empty category:** "Exams for <Name> are coming soon" + a link to all categories.
- **SEO:** canonical `/exams/<category>`, in the sitemap only when it has an active exam; JSON-LD `CollectionPage`.
- **Breadcrumb:** Home › Exams › <Category>.
- `/exams` becomes the category directory: tiles first, then all exams grouped by category.

---

## 5. Home page rule and proposed structure

**Owner rule:** no exam-specific details on home. Only category tiles → category page → exam pages.

The architect draft, adjusted with the audit evidence:
- "How it works" goes from 7 steps to 5.
- The hero no longer embeds the steps.
- Coming-soon features are removed from "What you get".
- The footer becomes 2 columns on mobile.

Target: about 3,200 px at 390 px (from about 6,450).

| # | Section | Purpose | Change vs today |
|---|---|---|---|
| 0 | Header | navigate | nav = Exams (category menu) · Learn · Practice · Current affairs; right: Sign in + "Start free"; no exam CTA |
| 1 | Hero | positioning + ONE action | keep H1; shorter line; one white-pill CTA "Start free"; step card removed |
| 2 | Categories (5 tiles) | route to exam | NEW: replaces "Exams" |
| 3 | How it works (5 steps) | explain the loop | 7 → 5 steps; horizontal row on desktop, 2-column compact on mobile; each step links |
| 4 | What you get (6) | concrete value | only what exists today; English / Hindi content added |
| 5 | Trust | real story | keep the copy; optional real photo |
| 6 | Free vs Pro | simple, honest | two columns; Pro "coming soon", no prices |
| 7 | FAQ (5–6) | objections | NEW, accordion + FAQPage JSON-LD |
| 8 | Final CTA | one action | "Start free" (or "Choose your exam"); no exam name |
| 9 | Footer | find + legal | categories column, legal, contact, the "not affiliated" line; 2 columns on mobile, 48 px targets |

### 5.1 Wireframes (ASCII; desktop 1280 | mobile 390)

**0. Header**
```
DESKTOP  ┌ ● Courage Library   Exams ▾   Learn ▾   Practice   Current affairs        Sign in  [ Start free ] ┐
                                (Exams ▾ = 5 categories + "All exams")
MOBILE   ┌ ● Courage Library                          Sign in  ☰ ┐
         menu sheet: EXAMS (5 categories, icons) · LEARN · PRACTICE · CURRENT AFFAIRS · [Start free] · Sign in   (48 px rows)
```

**1. Hero** (gradient; text-first LCP)
```
DESKTOP  GOVERNMENT EXAM PREPARATION                                  ┌──────────────────────┐
         Learn Smarter.                                                │  (optional AI         │
         Prepare Independently.   (cyan)                               │   illustration ≤30KB) │
         Lessons, practice, mocks and revision for SSC, Police,        └──────────────────────┘
         Defence, Railway and Banking exams.
         [ Start free → ]        Free during early access · No card needed
MOBILE   GOVERNMENT EXAM PREPARATION
         Learn Smarter. / Prepare Independently.
         Lessons, practice, mocks and revision for government exams.
         [ Start free → ]  (full width)
         Free during early access · No card needed           (≈ 520 px tall; no image on mobile)
```

**2. Categories**
```
DESKTOP  Choose your exam category
         ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
         │ [icon] │ │ [icon] │ │ [icon] │ │ [icon] │ │ [icon] │      5 across; whole tile is the link
         │  SSC   │ │ Police │ │Defence │ │Railway │ │Banking │      chip: "4 exams" / "Coming soon"
         └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
                                                     All exams →
MOBILE   2-column grid (SSC | Police / Defence | Railway / Banking), tiles ≥ 120 px tall, icon 48 px
```

**3. How it works**
```
DESKTOP  ① Learn ──── ② Practice ──── ③ Mock ──── ④ Analyze ──── ⑤ Revise     (one row; each step links)
         one line each
MOBILE   compact list: number · title · one line (≈ 90 px per step, ≈ 460 px total)
```

**4. What you get** (only what exists today)
```
DESKTOP  3 × 2 cards: Lessons · PYQ-style practice · Full-length mocks · Mistake Vault · Current affairs · English and Hindi
MOBILE   1 column, icon + title + one line (no "coming soon" cards)
```

**5. Trust**
```
DESKTOP  ┌ [real library photo, optional] │ Built by a real library in Kanpur — open since 2024 … (existing copy) ┐
MOBILE   text first, photo below (lazy)
```

**6. Free vs Pro**
```
DESKTOP  ┌ Free (now) ─────────────┐ ┌ Pro (coming soon) ─────────┐
         │ ✓ lessons ✓ practice     │ │ more mocks, deeper analysis │
         │ ✓ mocks ✓ Mistake Vault  │ │ announced here first        │
         └──────────────────────────┘ └─────────────────────────────┘
MOBILE   stacked
```

**7. FAQ** (accordion, 5–6 items) · **8. Final CTA** (gradient band, "Start free") · **9. Footer**
```
FOOTER DESKTOP  ● Courage Library | Exams: SSC Police Defence Railway Banking | Learn | Company: About, Contact, Help | Legal
                ── "Courage Library is an independent platform and is not affiliated with any exam conducting body." ──
FOOTER MOBILE   2 columns (Exams | Company), legal row, the not-affiliated line; links 48 px tall
```

### 5.2 Copy draft (plain English; no numbers we cannot prove)

- **Hero eyebrow:** GOVERNMENT EXAM PREPARATION
- **H1:** Learn Smarter. / Prepare Independently.
- **Line:** Lessons, practice, mock tests and revision for SSC, Police, Defence, Railway and Banking exams.
- **CTA:** Start free · **micro:** Free during early access. No card needed.
- **Categories:** "Choose your exam category" · tile chip "N exams" or "Coming soon" · link "All exams"
- **How it works:** "How it works"
  - Learn: "Study one topic at a time, in plain language."
  - Practice: "Answer questions on that topic and check yourself."
  - Mock: "Take a full-length test under real exam timing."
  - Analyze: "See which sections and questions cost you marks."
  - Revise: "Your mistakes come back until you get them right."
- **What you get:**
  - Lessons (topic by topic);
  - Exam-style practice;
  - Full-length mock tests;
  - Mistake Vault;
  - Current affairs;
  - English and Hindi content: "Study in the language you prepare in." The UI stays English (R9); the content follows the user's preference.
- **Trust:** keep today's text ("…a physical study library in Kanpur, Uttar Pradesh, open since August 2024…").
- **Free vs Pro:** "Free during early access" / "Pro: coming soon. Nothing to pay today."
- **FAQ (draft questions):**
  - Is it really free?
  - Which exams do you cover?
  - Can I study in Hindi?
  - Do I need to sign up to try a mock?
  - Who runs Courage Library?
  - Are you connected to SSC or any exam body? (Answer: no, the independent-platform line.)
- **Final CTA:** "Start preparing today" + [Start free]
- **Footer line:** "Courage Library is an independent platform and is not affiliated with any exam conducting body."

### 5.3 Budgets / acceptance for Phase B
- `/` first-load JS ≤ 110 kB (today 107). The accordion and the category menu must not add client JS beyond about 3 kB: use `<details>` for the FAQ.
- LCP < 2.5 s on the low-end profile:
  - shorter hero text;
  - no hero image below 768 px;
  - fonts: preload only the heading weight used above the fold.
- CLS < 0.1; axe 0 serious / critical; touch targets ≥ 48 px; min font 13 px; page ≤ 3,500 px at 390.
- One primary per screen (R4): the hero "Start free". The header "Start free" is the same action, styled as an outline on scroll (Q7).

---

## 6. Open questions for the owner

| # | Question | Recommendation |
|---|---|---|
| Q1 | Please share the "Phase 1: Who our users are" research (not in the repo). | — |
| Q2 | Header "Start free": sign-up is OFF until the legal drafts are approved. Should "Start free" go to the sign-up page (closed state) or to the category tiles / a free mock? | Until sign-up opens: "Start free" → `#categories` (choose an exam, free mocks need no account). |
| Q3 | Category URLs: `/exams/<category>` (shared slug namespace with exams, trigger-enforced) or `/exams/category/<category>`? | `/exams/<category>` with the shared namespace (clean URLs, as briefed). |
| Q4 | `qa-syllabus-test` category: SSC (hidden, inactive) or an inactive "Internal" category? | Inactive "Internal" category (never shown). |
| Q5 | Categories with 0 exams (Police, Defence, Railway, Banking): show as "Coming soon" tiles, or hide until the first exam is active? | Show all 5 with "Coming soon" (the brief lists 5; honest per R12). |
| Q6 | Trust: may we use a real photo of the Kanpur library (owner's photo)? | Yes, if available: one photo, ≤ 40 KB WebP, lazy. |
| Q7 | Hero illustration: one AI illustration (desktop only), or none? | None for v1: text-first is faster on low-end Android; add later if wanted. |
| Q8 | Category icons: will the owner supply 5 AI icons, or should we start with neutral line icons (lucide) until uploads exist? | Lucide fallback in code + admin upload; uploaded icons replace it per category. |
| Q9 | Remove `exams.category` (text) after the backfill, one release later? | Yes, one release later (no reader may still use it; gate-checked). |

**STOP:** Phase B (build) waits for the owner's approval and answers.
