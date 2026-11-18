-- =====================================================================================================================
-- 151 PAY-1 B6 refunds (owner decisions F1–F8 + locked D4–D7, 2026-11-19; PAY_1_DESIGN.md §14). Refunds are still MADE in
-- the Razorpay dashboard (D4); this migration makes the app decide, record and apply them correctly.
-- Rollback: docs/database/rollback/151_rollback.sql. No BEGIN / COMMIT (the runner owns the transaction).
--   1. test_attempts.access_tier (F6 b): the mock's tier (FREE / PRO) recorded when an attempt is created, by a BEFORE
--      INSERT trigger (fn_access_tier, the central rule); never changed afterwards (BEFORE UPDATE keeps the old value).
--      Older attempts stay NULL: the eligibility check falls back to the current tier and says so (TIER_AT_CHECK_TIME).
--   2. pro_refund_approvals: the admin records WHY a payment is refunded (reason + note + the eligibility snapshot)
--      BEFORE refunding it in the dashboard; the refund webhook links itself to the open approval. "Once per user"
--      (F2 a) = a completed POLICY_7_DAY approval. RLS on, no policy, service_role only.
--   3. fn_pro_refund_eligibility(order) — INVOKER, STABLE, service_role only. Refund Policy 3.2: the user's FIRST paid Pro
--      order (F1 a), within 7 days of its payment, ≤ 1 SUBMITTED Pro mock since the payment (D5), the policy refund not
--      used before (F2 a), the LATEST period of a stacked purchase (D7), not refunded already, order PAID.
--   4. fn_pro_refund_approve(payment, reason, note, admin) — INVOKER, service_role only: one open approval per payment;
--      POLICY_7_DAY only when eligible; writes the PRO_REFUND_APPROVED audit row.
--   5. fn_refund_pro_payment(…, p_gateway_mode DEFAULT 'live') v3 — same class (SECURITY DEFINER, service_role only):
--      MODE_MISMATCH for an order of the other mode (F5 a); a refund that shortens or ends a period moves every LATER
--      stacked period earlier by exactly the time removed (F3 a / F4 a), so the user keeps the paid days still due;
--      the refund is linked to its approval (refund_kind, or UNRECORDED); one Pro lock per user (as the fulfil).
--      Everything else as 149: idempotent per refund id, pro-rata partial refunds, the unapplied (double charge) branch,
--      no founding change (D6: the seat stays used).
-- SECURITY DEFINER count unchanged (fn_refund_pro_payment replaced; the new functions are INVOKER).
-- =====================================================================================================================

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261118000150_pay1_b5_email_events.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'PAY1_B6_PREFLIGHT: 150 is not applied';
    END IF;
END
$pre$;

-- 1. the mock's tier on each new attempt (F6 b)
ALTER TABLE public.test_attempts ADD COLUMN access_tier text CHECK (access_tier IS NULL OR access_tier IN ('FREE', 'PRO'));
COMMENT ON COLUMN public.test_attempts.access_tier IS 'PAY-1 B6: the mock''s tier when the attempt was created (trigger; never changed). NULL = created before 151.';

CREATE FUNCTION public.fn_test_attempt_access_tier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.access_tier := CASE WHEN NEW.mock_test_id IS NULL THEN NULL ELSE public.fn_access_tier('MOCK_TEST', NEW.mock_test_id::text) END;
    ELSE
        NEW.access_tier := OLD.access_tier; -- recorded once, never rewritten
    END IF;
    RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.fn_test_attempt_access_tier() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_test_attempts_access_tier
    BEFORE INSERT OR UPDATE ON public.test_attempts
    FOR EACH ROW EXECUTE FUNCTION public.fn_test_attempt_access_tier();

-- 2. refund approvals
CREATE TABLE public.pro_refund_approvals (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id   text NOT NULL CHECK (payment_id ~ '^pay_[A-Za-z0-9]{6,40}$'),
    order_id     uuid NOT NULL REFERENCES public.payment_orders(id),
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason       text NOT NULL CHECK (reason IN ('POLICY_7_DAY', 'DOUBLE_CHARGE', 'NOT_ACTIVATED', 'FAILED_DEBITED', 'FEATURE_REMOVED', 'GOODWILL')),
    note         text CHECK (note IS NULL OR length(note) <= 500),
    eligibility  jsonb,
    approved_by  uuid NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    refund_id    text CHECK (refund_id IS NULL OR length(refund_id) BETWEEN 3 AND 60),
    refunded_at  timestamptz
);
COMMENT ON TABLE public.pro_refund_approvals IS 'PAY-1 B6: why a payment is refunded, recorded by an admin before the dashboard refund; the refund webhook links itself (refund_id). Service role only.';
-- one OPEN approval per payment (a later one may follow once that refund has landed, e.g. partial then full)
CREATE UNIQUE INDEX uq_pro_refund_approvals_open ON public.pro_refund_approvals (payment_id) WHERE refund_id IS NULL;
CREATE INDEX idx_pro_refund_approvals_user ON public.pro_refund_approvals (user_id, reason) WHERE refund_id IS NOT NULL;
ALTER TABLE public.pro_refund_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pro_refund_approvals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pro_refund_approvals TO service_role;

-- 3. eligibility (Refund Policy 3.2; F1 a, F2 a, D5, D7, F6 b)
CREATE FUNCTION public.fn_pro_refund_eligibility(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
    v_order    public.payment_orders;
    v_txn      public.payment_transactions;
    v_ent      public.user_entitlements;
    v_first    boolean;
    v_within   boolean;
    v_mocks    integer;
    v_fallback integer;
    v_used     boolean;
    v_latest   boolean;
    v_refunded boolean;
    v_open     public.pro_refund_approvals;
    v_reasons  text[] := '{}';
    v_notes    text[] := '{}';
BEGIN
    SELECT * INTO v_order FROM public.payment_orders o WHERE o.id = p_order_id AND o.order_type = 'PRO_PLAN';
    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false, 'eligible', false, 'reasons', jsonb_build_array('ORDER_NOT_FOUND'));
    END IF;
    SELECT * INTO v_txn FROM public.payment_transactions t
     WHERE t.order_id = v_order.id AND t.captured_at IS NOT NULL ORDER BY t.captured_at LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', true, 'order_id', v_order.id, 'user_id', v_order.user_id, 'eligible', false,
                                  'reasons', jsonb_build_array('NOT_PAID'), 'mode', v_order.gateway_mode);
    END IF;
    SELECT * INTO v_ent FROM public.user_entitlements e WHERE e.order_id = v_order.id ORDER BY e.created_at LIMIT 1;

    -- F1 a: the user's FIRST paid Pro order (any earlier applied Pro payment of the same mode → not first)
    v_first := NOT EXISTS (
        SELECT 1 FROM public.payment_transactions t2 JOIN public.payment_orders o2 ON o2.id = t2.order_id
         WHERE o2.user_id = v_order.user_id AND o2.order_type = 'PRO_PLAN' AND o2.id <> v_order.id
           AND o2.gateway_mode = v_order.gateway_mode AND t2.captured_at IS NOT NULL AND t2.captured_at < v_txn.captured_at);
    v_within := pg_catalog.now() < v_txn.captured_at + interval '7 days';
    -- D5: SUBMITTED attempts on PRO mocks since the payment; F6 b: the tier recorded at start, else the current tier
    SELECT count(*) FILTER (WHERE x.tier = 'PRO'), count(*) FILTER (WHERE x.tier = 'PRO' AND x.snap IS NULL)
      INTO v_mocks, v_fallback
      FROM (SELECT a.access_tier AS snap,
                   COALESCE(a.access_tier, public.fn_access_tier('MOCK_TEST', a.mock_test_id::text)) AS tier
              FROM public.test_attempts a
             WHERE a.user_id = v_order.user_id
               AND (a.submitted_at IS NOT NULL OR a.status IN ('submitted', 'auto_submitted'))
               AND COALESCE(a.submitted_at, a.updated_at) >= v_txn.captured_at) x;
    -- F2 a: a COMPLETED policy refund on another order
    v_used := EXISTS (SELECT 1 FROM public.pro_refund_approvals r
                       WHERE r.user_id = v_order.user_id AND r.reason = 'POLICY_7_DAY' AND r.refund_id IS NOT NULL AND r.order_id <> v_order.id);
    -- D7: no later stacked period of this user
    v_latest := v_ent.id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.user_entitlements e2
         WHERE e2.user_id = v_order.user_id AND e2.id <> v_ent.id AND e2.is_active AND e2.revoked_at IS NULL
           AND e2.expires_at IS NOT NULL AND e2.entitlement_type IN ('PRO_SUBSCRIPTION', 'PROMOTIONAL_PASS')
           AND e2.starts_at >= v_ent.expires_at - interval '1 second');
    v_refunded := v_order.status = 'REFUNDED' OR COALESCE(v_txn.refund_amount, 0) > 0;

    IF v_order.status <> 'PAID' AND NOT v_refunded THEN v_reasons := v_reasons || 'NOT_PAID'::text; END IF;
    IF v_refunded THEN v_reasons := v_reasons || 'ALREADY_REFUNDED'::text; END IF;
    IF NOT v_first THEN v_reasons := v_reasons || 'NOT_FIRST_PURCHASE'::text; END IF;
    IF NOT v_within THEN v_reasons := v_reasons || 'OUTSIDE_7_DAYS'::text; END IF;
    IF v_mocks > 1 THEN v_reasons := v_reasons || 'MORE_THAN_1_PRO_MOCK'::text; END IF;
    IF v_used THEN v_reasons := v_reasons || 'POLICY_REFUND_ALREADY_USED'::text; END IF;
    IF NOT v_latest THEN v_reasons := v_reasons || 'NOT_LATEST_PERIOD'::text; END IF;
    IF v_fallback > 0 THEN v_notes := v_notes || 'TIER_AT_CHECK_TIME'::text; END IF;
    IF v_order.gateway_mode = 'test' THEN v_notes := v_notes || 'TEST_MODE'::text; END IF;
    IF v_order.founding THEN v_notes := v_notes || 'FOUNDING_SEAT_STAYS_USED'::text; END IF;

    SELECT * INTO v_open FROM public.pro_refund_approvals r WHERE r.payment_id = v_txn.gateway_payment_id AND r.refund_id IS NULL;

    RETURN jsonb_build_object(
        'found', true, 'order_id', v_order.id, 'user_id', v_order.user_id, 'payment_id', v_txn.gateway_payment_id,
        'amount_paise', v_order.amount_paise, 'status', v_order.status, 'mode', v_order.gateway_mode, 'founding', v_order.founding,
        'paid_at', v_txn.captured_at, 'window_ends_at', v_txn.captured_at + interval '7 days',
        'first_purchase', v_first, 'within_7_days', v_within, 'pro_mocks_submitted', v_mocks,
        'pro_mocks_tier_at_check_time', v_fallback, 'policy_refund_used', v_used, 'latest_period', v_latest,
        'already_refunded', v_refunded, 'refunded_paise', (COALESCE(v_txn.refund_amount, 0) * 100)::integer,
        'eligible', pg_catalog.cardinality(v_reasons) = 0,
        'reasons', to_jsonb(v_reasons), 'notes', to_jsonb(v_notes),
        'open_approval', CASE WHEN v_open.id IS NULL THEN NULL ELSE jsonb_build_object('id', v_open.id, 'reason', v_open.reason, 'created_at', v_open.created_at) END);
END
$$;
REVOKE ALL ON FUNCTION public.fn_pro_refund_eligibility(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pro_refund_eligibility(uuid) TO service_role;

-- 4. the admin records the approval (the server action checks ADMIN first)
CREATE FUNCTION public.fn_pro_refund_approve(p_payment_id text, p_reason text, p_note text, p_admin_id uuid, p_admin_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_order_id uuid;
    v_user_id  uuid;
    v_elig     jsonb;
    v_id       uuid;
BEGIN
    IF p_payment_id IS NULL OR p_payment_id !~ '^pay_[A-Za-z0-9]{6,40}$' OR p_admin_id IS NULL
       OR p_reason IS NULL OR p_reason NOT IN ('POLICY_7_DAY', 'DOUBLE_CHARGE', 'NOT_ACTIVATED', 'FAILED_DEBITED', 'FEATURE_REMOVED', 'GOODWILL')
       OR (p_note IS NOT NULL AND length(p_note) > 500) THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;
    -- an applied payment (Pro was granted for it) …
    SELECT t.order_id INTO v_order_id FROM public.payment_transactions t WHERE t.gateway_payment_id = p_payment_id;
    IF v_order_id IS NOT NULL THEN
        v_elig := public.fn_pro_refund_eligibility(v_order_id);
    ELSE
        -- … or one recorded "to refund" by B4 (a double charge / an order that cannot be fulfilled)
        SELECT a.target_id::uuid INTO v_order_id FROM public.admin_audit_logs a
         WHERE a.action_type IN ('PRO_DOUBLE_CHARGE', 'PRO_PAYMENT_TO_REFUND') AND a.new_value ->> 'payment_id' = p_payment_id
         ORDER BY a.created_at LIMIT 1;
        IF v_order_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_NOT_FOUND');
        END IF;
        v_elig := jsonb_build_object('unapplied', true, 'eligible', false, 'reasons', jsonb_build_array('UNAPPLIED_PAYMENT'));
    END IF;
    SELECT o.user_id INTO v_user_id FROM public.payment_orders o WHERE o.id = v_order_id AND o.order_type = 'PRO_PLAN';
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND');
    END IF;
    IF p_reason = 'POLICY_7_DAY' AND COALESCE((v_elig ->> 'eligible')::boolean, false) IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_ELIGIBLE', 'eligibility', v_elig);
    END IF;
    INSERT INTO public.pro_refund_approvals (payment_id, order_id, user_id, reason, note, eligibility, approved_by)
    VALUES (p_payment_id, v_order_id, v_user_id, p_reason, NULLIF(btrim(p_note), ''), v_elig, p_admin_id)
    ON CONFLICT (payment_id) WHERE refund_id IS NULL DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'ALREADY_APPROVED');
    END IF;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, new_value, reason)
    VALUES (p_admin_id, COALESCE(p_admin_email, 'unknown'), 'PRO_REFUND_APPROVED', 'payment_orders', v_order_id::text,
            jsonb_build_object('approval_id', v_id, 'payment_id', p_payment_id, 'refund_reason', p_reason, 'eligible', v_elig -> 'eligible'), NULLIF(btrim(p_note), ''));
    RETURN jsonb_build_object('success', true, 'approval_id', v_id, 'order_id', v_order_id, 'eligibility', v_elig);
END
$$;
REVOKE ALL ON FUNCTION public.fn_pro_refund_approve(text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pro_refund_approve(text, text, text, uuid, text) TO service_role;

-- 5. the refund webhook (v3)
DROP FUNCTION public.fn_refund_pro_payment(text, integer, text);
CREATE FUNCTION public.fn_refund_pro_payment(p_payment_id text, p_refund_amount_paise integer, p_gateway_refund_id text, p_gateway_mode text DEFAULT 'live')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_txn      public.payment_transactions;
    v_order    public.payment_orders;
    v_ent      public.user_entitlements;
    v_paid     integer;
    v_total    integer;
    v_full     boolean;
    v_days     integer;
    v_new_end  timestamptz;
    v_old_end  timestamptz;
    v_shift    interval := interval '0';
    v_moved    integer := 0;
    v_flag     public.admin_audit_logs;
    v_mode     text;
    v_n        integer;
    v_appr_id  uuid;
    v_kind     text;
BEGIN
    IF p_payment_id IS NULL OR btrim(p_payment_id) = '' OR p_refund_amount_paise IS NULL OR p_refund_amount_paise <= 0
       OR p_gateway_refund_id IS NULL OR btrim(p_gateway_refund_id) = '' OR p_gateway_mode IS NULL OR p_gateway_mode NOT IN ('test', 'live') THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;
    SELECT * INTO v_txn FROM public.payment_transactions t WHERE t.gateway_payment_id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        -- PAY-1 B4: a payment recorded as "to refund" (no Pro was granted for it) — acknowledge its refund once
        SELECT * INTO v_flag FROM public.admin_audit_logs a
         WHERE a.action_type IN ('PRO_DOUBLE_CHARGE', 'PRO_PAYMENT_TO_REFUND') AND a.new_value ->> 'payment_id' = p_payment_id
         ORDER BY a.created_at LIMIT 1;
        IF FOUND THEN
            SELECT o.gateway_mode INTO v_mode FROM public.payment_orders o WHERE o.id::text = v_flag.target_id;
            IF v_mode IS DISTINCT FROM p_gateway_mode THEN
                RETURN jsonb_build_object('success', false, 'code', 'MODE_MISMATCH');
            END IF;
            INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, new_value, reason)
            SELECT NULL, 'system:payments', 'PRO_UNAPPLIED_PAYMENT_REFUNDED', 'payment_orders', v_flag.target_id,
                   jsonb_build_object('payment_id', p_payment_id, 'refund_id', p_gateway_refund_id, 'refund_paise', p_refund_amount_paise), NULL
             WHERE NOT EXISTS (SELECT 1 FROM public.admin_audit_logs a WHERE a.action_type = 'PRO_UNAPPLIED_PAYMENT_REFUNDED'
                                 AND a.new_value ->> 'refund_id' = p_gateway_refund_id);
            GET DIAGNOSTICS v_n = ROW_COUNT;
            IF v_n = 1 THEN
                UPDATE public.pro_refund_approvals r SET refund_id = p_gateway_refund_id, refunded_at = pg_catalog.now()
                 WHERE r.payment_id = p_payment_id AND r.refund_id IS NULL
                RETURNING r.id, r.reason INTO v_appr_id, v_kind;
            END IF;
            RETURN jsonb_build_object('success', true, 'unapplied', true, 'order_id', v_flag.target_id, 'already_processed', v_n = 0,
                                      'refund_kind', COALESCE(v_kind, CASE WHEN v_n = 1 THEN 'UNRECORDED' END));
        END IF;
        RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_NOT_FOUND');
    END IF;
    IF COALESCE(v_txn.gateway_response_json -> 'refund_ids', '[]'::jsonb) ? p_gateway_refund_id THEN
        RETURN jsonb_build_object('success', true, 'already_processed', true);
    END IF;
    SELECT * INTO v_order FROM public.payment_orders o WHERE o.id = v_txn.order_id FOR UPDATE;
    IF v_order.gateway_mode IS DISTINCT FROM p_gateway_mode THEN
        RETURN jsonb_build_object('success', false, 'code', 'MODE_MISMATCH');
    END IF;
    -- one Pro change per user at a time (the same lock as the fulfil's stacking)
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pro_entitlement:' || v_order.user_id::text, 0));
    v_paid := COALESCE(v_order.amount_paise, (v_txn.amount * 100)::integer);
    v_total := COALESCE((v_txn.refund_amount * 100)::integer, 0) + p_refund_amount_paise;
    IF v_total > v_paid THEN
        RETURN jsonb_build_object('success', false, 'code', 'REFUND_EXCEEDS_PAYMENT');
    END IF;
    v_full := v_total >= v_paid;

    SELECT * INTO v_ent FROM public.user_entitlements e WHERE e.order_id = v_order.id FOR UPDATE;
    IF FOUND AND v_ent.is_active THEN
        v_old_end := v_ent.expires_at;
        IF v_full THEN
            UPDATE public.user_entitlements e SET is_active = false, revoked_at = pg_catalog.now(), updated_at = pg_catalog.now() WHERE e.id = v_ent.id;
            -- the part of this period that was still due is removed
            IF v_old_end IS NOT NULL AND v_old_end > pg_catalog.now() THEN
                v_shift := v_old_end - GREATEST(v_ent.starts_at, pg_catalog.now());
            END IF;
        ELSE
            -- pro rata: remove (period days × this refund ÷ paid), rounded down
            v_days := floor(EXTRACT(EPOCH FROM (v_ent.expires_at - v_ent.starts_at)) / 86400.0 * p_refund_amount_paise / v_paid)::integer;
            v_new_end := v_ent.expires_at - pg_catalog.make_interval(days => v_days);
            IF v_new_end <= v_ent.starts_at OR v_new_end <= pg_catalog.now() THEN
                UPDATE public.user_entitlements e SET is_active = false, revoked_at = pg_catalog.now(), updated_at = pg_catalog.now() WHERE e.id = v_ent.id;
                IF v_old_end > pg_catalog.now() THEN
                    v_shift := v_old_end - GREATEST(v_ent.starts_at, pg_catalog.now());
                END IF;
            ELSE
                UPDATE public.user_entitlements e SET expires_at = v_new_end, updated_at = pg_catalog.now() WHERE e.id = v_ent.id;
                v_shift := pg_catalog.make_interval(days => v_days);
            END IF;
        END IF;
        -- F3 a / F4 a: every LATER stacked period of this user moves earlier by the time removed (no gap, no lost days)
        IF v_old_end IS NOT NULL AND v_shift > interval '0' THEN
            UPDATE public.user_entitlements e
               SET starts_at = e.starts_at - v_shift, expires_at = e.expires_at - v_shift, updated_at = pg_catalog.now()
             WHERE e.user_id = v_order.user_id AND e.id <> v_ent.id AND e.is_active AND e.revoked_at IS NULL
               AND e.expires_at IS NOT NULL AND e.entitlement_type IN ('PRO_SUBSCRIPTION', 'PROMOTIONAL_PASS')
               AND e.starts_at >= v_old_end - interval '1 second';
            GET DIAGNOSTICS v_moved = ROW_COUNT;
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

    -- link the approval the admin recorded before refunding (F2 a); none → UNRECORDED (flagged on /admin/payments)
    UPDATE public.pro_refund_approvals r SET refund_id = p_gateway_refund_id, refunded_at = pg_catalog.now()
     WHERE r.payment_id = p_payment_id AND r.refund_id IS NULL
    RETURNING r.id, r.reason INTO v_appr_id, v_kind;
    v_kind := COALESCE(v_kind, 'UNRECORDED');

    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, new_value, reason)
    VALUES (NULL, 'system:payments', CASE WHEN v_full THEN 'PRO_ORDER_REFUNDED' ELSE 'PRO_ORDER_PARTIALLY_REFUNDED' END, 'payment_orders',
            v_order.id::text, jsonb_build_object('refund_paise', p_refund_amount_paise, 'refunded_total_paise', v_total, 'full', v_full,
                                                 'refund_id', p_gateway_refund_id, 'refund_kind', v_kind, 'approval_id', v_appr_id,
                                                 'shifted_seconds', EXTRACT(EPOCH FROM v_shift)::bigint, 'moved_periods', v_moved), NULL);

    RETURN jsonb_build_object('success', true, 'full', v_full, 'refunded_total_paise', v_total, 'order_id', v_order.id,
                              'refund_kind', v_kind, 'moved_periods', v_moved);
END
$$;
REVOKE ALL ON FUNCTION public.fn_refund_pro_payment(text, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_refund_pro_payment(text, integer, text, text) TO service_role;

DO $proof$
BEGIN
    IF to_regprocedure('public.fn_refund_pro_payment(text, integer, text)') IS NOT NULL THEN
        RAISE EXCEPTION 'PAY1_B6_PROOF: the old refund signature is still there';
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_refund_pro_payment(text, integer, text, text)'::regprocedure)
       OR (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_pro_refund_eligibility(uuid)'::regprocedure)
       OR (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_pro_refund_approve(text, text, text, uuid, text)'::regprocedure)
       OR (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_test_attempt_access_tier()'::regprocedure) THEN
        RAISE EXCEPTION 'PAY1_B6_PROOF: DEFINER / INVOKER classes are not as designed';
    END IF;
    IF has_function_privilege('authenticated', 'public.fn_refund_pro_payment(text, integer, text, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_refund_pro_payment(text, integer, text, text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fn_pro_refund_eligibility(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_pro_refund_eligibility(uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fn_pro_refund_approve(text, text, text, uuid, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_pro_refund_approve(text, text, text, uuid, text)', 'EXECUTE')
       OR has_table_privilege('authenticated', 'public.pro_refund_approvals', 'SELECT')
       OR has_table_privilege('anon', 'public.pro_refund_approvals', 'SELECT') THEN
        RAISE EXCEPTION 'PAY1_B6_PROOF: a client role can reach a refund function or the approvals table';
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.pro_refund_approvals'::regclass)
       OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pro_refund_approvals') THEN
        RAISE EXCEPTION 'PAY1_B6_PROOF: pro_refund_approvals must have RLS on and no policy';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_test_attempts_access_tier' AND tgrelid = 'public.test_attempts'::regclass) THEN
        RAISE EXCEPTION 'PAY1_B6_PROOF: the attempt tier trigger is missing';
    END IF;
END
$proof$;
