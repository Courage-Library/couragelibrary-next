# Release checklist: feat/home-1 → main

Run this only when the owner says **"release"**. Until then everything stays local (LOCAL-FIRST rule).

## 0. What ships

`main` is at `84458a7` and is the merge-base, so this is a **fast-forward** (no merge commit).

| Commit | What |
| --- | --- |
| `a101de6` | HOME-1 Phase A: landing audit + categories proposal; LOCAL-FIRST rule in the runbook |
| `b713b27` | Phase B: exam categories (128), category pages, landing redesign, sized logo copies |
| `9f9921f` | Owner decisions: compact phone layout; Settings › Home page photo (129) |
| `15d7773` | BUILD-FONT-1 self-hosted fonts + owner UI review fixes |
| `a792f79` | UX-2a L-10 re-pointed to the category model |
| *(this file)* | Release checklist |

## 1. Before pushing

- [ ] Working tree clean on `feat/home-1`; `git log --oneline main..feat/home-1` shows exactly the commits above.
- [ ] Migrations 128 + 129 are already applied. Re-check that the ledger shows both `APPLIED` and nothing pending (read-only query on `public.schema_migration_ledger`). Last checked on 2026-11-01: both `APPLIED`, 129 files, none pending. **No new migration ships, so no backup step is needed.**
- [ ] Local: full offline list (81/81), `npx tsc --noEmit`, lint, `npm run build`. Note that `/` must be ≤ 110 kB.
- [ ] No queued CI dispatch (a push cancels a pending dispatch).

## 2. Ship and CI (one run)

- [ ] `git checkout main && git merge --ff-only feat/home-1 && git push origin main`
- [ ] The push run covers the offline list, server-checks (including UX2A-LIVE with the new L-10, BRAND-2 P-01/P-02, HOME-1) and prod smoke.
- [ ] Live gates touched by 128 / 129 / HOME-1 (EXAM-CATEGORIES-LIVE, SITE-MEDIA-LIVE, EXAM-LOGO-1 live, SEC1B / SEC1C) need **one** `workflow_dispatch` with `live: true` on `main`. Dispatch it after the push run has finished; never push while it is queued.
- [ ] Classify any failure using the server log before retrying (at most 3 attempts).

## 3. After deploy (production, anonymous only; never sign in to prod)

- [ ] The production HTML for `/` has `<link rel="preload" ... as="font">` for exactly one file: the Poppins 700 Latin `…-s.p.woff2`. A local Windows build cannot show this because of the Next manifest path bug, so a Linux build must be checked.
- [ ] `/` first-load JS ≤ 110 kB (CI front-end budget); fonts on `/` ≤ 160 KB, with no Devanagari file.
- [ ] Prod anonymous smoke: `/` → 200, one h1, the category tiles (SSC = link with "1 exam", the others "Coming soon").
- [ ] `/exams` and `/exams/ssc` → 200; SSC CGL is listed as a link; the other category pages show "Coming soon" with no broken links.
- [ ] Header shows the CL monogram and menu at 390 and 1280; footer accordions on phones; legal links read "Privacy" and "Terms" (pages still show the draft notice).
- [ ] FAQ opens and closes (chevron turns, expanded state toggles); "Free during early access." appears under the final CTA.
- [ ] The production HTML of `/`, `/exams` and `/exams/ssc` contains **no storage host**; logos, icons and the photo come only from same-origin `/media/logos/…`.

## 4. Reminders for the owner

- **Create new exams only after this release.** The exam form now needs a category (selector). Before release, the production admin puts a new exam in the hidden **Internal** category.
- Upload the real home page photo in **Settings › Home page photo** after release. This is optional; without it the section stays text-only.
- Category icons can be uploaded in **Exams › Categories**. Until then the built-in line icons are used.
