# BRAND-3 — Brand Colour System v3 (decision #84), phase 1

**Status:** built, gated and captured locally. **STOP for architect review** (screenshots). Phase 2 (Courage Studio Today v2 + focus review) waits for the go.

**Scope:** a site-wide palette swap (student site, admin, emails) plus the R13 study-comfort rules. No database change, no auth change, no new dependency.

## What changed

| Area | Change |
|---|---|
| Tokens (`app/globals.css`, the one source) | **Scales:** v3 primary (blue-700 `#1D4ED8` brand, blue-800 hover, blue-50 tint, navy 900, focus surround 950), accent = cyan (`#22C7DC` fill, `#0E7490` text, `#E8FAFC` tint), ink (navy `#0B1B4D`, slate `#33415C` / `#64708A`, canvas `#F7F8FC`, line `#E6E9F2`), warning = an orange scale (`#EA580C`), info = cyan.<br>**Gradient:** brand-violet `#5000F0`, gradient start / mid / end and `.brand-gradient`.<br>**No amber / yellow:** the `amber-*` / `yellow-*` namespaces are **reset**, so a stray class renders no colour; legacy `orange-*` → warning, legacy `cyan-*` → accent.<br>**Hero:** navy with cyan + violet glows; the composited worst case is gated. |
| Code | **Codemod:** 852 class tokens in 101 files, by role — amber / yellow fills → solid blue-700 with white text; tints, borders, icons → cyan; legacy warning variants → orange. Two hover mismatches and the design-system swatches were fixed by hand.<br>**Pills:** `primary` (solid blue-700, R4) · `on-dark` (white pill with blue text = the hero primary; a solid blue pill disappears into the blue hero) · `outline` (the header and secondary actions) · `ghost-on-dark`. The header never adds a second solid primary.<br>**Small fixes:** the CA "Important days" chip → categorical slate; the wordmark dot → brand gradient; the hero eyebrow dot → cyan. |
| R13 study comfort | **Exam timer:** blue normally, **orange** in the last 5 minutes, never red or flashing.<br>**A wrong answer:** a soft red tint plus a prominent **"Here's why"** at reading size (result review + practice).<br>**Reading:** text ≥ 7:1 (new contrast kind `reading`). |
| Admin | v3 status chips (IN_REVIEW blue, APPROVED cyan). Design-system preview: v3 swatches plus a **Study comfort** section (the real timer in both phases, "Here's why", chips, the gradient). |
| Emails | **Strip:** the CNTS tile → cyan gradient `#22C7DC → #0E7490`. PNGs re-rendered with a Node port of `render.py` (same viewports, 2x, the real logo); `banner.png` and `strip-main.png` came out byte-identical, only `strip-cnts.png` changed.<br>**Auth templates:** cyan wordmark dot, v3 ink / muted / canvas / line. **Owner action: re-upload the 5 templates in Supabase.** |
| Mirror | `config/brand.ts`: theme-color = blue-700, background `#F7F8FC`; the palette mirror includes the gradient violet. |
| Docs | `docs/ux/DESIGN_RULES.md`: R4 revised + **R13**. `docs/ux/DESIGN_SYSTEM.md` §1: **decision #84** (BRAND-2 kept as superseded history). Concept references: `docs/reports/ux/admin_ux_1/concept/*.png`. |

## Gates (updated to v3 exactly — none loosened)

- **BRAND-1** 8/8:
  - B-01 v3 values;
  - B-02 contrast, 114 pairs incl. the new 7:1 reading pairs;
  - B-04 mirror;
  - B-05 emails (cyan dot);
  - B-06 timer blue → orange + "Here's why";
  - B-07 R4: blue primary, no cyan CTA fill, header outline only;
  - **B-08 (new) no amber / yellow anywhere** — tokens reset, no class / hex in code, emails or email assets.
- **BRAND-2** 11/11: C-01 v3 values, C-02 cyan + violet glows composited, C-09 cyan → accent.
- **Design ratchet** 9/9:
  - R-7 theme-color = brand;
  - R-8 amber / yellow reset, orange → warning;
  - `reading` = 7:1;
  - baseline lowered: palette classes 4654 → 3381, small text 388 → 304, legacy imports 207 → 190.
- **Other gates now count the ONE blue primary / the v3 timer:** F1 / F2 / F3 / F5 / F7 / UX-FIX-1.
- **Full offline list:** 56/56 green locally.

## Screenshots (local only — `E:\CourageLibrary-Backups\brand3-captures\{before,after}\`)

- **Before:** main `fc9a2e3` (worktree, removed).
- **After:** branch `brand3-phase1`.
- **Read-only:** e-mails blanked in the DOM before every shot (0 leaks), 0 non-GET requests.
- **Pages:** home, exam page, pricing (signed out); dashboard, practice, a submitted QA result, exam page (QA student) — at 1440 / 390; admin Today, Question drafts, question reports, design system — at 1440 / 1024.
- **Mock player:** not captured as a page. A real in-progress attempt is a database write, and the last-5-minutes state would need its start time changed. Both timer states are shown with the **real `AssessmentTimer` component** in the design-system Study comfort section (`after/admin-full/`).
- **Capture tool fix:** the admin layout scrolls inside `#admin-content`, so full-page admin shots only held the first viewport. The capture tool now unrolls it (`after/admin-full/` has the full pages).

### axe (WCAG 2.0 / 2.1 / 2.2 A + AA, serious + critical; rules / nodes)

| Page | Before | After |
|---|---|---|
| `anon /` | 0 / 0 | 0 / 0 |
| `anon /exams/ssc-cgl` | 0 / 0 | 0 / 0 |
| `anon /pricing` | 0 / 0 | 0 / 0 |
| `student /dashboard` | 0 / 0 | 0 / 0 |
| `student /practice` | 0 / 0 | 0 / 0 |
| `student /mock-tests/<attempt>/result` | 0 / 0 | 0 / 0 |
| `student /exams/ssc-cgl` | 0 / 0 | 0 / 0 |
| `admin /admin` | 0 / 0 | 0 / 0 |
| `admin /admin/questions/factory` | 0 / 0 | 0 / 0 |
| `admin /admin/question-reports` | 2 / 17 | 2 / 16 |
| `admin /admin/design-system` | 0 / 0 | 0 / 0 |

**axe did not increase on any page.**

- **The unrolled admin run** (`after/admin-full/`) sees content below the fold. It shows 8 contrast nodes on the design-system page. They are all the "Aa" sample cells of the contrast table for decorative / non-text / large-text pairs: reference samples, not UI.
- **Question reports:** 21 nodes in the legacy manager, phase 3 work.

## Open / for review

- **Hero primary:** on the dark hero the primary is the **white pill with blue text** (`on-dark`), not solid blue-700. Solid blue on the blue hero is weak (≈ 2:1 against the glow). Everywhere on light surfaces the primary is solid blue-700.
- **Hero eyebrow text:** uses cyan-200 `#A1EAF2`. Cyan-300 `#5CD8E6` measured 3.85:1 over the hero text column (v3 blue-800 is lighter than the old navy-blue mid stop).
- **Owner:** re-upload the 5 auth templates.
- **Legacy pages:** dormant ones (live tests, certificates, wallet, store, achievements) now show cyan where they had amber. Their full v3 treatment is phase 3.
- **Not in this task:** dark mode = backlog DARK-MODE-1.
