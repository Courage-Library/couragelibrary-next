# F9: Pricing + Razorpay (one-time Pro plans): inspection + design

**Status:** F9-A (read-only inspection and design). Nothing in this document is built, migrated or switched on. **STOP for the architect's review** before F9-B.

- **Payments mode:** STRICT. No live payment, no gateway API call, no secret in the repo, chat or logs.
- **Owner decisions (2026-10-25 / 26):**
  - one-time plans of 3, 6 or 12 months, with no auto-renew;
  - no GST (the document is a "Payment receipt", not a tax invoice);
  - the site is 18+ only.

## 1. What exists today (inspected 2026-10-26)

### 1.1 Schema

Read-only from the live dev database; values are not printed.

| Table / function | Rows | Shape (summary) | Notes for F9 |
|---|---|---|---|
| `subscription_plans` | 1 | `plan_code` (unique, `^[A-Z0-9_]+$`), `name`, `duration_days`, `base_price_inr numeric`, `currency`, `tax_rate_pct`, `is_active`, `display_order`, `feature_flags jsonb` | No version and no paise. **Replace** with versioned `pro_plan_versions` (§3.1). |
| `user_entitlements` | 0 | `entitlement_type` ∈ {`PRO_SUBSCRIPTION`, `COURSE_PURCHASE`, `PROMOTIONAL_PASS`}, `starts_at`, `expires_at` (nullable, > starts_at), `is_active`, `plan_id`, `custom_limits jsonb`, `course_id`, `exam_id` | The canonical entitlement store. F9 adds `source` + `order_id` (§3.4). |
| `payment_orders` | 0 | base / discount / taxable / tax / total amounts as `numeric` rupees; `gateway` (RAZORPAY etc.); `gateway_order_id` (unique); `status` ∈ {CREATED, PENDING, PAID, FAILED, EXPIRED, CANCELLED, REFUNDED}; `idempotency_key` (unique); `expires_at` | F9 adds a **snapshot** in paise (§3.2). |
| `payment_transactions` | 0 | `gateway_payment_id` (unique), `gateway_signature`, `amount` > 0, `status` ∈ {SUCCESS, FAILED, PENDING, REFUNDED}, `refund_amount` | Kept; idempotency key = `gateway_payment_id`. |
| `payment_webhook_events` | 0 | unique (`gateway`, `gateway_event_id`), `signature_verified`, `processing_status` | Kept; 106 made it fail-closed. |
| `billing_invoices` | 0 | GST fields (`cgst` / `sgst` / `igst`, `gstin`, `place_of_supply`) | No GST: F9 writes **payment receipts** (§3.9); GST columns stay 0 / unused. |
| `coupon_redemptions` | 0 | per order | No coupons in F9 (none in the brief). |
| `fn_create_payment_order(text,uuid,uuid,text,text,text)` | — | SECURITY DEFINER, **client-executable** (authenticated); reads `subscription_plans` / `courses` / `discount_coupons` | **Revoke and replace** in F9-B. Order creation becomes a server action with service-role writes (§3.2). |
| `fn_verify_and_fulfill_payment(...)` | — | service role only; fail-closed since 106 | **PAY-FULFIL-1**, §2. Rebuilt as `fn_fulfil_pro_order` (§3.5). |
| `fn_process_payment_webhook(...)` | — | service role only; fail-closed since 106 | Kept as the idempotent event store; processing goes through the one fulfil path. |
| `fn_check_premium_access_and_quota(uuid,uuid,text)` | — | SECURITY DEFINER, service role | Replaced by `hasPro()` + free-limit settings (§3.6). |

### 1.2 App code

- **Payments are off:** `config/payments.ts` has a `PAYMENTS_ENABLED` kill switch, default off, server-only.
- **`/api/billing/fulfill-order`** refuses every request: 503 while off, and 501 `PAYMENT_VERIFICATION_NOT_IMPLEMENTED` even when on (SEC-1A containment).
- **Billing service:** `services/billing.service.ts` lists plans, gets the subscription status (reads `user_entitlements`), and creates orders via `fn_create_payment_order`.
- **Pages:** `/pricing`, `/billing`, `/checkout/[orderId]`, `/checkout/success` and `/checkout/cancel` exist. `/pricing` shows the free / early-access view while payments are off.
- **Razorpay:** there is no SDK in `package.json`, and no HMAC or `timingSafeEqual` code for payments anywhere.
- **Pro checks are scattered:**
  - `PremiumEntitlementService.checkPremiumAccess` (adaptive);
  - `admin-premium.service` (`PRO_SUBSCRIPTION` / `PROMOTIONAL_PASS` filters);
  - `mock_tests.is_free` / `learning_documents.access_level`;
  - `fn_check_premium_access_and_quota`.

  There is no single `hasPro()`.
- **Env var names** (values never read):
  - present: `PAYMENTS_ENABLED`;
  - to be set by the owner in Vercel for F9-B (TEST keys only): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.

## 2. PAY-FULFIL-1: why fulfilment is broken

`fn_verify_and_fulfill_payment` was written against an older entitlement schema:
- it INSERTs `user_entitlements (status, valid_from, valid_until)`, and none of those columns exist; the live table has `is_active`, `starts_at` and `expires_at`;
- it uses `entitlement_type 'SUBSCRIPTION'`, which the CHECK rejects (allowed: `PRO_SUBSCRIPTION`, `COURSE_PURCHASE`, `PROMOTIONAL_PASS`);
- it renews from `MAX(valid_until)`, which is another non-existent column.

**Result:** every fulfil fails with 42703 before any write, so it fails closed by accident. It also computes GST (CGST / SGST / IGST) for an invoice, which the owner's no-GST decision removes.

The two 106 checks still SKIPPED ("valid → PAID once, replay → no double fulfil" and "payment id on another order → rejected") become F9-B tests (§5).

## 3. Target design (F9-B builds this after the go)

### 3.1 Plans: versioned, prices in paise, never from the client

New table `pro_plan_versions`:
- `id`, `plan_code` (`PRO_3M` | `PRO_6M` | `PRO_12M` | `PRO_12M_FOUNDING`), `version` (int);
- `duration_months` (3 | 6 | 12), `price_paise` (int > 0), `currency` (`INR`);
- `label` (display), `badge` (e.g. "Best value"), `active` (bool), `created_at`;
- UNIQUE (`plan_code`, `version`);
- **at most one active version per plan_code**, enforced by a partial unique index.

**A price change** inserts a new version and deactivates the old one. Orders keep their own snapshot (§3.2), so old orders are never affected.

**Version 1:**

| plan_code | duration | price | note |
|---|---|---|---|
| PRO_3M | 3 months | ₹299 (29900) | |
| PRO_6M | 6 months | ₹499 (49900) | |
| PRO_12M | 12 months | ₹799 (79900) | badge "Best value" |
| PRO_12M_FOUNDING | 12 months | ₹599 (59900) | founding offer, §3.7 |

**Access:** reads only through a server read model (plans are public information). There are no client writes, and RLS gives a public read of `active` rows only.

### 3.2 Order: a server action, never client prices

`createProOrder(planCode)` is a server action. It:
1. requires auth;
2. requires the 18+ confirmation (canonical `adult_confirmed_at`, or `app_metadata.adult_confirmed`);
3. refuses if the user is "not already unlimited" (no active lifetime / library grant; §3.8);
4. checks the PAYMENTS_ENABLED flag;
5. checks a per-user rate limit (5 open orders per 10 minutes);
6. reads the active plan version **on the server**;
7. creates the Razorpay order server-side (`amount` = snapshot paise, `currency` INR, `receipt` = our order id);
8. writes `payment_orders` with status CREATED and a **snapshot**: `plan_code`, `plan_version`, `amount_paise`, `currency`, `user_id`, `receipt_id`, `gateway_order_id`, `founding` (bool), `expires_at` (30 min).

**Writes:** a service-role SECDEF `fn_create_pro_order(...)`, not client-executable. The old `fn_create_payment_order` gets its client EXECUTE revoked.

**Double-click:** a client idempotency key per checkout session (UNIQUE `idempotency_key`) returns the same open order.

### 3.3 Checkout (R11 / R12, no dark patterns)

- **Checkout:** Razorpay Checkout runs in the browser with `key_id` only. The secret never leaves the server.
- **Before paying, the pricing page shows:**
  - the total price;
  - the plan dates ("Pro from today until <date>"; stacking shows the new end date);
  - one-time, no auto-renew, said plainly;
  - links to Terms, Refund and Privacy.
- **Honesty:** no pre-ticked boxes, no countdowns, no fake "x left" (the founding counter is real, §3.7), no strike-through prices.

### 3.4 Verify (client success) and webhook: one fulfil path

**Client success** posts (`razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`) to `/api/payments/verify`. The server then:
1. computes `HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)`;
2. compares it with `crypto.timingSafeEqual` (equal-length buffers);
3. fetches the payment from the Razorpay API: status `captured` (or `authorized`, then capture via the API); `amount`, `currency` and `order_id` must equal the snapshot;
4. calls `fn_fulfil_pro_order(order_id, payment_id, amount_paise, currency, source='CLIENT_VERIFY')`.

**Webhook** `/api/webhooks/razorpay`:
1. reads the **raw body**;
2. computes `HMAC-SHA256(raw_body, WEBHOOK_SECRET)` against `X-Razorpay-Signature` (constant-time);
3. stores the event idempotently in `payment_webhook_events` (unique gateway event id; 106 fail-closed);
4. handles `payment.captured` (and `order.paid`): the same API cross-check, then `fn_fulfil_pro_order(..., source='WEBHOOK')`;
5. `payment.failed` → the order goes to FAILED (no entitlement);
6. `refund.processed` → §3.10.

Any signature or amount mismatch is a 400 with no fulfil; it is logged with ids only (SILENT-FAIL-1 logger).

`user_entitlements` gains:
- `source` ∈ {`PAYMENT`, `LIBRARY`, `PROMO`};
- `order_id` (nullable, FK to `payment_orders`);
- `granted_by` (admin id, for LIBRARY);
- `founding` (bool).

### 3.5 `fn_fulfil_pro_order`: the ONE fulfil path (rebuilds PAY-FULFIL-1)

- **Who can call it:** SECURITY DEFINER, search_path `''`, EXECUTE for service_role only.
- **Idempotent on `razorpay_payment_id`:**
  - `payment_transactions.gateway_payment_id` is UNIQUE;
  - the function first `SELECT … FOR UPDATE`s the order row;
  - an already-PAID order returns `already_fulfilled`;
  - a payment id recorded for another order is rejected (106 rule kept).
- **Checks:** amount and currency equal the order snapshot (NULL on either side = reject).
- **Entitlement (stacking):**
  - `current_end` = the latest `expires_at` of the user's active `PRO_SUBSCRIPTION` rows;
  - `new_end` = `GREATEST(now(), current_end) + make_interval(months => duration_months)`;
  - insert a new row (`starts_at` = `GREATEST(now(), current_end)`, `expires_at` = `new_end`, `source` PAYMENT, `order_id`).
- **Also in the same function:**
  - order → PAID;
  - a transaction row;
  - a receipt row (§3.9);
  - an audit row (`admin_audit_logs`, actor = system);
  - the founding counter (§3.7).
- **Races:** the client verify and the webhook run concurrently. The order row lock plus the unique payment id give exactly one fulfilment; the second caller gets `already_fulfilled`.

### 3.6 Entitlement check: one server helper

- **`hasPro(userId)`** (server only) means: an active `PRO_SUBSCRIPTION` row with `starts_at ≤ now() < expires_at`, OR an active LIBRARY grant. It is backed by a SECURITY DEFINER `fn_has_pro(uuid)` (service role) plus a cached server helper. No client value is trusted.
- **Free limits** live in a single-row settings table `app_settings`, read by the server and editable by an admin: `free_practice_daily` = 30, `free_memory_lock_active` = 50, `free_daily_mock` = 1, `gst_registered` = false, `founding_limit` = 1000.
- **Migration of the scattered checks:** `PremiumEntitlementService.checkPremiumAccess`, `admin-premium.service` filters, the `is_free` / `access_level` gates and `fn_check_premium_access_and_quota` all route to `hasPro()` + `app_settings`.
- **Gate:** an offline check makes sure no other entitlement check reappears.

### 3.7 Founding offer: first 1,000 buyers, ₹599, kept on renewal

- **Counter:** an atomic server-side counter row `founding_offer` (`sold` int, `limit` int = 1000).
  - `fn_create_pro_order` may create a `PRO_12M_FOUNDING` order only while `sold < limit`. The count is checked at order time and enforced again at fulfil time.
  - Fulfil increments `sold` in the same transaction with `UPDATE … WHERE sold < limit`.
  - If the limit was reached between order and payment, the order is still fulfilled at the price paid (an honest snapshot), and `sold` may end at most at `limit + concurrently open orders`. Alternative for the architect: refuse at fulfil and auto-refund.
- **Renewal:** founding buyers keep ₹599. `user_entitlements.founding = true` makes `PRO_12M_FOUNDING` available to that user even after the public offer ends.
- **Display:** the offer simply disappears at 1,000. No timer, no strike-through. The page may show the real remaining count ("123 of 1,000 left") only if the architect wants it.

### 3.8 Library members: admin-granted Pro, no payment

- **How:** an admin action creates `user_entitlements` (`source` LIBRARY, `entitlement_type` `PROMOTIONAL_PASS` or `PRO_SUBSCRIPTION`, `expires_at` = valid_until, `granted_by`).
- **Rules:**
  - audited;
  - revocable (`is_active = false`, never deleted);
  - a library member with an active grant cannot buy ("already unlimited" check in §3.2) unless the grant ends before the new period. The architect rules on the exact rule.

### 3.9 Receipts (no GST)

- **When:** after fulfilment, from `fn_fulfil_pro_order` (DB row) and the app (email).
- **What:** a "Payment receipt" with number, date, plan, period, amount (₹), payment id and the business name and contact.
- **No GST:** no GSTIN, no tax lines (`gst_registered = false`). Reuses `billing_invoices` with tax columns 0 and a `document_type 'RECEIPT'` column, or a new `payment_receipts` table (architect choice; recommended: a new small table, to avoid misleading GST columns).
- **Email:** via the existing SMTP, Brand Band template style. The email itself is sent from the app after the DB commit, so a failed email never undoes a payment; it is logged.

### 3.10 Refunds

- **Who starts them:** the owner, from the Razorpay dashboard.
- **`refund.processed` webhook** (same signature and idempotency rules):
  - transaction → REFUNDED (`refund_amount`);
  - order → REFUNDED;
  - the entitlement from that order ends at `now()` (full refund) or is shortened pro rata (partial; the architect picks the rule);
  - an audit row.
- **No deletion.**

### 3.11 Expiry and reminders

- **Expiry:** data is never deleted; Pro features stop when `expires_at` passes (`hasPro` is false).
- **Reminders:** banner + email **7 days** and **1 day** before expiry. The cron is the existing Vercel cron route pattern (CRON_SECRET, as `finalize-attempts`) or a GitHub Actions schedule (SCHEDULED-CHECKS rule).
- **Idempotency:** a `pro_reminders_sent (user_id, entitlement_id, kind)` unique row means each reminder goes out at most once per user per kind.

### 3.12 Secrets

`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` live only in Vercel env. The owner sets them. They are never in the repo, chat or logs (the log-scan and no-personal-data gates cover planted look-alikes). F9-B uses **TEST-mode keys only**.

## 4. Migrations F9-B would need (each held; smoke as the real roles; dry-run)

1. **Plans, settings, counter:** `pro_plan_versions` (seed v1), `app_settings`, `founding_offer`.
2. **Columns:** `payment_orders` snapshot columns (paise, plan_code, plan_version, founding); `user_entitlements.source`, `order_id`, `granted_by`, `founding`.
3. **Functions:** `fn_create_pro_order`, `fn_fulfil_pro_order` (+ refund handler), `fn_has_pro`. Drop or retire `fn_verify_and_fulfill_payment`; revoke client EXECUTE on `fn_create_payment_order`.
4. **Receipts and reminders:** `payment_receipts` (or the receipt mode of `billing_invoices`) and `pro_reminders_sent`.

## 5. F9-B tests (required)

- **Signatures:** valid HMAC; tampered signature → reject; tampered amount / order → reject (API cross-check).
- **Replay:** the same payment id twice → one fulfilment; the same payment id on another order → reject (106 SKIPPED check F-3).
- **Races and double-clicks:** webhook + client verify racing → exactly one fulfilment (two concurrent sessions, rolled back); double-click checkout → one open order.
- **Amounts:** amount or currency mismatch → no fulfil.
- **Refunds:** refund webhook → entitlement ended + audit.
- **Stacking:** a renewal before expiry extends from the current end.
- **Price versions:** a price version change doesn't affect old orders (snapshot).
- **Access:** unauthenticated → blocked; under-18 (no confirmation) → blocked.
- **hasPro:** on / off / expired / library grant / revoked grant.
- **Founding:** the limit is enforced atomically; renewal at ₹599 for founding buyers.
- **Receipts:** a receipt is written; the email failure path is logged.
- **106 SKIPPED checks:** F-2 (valid → PAID once, replay no double) and F-3 now PASS.

**How they run:** all on synthetic rows in rolled-back transactions. Razorpay calls are mocked (no network) in offline tests. Only TEST-mode keys are used, by the owner, in a manual staging check.

## 6. Content inventory (CONTENT-INVENTORY-1, read-only, 2026-10-26)

**Method:**
- **Mocks:** published, non-dynamic mocks by template `test_type`.
- **Questions and articles:** mapped through the exam's **published** syllabus (syllabus node → canonical topic, including descendants).
- **CA:** not exam-specific, so it is counted globally.

| Exam | Active | Full mocks | Sectional | PYQ papers | Published questions | Articles | Syllabus mappings |
|---|---|---|---|---|---|---|---|
| SSC CGL | yes | 2 | 6 | 0 | 103 | 0 | 36 |
| SSC CHSL | no | 0 | 0 | 0 | 0 | 0 | 0 |
| SSC GD Constable | no | 0 | 0 | 0 | 0 | 0 | 0 |
| SSC MTS | no | 0 | 0 | 0 | 0 | 0 | 0 |
| QA Syllabus Test (internal) | no | 0 | 0 | 0 | 0 | 0 | 0 |
| **Totals** | | **2** | **6** | **0** | **103** (all published) | **0** | |

**Current affairs:** 0 published in the last 90 days (0 in total). Learning documents: 0 published.

**Implication for pricing (for the owner / architect):** Pro would currently unlock 2 full mocks, 6 sectional mocks, 103 questions, no PYQ papers, no articles and no CA. The free limits (30 practice / day, 1 mock / day) would cover most of today's content. Content is likely the gating factor for a paid launch, not payments.

## 7. Open questions for the architect

1. **Founding race:** fulfil an order paid after the 1,000th sale at its snapshot price (proposed), or refuse and auto-refund?
2. **Partial refunds:** shorten pro rata, or end Pro at once?
3. **Receipts:** a new `payment_receipts` table (recommended), or a receipt mode in `billing_invoices`?
4. **Library members:** may they buy while their grant is active (stacking after the grant), or never?
5. **Founding count display:** show the real remaining count on the pricing page, or nothing?
6. **Business details:** the business name, address and contact printed on receipts. These are owner data (Q1 grievance details exist; a legal entity name is still missing, LEGAL-AUDIT-1 #13).

## 8. F9-B build status (2026-10-26, TEST MODE ONLY)

**Rulings applied (architect GO, my recommendations accepted):** founding race → fulfil at the snapshot price; full refund ends that period now, partial shortens it pro rata; new `payment_receipts` table; library members may buy (a paid period stacks after the grant), only an open-ended grant blocks buying; no live founding counter on the page; receipts carry the brand name until the owner supplies the legal entity details.

**Database (APPLIED 2026-10-26, 851540c, CI green):** migrations 113 (schema) and 114 (8 service-role-only SECDEF functions). Chunked smoke AS THE REAL ROLES 27/27 before and after apply (rolled back), dry-runs OK, resilient backups pre-113 / pre-114, counts equal, types = generated, SECDEF ratchet 6/6. `fn_create_payment_order` client EXECUTE revoked. Permanent live gate `scripts/live/test_f9_pricing.cjs` (CI live `F9-PRICING`) includes the two 106 checks F-2 / F-3, now PASS.

**App:**
- `config/payments.ts`: `isProEnabled`, `checkoutState` (both flags, 3 keys, TEST key only, live refused until F9-C, refund policy published), honest closed messages.
- `lib/payments/razorpay-core.ts` (pure): checkout + webhook HMAC (constant-time), payment-vs-snapshot check, webhook parser, minimal REST client.
- `lib/payments/pro-flows.ts` (pure orchestration): order (server price → Razorpay order → attach), client verify, webhook (event id claimed once; failed events retried) → the ONE fulfil path.
- `lib/payments/pro-server.ts` (server-only): wiring, `hasPro()` (fails closed), `getAppSettings()` (Free limits), `getProPricing()`, `getProEndingSoon()`.
- Routes: server action `createProOrderAction`; `POST /api/payments/verify`; `POST /api/webhooks/razorpay`; `GET /api/cron/pro-reminders` (CRON_SECRET; counts only, not scheduled); legacy `POST /api/billing/create-order` → 410.
- UI: pricing Pro view (one Pay button, total + exact dates + "No auto-renew" + Terms / Refund / Privacy before paying; 18+ confirm link; sign-in link); Billing receipts list; dashboard banner 7 days before the end; admin `/admin/pro-library` (grant / revoke, admin only, end date required).
- Offline gate `scripts/test_f9b_payments.cjs` (CI `F9B-PAYMENTS`).

**Open / pending:**
- Refund policy page (LEGAL-AUDIT-1): checkout stays closed (`REFUND_POLICY_PUBLISHED = false`) until the owner approves the text.
- Live test-mode E2E: pending the owner adding TEST keys + webhook secret in Vercel (and the webhook URL in the Razorpay test dashboard).
- Receipt + reminder emails: no mail transport in the app yet (owner choice); nothing is sent or marked sent; receipts are in Billing.
- Free-limit ENFORCEMENT (practice 30/day, Memory Lock 50 active, 1 mock/day) and routing the scattered premium checks to `hasPro()`: next slice (needs the limit-reached copy ruled; no change while PRO_ENABLED is off).
- `fn_has_pro` counts exam-scoped promotional passes as global Pro (0 such rows); rule needed before admin promo passes are used with PRO_ENABLED on.
