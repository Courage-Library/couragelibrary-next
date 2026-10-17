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

## Network (DEV-NET)

This machine's connection to Supabase is intermittently slow or failing: connect timeouts, ECONNRESET, slow first TLS connect. The network-hardened way to run live gates on this machine, if one is found, is documented below by DEV-NET-1.
