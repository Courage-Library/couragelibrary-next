-- ============================================================================
-- COURAGE LIBRARY — PHASE 3I: MONETIZATION RUNTIME FUNCTIONS & RPCs
-- Target Database: couragelibrary-next
-- ============================================================================

-- 1. Create Payment Order RPC (Server-Authoritative Checkout)
CREATE OR REPLACE FUNCTION public.fn_create_payment_order(
    p_order_type TEXT,
    p_plan_id UUID DEFAULT NULL,
    p_course_id UUID DEFAULT NULL,
    p_coupon_code TEXT DEFAULT NULL,
    p_gateway TEXT DEFAULT 'RAZORPAY',
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_plan RECORD;
    v_course RECORD;
    v_coupon RECORD;
    v_base_amount NUMERIC(10,2);
    v_discount_amount NUMERIC(10,2) := 0.00;
    v_taxable_amount NUMERIC(10,2);
    v_tax_rate NUMERIC(5,2) := 18.00;
    v_tax_amount NUMERIC(10,2);
    v_total_amount NUMERIC(10,2);
    v_user_coupon_count INTEGER;
    v_order_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Check idempotency
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, status, total_payable_amount INTO v_order_id, v_taxable_amount, v_total_amount
        FROM public.payment_orders
        WHERE idempotency_key = p_idempotency_key AND user_id = v_user_id;

        IF v_order_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'order_id', v_order_id,
                'status', v_taxable_amount,
                'total_payable_amount', v_total_amount,
                'duplicate', true
            );
        END IF;
    END IF;

    -- Resolve product and catalog price
    IF p_order_type = 'SUBSCRIPTION_PURCHASE' THEN
        IF p_plan_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'plan_id is required for subscription purchase');
        END IF;

        SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id AND is_active = true;
        IF v_plan IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Active subscription plan not found');
        END IF;

        v_base_amount := v_plan.base_price_inr;
        v_tax_rate := v_plan.tax_rate_pct;

    ELSIF p_order_type = 'COURSE_PURCHASE' THEN
        IF p_course_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'course_id is required for course purchase');
        END IF;

        SELECT * INTO v_course FROM public.courses WHERE id = p_course_id AND status = 'PUBLISHED';
        IF v_course IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Published course not found');
        END IF;

        v_base_amount := COALESCE(v_course.price_inr, 0.00);
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid order_type');
    END IF;

    -- Lock and validate discount coupon if supplied (Deadlock Prevention Order 1)
    IF p_coupon_code IS NOT NULL AND length(trim(p_coupon_code)) > 0 THEN
        SELECT * INTO v_coupon
        FROM public.discount_coupons
        WHERE coupon_code = upper(trim(p_coupon_code)) AND is_active = true
        FOR UPDATE;

        IF v_coupon IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid or inactive coupon code');
        END IF;

        -- Validate coupon dates
        IF (v_coupon.starts_at IS NOT NULL AND now() < v_coupon.starts_at) OR
           (v_coupon.expires_at IS NOT NULL AND now() > v_coupon.expires_at) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Coupon has expired or is not yet active');
        END IF;

        -- Validate minimum order value
        IF v_base_amount < v_coupon.min_order_inr THEN
            RETURN jsonb_build_object('success', false, 'error', 'Order amount does not meet coupon minimum spend');
        END IF;

        -- Validate total global usage limit
        IF v_coupon.max_total_usage IS NOT NULL AND v_coupon.current_usage_count >= v_coupon.max_total_usage THEN
            RETURN jsonb_build_object('success', false, 'error', 'Coupon usage limit has been reached');
        END IF;

        -- Validate per-user usage limit
        SELECT COUNT(*) INTO v_user_coupon_count
        FROM public.coupon_redemptions
        WHERE coupon_id = v_coupon.id AND user_id = v_user_id AND status IN ('RESERVED', 'COMMITTED');

        IF v_user_coupon_count >= v_coupon.max_usage_per_user THEN
            RETURN jsonb_build_object('success', false, 'error', 'You have reached the maximum redemptions for this coupon');
        END IF;

        -- Calculate discount amount
        IF v_coupon.discount_type = 'PERCENTAGE' THEN
            v_discount_amount := round((v_base_amount * v_coupon.discount_value) / 100.00, 2);
            IF v_coupon.max_discount_inr IS NOT NULL AND v_discount_amount > v_coupon.max_discount_inr THEN
                v_discount_amount := v_coupon.max_discount_inr;
            END IF;
        ELSE
            v_discount_amount := v_coupon.discount_value;
        END IF;

        IF v_discount_amount > v_base_amount THEN
            v_discount_amount := v_base_amount;
        END IF;
    END IF;

    -- Calculate financial totals
    v_taxable_amount := v_base_amount - v_discount_amount;
    v_tax_amount := round((v_taxable_amount * v_tax_rate) / 100.00, 2);
    v_total_amount := v_taxable_amount + v_tax_amount;

    -- Insert Payment Order (Deadlock Prevention Order 2)
    INSERT INTO public.payment_orders (
        user_id, order_type, plan_id, course_id, base_amount,
        discount_amount, taxable_amount, tax_rate_pct, tax_amount,
        total_payable_amount, currency, gateway, status, idempotency_key, expires_at
    ) VALUES (
        v_user_id, p_order_type, p_plan_id, p_course_id, v_base_amount,
        v_discount_amount, v_taxable_amount, v_tax_rate, v_tax_amount,
        v_total_amount, 'INR', p_gateway, 'CREATED', p_idempotency_key, now() + interval '30 minutes'
    ) RETURNING id INTO v_order_id;

    -- Reserve coupon redemption (Deadlock Prevention Order 3)
    IF v_coupon IS NOT NULL THEN
        INSERT INTO public.coupon_redemptions (
            coupon_id, user_id, order_id, discount_amount, status, reserved_at
        ) VALUES (
            v_coupon.id, v_user_id, v_order_id, v_discount_amount, 'RESERVED', now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'base_amount', v_base_amount,
        'discount_amount', v_discount_amount,
        'taxable_amount', v_taxable_amount,
        'tax_amount', v_tax_amount,
        'total_payable_amount', v_total_amount,
        'currency', 'INR',
        'expires_at', now() + interval '30 minutes'
    );
END;
$$;

-- 2. Verify & Fulfill Payment (Atomic Service-Role Fulfillment Engine)
CREATE OR REPLACE FUNCTION public.fn_verify_and_fulfill_payment(
    p_order_id UUID,
    p_gateway_payment_id TEXT,
    p_gateway_signature TEXT,
    p_payment_method TEXT DEFAULT 'UPI',
    p_amount NUMERIC(10,2) DEFAULT NULL,
    p_billing_name TEXT DEFAULT 'Student',
    p_billing_address TEXT DEFAULT NULL,
    p_billing_state TEXT DEFAULT 'DELHI'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_plan RECORD;
    v_course RECORD;
    v_txn_id UUID;
    v_invoice_id UUID;
    v_invoice_num TEXT;
    v_entitlement_id UUID;
    v_cgst NUMERIC(10,2) := 0.00;
    v_sgst NUMERIC(10,2) := 0.00;
    v_igst NUMERIC(10,2) := 0.00;
    v_expires_at TIMESTAMPTZ;
BEGIN
    IF p_order_id IS NULL OR p_gateway_payment_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'order_id and gateway_payment_id are required');
    END IF;

    -- Lock Order row (Deadlock Prevention Order 2)
    SELECT * INTO v_order
    FROM public.payment_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment order not found');
    END IF;

    -- Idempotent check: If already PAID, return success immediately
    IF v_order.status = 'PAID' THEN
        RETURN jsonb_build_object('success', true, 'order_id', v_order.id, 'status', 'PAID', 'already_fulfilled', true);
    END IF;

    -- Validate payment amount matches order payable amount
    IF p_amount IS NOT NULL AND p_amount != v_order.total_payable_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount mismatch');
    END IF;

    -- 1. Insert Payment Transaction Record (Deadlock Prevention Order 4)
    INSERT INTO public.payment_transactions (
        order_id, gateway, gateway_payment_id, gateway_signature,
        payment_method, amount, currency, status, captured_at
    ) VALUES (
        v_order.id, v_order.gateway, p_gateway_payment_id, p_gateway_signature,
        p_payment_method, v_order.total_payable_amount, v_order.currency, 'SUCCESS', now()
    ) ON CONFLICT (gateway_payment_id) DO UPDATE
        SET status = 'SUCCESS', captured_at = now()
    RETURNING id INTO v_txn_id;

    -- 2. Transition Order Status to PAID
    UPDATE public.payment_orders
    SET status = 'PAID', updated_at = now()
    WHERE id = v_order.id;

    -- 3. Commit Coupon Redemption and increment count
    UPDATE public.coupon_redemptions
    SET status = 'COMMITTED', committed_at = now()
    WHERE order_id = v_order.id;

    UPDATE public.discount_coupons dc
    SET current_usage_count = current_usage_count + 1, updated_at = now()
    FROM public.coupon_redemptions cr
    WHERE cr.order_id = v_order.id AND cr.coupon_id = dc.id;

    -- 4. Issue Entitlement into user_entitlements (Phase 3E/3F Integration)
    IF v_order.order_type = 'SUBSCRIPTION_PURCHASE' THEN
        SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_order.plan_id;
        v_expires_at := now() + (v_plan.duration_days || ' days')::interval;

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

    -- 5. Generate Legal Sequential GST Tax Invoice (Deadlock Prevention Order 6)
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

    -- 6. Trigger In-App Notification (Phase 3H Integration)
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
$$;

-- 3. Ingest Webhook Event RPC (Append-Only Replay Protection)
CREATE OR REPLACE FUNCTION public.fn_process_payment_webhook(
    p_gateway TEXT,
    p_gateway_event_id TEXT,
    p_event_type TEXT,
    p_payload JSONB,
    p_signature_verified BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_event_id UUID;
BEGIN
    IF NOT p_signature_verified THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid gateway webhook signature');
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
$$;

-- 4. Role Grants
REVOKE EXECUTE ON FUNCTION public.fn_create_payment_order(TEXT, UUID, UUID, TEXT, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_create_payment_order(TEXT, UUID, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_verify_and_fulfill_payment(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.fn_verify_and_fulfill_payment(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_process_payment_webhook(TEXT, TEXT, TEXT, JSONB, BOOLEAN) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.fn_process_payment_webhook(TEXT, TEXT, TEXT, JSONB, BOOLEAN) TO service_role;

NOTIFY pgrst, 'reload schema';
