# PUBLIC-HARDEN-1: INC-4 remediation (history rewrite, public-repo hardening)

Phase brief: architect, 2026-10-18 (Stage 2 "GO force-push", owner approved). Decisions:
- **#57:** the repository stays public.
- **#58:** rewrite history.
- **Rule:** no real personal data in the repository, ever.
- The legacy project is handled by the owner; this work never connects to it.
- CI-1's first run stays on hold.

**Owner checks** (answered in chat):
- forks: **0**;
- branch protection on `main`: **none**;
- **email redaction in history: YES**;
- author / committer email: **rewrite to the owner's GitHub noreply address** (keeps commits linked to the account).

## 1. Rewrite (fresh mirror; git-filter-repo 2.47.0)

**Removed from all history (8 entries):**
- `scratch/legacy_raw_inventory.json`
- `scratch/dry_run_migration.js`
- `scratch/execute_zero_data_loss_migration.js`
- `scratch/extract_legacy_database_inventory.js`
- `scratch/inspect_legacy_all_tables.js`
- `scratch/select_pilot_subset.js`
- `scratch/phase7f2_migration_baseline.json` (added by the ruling)
- `supabase/.temp/` (the whole directory)

**Email redaction** (`--replace-text`, case-insensitive, all history): 3 personal webmail addresses, replaced with reserved `.test` placeholders. The addresses themselves are not reproduced here.

| Label | Where | Replaced with |
|---|---|---|
| G1 (owner) | admin-email tests / old service code | `owner@couragelibrary.test` |
| G2 (owner) | the same `ADMIN_EMAILS` tests | `owner2@couragelibrary.test`, kept distinct so a two-entry admin list keeps its meaning |
| G3 | a *non-admin* "candidate" test value in one test and one audit doc | `student@couragelibrary.test`. This is a stated extension beyond "the owner's address": mapping it to the owner address would have flipped a non-admin test into an admin one, and the new rule forbids a possibly real address in public history |

**Commit metadata:**
- The owner's Gmail was the author **and** committer email on all 181 commits.
- With the owner's choice it is mapped (`--mailmap`) to the owner's **GitHub noreply** address.
- Names and dates are unchanged.

**Flags kept:**
- `--prune-empty never --prune-degenerate never`: 1:1 history.
- Commit-message SHA updates kept: no `--preserve-commit-hashes`.
- The HEAD migration comment naming the legacy project id is unchanged (ruling).

## 2. Verification of the rewritten mirror (before pushing)

| Check | Result |
|---|---|
| HEAD diff vs `62a77a1` | **exactly the address replacements**: 2 files changed (`docs/audits/phase3h4_2_production_boundary_verification.md`, `scripts/test_phase3h4_2_production_boundary_verification.cjs`); each new file equals the old file with only the replacements applied; 0 files added / removed |
| Commit count | 181 → 181 |
| Author / committer names and dates | identical on every commit |
| Author / committer email | 362 of 362 personal-Gmail entries → GitHub noreply; 0 other changes |
| Commit messages | 3 changed, by cited-SHA updates only |
| Purged paths reachable | 0 commits |
| Personal webmail anywhere (content, messages, metadata) | 0 |
| Legacy project id, checked with the id from the pristine mirror (non-vacuous) | only the HEAD migration comment (×1) |
| JWTs anywhere | 0 |
| PUBLIC-REPO-1 secret scan | 0 real secrets, 0 `.env*` files. Remaining: the current publishable key in `.env.example` (public by design), 3 fake / placeholder self-test values, 28 code-expression "password" hits |
| `.gitattributes` / refs | unchanged / only `refs/heads/main` |

**Verdicts: 12/12 PASS.**

## 3. Force-push

1. Immediately before each attempt: `origin/main` = `62a77a1`, equal to the pristine mirror.
2. `git push --force-with-lease=main:<62a77a1 full SHA> … main:main` from the verified mirror.
3. **Attempt 1:** HTTP 408 during the upload (network). **Attempt 2:** could not connect (network). Neither changed `origin`.
4. **Attempt 3:** `+ 62a77a1...bdd6bd6 main -> main (forced update)`.
5. No branch protection, so no toggle was needed.

**After the push:**
- `origin/main` = **`bdd6bd6`**, tree `98292a4` (the verified tree).
- The working repository was re-synced (`reset --hard origin/main`, reflog expired, `gc --prune=now`): the old objects are gone locally.
- `wait-for-deploy bdd6bd6` → **deployed (200)**.
- Anonymous production smoke: **all passed** (project-ref scan: 1 document + 11 chunks).

`docs/ops/COMMIT_MAP.md` maps the 46 old SHAs cited in the docs to the new SHAs.

## 4. Stage 2 commits on top of `bdd6bd6`

| Item | Change |
|---|---|
| **(a)** personal emails at HEAD | Already handled by the history-wide replacement (§1): 0 personal addresses at HEAD. The new gate also flagged one `@test.com` fixture (a real, registered domain) in a legacy script → replaced with `admin@exam-cleanup.test` |
| **(b)** CI public hardening (`.github/workflows/ci-gates.yml`) | see the list below |
| **(c)** SECDEF narrative | `docs/reports/sec/SECDEF_AUDIT_STAGE1_REPORT.md` removed from HEAD and replaced by `docs/reports/sec/SECDEF_AUDIT_STAGE1_SUMMARY.md` (one paragraph, no open-finding detail). `scripts/secdef/allowlist.json` is kept (the ratchet needs it). The narrative remains in history, since the ruling asked for HEAD only |
| **(d)** new permanent gate `scripts/test_no_personal_data.cjs` | see the list below |

**(b) CI public hardening:**
- **No artifact upload.**
- Every gate runs through the new **`scripts/ci/run-quiet.cjs`**: output is captured to the runner's temp dir and log-scanned **before** anything is printed. Only `<ID> PASS|FAIL exit n — passed x/y · fail-lines · warns · failing [check IDs]` is printed, so security gates print check IDs only. Any scan hit means FAIL with the output withheld.
- `CI_QUIET=1` makes `with-server.cjs` never print the server-log tail.
- Server logs are kept outside the scanned directory and never printed.
- No `tee`. The final log scan covers all captured outputs.
- Still dispatch-only, actions pinned by SHA.

**(d) The no-personal-data gate:**
- Scans all tracked text files (1,233) for email addresses outside a reviewed allow-list, Indian-mobile / E.164 phone numbers, and JSON data-dump shapes. It prints file + class + count only, and requires ≥ 500 files scanned.
- The allow-list: support@, `*.test`, `example.*`, the special-use `.local` / `.internal`, the 7 listed `@couragelibrary.com` role / fixture addresses, `noreply@anthropic.com`, `git@github.com`, the GitHub Actions bot address, GitHub noreply addresses, and the 2 open-redirect vectors pinned to their SEC-1D files.
- `--self-test`: planted webmail, phone and data-dump shapes are caught; allow-listed values, UUIDs and timestamps pass; empty input fails.

**Tests:**
- `scripts/ci/test_ci_scripts.cjs` adds C-7 to C-10: run-quiet prints one summary line and no detail; a planted secret is withheld and FAILs; with-server is quiet under `CI_QUIET`; the workflow is public-safe (no artifact, no `tee`, all 55 gate lines wrapped, 6 actions pinned, dispatch-only).
- `docs/testing/PERMANENT_GATES.md` updated.

## 5. Gates (local)

| Gate | Result |
|---|---|
| Offline set, run exactly as CI does (`run-quiet`, `CI_QUIET=1`): TSC, LINT, CI-SUPPORT 10/10, NO-PERSONAL-DATA (1,233 files, 0 findings), NO-RUNTIME-DB 5/5, DESIGN-RATCHET 8/8, UX1B 7/7, QF1-OFFLINE 73/73, SEC-1B 26/26, SEC-1C 22/22, SEC-1D 14/14, QBKEY1 5/5, DRILL1 2/2, SYL-IMPORT-1 32/32, READERS 3/3, EDITOR 5/5, UX2A 10/10, TYPES1 9/9, ref-scan and no-personal-data self-tests | **all PASS** (TSC / LINT first showed exit `-4058`: Windows could not resolve `npx` / `npm` without a shell. Fixed in `run-quiet`; on Linux runners commands still run without a shell) |
| Log scan of the captured outputs | OK, 0 findings |
| Build | OK |

## 6. For the owner

**(i) Re-sync any other local clone** (this machine is already re-synced). In Git Bash:

```bash
git status --short
git fetch origin
git reset --hard origin/main
git reflog expire --expire=now --all
git gc --prune=now
git log -1 --format=%h
```

- `git status --short`: expect only untracked files. If a tracked file shows as modified, stop and ask.
- `git log -1 --format=%h`: shows the current `main` head.

Any clone on another machine: delete it and clone fresh.

**(ii) GitHub Support "sensitive data removal" request.** Submit it at **https://support.github.com/contact** (choose the account / repository and the topic for removing sensitive data). The text contains no personal data and no credential:

> **Subject:** Sensitive data removal — purge cached commits after a history rewrite — Courage-Library/couragelibrary-next
>
> Hello GitHub Support,
>
> We rewrote the history of our **public** repository **Courage-Library/couragelibrary-next** and force-pushed `main` on 2026-10-18 (old HEAD `62a77a1` → new HEAD `bdd6bd6`). We used git-filter-repo to remove files containing personal data and connection details for a decommissioned system, and to remove a personal email address from file contents and commit metadata.
>
> **Paths removed from all commits:**
> - `scratch/legacy_raw_inventory.json`
> - `scratch/dry_run_migration.js`
> - `scratch/execute_zero_data_loss_migration.js`
> - `scratch/extract_legacy_database_inventory.js`
> - `scratch/inspect_legacy_all_tables.js`
> - `scratch/select_pilot_subset.js`
> - `scratch/phase7f2_migration_baseline.json`
> - `supabase/.temp/` (directory)
>
> **Old commits that are now unreferenced and should be purged** (old SHAs):
> - `9ce57e3` (root commit; `supabase/.temp/`)
> - `8889430` (scratch files added)
> - `7377a9f` (scratch files deleted)
> - `d6da78a`, `5bf01d2`, `ed380ae` (`supabase/.temp/` changes and removal)
> - `0372db5`, `cc068ec`, `0eeb6d4` (files that contained the personal email address)
> - and **every commit from `9ce57e3` through `62a77a1`**: all 181 old commits on `main` are superseded, because the author / committer email was rewritten on all of them.
>
> Please purge the cached views of these commits and garbage-collect the unreferenced objects. The repository has **no forks, no pull requests, no other branches and no tags**.
>
> Thank you.

**Still with the owner:** the legacy Supabase project (lock down / pause it, rotate its JWT secret). **CI-1 stays on hold** until the architect lifts it. The workflow is now public-safe; adding the secrets and doing the first dispatch is the next step.

PUBLIC-HARDEN-1 status: CLOSED
