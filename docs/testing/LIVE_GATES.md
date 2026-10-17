# Live gates — how to run them

Live gates are the suites that need a running local production build (`next start`) and/or the live couragelibrary-next database. Examples: `test_ux2a_landing.cjs` (live part), `test_gap2_4b_editor.cjs --live`, `test_ux1b_shell_a11y.cjs`, the signed-in smokes, `test_sec1c_admin_pages.cjs --live`.

They run against **localhost only**. Production gets only the anonymous smoke + `wait-for-deploy`.

## Standing rule (architect, 2026-10-17)

This rule was recorded after an incident: a wait loop without a timeout polled `/api/health` for 2 h while no gate ran. It applies to every run.

1. **No unbounded wait loops.** Every wait has a hard timeout, and on timeout it fails loudly with the log tail:
   - server health: max **120 s**;
   - any single gate: max **15 min**.
2. **Health before gates.** The server's health (`GET /api/health` → 200) must be confirmed **before** any gate starts. If it is not healthy within 120 s → stop, show the server log tail, and do not start gates.
3. **Always clean up.** At the end of every run — pass, fail, timeout or interrupt — stop the server and any child processes.
4. **Free-port check first.** Before starting the server, check that the port is free. If it is in use, refuse; never assume an old server is "the" build.

## Required runner (architect, 2026-10-17)

**`scripts/live/with-server.cjs` is the required way to run ANY live gate.** A live gate started any other way (a hand-started `next start`, wait loops) does not count as a gate result.

## How

Build first, then let the runner own the server lifecycle:

```bash
npm run build
```
```bash
node scripts/live/with-server.cjs --port=3100 -- "node scripts/test_ux2a_landing.cjs http://localhost:3100" "node scripts/test_ux1b_shell_a11y.cjs http://localhost:3100"
```

What `scripts/live/with-server.cjs` does:
- Refuses without `.next/BUILD_ID` or if the port is busy.
- Starts `next start` directly (node + the next binary, no npx / shell wrappers), with the log in a temp file.
- Polls health with Node `fetch` (no curl), max 120 s.
- Runs each gate with a 15-minute hard limit (`--gate-timeout=<s>` to lower it).
- Prints redacted log tails on failure, always kills the server tree, and prints a summary.

**Do not** start the server by hand with `npx next start … &` plus `until curl …` loops.

## Windows / Git Bash pitfalls (recorded)

- **Git Bash path conversion.**
  - Git Bash rewrites arguments that look like POSIX paths (`/dashboard` → `C:/Program Files/Git/dashboard`) when calling native programs.
  - Setting `MSYS_NO_PATHCONV=1` fixes that but **also stops `/dev/null` from being translated**: native `curl -o /dev/null` then fails on every call. That failure caused the 2-hour hang.
  - Prefer Node scripts (no shell paths), or pass URL paths that don't start with `/`.
- **Heredocs.** Bash heredocs and `node -e` strings mangle backslashes and quotes. Write scripts to files.

## Pre-migration backup: BACKUP-RESILIENT-1 (architect ruling, 2026-10-17)

A backup before a migration is mandatory. On this machine the **standard procedure** is the resilient mode:

```bash
node scripts/db/backup.cjs pre-<change> --resilient
```

How it works:
- schema-only dump first;
- then one short session per table, with **at most 3 attempts per table** and transaction-local `statement_timeout` / `idle_in_transaction_session_timeout`;
- after any failed attempt, terminate only the script's own orphaned sessions and record their PIDs;
- a `manifest.json` (table → rows → sha256) that must verify **100%** against live counts taken at the end.

**If any table fails 3 times → BLOCKED: do not migrate.**

Full procedure, restore path and restore dry test: `docs/database/MIGRATION_RUNBOOK.md` §1 and "Restore".

## Network (DEV-NET-1 outcome, 2026-10-17)

This machine's path to Supabase has **bursty** instability: connect timeouts, ECONNRESET, an occasional DNS miss from the LAN resolver, multi-second TLS / TCP spikes. `scripts/diag/net-probe.cjs` (`docs/reports/ops/DEV_NET1_REPORT.md`) showed:
- both Supabase hosts are **IPv4-only**, so `--dns-result-order=ipv4first` and auto-select-family change nothing (Node 20 already auto-selects);
- **no network flag is required**, and none is a fix.

Rules for live gates on this machine:
1. Always use `scripts/live/with-server.cjs` (above).
2. **At most 3 attempts per gate.**
3. **Classify failures by the server log of that attempt:**
   - network errors (`fetch failed`, ECONNRESET, connect timeout, ENOTFOUND) during the attempt → network-caused, retry;
   - **a failure with a clean server log is a real regression → STOP** and report the locator + screenshot.
4. When a suite aborts mid-way, restore its own QA data with the existing RPCs before retrying. For example, the GAP2-4b editor suite can leave a QA test version PUBLISHED → `fn_syllabus_archive_version` as qa-admin.
5. Diagnose the network with `node scripts/diag/net-probe.cjs` (prints labels and families only, never hosts or keys).

Long-term recommendation: run the live gates from CI (a stable network); this machine for development.
