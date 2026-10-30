# CI-SPEED-1 — sharded live gates, per-suite caps, fail-fast pages

Architect ruling: 2026-10-29. The interim live-gates limit (45 → 60 min) is replaced by this design.

## Measured baseline

**Dispatch 40919071379** (mig/125, 5f4c0ec, ubuntu-24.04):

| Part | Time |
|---|---|
| live-gates job | 45 min (setup + build ≈ 2 min; 41 gates in sequence ≈ 43 min) |
| live-journeys job | 10 min of gates |

The per-gate seconds are recorded in `scripts/ci/live-gate-caps.json` (`measured`).

## a. Shards (one matrix job, `live-gates`, 3 shards)

Each shard has its own runner, local server, QA session cache and time limit.

| Shard | Gates | Gate time (measured) | Limit |
|---|---|---|---|
| **db** | 15 | ≈ 25 min | 40 min |
| **security** | 13 | ≈ 12 min | 25 min |
| **pages** | 9 | ≈ 7 min | 20 min |

`live-journeys` (≈ 10 min, limit 45) is unchanged and still runs in parallel.

- **Expected wall-clock:** ≈ 27 min (the db shard + build), down from 45. **The ≤ 25 min target is not met yet;** see "Residual" below.

### Isolation: why these shards cannot interfere (LIVE-LOCK-SAFETY)

Every live write happens inside a rolled-back transaction with `lock_timeout = 3 s`. Two shards can therefore only interfere by holding a lock that the other one waits on for more than 3 s. That would make a gate fail; it can never commit data.

The shared object group was mapped from the catalog (read only, 2026-10-29). Its writers contend on these keys:

| Lock / key | Taken by |
|---|---|
| advisory `exam_syllabus:<exam>` (the QA exam) | `fn_syllabus_create_draft` / `publish` / `import_draft` / `seed_legacy_gd_draft`, `fn_syllabus_intake_import`, `fn_taxonomy_merge_nodes` |
| unique index "one PUBLISHED per exam + cycle + tier" (QA exam) | every gate that publishes a QA-exam fixture version |
| advisory `taxonomy-scope:<parent>` | trigger `trg_guard_master_tree`: every `canonical_taxonomy_nodes` insert / update |
| advisory `node_lesson:<node>`, `prompt_template:<type>`, `exam_course_launch:<exam>`, `exam_note:…` | the lesson / prompt / launch / note RPCs |
| `CREATE TRIGGER` on `exam_syllabus_nodes` (SHARE ROW EXCLUSIVE) | SYLIMPORT1 I-9; it blocks every insert into that table |

- **db shard:** every gate that writes this group, serialized exactly as before. The isolation is by serialization.
- **security and pages shards:** only gates that are catalog / authz / read-only, or that write rows no other gate touches and that share none of the keys above:
  - QB-KEY-1 writes its own questions;
  - SECDEF-S2-1 writes battle rooms;
  - ADMIN-D1-D2 writes discussion rows;
  - FLAGS-LIVE takes per-user locks for the QA student. These were already parallel with live-journeys before this change.
- **One recorded exception:** CA3 writes only the committed QA lesson document, and no other live gate writes it.

**Proof in CI.** Offline gate `scripts/ci/test_ci_scripts.cjs` **C-19** scans the scripts of every gate outside the db shard. It looks for writes to the group's tables and for calls to the group's lock-taking RPCs. Any hit fails the gate unless it has a recorded exception. The negative control moves SYLIMPORT1 into the security shard and must be caught.

## b. Fail-fast

**Per page.** `scripts/smoke/signed-in-smoke.cjs` gives each page one 30 s budget (load + required element), where it used to allow 120–180 s. The suite stops at the **first** failing check.
- `--all` keeps going, for local diagnosis only.
- The page gates SEC1C, SEC1D, UX2A, UX2B and BRAND2 have no wait above 30 s.

**Per suite.** `run-quiet --caps scripts/ci/live-gate-caps.json` sets every live gate's cap:
- the formula is 2.5 × measured (+ 60 s for re-fixtured gates, + 70 s for the ISR re-check), with a minimum of 120 s and a maximum of 900 s;
- a gate without a cap is refused (fail closed).

**Checked by C-19:**
- both live jobs use `--caps`;
- every gate has a cap;
- an uncapped gate is refused (negative control);
- CI never sets `SMOKE_NEGATIVE_CONTROL` or `--all`.

**Negative control (local, 2026-10-29).** `SMOKE_NEGATIVE_CONTROL=1` makes the `/admin/questions` expectation impossible. The admin-pages smoke then fails in < 2 min; the result is in the CI-SPEED-1 report.

**Before.** On a0acfc0, two broken smoke expectations × 180 s per page × 3 smoke runs pushed the job past 45 min.

## c. Limits

- **C-15** pins live-gates per shard: db 40 · security 25 · pages 20. These are about 1.5 × the measured shard time.
- The other jobs are unchanged.

## Outcome (dispatch 40996314259, 2026-10-30)

All 3 shards green on the first run:

| Shard | Time |
|---|---|
| db | 28 min |
| security | 15 min |
| pages | 8 min |

- Wall-clock ≈ 30 min (was 45). The architect accepted ≈ 27–30 min.
- CI-SPEED-1 is closed. Phase 2 below is **DEFERRED to the backlog** (ruling 2026-10-30).

## Backlog: CI-SPEED-1 phase 2 (deferred)

The db shard is the floor: about 25 min of serialized gate time. To reach ≤ 25 min wall-clock with margin, it has to be split, and that needs gate-internal changes:

1. Each syllabus-writing gate builds its **own exam** inside its transaction, instead of sharing `qa-syllabus-test`. That removes the shared advisory lock and the publish-index key.
2. SYLIMPORT1 I-9 provokes its mid-import failure **without DDL** (no `CREATE TRIGGER`), so `exam_syllabus_nodes` is no longer table-locked.
3. Profile GAP2-4A (≈ 5 min) and RLS (≈ 3 min): many sequential round trips.

With 1 and 2 done, the db shard can be split into syllabus / taxonomy and lesson / course shards of about 13 and 12 min.
