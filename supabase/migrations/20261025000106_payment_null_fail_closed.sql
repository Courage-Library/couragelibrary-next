-- =====================================================================================================================
-- 106 PAY-NULL-1 — payment RPCs fail CLOSED on NULL / absent values (payments: STRICT — NOT APPLIED until the architect's
-- separate "go" — GIVEN 2026-10-25; no live payment call, no gateway API). Rollback: docs/database/rollback/106_rollback.sql
-- No BEGIN / COMMIT here: the runner owns the transaction. Generated from the live definitions (exact substitutions).
-- Report: docs/reports/security/PAY_NULL_1.md
--
--   fn_process_payment_webhook: `IF NOT p_signature_verified` let a NULL flag through → `IS NOT TRUE`; a NULL / empty
--     event id is rejected (idempotency on (gateway, gateway_event_id) needs a real id).
--   fn_verify_and_fulfill_payment: absent signature rejected; amount mandatory and equal to the order total (NULL on
--     either side = reject); a gateway payment id already used for another order is rejected. Same-order idempotency
--     unchanged (PAID → already_fulfilled; ON CONFLICT (gateway_payment_id)).
-- Both stay SECURITY DEFINER, same search_path, EXECUTE for service_role only (no client grant).
-- =====================================================================================================================

CREATE OR REPLACE FUNCTION public.fn_process_payment_webhook(p_gateway text, p_gateway_event_id text, p_event_type text, p_payload jsonb, p_signature_verified boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_event_id UUID;
BEGIN
    -- 106 PAY-NULL-1: fail CLOSED — only an explicit TRUE passes (NULL / absent = rejected)
    IF p_signature_verified IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid gateway webhook signature');
    END IF;

    -- 106: idempotency needs a real event id (a NULL never conflicts, so a NULL id could be stored again and again)
    IF p_gateway IS NULL OR p_gateway_event_id IS NULL OR btrim(p_gateway_event_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'gateway and gateway_event_id are required');
    END IF;

    INSERT INTO public.payment_webhook_events (
        gateway, gateway_event_id, event_type, raw_payload, signature_verified, processing_status
    ) VALUES (
        p_gateway, p_gateway_event_id, p_event_type, p_payload, true, 'PENDING'
    ) ON CONFLICT (gateway, gateway_event_id) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
        RETURN jsonb_build_object('success', true, 'duplicate', true, 'message', 'Webhook event already processed');
    END IF;

    RETURN jsonb_build_object('success', true, 'event_id', v_event_id, 'duplicate', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_verify_and_fulfill_payment(p_order_id uuid, p_gateway_payment_id text, p_gateway_signature text, p_payment_method text DEFAULT 'UPI'::text, p_amount numeric DEFAULT NULL::numeric, p_billing_name text DEFAULT 'Student'::text, p_billing_address text DEFAULT NULL::text, p_billing_state text DEFAULT 'DELHI'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_order RECORD;
    v_plan RECORD;
    v_txn_id UUID;
    v_invoice_id UUID;
    v_invoice_num TEXT;
    v_entitlement_id UUID;
    v_current_expiry TIMESTAMPTZ;
    v_expires_at TIMESTAMPTZ;
    v_cgst NUMERIC(10,2) := 0.00;
    v_sgst NUMERIC(10,2) := 0.00;
    v_igst NUMERIC(10,2) := 0.00;
BEGIN
    IF p_order_id IS NULL OR p_gateway_payment_id IS NULL OR btrim(p_gateway_payment_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'order_id and gateway_payment_id are required');
    END IF;

    -- 106 PAY-NULL-1: an absent signature is rejected. The database cannot check the HMAC (no secret here): the caller
    -- MUST verify the gateway signature on the raw body (constant-time compare) before calling; this only refuses a
    -- call that carries none.
    IF p_gateway_signature IS NULL OR btrim(p_gateway_signature) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'gateway signature is required');
    END IF;

    SELECT * INTO v_order
    FROM public.payment_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment order not found');
    END IF;

    IF v_order.status = 'PAID' THEN
        RETURN jsonb_build_object('success', true, 'order_id', v_order.id, 'status', 'PAID', 'already_fulfilled', true);
    END IF;

    IF v_order.status IN ('CANCELLED', 'EXPIRED', 'REFUNDED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot fulfill order in ' || v_order.status || ' state');
    END IF;

    -- 106: fail CLOSED — the paid amount is mandatory and must equal the order total (a NULL on either side = reject)
    IF p_amount IS NULL OR v_order.total_payable_amount IS NULL OR p_amount <> v_order.total_payable_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount mismatch');
    END IF;

    -- 106: a gateway payment id already recorded for ANOTHER order is never reused (same-order replay unchanged:
    -- ON CONFLICT below; an already PAID order returns already_fulfilled above)
    IF EXISTS (SELECT 1 FROM public.payment_transactions t WHERE t.gateway_payment_id = p_gateway_payment_id AND t.order_id <> v_order.id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'gateway payment id already used for another order');
    END IF;

    INSERT INTO public.payment_transactions (
        order_id, gateway, gateway_payment_id, gateway_signature,
        payment_method, amount, currency, status, captured_at
    ) VALUES (
        v_order.id, v_order.gateway, p_gateway_payment_id, p_gateway_signature,
        p_payment_method, v_order.total_payable_amount, v_order.currency, 'SUCCESS', now()
    ) ON CONFLICT (gateway_payment_id) DO UPDATE
        SET status = 'SUCCESS', captured_at = now()
    RETURNING id INTO v_txn_id;

    UPDATE public.payment_orders
    SET status = 'PAID', updated_at = now()
    WHERE id = v_order.id;

    UPDATE public.coupon_redemptions
    SET status = 'COMMITTED', committed_at = now()
    WHERE order_id = v_order.id;

    UPDATE public.discount_coupons dc
    SET current_usage_count = current_usage_count + 1, updated_at = now()
    FROM public.coupon_redemptions cr
    WHERE cr.order_id = v_order.id AND cr.coupon_id = dc.id;

    IF v_order.order_type = 'SUBSCRIPTION_PURCHASE' THEN
        SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_order.plan_id;

        SELECT valid_until INTO v_current_expiry
        FROM public.user_entitlements
        WHERE user_id = v_order.user_id
          AND entitlement_type = 'SUBSCRIPTION'
          AND status = 'ACTIVE'
        ORDER BY valid_until DESC
        LIMIT 1;

        IF v_current_expiry IS NOT NULL AND v_current_expiry > now() THEN
            v_expires_at := v_current_expiry + (v_plan.duration_days || ' days')::interval;
        ELSE
            v_expires_at := now() + (v_plan.duration_days || ' days')::interval;
        END IF;

        INSERT INTO public.user_entitlements (
            user_id, entitlement_type, status, valid_from, valid_until
        ) VALUES (
            v_order.user_id, 'SUBSCRIPTION', 'ACTIVE', now(), v_expires_at
        ) RETURNING id INTO v_entitlement_id;

    ELSIF v_order.order_type = 'COURSE_PURCHASE' THEN
        INSERT INTO public.user_entitlements (
            user_id, entitlement_type, course_id, status, valid_from
        ) VALUES (
            v_order.user_id, 'COURSE_PURCHASE', v_order.course_id, 'ACTIVE', now()
        ) RETURNING id INTO v_entitlement_id;
    END IF;

    IF upper(trim(p_billing_state)) = 'DELHI' THEN
        v_cgst := round(v_order.tax_amount / 2.00, 2);
        v_sgst := v_order.tax_amount - v_cgst;
    ELSE
        v_igst := v_order.tax_amount;
    END IF;

    v_invoice_num := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('public.seq_invoice_number')::text, 7, '0');

    INSERT INTO public.billing_invoices (
        invoice_number, user_id, order_id, transaction_id, invoice_date,
        billing_name, billing_address, billing_state, place_of_supply,
        taxable_amount, tax_rate_pct, cgst_amount, sgst_amount, igst_amount,
        total_amount, currency, status
    ) VALUES (
        v_invoice_num, v_order.user_id, v_order.id, v_txn_id, now(),
        p_billing_name, p_billing_address, p_billing_state, p_billing_state,
        v_order.taxable_amount, v_order.tax_rate_pct, v_cgst, v_sgst, v_igst,
        v_order.total_payable_amount, v_order.currency, 'ISSUED'
    ) RETURNING id INTO v_invoice_id;

    PERFORM public.fn_send_user_notification(
        p_user_id := v_order.user_id,
        p_title := 'Payment Successful & Access Activated!',
        p_body := 'Your order ' || v_invoice_num || ' for ₹' || v_order.total_payable_amount::text || ' is confirmed. Your access is active.',
        p_category := 'SYSTEM',
        p_priority := 'HIGH',
        p_idempotency_key := 'order_success:' || v_order.id::text
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'transaction_id', v_txn_id,
        'entitlement_id', v_entitlement_id,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'status', 'PAID'
    );
END;
$function$;
