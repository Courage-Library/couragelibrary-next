# Appendix E — Production Security & Compliance Checklist

This checklist defines the mandatory security controls required for production deployment of the Courage Library Assessment System.

---

## 1. Zero-Trust Exam Integrity Controls

- [x] **Zero Client-Side Key Exposure**: Ensure API endpoints strip `is_correct`, `solution_markup`, and discriminatory metrics from question payloads during active attempts.
- [x] **Server-Monotonic Time Authority**: Verify remaining duration is computed from `test_attempts.started_at` and `NOW()`. Client clock manipulation must yield zero extra exam time.
- [x] **Monotonic Answer Sequence Numbers**: Ensure `fn_save_attempt_answer` discards stale or out-of-order packets where `sequence_id <= stored_sequence_id`.
- [x] **Single-Tab Session Mutex**: Enforce active tab token validation; secondary tab attempts must trigger UI lockout.
- [x] **Forensic Watermarking**: Render canvas watermark with candidate user ID, timestamp, and IP hash across all viewports.
- [x] **No Developer Tool Inspection Leak**: Confirm Redux/Zustand devtools are disabled in production builds.

---

## 2. Database & Row-Level Security (RLS) Policies

- [x] **Explicit RLS Enabled**: Verify `ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY` across all assessment tables.
- [x] **Candidate Read Isolation**: `test_attempts` and `test_results` accessible only where `auth.uid() = user_id`.
- [x] **Immutable Question Version Read Access**: Active question versions readable by authenticated candidates; unpublished drafts restricted to admins.
- [x] **No Direct Client Mutation**: Direct `INSERT`, `UPDATE`, or `DELETE` on `test_results`, `adaptive_item_calibrations`, and `coin_ledger` blocked; mutations permitted strictly via `SECURITY DEFINER` RPCs.
- [x] **Search Path Safety**: All PostgreSQL RPC functions explicitly declare `SET search_path = public, pg_temp;` to prevent search path hijacking.

---

## 3. Concurrency, Quotas & Gamification Mutexes

- [x] **Daily Mock 1-Attempt Mutex**: Verify `pg_advisory_xact_lock` serializes concurrent daily mock start requests per user/IST day.
- [x] **Double Submission Lock**: Confirm `fn_submit_test_attempt` uses `FOR UPDATE` row lock on `test_attempts` to guarantee single-winner execution.
- [x] **Atomic Coin Balance Settlement**: Virtual coin debit/credit RPCs enforce non-negative wallet balances with idempotency keys.
- [x] **Unattended Attempt Sweeper**: Scheduled pg_cron worker sweeps expired attempts (`NOW() > started_at + duration + grace`).

---

## 4. Cryptographic Proofs & Certificate Verification

- [x] **HMAC-SHA256 Signing**: All All-India merit certificates signed with platform secret key.
- [x] **Public Verification Portal**: Public route `/verify/[cert_id]` validates payload signature against tamper-evident hash.
- [x] **Evidence Watermark Lineage**: Psychometric calibration snapshots store deterministic SHA-256 hashes of input cohorts.
