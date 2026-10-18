# PUBLIC-HARDEN-1 Stage 1: history-rewrite dry run (INC-4 remediation)

> **Superseded by Stage 2** (`docs/reports/ops/PUBLIC_HARDEN1_REPORT.md`). Stage 2 re-ran the rewrite on a fresh mirror with `scratch/phase7f2_migration_baseline.json` added, the owner-approved email redaction (file contents plus author / committer email → GitHub noreply), and the regenerated commit map. The **live new HEAD is `bdd6bd6`** (this dry run's `790dfaf` was never pushed).

Phase brief: architect, 2026-10-18.
- **Decision #57:** the repository stays public.
- **Decision #58:** rewrite history to remove the INC-4 paths.
- **New rule:** no real personal data in the repository, ever.
- The legacy project is handled by the owner; this work never connects to it.
- CI-1's first run stays on hold.

**Stage 1 changed nothing on `origin` and nothing in the working repository's history.** All work was done on a fresh mirror clone in a scratch directory.

## 1. Tooling and mirror

- **git-filter-repo 2.47.0** (internal id `a40bce548d2c`), installed with `python -m pip install --user git-filter-repo==2.47.0`, a one-off ops tool allowed by the ruling. No npm dependency. git 2.56.0.
- **Fresh mirror:** `git clone --mirror https://github.com/Courage-Library/couragelibrary-next.git`.
  - Refs: **only `refs/heads/main`**; no tags, no notes.
  - The remote advertises no other refs: `git ls-remote` returns only `HEAD` and `refs/heads/main`, and there are **no `refs/pull/*`**, so no pull request ever existed.
  - 181 commits; HEAD `62a77a1`, tree `514c9c9…`.
- The rewrite ran on a **local copy** of the mirror, so the pristine mirror stays available for comparison and rollback.

## 2. Purge list (confirmed from history; nothing else)

| Path | Why |
|---|---|
| `scratch/legacy_raw_inventory.json` | legacy data sample containing personal data (INC-4) |
| `scratch/dry_run_migration.js` | legacy-project connection details |
| `scratch/execute_zero_data_loss_migration.js` | legacy-project connection details |
| `scratch/extract_legacy_database_inventory.js` | legacy-project connection details |
| `scratch/inspect_legacy_all_tables.js` | legacy-project connection details |
| `scratch/select_pilot_subset.js` | legacy-project connection details |
| `supabase/.temp/` (whole directory, 9 files) | Supabase CLI temp files (project ref / region / pooler host) |

The history-wide scan covered every path in every commit (2,601 blobs). Only the 6 `scratch/` paths above held the legacy connection details or personal data. 36 other `scratch/` paths (since deleted) hold neither and are **not** purged.

**For the architect: optional or out of scope (not purged).**

| Item | Content | Recommendation |
|---|---|---|
| `scratch/phase7f2_migration_baseline.json` (history only) | the legacy project's **URL** (project id); no key, no personal data | optional: add it to the purge list if the architect wants the legacy URL gone from history. Re-running is cheap; it only changes this one path |
| `supabase/migrations/20260825000025_phase3l_community_discussions.sql` (**at HEAD**) | one comment line naming the legacy project id (no key) | leave it: it is at HEAD (the HEAD tree must stay identical) and an applied migration (ledger checksum); the id alone is not a credential |
| older versions of `services/admin.service.ts`, and two docs / tests at HEAD | the **owner's own** email address used as an admin-email test value | HEAD values are replaced in Stage 2 (a); historical copies stay (owner's own address, not user data). Optional: a `--replace-text` pass could redact them in history too |
| `scratch/backup_user_<uuid>_….json` (history) | user UUIDs plus wallet / ledger rows; no email, name or phone | not personal data by direct identifiers; not purged |

## 3. The run

```
git clone --mirror -q mirror.git rewritten.git
cd rewritten.git
python -m git_filter_repo --invert-paths --paths-from-file ../purge-paths.txt \
       --prune-empty never --prune-degenerate never
```

- `--prune-empty never` / `--prune-degenerate never` keep **every commit**, including commits whose only change was a purged path, so the history stays 1:1 and the commit map is complete.
- filter-repo's `commit-map` (old → new, all 181) and `ref-map` are kept in the mirror's `filter-repo/` directory on the owner's machine (scratch). The cited subset is in `docs/ops/COMMIT_MAP.md`.

## 4. Verification of the rewritten mirror

| Check | Result |
|---|---|
| HEAD tree vs current `origin/main` HEAD tree | **identical**: `514c9c9fa5ec8c5c871978c1950490df5c203145` both; `git diff --stat` empty |
| Commit count | **181 → 181** |
| Author and committer (name, email, date) on every commit | **identical** (field-by-field comparison over all 181) |
| Commit messages | identical except **3**: filter-repo rewrote the short SHAs cited inside those messages to the new SHAs (`03a44b8`→`80830d4`, `a17f6e0`→`2dd7210`, `bf91244`→`489c681`). This keeps the references valid. To keep the old SHA text instead, re-run with `--preserve-commit-hashes` (architect's choice) |
| Purged paths reachable in any commit | **0** |
| `.gitattributes` / LF rules | intact (part of the identical HEAD tree; historic trees differ only by the purged paths) |
| Tags / notes / other refs | none exist; `refs/heads/main` only |
| **PUBLIC-REPO-1 history scan, re-run on the rewritten mirror** | **0 real secrets; 0 `.env*` files; 0 legacy anon keys (was 10); 0 JWTs at all; 0 personal-data field dumps (was 1 file); 0 `supabase/.temp` paths**. Remaining hits are expected: the current publishable key in `.env.example` (public by design), 3 fake / placeholder self-test values, and the 28 password-pattern hits, which are all code expressions |
| Legacy project id (checked against the id taken from the pristine mirror, so the check is not vacuous) | remains only in the two items of §2 "optional / out of scope" |

**Every SHA changes.** The root commit (`9ce57e3`, the first commit of the repository) already contained `supabase/.temp/`, so the rewrite starts at the root. The new HEAD will be `790dfaf`, with the same tree as today's `62a77a1`.

## 5. Commit map

`docs/ops/COMMIT_MAP.md` maps old → new for the **46 commit SHAs cited** in `docs/**` and the root-level docs (285 files scanned; 0 unmapped). No personal data; SHAs and dates only.

**Constraint:** the map and the new SHAs are valid only if **nothing is pushed to `origin/main` between this dry run and Stage 2.** If anything is pushed, Stage 2 starts by re-running Stage 1, and only commits after the push get new map entries.

## 6. Impact

| Area | Impact | Action |
|---|---|---|
| **Vercel** | Git integration deploys the new `main` HEAD (`790dfaf`, identical tree) after the force-push. Existing deployments keep pointing at old SHAs (harmless) | Stage 2: `wait-for-deploy … 790dfaf`, then the anonymous production smoke |
| **`wait-for-deploy`** | compares `/api/health` version with the short SHA; works with the new SHA | none |
| **Branches / refs on GitHub** | only `main`; no tags, no PRs | none |
| **Branch protection** | unknown: the read-only GitHub API returned 403 (unauthenticated rate limit) | owner checks **Settings → Branches / Rules**. If `main` is protected against force-push, lift it for the push and restore it right after (Stage 2) |
| **Forks** | **unknown** (API 403). A fork made before the rewrite keeps the old history, and the rewrite cannot reach it | owner checks the **Forks** count on the repository page. If > 0, list them in the GitHub Support request |
| **Cached views / old commit URLs** | GitHub may keep serving old commits by SHA until garbage-collected | GitHub Support request (§7) |
| **Local clones** (owner machine, `E:\Courage Library`) | old history stays locally until re-synced | commands below |
| **CI** | the workflow is not triggered (dispatch-only, on hold) | none |
| **Migration ledger** | stores file names and checksums, not commit SHAs | none |
| **Reports / memory citing old SHAs** | resolvable through `docs/ops/COMMIT_MAP.md` | none |

**Re-sync the owner's working copy after Stage 2's force-push.** Run in Git Bash in `E:\Courage Library`. `.env.local` and the local-only reports are untracked and are not touched.

```bash
git status --short
git fetch origin
git reset --hard origin/main
git reflog expire --expire=now --all
git gc --prune=now
git log -1 --format=%h
```

- `git status --short`: expect only untracked files. If any tracked file shows as modified, stop and ask.
- `git reset --hard origin/main`: the working tree is identical, since the tree is unchanged.
- `git reflog expire` and `git gc`: drop the old objects from the local repository.
- `git log -1 --format=%h`: expect `790dfaf`.

Any other clone (for example on another machine): delete it and clone fresh.

## 7. Draft: GitHub Support "sensitive data removal" request

> **Subject:** Sensitive data removal: purge cached commits after history rewrite — Courage-Library/couragelibrary-next
>
> Hello GitHub Support,
>
> We have rewritten the history of our public repository **Courage-Library/couragelibrary-next** (branch `main`, force-pushed on <DATE>) to remove files that contained personal data and connection details for a decommissioned system. We used git-filter-repo. The current tree is unchanged; only the following paths were removed from all commits:
>
> - `scratch/legacy_raw_inventory.json`
> - `scratch/dry_run_migration.js`
> - `scratch/execute_zero_data_loss_migration.js`
> - `scratch/extract_legacy_database_inventory.js`
> - `scratch/inspect_legacy_all_tables.js`
> - `scratch/select_pilot_subset.js`
> - `supabase/.temp/` (directory)
>
> The old commits that contained these files include (old SHAs):
> - `9ce57e3` (root; `supabase/.temp/`)
> - `8889430` (scratch files added)
> - `7377a9f` (scratch files deleted)
> - `d6da78a`, `5bf01d2`, `ed380ae` (`supabase/.temp/` changes / removal)
> - plus every commit between `9ce57e3` and `62a77a1` (all 181 old commits on `main` are superseded)
>
> Please **purge cached views and garbage-collect the unreferenced objects** for these old commits, and remove any references to them in pull requests or caches (we have no pull requests; forks: <N / none>).
>
> We have no other branches or tags. Thank you.

The request contains no personal data and no credential; it names commits and paths only.

## 7a. Gates

No code changed in Stage 1.

**Local, uncommitted files:** `docs/ops/COMMIT_MAP.md` and this report. Both are committed in Stage 2, after the force-push. The PUBLIC-REPO-1 report remains local-only.

## 8. Stage 2 (pending): only after the owner writes "GO force-push" and the architect relays it

1. Re-check that `origin/main` is still `62a77a1`; otherwise re-run Stage 1.
2. Lift branch protection if present.
3. `git push --force` the verified `rewritten.git` `main`.
4. Restore branch protection.
5. Verify the `origin/main` tree is `514c9c9…`, the Vercel deploy of `790dfaf` is green, and the anonymous production smoke passes.
6. Then normal commits:
   - (a) replace the personal test emails at HEAD with `*.test` identities;
   - (b) CI public hardening (no artifact upload; ID + PASS / FAIL + counts only; captured output scanned before printing; no server-log tail; security gates print IDs);
   - (c) remove the SECDEF Stage 1 narrative report, leaving a short public summary;
   - (d) the new permanent gate `scripts/test_no_personal_data.cjs` with a self-test.

PUBLIC-HARDEN-1 Stage 1 status: READY-FOR-OWNER-GO
