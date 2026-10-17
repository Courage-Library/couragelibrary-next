# DEV-NET-1 — dev machine ↔ Supabase network diagnosis

Phase brief (architect, 2026-10-17): diagnose the network flakiness that blocks live gates on this machine and make live gates reliable, without changing runtime / app code or Vercel settings. Then use the result to finalise SYL-IMPORT-1.

Commit 2 contains scripts and docs only.

## 1. Probe

`scripts/diag/net-probe.cjs` (new, diagnostics only):
- **Privacy:** hosts are never printed (labels `supabase-api` / `supabase-db-pooler`), IPs appear only as their family, and the anon key comes from `.env.local` and is never printed.
- **TLS:** always verified.
- **Per iteration (20):**
  - `supabase-api`: DNS lookup (all families; A vs AAAA; time), then per family a TCP connect to :443, a verified TLS handshake (SNI = host) and an HTTPS `GET /rest/v1/` (anon apikey), plus one default `fetch` (undici, honouring Node's DNS order / autoSelectFamily — what the app's server uses);
  - `supabase-db-pooler`: DNS + TCP connect to the pooler port (the first hop of the pg suites).
- **Helper:** `scripts/diag/autoselect-family.cjs` is a `--require` preload that turns on `net.setDefaultAutoSelectFamily(true)` (attempt timeout 500 ms). It is for diagnostics / test processes only and never imported by the app.

## 2. Environment facts (no secrets)

| Item | Value |
|---|---|
| Node | v20.19.4 (`autoSelectFamily` is **already on by default**, attempt timeout 250 ms; DNS result order `verbatim`) |
| OS | Windows 11 Home Single Language 10.0.26300 |
| Network | a single active adapter: **Wi-Fi** (Realtek RTL8822CE) |
| DNS resolver | the LAN router (private address) on the Wi-Fi adapter |
| Proxy | no proxy env vars; user proxy off; no PAC / auto-config; WinHTTP "Direct access" |
| VPN / tunnel adapters | none up |
| Antivirus / HTTPS scanning | Windows Defender only (no third-party HTTPS-inspecting product) |
| IPv6 | the machine has an IPv6 default route, but **neither Supabase host publishes AAAA records**: both are IPv4-only |

## 3. Results (20 iterations per mode; timeout 10 s per operation)

| Phase | (a) default | (b) `--dns-result-order=ipv4first` | (c) autoSelectFamily preload |
|---|---|---|---|
| api DNS | 100 % · p50 1 ms · p95 351 ms | 100 % · 1 / 10 ms | 100 % · 1 / 12 ms |
| A / AAAA records | 2 / 0 | 2 / 0 | 2 / 0 |
| api TCP IPv4 | 100 % · 3 / 426 ms | 100 % · 3 / 140 ms | 100 % · 4 / **7049 ms** |
| api TLS IPv4 (verified) | 100 % · 154 / **4302 ms** | 100 % · 38 / **3489 ms** | 100 % · 96 / 889 ms |
| api HTTPS GET /rest/v1/ IPv4 | 100 % · 163 / 1325 ms | 100 % · 102 / 665 ms | 100 % · 247 / 887 ms |
| api default `fetch` | 100 % · 49 / **3462 ms** | 100 % · 48 / 447 ms | 100 % · 49 / 453 ms |
| pooler DNS | 100 % · 1 / 19 ms | 100 % · 1 / 2 ms | 100 % · 1 / 20 ms |
| pooler TCP IPv4 | 100 % · 40 / **3044 ms** | 100 % · 40 / 443 ms | 100 % · 173 / 449 ms |
| **overall** | **100 %** | **100 %** | **100 %** |

The numbers are success rate · p50 / p95.

**Reading:**
1. **IPv6 / DNS ordering / happy-eyeballs are not the cause.** Both hosts are IPv4-only, so `ipv4first` changes nothing, and Node 20 already runs auto-select-family by default.
2. **No mode is "clearly more reliable".**
   - All three were 100 % in their windows, so none can be shown to be ≥ 99 % reliable *because of the mode*.
   - The latency spikes (3–7 s at p95) land in a different phase on each run — TCP, TLS, fetch, pooler — independently of the mode.
3. **The failure pattern is bursty path instability on Wi-Fi**, consistent with everything recorded earlier:
   - connect timeouts of 10 s and ECONNRESET to the Supabase API (Cloudflare) and the pooler (AWS);
   - one `ENOTFOUND` from the LAN resolver;
   - the first TLS connect taking ~7 s.
   - 20-iteration windows can be clean while minutes later a burst of failures occurs, as in UX-2a, SYL-IMPORT-1 §7.1 and the CA routes DNS miss during this phase.

## 4. Decision for live gates on this machine

- **No network flag is required, and none is documented as "the fix"**: there is no evidence one helps. Runtime / app code and Vercel settings are unchanged.
- **Reliability comes from discipline, not flags** (recorded in `docs/testing/LIVE_GATES.md`):
  1. Run every live gate through `scripts/live/with-server.cjs`: health confirmed first, bounded gates, cleanup always.
  2. At most 3 attempts per gate. A failure counts as network-caused only when the server log shows network errors (`fetch failed`, ECONNRESET, connect timeout, ENOTFOUND) during that attempt. A failure with a clean log is treated as a real regression (STOP).
  3. Restore suite-owned QA data between attempts with the existing RPCs, when a suite aborts mid-way.
- **Recommendations (owner / platform, not done here):**
  - prefer a wired connection or a different upstream DNS resolver for gate runs;
  - long-term, run the live gates from CI (a stable network next to Supabase), with this machine for development only.

## 5. SYL-IMPORT-1 finalisation (step 5)

`scripts/test_gap2_4b_editor.cjs --live` was run on HEAD `dd8b305` through the runner, in the default mode.

| Attempt | Result | Server log |
|---|---|---|
| 1 | 6/8. E-05 passed (first time ever on this machine); E-06: the publish succeeded but the list did not refresh; E-07: the QA test version was left PUBLISHED | ECONNRESET during the run → network-affected. The leftover QA version (v26, created by qa-staff) was archived with `fn_syllabus_archive_version` as qa-admin before the next attempt |
| 2 | **8/8** | **0 network errors** |

→ The editor works end to end, and the earlier E-05 / E-06 failures were network-caused. **SYL-IMPORT-1 is finalised** (SYL_IMPORT1_REPORT §7.2).

## 6. Files (commit 2)

| File | Change |
|---|---|
| `scripts/diag/net-probe.cjs` | new — network probe |
| `scripts/diag/autoselect-family.cjs` | new — diagnostics preload |
| `docs/testing/LIVE_GATES.md` | DEV-NET-1 outcome + attempt / classification rules |
| `docs/reports/BACKLOG.md` | DEV-NET updated (diagnosed; CI recommendation) |
| `docs/reports/syllabus/SYL_IMPORT1_REPORT.md` | §7.2 finalisation, status line |
| `docs/reports/ux/UX2A1_REPORT.md` | §8 production smoke, status CLOSED |
| `docs/reports/ops/DEV_NET1_REPORT.md` | this report |

## 7. Security

- No host, key, token or connection string was printed: the probe prints labels and families only, and the runner redacts the server log tails.
- TLS verification stayed on everywhere.
- No account was created, and nothing ran against production except the anonymous smoke (Part A).
- The legacy CA-5 / CA-6 suites, which disable TLS verification, were **not** run.

DEV-NET-1 status: CLOSED
