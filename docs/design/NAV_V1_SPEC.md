# NAV-1 — Navigation Spec v1 (owner-approved 23 Nov 2026)

Visual reference: `docs/design/nav-v1-reference.html` (open in a browser). Palette, logo suite and fonts as in `docs/design/LANDING_V1_SPEC.md` (cl-* tokens, `public/brand/`).

## 0. Decisions
| Area | Decision |
|---|---|
| Structure | **S2**: (1) Visitor header on public pages, (2) Student navigation on signed-in app pages, (3) **Exam focus**: no site navigation inside a live mock attempt |
| Visitor desktop | **V2**: links + **Exams dropdown** (category menu) |
| Visitor phone | **M1**: logo + Start free + menu button; menu = right-side drawer |
| Student desktop | **D2**: **left sidebar**, collapsible to icons, remembers choice |
| Student phone | **N2**: **bottom tab bar with centre "Today's mock" button**; avatar opens a sheet |
| Language | Visitors: EN/हिंदी switch only on the landing (/ and /hi). Students: Language item in the profile menu (avatar menu / sheet) |

## 1. Visitor header (all public pages: /, /hi, /exams, /exams/*, /category/*, /current-affairs/*, /mock-tests, /about, /contact, /help, legal pages, auth pages)
- One shared component used everywhere (replaces the old PublicShell header and the landing-scoped header — no two versions).
- Height 66 px desktop / 60 px phone; sticky; white 92% + blur (solid in lite mode); 1 px cl-line bottom border.
- Left: horizontal logo SVG (height 30 desktop / 26 phone) → `/` (on /hi → `/hi`).
- Desktop links (≥ 900 px): **Exams ▾**, Current Affairs, Mock Tests. **Learn** appears only when a Learn index route exists (feature flag/route check). Active link: charcoal + 600 weight + 2 px cl-blue bottom border. Hover: colour change 150 ms.
- **Exams menu**: opens on click (and hover with ~150 ms intent delay on pointer devices); 2-column grid of category tiles, each with its palette gradient swatch, name and status line from live data (live: "<live exams> live · more coming" / link to `/exams/<slug>` or category page; not live or no route: muted, "Coming soon", not a link); footer link "All exams →" (`/exams`). Keyboard: Enter/Space opens, arrow keys move, Esc closes and returns focus; closes on outside click and on route change. Works without JS as a link to /exams.
- Right side: EN|हिंदी switch **only on / and /hi**; "Sign in" (text link) + "Start free" (cl-blue pill, 40 px). Signed-in hint (existing pre-paint data-auth): both replaced by "Go to dashboard". Sign-up closed: Start free → "Explore exams" (existing X-01 rule).
- Phone (< 900 px): logo · "Start free" compact pill (36 px tall) · menu button (48 px target). Drawer from right, 84% width, focus-trapped, Esc/overlay closes: Exams (expandable list of categories with status + All exams), Current Affairs, Mock Tests, Learn (when ready), language switch (landing only), Sign in + Start free at the bottom (or Go to dashboard when signed in). No-JS fallback (native details/links).

## 2. Student navigation (signed-in app pages: dashboard, practice, mocks list, results, mistake vault, student current-affairs views, profile/settings)
### Desktop ≥ 1024 px — left sidebar
- Width 240 px expanded / 72 px collapsed; full height; white; 1 px cl-line right border.
- Top: logo (expanded: mark + wordmark; collapsed: mark only) → student home.
- Items (icon + label): Home, Practice, Mocks, Current Affairs, Results, Mistake Vault, Learn (only when ready). Only routes that exist are shown.
- Active: cl-blue-tint background, cl-blue-text, 600 weight, 3 px cl-blue bar at the left edge; `aria-current="page"`.
- "PRO" chip (coral tint/coral text) on Mistake Vault only when the paywall master switch is on.
- Bottom: Help, Collapse toggle (chevron). Collapsed: icons only, each with tooltip + aria-label. Preference stored client-side (localStorage) and applied before paint (no layout shift); default expanded.
- Top bar (60 px) over the content: page title (h1 stays in page content if already there — no duplicate h1), right: avatar button → menu: name, Profile, Language EN|हिंदी, Help, Sign out (coral text). No notifications bell until notifications exist.
### Phone/tablet < 1024 px — bottom bar
- Top bar 58 px: logo (mark + wordmark) left, avatar right (48 px target).
- Bottom bar 68 px + safe-area inset, fixed: Home · Practice · **centre button** · Mocks · CA (Current Affairs). Active tab: cl-blue-text + 600.
- Centre button: 56 px circle, cl-blue, white play icon, white 4 px ring, lifted above the bar, label "Today's mock" (HI: "आज का मॉक"); goes to today's free daily mock; if none scheduled today → Mocks list. aria-label "Start today's free mock".
- Avatar sheet (bottom sheet, focus-trapped, Esc/overlay/drag-down closes): name, My results, Mistake Vault, Profile, Language EN|हिंदी, Help, Sign out.
- Page content gets bottom padding so nothing hides behind the bar.

## 3. Exam focus
- On live attempt routes (mock/test attempt in progress): **no visitor header, no sidebar, no bottom bar**. Only the existing exam console bar. Result pages after submit use the student navigation again.

## 4. Language item (students)
- Language preference is a client-side setting (no database change in this phase). It switches to the Hindi version where one exists (landing /hi, /hi/learn lessons) and is remembered for those pages. Where no Hindi version exists, the page stays English; the menu shows a small "Hindi where available" note. No claim of full Hindi.

## 5. Accessibility & motion
- Skip link to main content on every layout; landmarks (`header`, `nav` with distinct aria-labels, `main`); visible 2 px cl-blue focus ring; all targets ≥ 48 px; menus/drawers/sheets: focus trap, Esc closes, focus returns to trigger; `prefers-reduced-motion` removes transitions. Hover 150 ms, drawer/sheet 200 ms ease-out. CLS < 0.1.

## 6. Copy (EN / HI)
Exams / परीक्षाएँ · Current Affairs / करेंट अफेयर्स · Mock Tests / मॉक टेस्ट · Learn / पढ़ाई · Sign in / साइन इन · Start free / मुफ़्त शुरू करें · Go to dashboard / डैशबोर्ड पर जाएँ · Explore exams / परीक्षाएँ देखें · Choose your exam / अपनी परीक्षा चुनें · All exams → / सभी परीक्षाएँ → · Coming soon / जल्द आ रहा है · Home / होम · Practice / प्रैक्टिस · Mocks / मॉक · Results / परिणाम · Mistake Vault / मिस्टेक वॉल्ट · Today's mock / आज का मॉक · My results / मेरे परिणाम · Profile / प्रोफ़ाइल · Language / भाषा · Help / मदद · Sign out / साइन आउट · Collapse / छोटा करें · Menu / मेनू.
Student pages are English today; HI strings are used only where a Hindi page exists.

## 7. Out of scope
Admin navigation, search, notifications, new routes (Learn index), dark mode, database changes, page content redesign.
