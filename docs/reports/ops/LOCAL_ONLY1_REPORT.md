# LOCAL-ONLY-1: two local-only reports published by commit 221898e

**Owner instruction:** 2026-10-21. The repository is public (#57). This report is public-safe: paths and process only, no content of the leaked files.

## 1. What happened

| Item | Detail |
|---|---|
| Commit | `221898e` (author: owner account, 2026-10-21 14:53 +0530), pushed to `main` |
| Wanted content | the CI-1 prod-smoke fix (5 files) |
| Also added | two files that must never be tracked: `docs/reports/auth/AUTH1_STAGE1_LOCAL_FINDING.md` and `docs/reports/ops/PUBLIC_REPO1_REPORT.md` |
| Their content | a security finding (since fixed in `02bc441`) and a repository-exposure audit |

## 2. Root cause

**The commit equals the whole working tree.** `221898e` contains exactly the 5 modified files plus the **only two untracked files** in the working tree at that moment. That pattern fits a "stage all" (`git add -A`, `git add .`, or an editor's "Stage All Changes"), followed by a commit with an editor-generated message: two conventional-commit subjects joined into one line.

**The exact commands cannot be recovered.** The reflog shows only `commit:` (no amend, no rebase), and shell or editor history is not stored in the repository.

**Underlying cause (agent process, not the owner):**
- Both files were kept **untracked but not git-ignored**.
- The safeguard was an "explicit paths only" rule that bound only the agent's own commits. Nothing stopped a stage-all by anyone else.
- `test_no_personal_data` passed because neither file contains email addresses, phone numbers or data dumps: wrong class of check.

## 3. Fix

| Step | Status |
|---|---|
| Untracked both files (local copies kept), git-ignored them and a `docs/reports/**/*_LOCAL*.md` pattern | `8a660a0`, pushed immediately |
| **Permanent gate** `scripts/test_no_local_only_tracked.cjs`: checks the git index (tracked + staged) against `docs/ops/LOCAL_ONLY_PATHS.txt` (paths only) and the `*_LOCAL*` pattern; also requires every listed path to be git-ignored. `--self-test` plants fake files in a throwaway repo. Run against `221898e`'s tree it flags exactly the two files. | added to the CI offline job (`NO-LOCAL-ONLY`, `LOCAL-ONLY-SELFTEST`) and `PERMANENT_GATES.md` |
| **Opt-in pre-commit hook** `.githooks/pre-commit`: refuses a commit that stages a local-only file. Tested: blocks a staged planted file, passes once it is removed. | owner: `git config core.hooksPath .githooks` once per clone |
| **Procedure** (`PERMANENT_GATES.md`): explicit paths only, never stage-all with untracked files present; a local-only file is listed **and** git-ignored the moment it is created | recorded |

## 4. History purge

Removing the files from HEAD does not remove them from history.

**Stage 1: dry run, DONE 2026-10-21.**
- Method (PUBLIC-HARDEN-1): a fresh `--mirror` clone of `origin` (HEAD `9daa72d`), kept pristine; a copy rewritten with git-filter-repo `a40bce548d2c`.
  - `--invert-paths` on exactly the two paths;
  - `--prune-empty never --prune-degenerate never` (1:1 history).
- Nothing was pushed.

| Check | Result |
|---|---|
| HEAD tree vs post-untrack HEAD (`9daa72d`) | **identical** (`396eb59`) |
| Commit count | 194 → 194 |
| Purged paths reachable | 0 commits (pristine: 2) |
| Distinctive strings from both files (pickaxe over all history) | 0 (pristine: 2 each) |
| Author / committer names, emails, dates | identical on every commit |
| Commits whose SHA changed | 3: `221898e` → `1be5d74`, `8a660a0` → `30787eb`, `9daa72d` → `9caab75`; all earlier SHAs unchanged |
| Commit messages | 3 lines changed, each only by a cited-SHA update |
| Personal-data / secret scans | HEAD tree identical to the scanned HEAD; the purge only removes content |

**Stage 2: force-push, on the owner's "GO force-push" after the legacy project is locked down.**
- Any commit pushed after `9daa72d` also changes SHA, so Stage 1 is **re-run** on a fresh mirror immediately before Stage 2.
- Push with `--force-with-lease` against the then-current `origin/main`.
- `docs/ops/COMMIT_MAP.md` gets a LOCAL-ONLY-1 section regenerated from filter-repo's commit-map.
- Then ask GitHub Support to purge cached views of the removed paths.

**Owner actions** (outside the repository; details are in the local-only audit):
- lock down the legacy project;
- request a GitHub cache / fork purge after the history rewrite.

The force-push waits for the owner's "GO force-push".
