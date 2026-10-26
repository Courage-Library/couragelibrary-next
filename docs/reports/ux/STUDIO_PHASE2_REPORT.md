# Courage Studio — phase 2 report (decision #84): Today v2 + Focus review

Status: **built, gates green locally — awaiting architect review** (screenshots are local only, outside the repo).

## What shipped

| Area | Where | Notes |
|---|---|---|
| Shell v2 | `lib/admin/nav.ts`, `components/admin/admin-sidebar.tsx`, `app/admin/layout.tsx` | Navy sidebar (`ink-900`) with a subtle cyan (top) / violet (bottom) glow (`.studio-sidebar`), gradient brand tile "Courage Studio · Admin workspace". Groups: Today · Focus review (count badge) · CREATE (Questions, Mock tests, Learning, Current affairs, Syllabus map) · CARE (Question reports, Tickets, Community flags, Students, Institutes) · Payments (flag) · SYSTEM (Security, Settings, Design system) · Not live yet. Role-aware rules + every page guard unchanged (AB-01 checks each link against its page). |
| Today v2 | `app/admin/page.tsx`, `lib/admin/today.ts`, `lib/admin/review-stats-core.ts` | Greeting by IST hour + first name (or role) and "N things need you today". Gradient MISSION card: daily review goal, progress ring (reviews today from the audit log), time-left estimate (today's average gap, breaks > 15 min ignored; no estimate before two reviews), review streak, "Start focus session" (the one primary; **F**). Queue cards: drafts + 14-day sparkline, question reports + overdue bar (> 2 days), current affairs, tickets (24 h promise), community flags, Library Pro (admin). Content health: published questions by exam × subject (canonical mapping, read only), empty cells muted, "Where to build next" → coverage. Recent activity (admin): action + time only, no e-mails / values. Every number real or "Not available". |
| Focus review | `app/admin/review/focus/page.tsx`, `components/admin/studio/focus-review.tsx` | Full screen, dark surround (`focus-surround` #0A1230) + white card; light-surround toggle remembered per browser. "n of goal". EN + HI (the other language shows "not linked yet" when absent). Options with the answer key, explanation, AUTO CHECKS, the Q3 confirmation "I checked all 6" with the 6 reviewer items listed. Keys: **A** approve · **R** reject (reason required) · **E** edit drawer · **J** next / skip · **K** previous · **Esc** exit. The next item auto-opens. Session stats: approved, rejected, average time. |
| Auto checks | `lib/question-factory/auto-checks.ts`, QF service | Computed on the server from the stored version: answer key, explanation (≥ 20 chars), topic mapped, Hindi version linked, no duplicate (content checksum on other questions), difficulty set. A failed blocking check disables Approve with its reason AND the service refuses (`QF_AUTO_CHECK_FAILED`) before the transition RPC. |
| Q4 | QF service `publish()`, `lib/admin/studio-settings.ts` | `ADMIN_REQUIRE_SECOND_REVIEWER` (default off): on → the approver cannot publish (`QF_SECOND_REVIEWER_REQUIRED`, before the RPC); off → allowed and an audit row `QF_SELF_APPROVED_PUBLISH` is written. |
| Settings | `app/admin/settings/page.tsx` | Admin only, read only: both settings, their values and source (row or default). |

## Decisions taken inside the spec (please confirm)

1. **Settings storage — no migration.** "The existing settings table" = `public.premium_system_configs` (key / value, domain `GLOBAL`). Keys `ADMIN_DAILY_REVIEW_GOAL {"value":20}` and `ADMIN_REQUIRE_SECOND_REVIEWER {"value":false}`. No rows were written: a missing row = the documented default. Setting a value is an owner step (one row insert).
2. **Hindi check = warning, not blocking.** Every stored version is English (0 Hindi) and the schema has no translation link beyond "another version of the same question in the other language". A blocking Hindi check would stop every approval. **Ruling needed:** keep as a warning until Hindi content exists, or make it blocking now.
3. **Keys J / K.** The spec lists "K skip · J/K next/prev" (K twice). Built: J = next / skip, K = previous (one key per action).
4. **Edit (E).** An IN_REVIEW version cannot be edited directly (existing rule: edit only DRAFT / CHANGES_REQUESTED). The drawer runs the existing actions in order: request changes (the reviewer's note) → save the edit (re-runs the quality gates) → submit for review. The question returns to the queue; nothing new was added to authorization.
5. **Mission card contrast.** The pure brand gradient fails 4.5:1 for small white text over its cyan start, so the card carries a navy scrim (≥ 50 %): worst point 5.17:1 (gated in SP-07).

## Security / data

- No auth changes; no new tables, columns or migrations; no new data exposure. The focus page passes only version ids to the client; each item is read by `qfGetFocusItemAction` (guard first, sanitized — same pattern as every QF action) and every decision uses the existing guarded QF actions.
- `/admin/review/focus` = staff + admin (same as Question drafts); `/admin/settings` = admin only. SEC-1C inventory 41 → 43, ADMIN_ONLY + `settings`.
- The sidebar badge is a head-count read after the layout guard and never throws.

## Gates

- New: `scripts/test_studio_phase2.cjs` (CI `STUDIO-P2`) 9/9 — first run non-writing (pure modules + static reads).
- QF-1 offline 77/77: fixture now a complete version (the approve path runs the auto checks); new ADM-3b (blocked approve, no RPC) and Q4-1..3 (second reviewer on / off / other approver).
- ADMIN-UX-1b 9/9 (Studio groups, Focus + Settings links, Today v2 AB-06). SEC-1C 22/22.
- Full offline list: 57/57 locally.
