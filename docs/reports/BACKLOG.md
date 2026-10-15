# Backlog (cross-phase follow-ups)

These are items that no open phase owns. Phase-owned items stay in their own reports. Examples:
- TEST-CA: the legacy Current Affairs suites
- LOOP-1: the `B-DSH-*` tags
- GAP2-4: `B-CURRICULUM-MAPPING`

| ID | Item | Source | Notes |
|---|---|---|---|
| TEST-EK | Fix the stale Exam Knowledge suite assertions: 3H.3 `I43`; 3H.4.1 `H03`, `H07`; 3H.4 `S04`, `S05`, `S09`, `S34`, `S42`, `S44` | `docs/reports/sec/SEC_HOTFIX4_REPORT.md` | These are static source assertions that predate the SEC-1B guard refactor, plus S09, which expects zero EK documents. The failure set is proven identical at `5ea60f4` and `9569ac2`. Re-point them at the current guards (`requireAdmin…`) and live data, without weakening them. |
