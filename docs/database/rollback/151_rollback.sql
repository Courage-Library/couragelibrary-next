-- =====================================================================================================================
-- Rollback for 151 PAY-1 B6 refunds (supabase/migrations/20261119000151_pay1_b6_refunds.sql).
-- ROLLBACK-CHAIN: run first: none
-- Roll the B6 APP back first (it passes p_gateway_mode to the refund and calls the eligibility / approval functions).
-- Restores the exact 149 fn_refund_pro_payment (its 3-argument signature, SECURITY DEFINER, service_role only); drops
-- fn_pro_refund_approve, fn_pro_refund_eligibility, the approvals table, the attempt tier trigger + its function and
-- test_attempts.access_tier. REFUSES while an approval exists (the refund history it holds would be lost): export
-- pro_refund_approvals first, then delete its rows in the same transaction as this rollback.
-- Entitlement dates moved by a B6 refund stay as they are (history). Re-name the SECDEF allow-list entry back to the
-- 3-argument signature and remove the PAY-1 B6 rule line in the same change.
-- Run inside ONE transaction (no BEGIN / COMMIT here).
-- =====================================================================================================================

DO $pre$
BEGIN
    IF EXISTS (SELECT 1 FROM public.pro_refund_approvals) THEN
        RAISE EXCEPTION 'ROLLBACK_151: refuses while pro_refund_approvals has rows; export them first';
    END IF;
END
$pre$;

DROP FUNCTION public.fn_refund_pro_payment(text, integer, text, text);
CREATE FUNCTION public.fn_refund_pro_payment(p_payment_id text, p_refund_amount_paise integer, p_gateway_refund_id text)
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
REVOKE ALL ON FUNCTION public.fn_refund_pro_payment(text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_refund_pro_payment(text, integer, text) TO service_role;

DROP FUNCTION public.fn_pro_refund_approve(text, text, text, uuid, text);
DROP FUNCTION public.fn_pro_refund_eligibility(uuid);
DROP TABLE public.pro_refund_approvals;
DROP TRIGGER trg_test_attempts_access_tier ON public.test_attempts;
DROP FUNCTION public.fn_test_attempt_access_tier();
ALTER TABLE public.test_attempts DROP COLUMN access_tier;

DO $proof$
BEGIN
    IF to_regprocedure('public.fn_refund_pro_payment(text, integer, text)') IS NULL
       OR to_regprocedure('public.fn_refund_pro_payment(text, integer, text, text)') IS NOT NULL
       OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_refund_pro_payment(text, integer, text)'::regprocedure)
       OR has_function_privilege('authenticated', 'public.fn_refund_pro_payment(text, integer, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_refund_pro_payment(text, integer, text)', 'EXECUTE')
       OR to_regclass('public.pro_refund_approvals') IS NOT NULL
       OR to_regprocedure('public.fn_pro_refund_eligibility(uuid)') IS NOT NULL
       OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'test_attempts' AND column_name = 'access_tier') THEN
        RAISE EXCEPTION 'ROLLBACK_151_PROOF: the 149 state is not back';
    END IF;
END
$proof$;
