# Commit map: PUBLIC-HARDEN-1 history rewrite (#58)

The public history of `main` was rewritten once (PUBLIC-HARDEN-1 Stage 2). The rewrite removed INC-4 paths, replaced personal email addresses in file contents with `*.test` placeholders, and set the commit author / committer email to the GitHub noreply address.

- **Every commit SHA changed.** The root commit `9ce57e3` was affected.
- **Unchanged:** authors' names, dates, commit count (181) and content.
- **Only HEAD content difference:** the address replacements in two files.
- Old HEAD `62a77a1` → new HEAD `bdd6bd6`.

This table maps every old short SHA cited in `docs/**` and the root-level docs to its new SHA, so older reports stay traceable. It was generated from git-filter-repo's commit-map; the full 181-entry map is kept in the owner's local mirror.

| Old | New | Date | Cited in (files) |
|---|---|---|---|
| `20b0135` | `a0e31f0` | 2026-09-08 | 1 |
| `b13c4ea` | `a2388bf` | 2026-09-10 | 1 |
| `b8bd693` | `f5f6977` | 2026-10-02 | 2 |
| `f4e258e` | `dab64c4` | 2026-10-12 | 1 |
| `8c23e3f` | `7103039` | 2026-10-12 | 1 |
| `0372db5` | `6c0bdc4` | 2026-10-12 | 1 |
| `9e2d9b4` | `25a3230` | 2026-10-13 | 1 |
| `d541c2d` | `3ad7948` | 2026-10-13 | 1 |
| `b1cdcf6` | `1c676b2` | 2026-10-13 | 1 |
| `10c52ff` | `765d1ba` | 2026-10-13 | 1 |
| `2a978b2` | `9ed4ad4` | 2026-10-13 | 1 |
| `69f98d3` | `0635ca2` | 2026-10-13 | 1 |
| `d4077e5` | `219daf6` | 2026-10-13 | 1 |
| `5ea60f4` | `33583e1` | 2026-10-15 | 2 |
| `ac909e3` | `d4ec047` | 2026-10-15 | 2 |
| `a17f6e0` | `1be8e8b` | 2026-10-15 | 1 |
| `dc8e885` | `65f1e97` | 2026-10-15 | 1 |
| `ed380ae` | `fea1b56` | 2026-10-15 | 1 |
| `8ef9bf7` | `11374e2` | 2026-10-15 | 2 |
| `e4b3e4c` | `bb34f85` | 2026-10-15 | 1 |
| `9826eed` | `b469809` | 2026-10-15 | 1 |
| `763459a` | `8414cc2` | 2026-10-15 | 1 |
| `94700f0` | `0a006d1` | 2026-10-15 | 1 |
| `9569ac2` | `5027a15` | 2026-10-16 | 2 |
| `5f6f2c9` | `ec59697` | 2026-10-16 | 1 |
| `64a040b` | `3135c67` | 2026-10-16 | 1 |
| `24c431b` | `70b7853` | 2026-10-16 | 2 |
| `daf8441` | `b67cb04` | 2026-10-16 | 2 |
| `d91e0d3` | `21fa2df` | 2026-10-16 | 2 |
| `0cfae8d` | `48ee51e` | 2026-10-16 | 1 |
| `bea0dc6` | `b265db2` | 2026-10-16 | 1 |
| `b864978` | `6dc2623` | 2026-10-16 | 1 |
| `2c6f91b` | `82fc40e` | 2026-10-16 | 1 |
| `76bc99f` | `c5e774a` | 2026-10-16 | 1 |
| `e269b95` | `69878d0` | 2026-10-16 | 1 |
| `59edf3f` | `9fdaa44` | 2026-10-16 | 1 |
| `0ef827f` | `f7a8d4f` | 2026-10-16 | 1 |
| `dd8b305` | `50be949` | 2026-10-17 | 3 |
| `8203df0` | `5375d45` | 2026-10-17 | 2 |
| `97452f7` | `6ba7765` | 2026-10-17 | 2 |
| `078ce6f` | `fe10c4c` | 2026-10-17 | 1 |
| `03a44b8` | `a09f797` | 2026-10-17 | 1 |
| `8a31644` | `d9084c5` | 2026-10-17 | 1 |
| `8aa9f24` | `a76a670` | 2026-10-17 | 1 |
| `77ed801` | `9f622d7` | 2026-10-18 | 1 |
| `dc0f190` | `e53900e` | 2026-10-18 | 1 |

## LOCAL-ONLY-1 history rewrite (2026-10-22)

Two local-only files, added by mistake in `221898e`, were removed from **all** history (git-filter-repo `--invert-paths`).

**Flags:** `--prune-empty never --prune-degenerate never --preserve-commit-hashes`.
- Commit count is unchanged (198), as are authors, committers, dates and **messages, byte for byte**.
- Messages therefore still cite the old SHAs; translate them with this table.
- The final tree is identical (`96d8842`), so there is no content change at HEAD.
- Only the commit that added the files and its descendants changed SHA; every commit from `14fe94f` down is unchanged.

- Old `main`: `7710eb3db74f` → new `main`: `1c2db2bc0f31` (force-pushed with lease).

| Old | New | Date | Subject |
|---|---|---|---|
| `7710eb3` | `1c2db2b` | 2026-10-21 | docs(ux-2b): production visual review (360 / 1440, axe) + CNTS duplicate heading |
| `1b36848` | `84a5bba` | 2026-10-21 | fix(ux-2b): coming-soon hub for listed exams whenever not FOUND (anonymous RLS hides inact |
| `5fcac5d` | `f0c4b35` | 2026-10-21 | feat(ux-2b): public pages in the UX-2a look; /premium -> /pricing; honest copy fixes |
| `57d189d` | `41f6d2d` | 2026-10-21 | ci(ci-1): enable push trigger on main (code changes; docs-only skipped); close SECDEF-S2-2 |
| `9daa72d` | `2724209` | 2026-10-21 | test(local-only-1): guard against tracking local-only files; root cause of 221898e |
| `8a660a0` | `effe888` | 2026-10-21 | chore(security): untrack local-only reports published by 221898e |
| `221898e` | `1be5d74` | 2026-10-21 | feat(ci): enhance run-quiet with self-test and safe diagnostic tokens; add public URL ref  |
| `14fe94f` | `14fe94f` (unchanged) | 2026-10-20 | fix(secdef-s2-2): revoke unused client EXECUTE on 33 SECURITY DEFINER functions (090) |
| `02bc441` | `02bc441` (unchanged) | 2026-10-20 | feat(auth-1): stage 2a: app_metadata-only roles, insert-only profiles, /auth/confirm, erro |
| `bc4f520` | `bc4f520` (unchanged) | 2026-10-20 | docs(auth-1): Stage 1 forensics + design report (read-only) |
| `b6a533c` | `b6a533c` (unchanged) | 2026-10-20 | fix(ux-2b.h2): remove unbacked official/verified claims; CA canonical tier labels; plain m |
| `ec580b1` | `ec580b1` (unchanged) | 2026-10-19 | fix(ux-2b.h): honest copy: pricing payments-off variant, CA empty states, no 'official', r |
| `165c605` | `165c605` (unchanged) | 2026-10-19 | feat(ux-2b.3): mistakes + practice: P0 a11y/dead CTA fixes, honest stats, design-system mi |
| `bf2672b` | `bf2672b` (unchanged) | 2026-10-19 | chore(ux-t0): design skills calibration + design audit |
| `ccd6465` | `ccd6465` (unchanged) | 2026-10-18 | test(public-harden-1): no-personal-data permanent gate; commit map + reports |
