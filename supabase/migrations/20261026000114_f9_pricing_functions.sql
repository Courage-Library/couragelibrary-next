-- =====================================================================================================================
-- 114 F9-B PRICING FUNCTIONS — the server-only order / fulfil / refund / entitlement path (Razorpay TEST mode only)
-- Architect GO (F9-B) as a CONDITIONAL GO: apply only if the chunked smoke AS THE REAL ROLES + dry-run ALL pass.
-- Rollback: docs/database/rollback/114_rollback.sql. No BEGIN / COMMIT: the runner owns the transaction.
-- Every function: SECURITY DEFINER, search_path '', EXECUTE for service_role ONLY (the app's server code). Nothing here
-- is client-callable; prices are read from pro_plan_versions on the server, never from the client.
--
--   fn_create_pro_order   — 18+ (canonical adult_confirmed_at), not already unlimited, 5 orders / 10 min, active plan
--                           version, founding allowed while sold < limit (or for founding buyers renewing); a snapshot
--                           order (CREATED, 30 min); idempotent per user + key (double-click → the same open order).
--   fn_attach_gateway_order — stores the Razorpay order id on the caller's own CREATED order (→ PENDING).
--   fn_fulfil_pro_order   — THE ONE fulfil path (client verify + webhook). Row-locks the order; idempotent on the
--                           payment id; rejects a payment id used for another order, an amount / currency mismatch and
--                           NULLs (fail closed); stacks the entitlement from max(now, current end); writes transaction,
--                           entitlement, receipt, founding count and audit row; order → PAID. Concurrent callers → ONE
--                           fulfilment (order row lock + per-user advisory lock + unique payment id + unique order_id).
--   fn_mark_pro_order_failed — payment.failed: CREATED / PENDING → FAILED (a later success can still fulfil).
--   fn_refund_pro_payment — refund.processed: idempotent per refund id; full → Pro ends now (deactivated, revoked_at);
--                           partial → shortened pro rata; transaction / order updated; audit row. Never deletes.
--   fn_has_pro            — the canonical Pro check (active, not revoked, started, not expired).
--   fn_grant_library_pro / fn_revoke_library_pro — admin-granted Pro for library members (audited; revoke never deletes).
-- =====================================================================================================================

CREATE OR REPLACE FUNCTION public.fn_has_pro(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p_user_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.user_entitlements e
         WHERE e.user_id = p_user_id
           AND e.entitlement_type IN ('PRO_SUBSCRIPTION', 'PROMOTIONAL_PASS')
           AND e.is_active AND e.revoked_at IS NULL
           AND e.starts_at <= pg_catalog.now()
           AND (e.expires_at IS NULL OR e.expires_at > pg_catalog.now()));
$$;

CREATE OR REPLACE FUNCTION public.fn_create_pro_order(p_user_id uuid, p_plan_code text, p_idempotency_key text)
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
    IF p_user_id IS NULL OR p_plan_code IS NULL OR p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 80 THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
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
        IF v_existing.status IN ('CREATED', 'PENDING') AND v_existing.expires_at > pg_catalog.now() THEN
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
                                       currency, gateway, status, idempotency_key, expires_at)
    VALUES (p_user_id, 'PRO_PLAN', v_plan.id, v_plan.plan_code, v_plan.version, v_plan.price_paise, v_plan.is_founding,
            v_plan.price_paise / 100.0, 0, v_plan.price_paise / 100.0, 0, 0, v_plan.price_paise / 100.0,
            v_plan.currency, 'RAZORPAY', 'CREATED', v_key, pg_catalog.now() + interval '30 minutes')
    RETURNING id INTO v_order_id;

    RETURN jsonb_build_object('success', true, 'existing', false, 'order_id', v_order_id, 'amount_paise', v_plan.price_paise,
                              'currency', v_plan.currency, 'plan_code', v_plan.plan_code, 'plan_version', v_plan.version,
                              'duration_months', v_plan.duration_months, 'founding', v_plan.is_founding);
END
$$;

CREATE OR REPLACE FUNCTION public.fn_attach_gateway_order(p_order_id uuid, p_user_id uuid, p_gateway_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_n integer;
BEGIN
    IF p_order_id IS NULL OR p_user_id IS NULL OR p_gateway_order_id IS NULL OR p_gateway_order_id !~ '^order_[A-Za-z0-9]{6,40}$' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;
    UPDATE public.payment_orders o SET gateway_order_id = p_gateway_order_id, status = 'PENDING', updated_at = pg_catalog.now()
     WHERE o.id = p_order_id AND o.user_id = p_user_id AND o.order_type = 'PRO_PLAN' AND o.status = 'CREATED' AND o.gateway_order_id IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN CASE WHEN v_n = 1 THEN jsonb_build_object('success', true) ELSE jsonb_build_object('success', false, 'code', 'NOT_ATTACHABLE') END;
END
$$;

CREATE OR REPLACE FUNCTION public.fn_fulfil_pro_order(p_gateway_order_id text, p_payment_id text, p_amount_paise integer, p_currency text, p_source text)
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
BEGIN
    -- fail CLOSED on anything missing (106 lesson: a NULL must never pass a check)
    IF p_gateway_order_id IS NULL OR btrim(p_gateway_order_id) = '' OR p_payment_id IS NULL OR btrim(p_payment_id) = ''
       OR p_amount_paise IS NULL OR p_currency IS NULL OR p_source IS NULL OR p_source NOT IN ('CLIENT_VERIFY', 'WEBHOOK') THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;

    SELECT * INTO v_order FROM public.payment_orders o WHERE o.gateway_order_id = p_gateway_order_id FOR UPDATE;
    IF NOT FOUND OR v_order.order_type IS DISTINCT FROM 'PRO_PLAN' THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND');
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
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_ALREADY_PAID');
    END IF;
    IF v_order.status NOT IN ('CREATED', 'PENDING', 'FAILED') THEN
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

    v_receipt := 'CL-R-' || pg_catalog.to_char(pg_catalog.now() AT TIME ZONE 'Asia/Kolkata', 'YYMMDD') || '-'
                 || pg_catalog.upper(pg_catalog.substr(pg_catalog.md5(v_order.id::text || p_payment_id), 1, 6));
    INSERT INTO public.payment_receipts (receipt_number, user_id, order_id, transaction_id, plan_code, plan_version, period_start, period_end,
                                         amount_paise, currency, gateway_payment_id, business_name)
    VALUES (v_receipt, v_order.user_id, v_order.id, v_txn_id, v_order.plan_code, v_order.plan_version, v_start, v_new_end,
            p_amount_paise, p_currency, p_payment_id, 'Courage Library');

    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, new_value, reason)
    VALUES (NULL, 'system:payments', 'PRO_ORDER_FULFILLED', 'payment_orders', v_order.id::text,
            jsonb_build_object('plan_code', v_order.plan_code, 'plan_version', v_order.plan_version, 'amount_paise', p_amount_paise,
                               'starts_at', v_start, 'expires_at', v_new_end, 'source', p_source, 'founding', v_order.founding), NULL);

    RETURN jsonb_build_object('success', true, 'already_fulfilled', false, 'order_id', v_order.id, 'user_id', v_order.user_id,
                              'entitlement_id', v_ent_id, 'receipt_number', v_receipt, 'starts_at', v_start, 'expires_at', v_new_end,
                              'founding', v_order.founding);
END
$$;

CREATE OR REPLACE FUNCTION public.fn_mark_pro_order_failed(p_gateway_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_n integer;
BEGIN
    IF p_gateway_order_id IS NULL OR btrim(p_gateway_order_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;
    UPDATE public.payment_orders o SET status = 'FAILED', updated_at = pg_catalog.now()
     WHERE o.gateway_order_id = p_gateway_order_id AND o.order_type = 'PRO_PLAN' AND o.status IN ('CREATED', 'PENDING');
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN jsonb_build_object('success', true, 'updated', v_n);
END
$$;

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
BEGIN
    IF p_payment_id IS NULL OR btrim(p_payment_id) = '' OR p_refund_amount_paise IS NULL OR p_refund_amount_paise <= 0
       OR p_gateway_refund_id IS NULL OR btrim(p_gateway_refund_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;
    SELECT * INTO v_txn FROM public.payment_transactions t WHERE t.gateway_payment_id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
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

CREATE OR REPLACE FUNCTION public.fn_grant_library_pro(p_user_id uuid, p_valid_until timestamptz, p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF p_user_id IS NULL OR p_admin_id IS NULL OR p_valid_until IS NULL OR p_valid_until <= pg_catalog.now() THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
        RETURN jsonb_build_object('success', false, 'code', 'USER_NOT_FOUND');
    END IF;
    INSERT INTO public.user_entitlements (user_id, entitlement_type, starts_at, expires_at, is_active, source, granted_by)
    VALUES (p_user_id, 'PROMOTIONAL_PASS', pg_catalog.now(), p_valid_until, true, 'LIBRARY', p_admin_id)
    RETURNING id INTO v_id;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, new_value, reason)
    VALUES (p_admin_id, 'admin:library-grant', 'LIBRARY_PRO_GRANTED', 'user_entitlements', v_id::text,
            jsonb_build_object('user_id', p_user_id, 'valid_until', p_valid_until), NULL);
    RETURN jsonb_build_object('success', true, 'entitlement_id', v_id);
END
$$;

CREATE OR REPLACE FUNCTION public.fn_revoke_library_pro(p_entitlement_id uuid, p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_n integer;
BEGIN
    IF p_entitlement_id IS NULL OR p_admin_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;
    UPDATE public.user_entitlements e SET is_active = false, revoked_at = pg_catalog.now(), updated_at = pg_catalog.now()
     WHERE e.id = p_entitlement_id AND e.source = 'LIBRARY' AND e.is_active;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_REVOCABLE');
    END IF;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, reason)
    VALUES (p_admin_id, 'admin:library-grant', 'LIBRARY_PRO_REVOKED', 'user_entitlements', p_entitlement_id::text, NULL);
    RETURN jsonb_build_object('success', true);
END
$$;

-- service role only (Supabase's default ACL would otherwise grant new functions to anon / authenticated)
REVOKE ALL ON FUNCTION public.fn_has_pro(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_create_pro_order(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_attach_gateway_order(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_fulfil_pro_order(text, text, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_mark_pro_order_failed(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_refund_pro_payment(text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_grant_library_pro(uuid, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_revoke_library_pro(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_has_pro(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_create_pro_order(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_attach_gateway_order(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_fulfil_pro_order(text, text, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_mark_pro_order_failed(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_refund_pro_payment(text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_grant_library_pro(uuid, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_revoke_library_pro(uuid, uuid) TO service_role;
