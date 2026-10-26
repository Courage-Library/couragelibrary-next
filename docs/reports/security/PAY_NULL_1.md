# PAY-NULL-1: payment RPCs and NULL (read-only analysis + held migration 106)

**Scope rules (strict):** no live payment calls, no gateway API, no apply. The smoke used synthetic rows only, inside one rolled-back transaction, with no network.

- **Date:** 2026-10-25.
- **Data:** 0 payment orders and 0 transactions exist. Payments are off (`config/payments.ts`).

## (a) Analysis

| Question | Answer |
|---|---|
| Who can EXECUTE `fn_process_payment_webhook(text,text,text,jsonb,boolean)` and `fn_verify_and_fulfill_payment(uuid,text,text,text,numeric,text,text,text)`? | Only `service_role` (and the owner `postgres`). `anon` and `authenticated`: no. Both are SECURITY DEFINER with `search_path` set to `public, pg_temp`. |
| Does a route verify the Razorpay HMAC before calling the RPC? | **There is no caller at all.** No app code calls either RPC. There is no webhook route. `app/api/billing/fulfill-order/route.ts` refuses every request before any auth, DB or RPC work: 503 when payments are off, 501 `PAYMENT_VERIFICATION_NOT_IMPLEMENTED` when on (SEC-1A containment). No HMAC / `timingSafeEqual` code for payments exists. |
| Where does the "signature valid" flag come from? | Only from the RPC caller (`p_signature_verified boolean`). Today nobody passes it. |
| Can it be NULL? | Yes. `IF NOT p_signature_verified` treats NULL as "not denied": **proven (rolled back) that a NULL flag is accepted** and the event is stored as `signature_verified = true`. |
| Other NULL / fail-open paths | Webhook: a NULL `gateway_event_id` never conflicts, so it bypasses the duplicate check. Fulfil: (1) `p_gateway_signature` is stored but never required; (2) `p_amount IS NOT NULL AND p_amount != total` skips the amount check when the amount is NULL; (3) `ON CONFLICT (gateway_payment_id) DO UPDATE` lets a payment id already recorded for order A be used to mark order B PAID. |
| The database cannot verify the HMAC | It holds no secret. The future route must verify the signature on the **raw body** with a constant-time compare **before** calling, and pass `true` only then. |

## Pre-existing defect found: PAY-FULFIL-1

`fn_verify_and_fulfill_payment` reads and writes `user_entitlements.valid_from`, `valid_until` and `status`. The live table has `starts_at`, `expires_at` and `is_active`, so **every fulfil fails with 42703 today**. It fails closed by accident, but payments cannot work until it is fixed.

Not changed here (payments hard limit). It needs its own ruling. Because of it, the "fulfils once / replay / cross-order" checks cannot run.

## (b) Migration 106 (held, NOT applied)

- **File:** `supabase/migrations/20261025000106_payment_null_fail_closed.sql`.
- **Rollback:** `docs/database/rollback/106_rollback.sql`.
- **How it was built:** generated from the live definitions with exact substitutions. Both functions stay SECURITY DEFINER with service-role-only EXECUTE.

| Change | Function |
|---|---|
| `p_signature_verified IS NOT TRUE` → reject (NULL or false) | webhook |
| NULL or empty `gateway` / `gateway_event_id` → reject | webhook |
| NULL or empty `p_gateway_payment_id` or `p_gateway_signature` → reject | fulfil |
| Amount mandatory and equal to the order total (`p_amount IS NULL OR total IS NULL OR p_amount <> total` → reject) | fulfil |
| A `gateway_payment_id` already recorded for **another** order → reject | fulfil |
| Same-order idempotency unchanged: PAID → `already_fulfilled`; `ON CONFLICT (gateway_payment_id)` | fulfil |

## (c) Smoke

Synthetic rows only, no network, one rolled-back transaction, run as `service_role`.

| Check | Result |
|---|---|
| B-1 before 106: a NULL flag is accepted by the webhook | proven |
| W-1 after: NULL flag rejected, `false` rejected | PASS |
| W-2 after: `true` + valid → stored once; replay → `duplicate`, not stored again | PASS |
| W-3 after: NULL event id rejected | PASS |
| F-1 after: NULL amount, NULL signature and a wrong amount rejected | PASS |
| F-2 valid → PAID once; replay → no double fulfil | **PASS** (F9-B, 2026-10-26: the ONE fulfil path `fn_fulfil_pro_order`, migration 114; live gate `F9-PRICING`) |
| F-3 the same payment id on another order → rejected | **PASS** (F9-B: `PAYMENT_ID_REUSED`; live gate `F9-PRICING`) |
| M-1 SECURITY DEFINER, no client EXECUTE | PASS |
| R-1 live unchanged, no synthetic rows left | PASS |

## Decisions needed (architect)

1. Go or no-go for 106.
2. A ruling on PAY-FULFIL-1, which is needed before any payment can be fulfilled. Once it is fixed, the F-2 and F-3 checks run as written.
