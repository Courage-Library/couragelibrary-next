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

Stage 1 is a dry run on a fresh mirror; it follows in a separate report section. Removing the files from HEAD does not remove them from history.

**Owner actions** (outside the repository; details are in the local-only audit):
- lock down the legacy project;
- request a GitHub cache / fork purge after the history rewrite.

The force-push waits for the owner's "GO force-push".
