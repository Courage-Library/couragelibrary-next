# ACCOUNT-DELETION-DESIGN-1: in-app account deletion (design only)

**Phase:** LEGAL-PAGES-1, read only. Nothing here is built and nothing was written to the database.
**Date:** 2026-11-12.

**Why:** the approved legal text promises the following:
- Privacy 2.5: "**Erase** it by deleting your account (Account settings → Delete account) or by writing to us".
- Privacy 2.4: account and learning data are "deleted or anonymised within 30 days after you delete your account", and payment and invoice records are kept for 8 years.
- Terms 1.9: "You can close your account at any time from Account settings or by writing to support@couragelibrary.in."

## 1. Current state

- **No deletion exists.** There is no UI, no RPC and no `auth.admin.deleteUser` call, and nothing in `app/`, `components/`, `lib/`, `services/` or the migrations deletes or anonymises an account.
- **Interim (LEGAL-PAGES-1):** Account settings (`/settings/profile`) has a "Delete account" section. Its link opens `mailto:support@couragelibrary.in?subject=Account%20deletion%20request`. Staff handle each request by hand within 30 days. This keeps the promise honest until the flow below exists.
  - **Caveat:** `/settings/profile` exists only while the profiles flag is on (`isProfilesEnabled()`); otherwise it is a 404. In that case the email route ("or by writing to us") is the only path. The owner should confirm that the flag is on in production before the release.
- **What blocks a plain delete today.** Deleting the `auth.users` row fails for most real students, because 11 user-linked tables use `ON DELETE RESTRICT`. This comes from the migration files; check it against the live catalogue before writing the migration.

  | Table | Column | On delete | Note |
  |---|---|---|---|
  | `test_attempts` | `user_id` | RESTRICT | every mock attempt |
  | `test_results` | `user_id` | RESTRICT | every result |
  | `payment_orders` | `user_id` | RESTRICT | **legal retention: 8 years** |
  | `payment_receipts` | `user_id` | RESTRICT | **legal retention: 8 years** |
  | `billing_invoices` | `user_id` | RESTRICT | **legal retention: 8 years** |
  | `coupon_redemptions` | `user_id` | RESTRICT | payment-linked |
  | `coin_ledger` | `user_id` | RESTRICT | ledger is append-only |
  | `live_test_registrations` | `user_id` | RESTRICT | |
  | `live_test_leaderboard_entries` | `user_id` | RESTRICT | |
  | `live_test_audit_logs` | `actor_id` | RESTRICT | audit |
  | `institutes` | `owner_user_id` | RESTRICT | institute owners only |

  About 60 other tables use `ON DELETE CASCADE`. Examples: `user_profiles`, `user_mistake_vault`, `user_mistake_occurrences`, `practice_answers`, `user_lesson_progress`, `lesson_reading_sessions`, `lesson_quick_check_attempts`, `attempt_proctor_events`, `support_tickets`, `user_entitlements`, `coin_wallets`, `user_notifications`, `discussion_threads` and `discussion_messages`. About 30 staff or authoring columns use `SET NULL`, e.g. `admin_audit_logs.actor_id` and `document_versions.approved_by_user_id`.

## 2. Proposed flow

1. **Request.** A student opens Account settings → Delete account.
   - The screen shows what is deleted, what is kept (payment and invoice records for 8 years; anonymised statistics), and that an active Pro plan ends without a refund unless the Refund Policy applies.
   - The student types `DELETE` and re-authenticates: a fresh sign-in, or aal2 for staff.
   - Call `fn_request_account_deletion()` (SECURITY DEFINER, own account only). It records the request with a timestamp and returns a reference.
2. **Confirm.** An email to the registered address confirms the request and gives a "cancel" link that is valid for 7 days. No email reply is needed. The request is effective unless it is cancelled.
3. **Soft-disable (immediately).** The account is banned for sign-in (Supabase `auth.admin.updateUserById(id, { ban_duration })`, server-side with the service role, never from the client). Then:
   - `user_profiles` is hidden: the public profile and leaderboard entries disappear, and the username is released after hard delete.
   - Sessions are revoked.
   - Community posts show "Deleted user".
4. **Hard delete or anonymise (at most 30 days later).** A scheduled job (`fn_process_account_deletions()`, service role only) runs daily, starting 7 days after the request (after the cancel window), so it always finishes within 30 days. For each due request, in one transaction:
   - **Keep, anonymised (8 years):** `payment_orders`, `payment_receipts`, `billing_invoices`, `payment_transactions` and `coupon_redemptions`. Set `user_id` to one fixed "deleted user" tombstone account (`auth.users` row, banned, no email). Keep the amounts, Razorpay IDs, dates and invoice numbers that tax and accounting law requires, plus a non-reversible hash of the email for refund or dispute lookups.
   - **Keep, anonymised (statistics):**
     - `test_attempts`, `test_results` and `live_test_*`: re-point to the tombstone. Question statistics and percentile pools stay correct, and no row identifies the student.
     - `coin_ledger`: re-point; balances end with the account (Terms 1.5).
     - `live_test_audit_logs.actor_id`: re-point.
   - **Delete:** the `auth.users` row. Everything with `ON DELETE CASCADE` goes with it (profile, Mistake Vault, notes, progress, proctor events, tickets, notifications, entitlements, wallet and so on).
   - **Support and grievance records (3 years after closure, Privacy 2.4):** `support_tickets` currently cascades. Either change its FK to `SET NULL` and keep the ticket text with the email removed, or accept deletion and keep a separate redacted closure log. **Owner decision needed.**
   - **Security and access logs (at least 1 year, Privacy 2.4):** Supabase auth logs are kept by Supabase. Application security events stay keyed by a hash, not by the user id.
   - Write one `admin_audit_logs` row: `ACCOUNT_DELETED` with the request reference and counts, and no personal data.
5. **Inactive accounts (3 years, Privacy 2.4):** a later job emails a warning and then follows the same path. This is out of scope here.

## 3. Database work (migrations, each with backup, dry-run and rollback)

| # | Migration | Content |
|---|---|---|
| A | `account_deletion_requests` | Table: id, user_id (CASCADE until processed), requested_at, cancel_token_hash, cancel_until, status (`PENDING` / `CANCELLED` / `DONE`), processed_at, counts jsonb. RLS: the owner reads own row; there are no client writes. |
| B | tombstone user | One fixed `auth.users` row (banned, no email, no identities) plus a `user_profiles` row with the username "deleted-user"; the id is stored in `premium_system_configs`. |
| C | FK changes | The 11 RESTRICT FKs stay RESTRICT, because the job re-points them before the delete. `support_tickets.user_id` changes CASCADE → SET NULL only if the owner chooses to keep tickets. |
| D | `fn_request_account_deletion()` | SECURITY DEFINER, `auth.uid()` only, idempotent, refuses for the tombstone or staff accounts with an open admin role. Granted to `authenticated`. |
| E | `fn_cancel_account_deletion(token)` | Hash compare, inside the window only. |
| F | `fn_process_account_deletions(limit)` | `service_role` only; LIVE-LOCK-SAFETY timeouts; one user per transaction; re-point, then delete; audit row. |
| G | SECDEF allow-list | Add D, E and F to the allow-list gate. |

**App:**
- A Delete account screen that replaces the interim mailto.
- A server action that re-authenticates, then calls D and bans via the service role.
- Cron through a Vercel cron route protected by a secret, which calls F.
- Emails: confirmation and done.

## 4. RLS and RPC needs

- **The student never deletes directly.** No client DELETE grant on `auth.users` or the retained tables; everything goes through D and E. F runs with the service role from a server cron only.
- The ban, session revocation and `auth.users` delete use the Supabase admin API on the server, never from the client (rule: no secrets in the client).
- After deletion, RLS reads by the tombstone id return nothing to anyone except staff reports, which already aggregate.

## 5. Risks

- **The RESTRICT FKs:** a delete without re-pointing fails, so the job must re-point every RESTRICT table. Gate: a live test with a seeded user who has rows in all 11 RESTRICT tables, rolled back.
- **Retention conflicts:** the 8-year payment retention versus erasure is solved by anonymising, and keeping identifiers (Razorpay IDs) is justified as a legal obligation. Have this reviewed before launch.
- **Backups:** resilient backups (`BACKUP_DIR`, outside the repo) still contain the deleted user until they age out. The policy says "deleted or anonymised within 30 days". Set the backup retention to 30 days or less, or document backup expiry.
- **Pro plans:** deleting an account with an active plan ends access without a refund (Refund Policy 3.3 applies). The confirmation screen must say so.
- **Abuse:** deletion followed by re-sign-up to repeat the 7-day refund ("once per user"). Keep a hash of the email in the payment rows for this check.
- **Staff accounts:** refuse self-deletion while an admin or staff role is active. An admin removes the role first.
- **Community content:** shown as "Deleted user"; posts stay readable only if the owner decides that. Otherwise they cascade.

## 6. Status

- **Design only.** Build it as its own phase, after the owner decides on the support-ticket retention, the community content and the backup retention.
- Until then, the interim mailto plus manual handling by staff keeps the 30-day promise.
