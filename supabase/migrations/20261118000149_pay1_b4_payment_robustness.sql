-- =====================================================================================================================
-- 149 PAY-1 B4 payment robustness (owner decisions R1–R4, 2026-11-18; PAY_1_DESIGN.md §12). Compatible with the app on
-- main (the new arguments default to 'live'; payments are off in production, so nothing calls these functions today).
-- Rollback: docs/database/rollback/149_rollback.sql. No BEGIN / COMMIT (the runner owns the transaction).
--   1. payment_orders.gateway_mode ('test' | 'live', default 'live'): test-mode rows never mix with live ones (G7); a
--      partial index for the reconciliation job (open PRO orders by age).
--   2. fn_create_pro_order(…, p_gateway_mode DEFAULT 'live'): stores the mode; a TEST-mode order only for a QA identity
--      (auth e-mail in the reserved .test QA domain) → otherwise TEST_MODE_QA_ONLY; an idempotency key is never reused
--      across modes.
--   3. fn_fulfil_pro_order(…, p_gateway_mode DEFAULT 'live'):
--      - p_source also 'RECONCILE' (the job); an order of another mode → MODE_MISMATCH (a test key never fulfils a
--        live order and vice versa);
--      - a captured payment on an order that is already PAID by another payment → still ORDER_ALREADY_PAID (Pro is never
--        granted twice), now ALSO one PRO_DOUBLE_CHARGE audit row per payment (R4: refund it in the dashboard); a
--        captured payment on a REFUNDED / EXPIRED / CANCELLED order → one PRO_PAYMENT_TO_REFUND row;
--      - the receipt number is retried up to 5 times on a collision (attempt 0 = the old format); after 5 → an error
--        (rolls back; nothing half-done).
--   3b. fn_refund_pro_payment: the refund of such a "to refund" payment is acknowledged (PRO_UNAPPLIED_PAYMENT_REFUNDED,
--      once per refund id) instead of PAYMENT_NOT_FOUND (which made Razorpay redeliver it forever); same signature.
--   4. payment_job_leases + fn_payment_job_lease(job, holder, seconds): one reconciliation run at a time (R1: two
--      overlapping triggers → the second gets false). INVOKER; table and function service_role only; RLS on, no policy.
-- SECURITY DEFINER count unchanged (the two functions are replaced in place: same class, same grants, search_path '').
-- =====================================================================================================================

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261118000148_pay1_cleanup.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'PAY1_B4_PREFLIGHT: 148 is not applied';
    END IF;
END
$pre$;

-- 1. mode marker + the job's index
ALTER TABLE public.payment_orders ADD COLUMN gateway_mode text NOT NULL DEFAULT 'live' CHECK (gateway_mode IN ('test', 'live'));
COMMENT ON COLUMN public.payment_orders.gateway_mode IS 'PAY-1 B4: the Razorpay key mode the order was created with (test = QA only); reports and refunds never mix the two.';
CREATE INDEX idx_po_pro_open_created ON public.payment_orders (gateway_mode, created_at) WHERE order_type = 'PRO_PLAN' AND status IN ('PENDING', 'FAILED');

-- 2. order creation
DROP FUNCTION public.fn_create_pro_order(uuid, text, text);
CREATE FUNCTION public.fn_create_pro_order(p_user_id uuid, p_plan_code text, p_idempotency_key text, p_gateway_mode text DEFAULT 'live')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_plan     public.pro_plan_versions;
    v_key      text;
    v_existing public.payment_orders;
    v_recent   integer;
    v_sold     integer;
    v_limit    integer;
    v_order_id uuid;
BEGIN
    IF p_user_id IS NULL OR p_plan_code IS NULL OR p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 80
       OR p_gateway_mode IS NULL OR p_gateway_mode NOT IN ('test', 'live') THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;
    -- PAY-1 B4 (G7): test-mode orders write into the shared database — QA identities only
    IF p_gateway_mode = 'test' AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id AND pg_catalog.lower(u.email) LIKE '%@courage-library.test') THEN
        RETURN jsonb_build_object('success', false, 'code', 'TEST_MODE_QA_ONLY');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = p_user_id AND p.adult_confirmed_at IS NOT NULL) THEN
        RETURN jsonb_build_object('success', false, 'code', 'AGE_REQUIRED');
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_entitlements e WHERE e.user_id = p_user_id AND e.entitlement_type IN ('PRO_SUBSCRIPTION', 'PROMOTIONAL_PASS')
                 AND e.is_active AND e.revoked_at IS NULL AND e.expires_at IS NULL) THEN
        RETURN jsonb_build_object('success', false, 'code', 'ALREADY_UNLIMITED');
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pro_order:' || p_user_id::text, 0));
    v_key := p_user_id::text || ':' || p_idempotency_key;
    SELECT * INTO v_existing FROM public.payment_orders o WHERE o.idempotency_key = v_key;
    IF FOUND THEN
        IF v_existing.status IN ('CREATED', 'PENDING') AND v_existing.expires_at > pg_catalog.now() AND v_existing.gateway_mode = p_gateway_mode THEN
            RETURN jsonb_build_object('success', true, 'existing', true, 'order_id', v_existing.id, 'gateway_order_id', v_existing.gateway_order_id,
                                      'amount_paise', v_existing.amount_paise, 'currency', v_existing.currency, 'plan_code', v_existing.plan_code);
        END IF;
        RETURN jsonb_build_object('success', false, 'code', 'IDEMPOTENCY_KEY_USED');
    END IF;

    SELECT count(*) INTO v_recent FROM public.payment_orders o WHERE o.user_id = p_user_id AND o.created_at > pg_catalog.now() - interval '10 minutes';
    IF v_recent >= 5 THEN
        RETURN jsonb_build_object('success', false, 'code', 'RATE_LIMITED');
    END IF;

    SELECT * INTO v_plan FROM public.pro_plan_versions v WHERE v.plan_code = p_plan_code AND v.active;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'PLAN_NOT_FOUND');
    END IF;
    IF v_plan.is_founding THEN
        SELECT f.sold INTO v_sold FROM public.founding_offer f WHERE f.id;
        SELECT s.founding_limit INTO v_limit FROM public.app_settings s WHERE s.id;
        IF COALESCE(v_sold, 0) >= COALESCE(v_limit, 0)
           AND NOT EXISTS (SELECT 1 FROM public.user_entitlements e WHERE e.user_id = p_user_id AND e.founding) THEN
            RETURN jsonb_build_object('success', false, 'code', 'FOUNDING_CLOSED');
        END IF;
    END IF;

    INSERT INTO public.payment_orders (user_id, order_type, pro_plan_version_id, plan_code, plan_version, amount_paise, founding,
                                       base_amount, discount_amount, taxable_amount, tax_rate_pct, tax_amount, total_payable_amount,
                                       currency, gateway, status, idempotency_key, expires_at, gateway_mode)
    VALUES (p_user_id, 'PRO_PLAN', v_plan.id, v_plan.plan_code, v_plan.version, v_plan.price_paise, v_plan.is_founding,
            v_plan.price_paise / 100.0, 0, v_plan.price_paise / 100.0, 0, 0, v_plan.price_paise / 100.0,
            v_plan.currency, 'RAZORPAY', 'CREATED', v_key, pg_catalog.now() + interval '30 minutes', p_gateway_mode)
    RETURNING id INTO v_order_id;

    RETURN jsonb_build_object('success', true, 'existing', false, 'order_id', v_order_id, 'amount_paise', v_plan.price_paise,
                              'currency', v_plan.currency, 'plan_code', v_plan.plan_code, 'plan_version', v_plan.version,
                              'duration_months', v_plan.duration_months, 'founding', v_plan.is_founding, 'gateway_mode', p_gateway_mode);
END
$$;

-- 3. the ONE fulfil path
DROP FUNCTION public.fn_fulfil_pro_order(text, text, integer, text, text);
CREATE FUNCTION public.fn_fulfil_pro_order(p_gateway_order_id text, p_payment_id text, p_amount_paise integer, p_currency text, p_source text, p_gateway_mode text DEFAULT 'live')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_order    public.payment_orders;
    v_plan     public.pro_plan_versions;
    v_end      timestamptz;
    v_start    timestamptz;
    v_new_end  timestamptz;
    v_txn_id   uuid;
    v_ent_id   uuid;
    v_receipt  text;
    v_try      integer;
    v_n        integer;
BEGIN
    -- fail CLOSED on anything missing (106 lesson: a NULL must never pass a check)
    IF p_gateway_order_id IS NULL OR btrim(p_gateway_order_id) = '' OR p_payment_id IS NULL OR btrim(p_payment_id) = ''
       OR p_amount_paise IS NULL OR p_currency IS NULL OR p_source IS NULL OR p_source NOT IN ('CLIENT_VERIFY', 'WEBHOOK', 'RECONCILE')
       OR p_gateway_mode IS NULL OR p_gateway_mode NOT IN ('test', 'live') THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;

    SELECT * INTO v_order FROM public.payment_orders o WHERE o.gateway_order_id = p_gateway_order_id FOR UPDATE;
    IF NOT FOUND OR v_order.order_type IS DISTINCT FROM 'PRO_PLAN' THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND');
    END IF;
    -- PAY-1 B4: a key of one mode never fulfils an order of the other
    IF v_order.gateway_mode IS DISTINCT FROM p_gateway_mode THEN
        RETURN jsonb_build_object('success', false, 'code', 'MODE_MISMATCH');
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pro_entitlement:' || v_order.user_id::text, 0));

    -- the same payment id on ANOTHER order is never reused (106 rule)
    IF EXISTS (SELECT 1 FROM public.payment_transactions t WHERE t.gateway_payment_id = p_payment_id AND t.order_id <> v_order.id) THEN
        RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_ID_REUSED');
    END IF;
    IF v_order.status = 'PAID' THEN
        IF EXISTS (SELECT 1 FROM public.payment_transactions t WHERE t.order_id = v_order.id AND t.gateway_payment_id = p_payment_id) THEN
            RETURN jsonb_build_object('success', true, 'already_fulfilled', true, 'order_id', v_order.id);
        END IF;
        -- PAY-1 B4 (R4): a second captured payment on a paid order — never a second Pro; one audit row per payment for a
        -- dashboard refund
        INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, new_value, reason)
        SELECT NULL, 'system:payments', 'PRO_DOUBLE_CHARGE', 'payment_orders', v_order.id::text,
               jsonb_build_object('payment_id', p_payment_id, 'amount_paise', p_amount_paise, 'currency', p_currency, 'source', p_source,
                                  'gateway_mode', v_order.gateway_mode, 'user_id', v_order.user_id),
               'a second captured payment on a paid order: refund it in the Razorpay dashboard'
         WHERE NOT EXISTS (SELECT 1 FROM public.admin_audit_logs a WHERE a.action_type = 'PRO_DOUBLE_CHARGE' AND a.target_id = v_order.id::text
                             AND a.new_value ->> 'payment_id' = p_payment_id);
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_ALREADY_PAID');
    END IF;
    IF v_order.status NOT IN ('CREATED', 'PENDING', 'FAILED') THEN
        -- PAY-1 B4 (R4): money taken for an order that can no longer be fulfilled — refund it in the dashboard
        INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, new_value, reason)
        SELECT NULL, 'system:payments', 'PRO_PAYMENT_TO_REFUND', 'payment_orders', v_order.id::text,
               jsonb_build_object('payment_id', p_payment_id, 'amount_paise', p_amount_paise, 'currency', p_currency, 'source', p_source,
                                  'gateway_mode', v_order.gateway_mode, 'user_id', v_order.user_id, 'order_status', v_order.status),
               'a captured payment on an order that cannot be fulfilled: refund it in the Razorpay dashboard'
         WHERE NOT EXISTS (SELECT 1 FROM public.admin_audit_logs a WHERE a.action_type = 'PRO_PAYMENT_TO_REFUND' AND a.target_id = v_order.id::text
                             AND a.new_value ->> 'payment_id' = p_payment_id);
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_PAYABLE', 'status', v_order.status);
    END IF;
    IF p_amount_paise IS DISTINCT FROM v_order.amount_paise OR p_currency IS DISTINCT FROM v_order.currency THEN
        RETURN jsonb_build_object('success', false, 'code', 'AMOUNT_MISMATCH');
    END IF;

    SELECT * INTO v_plan FROM public.pro_plan_versions v WHERE v.id = v_order.pro_plan_version_id;
    SELECT max(e.expires_at) INTO v_end FROM public.user_entitlements e
     WHERE e.user_id = v_order.user_id AND e.entitlement_type IN ('PRO_SUBSCRIPTION', 'PROMOTIONAL_PASS')
       AND e.is_active AND e.revoked_at IS NULL AND e.expires_at > pg_catalog.now();
    v_start := GREATEST(pg_catalog.now(), COALESCE(v_end, pg_catalog.now()));
    v_new_end := v_start + pg_catalog.make_interval(months => v_plan.duration_months);

    INSERT INTO public.payment_transactions (order_id, gateway, gateway_payment_id, amount, currency, status, captured_at, gateway_response_json)
    VALUES (v_order.id, 'RAZORPAY', p_payment_id, p_amount_paise / 100.0, p_currency, 'SUCCESS', pg_catalog.now(),
            jsonb_build_object('source', p_source, 'amount_paise', p_amount_paise))
    RETURNING id INTO v_txn_id;

    INSERT INTO public.user_entitlements (user_id, entitlement_type, starts_at, expires_at, is_active, source, order_id, founding, pro_plan_version_id)
    VALUES (v_order.user_id, 'PRO_SUBSCRIPTION', v_start, v_new_end, true, 'PAYMENT', v_order.id, v_order.founding, v_plan.id)
    RETURNING id INTO v_ent_id;

    UPDATE public.payment_orders o SET status = 'PAID', updated_at = pg_catalog.now() WHERE o.id = v_order.id;
    IF v_order.founding THEN
        UPDATE public.founding_offer f SET sold = f.sold + 1 WHERE f.id;
    END IF;

    -- PAY-1 B4 (G10): a receipt-number collision no longer aborts the fulfil — up to 5 numbers (attempt 0 = the old one)
    v_n := 0;
    FOR v_try IN 0..4 LOOP
        v_receipt := 'CL-R-' || pg_catalog.to_char(pg_catalog.now() AT TIME ZONE 'Asia/Kolkata', 'YYMMDD') || '-'
                     || pg_catalog.upper(pg_catalog.substr(pg_catalog.md5(v_order.id::text || p_payment_id || CASE WHEN v_try = 0 THEN '' ELSE ':' || v_try::text END), 1, 6));
        INSERT INTO public.payment_receipts (receipt_number, user_id, order_id, transaction_id, plan_code, plan_version, period_start, period_end,
                                             amount_paise, currency, gateway_payment_id, business_name)
        VALUES (v_receipt, v_order.user_id, v_order.id, v_txn_id, v_order.plan_code, v_order.plan_version, v_start, v_new_end,
                p_amount_paise, p_currency, p_payment_id, 'Courage Library')
        ON CONFLICT (receipt_number) DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        EXIT WHEN v_n = 1;
    END LOOP;
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'PRO_RECEIPT_NUMBER_EXHAUSTED' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, new_value, reason)
    VALUES (NULL, 'system:payments', 'PRO_ORDER_FULFILLED', 'payment_orders', v_order.id::text,
            jsonb_build_object('plan_code', v_order.plan_code, 'plan_version', v_order.plan_version, 'amount_paise', p_amount_paise,
                               'starts_at', v_start, 'expires_at', v_new_end, 'source', p_source, 'founding', v_order.founding,
                               'gateway_mode', v_order.gateway_mode), NULL);

    RETURN jsonb_build_object('success', true, 'already_fulfilled', false, 'order_id', v_order.id, 'user_id', v_order.user_id,
                              'entitlement_id', v_ent_id, 'receipt_number', v_receipt, 'starts_at', v_start, 'expires_at', v_new_end,
                              'founding', v_order.founding);
END
$$;

-- 3b. a refund of a payment Pro was never granted for (R4: a double charge / a payment on an unfulfillable order,
--     refunded in the dashboard): recorded once per refund id and acknowledged (success, unapplied) — before 149 it was
--     PAYMENT_NOT_FOUND → 409 → Razorpay redelivered it forever. Everything else is the 114 body unchanged.
CREATE OR REPLACE FUNCTION public.fn_refund_pro_payment(p_payment_id text, p_refund_amount_paise integer, p_gateway_refund_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_txn     public.payment_transactions;
    v_order   public.payment_orders;
    v_ent     public.user_entitlements;
    v_paid    integer;
    v_total   integer;
    v_full    boolean;
    v_days    integer;
    v_new_end timestamptz;
    v_flag    public.admin_audit_logs;
BEGIN
    IF p_payment_id IS NULL OR btrim(p_payment_id) = '' OR p_refund_amount_paise IS NULL OR p_refund_amount_paise <= 0
       OR p_gateway_refund_id IS NULL OR btrim(p_gateway_refund_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;
    SELECT * INTO v_txn FROM public.payment_transactions t WHERE t.gateway_payment_id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        -- PAY-1 B4: a payment recorded as "to refund" (no Pro was granted for it) — acknowledge its refund once
        SELECT * INTO v_flag FROM public.admin_audit_logs a
         WHERE a.action_type IN ('PRO_DOUBLE_CHARGE', 'PRO_PAYMENT_TO_REFUND') AND a.new_value ->> 'payment_id' = p_payment_id
         ORDER BY a.created_at LIMIT 1;
        IF FOUND THEN
            INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, new_value, reason)
            SELECT NULL, 'system:payments', 'PRO_UNAPPLIED_PAYMENT_REFUNDED', 'payment_orders', v_flag.target_id,
                   jsonb_build_object('payment_id', p_payment_id, 'refund_id', p_gateway_refund_id, 'refund_paise', p_refund_amount_paise), NULL
             WHERE NOT EXISTS (SELECT 1 FROM public.admin_audit_logs a WHERE a.action_type = 'PRO_UNAPPLIED_PAYMENT_REFUNDED'
                                 AND a.new_value ->> 'refund_id' = p_gateway_refund_id);
            RETURN jsonb_build_object('success', true, 'unapplied', true, 'order_id', v_flag.target_id);
        END IF;
        RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_NOT_FOUND');
    END IF;
    IF COALESCE(v_txn.gateway_response_json -> 'refund_ids', '[]'::jsonb) ? p_gateway_refund_id THEN
        RETURN jsonb_build_object('success', true, 'already_processed', true);
    END IF;
    SELECT * INTO v_order FROM public.payment_orders o WHERE o.id = v_txn.order_id FOR UPDATE;
    v_paid := COALESCE(v_order.amount_paise, (v_txn.amount * 100)::integer);
    v_total := COALESCE((v_txn.refund_amount * 100)::integer, 0) + p_refund_amount_paise;
    IF v_total > v_paid THEN
        RETURN jsonb_build_object('success', false, 'code', 'REFUND_EXCEEDS_PAYMENT');
    END IF;
    v_full := v_total >= v_paid;

    SELECT * INTO v_ent FROM public.user_entitlements e WHERE e.order_id = v_order.id FOR UPDATE;
    IF FOUND AND v_ent.is_active THEN
        IF v_full THEN
            UPDATE public.user_entitlements e SET is_active = false, revoked_at = pg_catalog.now(), updated_at = pg_catalog.now() WHERE e.id = v_ent.id;
        ELSE
            -- pro rata: remove (period days × this refund ÷ paid), rounded down
            v_days := floor(EXTRACT(EPOCH FROM (v_ent.expires_at - v_ent.starts_at)) / 86400.0 * p_refund_amount_paise / v_paid)::integer;
            v_new_end := v_ent.expires_at - pg_catalog.make_interval(days => v_days);
            IF v_new_end <= v_ent.starts_at OR v_new_end <= pg_catalog.now() THEN
                UPDATE public.user_entitlements e SET is_active = false, revoked_at = pg_catalog.now(), updated_at = pg_catalog.now() WHERE e.id = v_ent.id;
            ELSE
                UPDATE public.user_entitlements e SET expires_at = v_new_end, updated_at = pg_catalog.now() WHERE e.id = v_ent.id;
            END IF;
        END IF;
    END IF;

    UPDATE public.payment_transactions t
       SET refund_amount = v_total / 100.0, refund_reason = 'GATEWAY_REFUND', status = CASE WHEN v_full THEN 'REFUNDED' ELSE t.status END,
           gateway_response_json = COALESCE(t.gateway_response_json, '{}'::jsonb)
               || jsonb_build_object('refund_ids', COALESCE(t.gateway_response_json -> 'refund_ids', '[]'::jsonb) || to_jsonb(p_gateway_refund_id)),
           updated_at = pg_catalog.now()
     WHERE t.id = v_txn.id;
    IF v_full THEN
        UPDATE public.payment_orders o SET status = 'REFUNDED', updated_at = pg_catalog.now() WHERE o.id = v_order.id;
    END IF;

    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, new_value, reason)
    VALUES (NULL, 'system:payments', CASE WHEN v_full THEN 'PRO_ORDER_REFUNDED' ELSE 'PRO_ORDER_PARTIALLY_REFUNDED' END, 'payment_orders',
            v_order.id::text, jsonb_build_object('refund_paise', p_refund_amount_paise, 'refunded_total_paise', v_total, 'full', v_full), NULL);

    RETURN jsonb_build_object('success', true, 'full', v_full, 'refunded_total_paise', v_total, 'order_id', v_order.id);
END
$$;

REVOKE ALL ON FUNCTION public.fn_create_pro_order(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_pro_order(uuid, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_fulfil_pro_order(text, text, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fulfil_pro_order(text, text, integer, text, text, text) TO service_role;

-- 4. one reconciliation run at a time
CREATE TABLE public.payment_job_leases (
    job         text PRIMARY KEY CHECK (job ~ '^[a-z][a-z0-9_]{2,40}$'),
    holder      uuid NOT NULL,
    lease_until timestamptz NOT NULL
);
COMMENT ON TABLE public.payment_job_leases IS 'PAY-1 B4: one row per payment job; a run holds the lease until lease_until (service role only).';
ALTER TABLE public.payment_job_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payment_job_leases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.payment_job_leases TO service_role;

CREATE FUNCTION public.fn_payment_job_lease(p_job text, p_holder uuid, p_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_n integer;
BEGIN
    IF p_job IS NULL OR p_holder IS NULL OR p_seconds IS NULL OR p_seconds < 0 OR p_seconds > 900 THEN
        RETURN false;
    END IF;
    IF p_seconds = 0 THEN
        -- release: only the holder
        UPDATE public.payment_job_leases l SET lease_until = pg_catalog.now() WHERE l.job = p_job AND l.holder = p_holder;
        RETURN true;
    END IF;
    INSERT INTO public.payment_job_leases AS l (job, holder, lease_until)
    VALUES (p_job, p_holder, pg_catalog.now() + pg_catalog.make_interval(secs => p_seconds))
    ON CONFLICT (job) DO UPDATE SET holder = EXCLUDED.holder, lease_until = EXCLUDED.lease_until
     WHERE l.lease_until <= pg_catalog.now() OR l.holder = EXCLUDED.holder;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n = 1;
END
$$;
REVOKE ALL ON FUNCTION public.fn_payment_job_lease(text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_payment_job_lease(text, uuid, integer) TO service_role;

DO $proof$
BEGIN
    IF to_regprocedure('public.fn_create_pro_order(uuid, text, text)') IS NOT NULL
       OR to_regprocedure('public.fn_fulfil_pro_order(text, text, integer, text, text)') IS NOT NULL THEN
        RAISE EXCEPTION 'PAY1_B4_PROOF: an old signature is still there';
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_create_pro_order(uuid, text, text, text)'::regprocedure)
       OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_fulfil_pro_order(text, text, integer, text, text, text)'::regprocedure)
       OR (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_payment_job_lease(text, uuid, integer)'::regprocedure) THEN
        RAISE EXCEPTION 'PAY1_B4_PROOF: DEFINER / INVOKER classes are not as designed';
    END IF;
    IF has_function_privilege('authenticated', 'public.fn_create_pro_order(uuid, text, text, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_fulfil_pro_order(text, text, integer, text, text, text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fn_fulfil_pro_order(text, text, integer, text, text, text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fn_payment_job_lease(text, uuid, integer)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_payment_job_lease(text, uuid, integer)', 'EXECUTE')
       OR has_table_privilege('authenticated', 'public.payment_job_leases', 'SELECT')
       OR has_table_privilege('anon', 'public.payment_job_leases', 'SELECT') THEN
        RAISE EXCEPTION 'PAY1_B4_PROOF: a client role can reach a payment function or the lease table';
    END IF;
    IF EXISTS (SELECT 1 FROM public.payment_orders WHERE gateway_mode <> 'live') THEN
        RAISE EXCEPTION 'PAY1_B4_PROOF: existing orders must be live';
    END IF;
END
$proof$;
