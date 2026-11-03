-- =====================================================================================================================
-- 137 COURSE-UX-1 — coins for lessons: EARN only (STRICT). Decision #78 ("COINS: loyalty points, not a wallet; STRICT;
-- after F9") with the owner's NARROW EXCEPTION of 2026-11-03: lesson EARNING only; spending stays frozen; the generic
-- award function stays frozen (112, unchanged).
--   1. reward_policies LESSON_COMPLETED: 10 coins per lesson, +5 when every quick check was right on the first attempt,
--      at most 100 lesson coins per day (India day, Asia/Kolkata); once per student per lesson, ever.
--   2. fn_lesson__award_coins(user, lesson, all_correct) — INVOKER, NO client or service grant: runs only inside
--      fn_lesson_complete (SECURITY DEFINER, as the owner). Reuses the canonical store (gamification_events + coin_ledger
--      + coin_wallets — no parallel store), the existing idempotency keys (UNIQUE): "lesson_completed:<user>:<lesson>"
--      and "ledger_" + that key; the wallet row is locked (FOR UPDATE) so the daily cap holds across tabs; a locked
--      wallet earns nothing; the event + ledger rows are the audit trail.
--   3. The database switch: premium_system_configs GLOBAL "COINS_LESSON_EARN" {"value": true} with is_enabled — ABSENT
--      here (OFF). Nothing is awarded until the owner approves the coins legal text and turns it on AFTER the code reading
--      it is in production (DEPLOY-BEFORE-ACTIVATE). The app flag COINS_LESSON_EARN (default off) only shows the toast
--      and the header balance; the database switch alone decides awards (a direct RPC call cannot bypass it).
--   4. fn_lesson_complete (same signature / grants, SECURITY DEFINER, search_path ''): the 136 body + the award at the
--      moment a lesson becomes COMPLETED (never on "already completed").
-- Anti-abuse: server clock only (136); replay / reruns / two tabs → one completion (row lock) and one event (UNIQUE key);
-- quick-skip → refused by 136 (end + checks + time); the daily cap counts awarded coins under the wallet lock.
-- SECURITY DEFINER count unchanged (the award helper is INVOKER). Rollback: docs/database/rollback/137_rollback.sql.
-- No BEGIN / COMMIT (the runner owns the transaction).
-- =====================================================================================================================
DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261103000136_lesson_completion_evidence.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'COURSE_UX_1_137_PREFLIGHT: 136 is not applied';
    END IF;
    IF EXISTS (SELECT 1 FROM public.reward_policies WHERE policy_code = 'LESSON_COMPLETED') THEN
        RAISE EXCEPTION 'COURSE_UX_1_137_PREFLIGHT: LESSON_COMPLETED policy already exists';
    END IF;
    IF EXISTS (SELECT 1 FROM public.premium_system_configs WHERE config_key = 'COINS_LESSON_EARN') THEN
        RAISE EXCEPTION 'COURSE_UX_1_137_PREFLIGHT: COINS_LESSON_EARN already configured';
    END IF;
    IF position('frozen' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_award_gamification_reward(uuid, text, text, uuid, text, integer, text, jsonb)'::regprocedure)) = 0 THEN
        RAISE EXCEPTION 'COURSE_UX_1_137_PREFLIGHT: the 112 coins freeze is not in place';
    END IF;
END
$pre$;

-- 1. the policy (owner answer 1)
INSERT INTO public.reward_policies (policy_code, event_type, base_coins, performance_bonus_coins, daily_limit_count, cooldown_seconds, min_duration_seconds, eligibility_rules, policy_version, is_active)
VALUES ('LESSON_COMPLETED', 'LESSON_COMPLETED', 10, 5, NULL, 0, 60,
        '{"daily_coin_cap": 100, "day_timezone": "Asia/Kolkata", "once_per": "user_lesson", "bonus": "all quick checks right on the first attempt", "decision": "#78 + owner exception 2026-11-03 (earn only)"}'::jsonb,
        'course_ux_1_v1', true);

-- 2. the award (canonical ledger; internal)
CREATE OR REPLACE FUNCTION public.fn_lesson__award_coins(p_user_id uuid, p_document_id uuid, p_all_correct boolean)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
    v_on       boolean;
    v_policy   public.reward_policies%ROWTYPE;
    v_cap      integer;
    v_key      text := 'lesson_completed:' || p_user_id::text || ':' || p_document_id::text;
    v_locked   boolean;
    v_balance  integer;
    v_earned   integer;
    v_today    integer;
    v_amount   integer;
    v_award    integer;
    v_event_id uuid;
BEGIN
    SELECT c.is_enabled AND coalesce((c.config_value ->> 'value')::boolean, false) INTO v_on
      FROM public.premium_system_configs c WHERE c.config_domain = 'GLOBAL' AND c.config_key = 'COINS_LESSON_EARN';
    IF NOT coalesce(v_on, false) THEN
        RETURN jsonb_build_object('coins_awarded', 0, 'reason', 'EARN_OFF');
    END IF;
    SELECT * INTO v_policy FROM public.reward_policies WHERE policy_code = 'LESSON_COMPLETED' AND is_active AND effective_from <= now();
    IF NOT FOUND THEN RETURN jsonb_build_object('coins_awarded', 0, 'reason', 'NO_POLICY'); END IF;
    v_cap := greatest(0, coalesce((v_policy.eligibility_rules ->> 'daily_coin_cap')::int, 0));

    INSERT INTO public.coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
    SELECT is_locked, current_balance, lifetime_earned INTO v_locked, v_balance, v_earned FROM public.coin_wallets WHERE user_id = p_user_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.gamification_events WHERE idempotency_key = v_key) THEN
        RETURN jsonb_build_object('coins_awarded', 0, 'reason', 'ALREADY_AWARDED');
    END IF;

    SELECT coalesce(sum(actual_coins_awarded), 0)::int INTO v_today
      FROM public.gamification_events
     WHERE user_id = p_user_id AND event_type = 'LESSON_COMPLETED'
       AND occurred_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata');
    v_amount := v_policy.base_coins + CASE WHEN p_all_correct THEN v_policy.performance_bonus_coins ELSE 0 END;
    v_award  := CASE WHEN v_locked THEN 0 ELSE least(v_amount, greatest(0, v_cap - v_today)) END;

    INSERT INTO public.gamification_events (user_id, event_type, source_type, source_id, idempotency_key, verification_status, reward_status,
                                            reason_code, calculated_coins, actual_coins_awarded, policy_version, metadata, processed_at)
    VALUES (p_user_id, 'LESSON_COMPLETED', 'LESSON', p_document_id, v_key, 'VERIFIED', CASE WHEN v_award > 0 THEN 'REWARDED' ELSE 'ZERO_REWARD' END,
            CASE WHEN v_locked THEN 'WALLET_LOCKED' WHEN v_award < v_amount THEN 'DAILY_CAP' ELSE 'STANDARD' END,
            v_amount, v_award, v_policy.policy_version,
            jsonb_build_object('document_id', p_document_id, 'all_correct', p_all_correct, 'daily_cap', v_cap, 'today_before', v_today), now())
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_event_id;
    IF v_event_id IS NULL THEN RETURN jsonb_build_object('coins_awarded', 0, 'reason', 'ALREADY_AWARDED'); END IF;

    IF v_award > 0 THEN
        INSERT INTO public.coin_ledger (user_id, transaction_type, amount, direction, balance_after, source_event_id, source_type, source_id, reason_code, idempotency_key, metadata)
        VALUES (p_user_id, 'CREDIT', v_award, 'CREDIT', v_balance + v_award, v_event_id, 'LESSON', p_document_id, 'LESSON_COMPLETED', 'ledger_' || v_key,
                jsonb_build_object('document_id', p_document_id, 'all_correct', p_all_correct));
        UPDATE public.coin_wallets
           SET current_balance = v_balance + v_award, lifetime_earned = v_earned + v_award, last_transaction_at = now(), updated_at = now()
         WHERE user_id = p_user_id;
    END IF;
    RETURN jsonb_build_object('coins_awarded', v_award, 'reason', CASE WHEN v_locked THEN 'WALLET_LOCKED' WHEN v_award < v_amount THEN 'DAILY_CAP' ELSE 'STANDARD' END,
                              'bonus', p_all_correct AND v_award > v_policy.base_coins);
END
$fn$;
COMMENT ON FUNCTION public.fn_lesson__award_coins(uuid, uuid, boolean) IS 'COURSE-UX-1 (137): lesson coins via the canonical ledger; internal (no grants) — called only by fn_lesson_complete. Switch: premium_system_configs COINS_LESSON_EARN.';
REVOKE ALL ON FUNCTION public.fn_lesson__award_coins(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;

-- 4. completion awards at the moment the lesson becomes COMPLETED (136 body + the award)
CREATE OR REPLACE FUNCTION public.fn_lesson_complete(p_document_id uuid, p_language text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_user      uuid := auth.uid();
    v_node      uuid;
    v_blocks    jsonb;
    v_status    text;
    v_session   public.lesson_reading_sessions%ROWTYPE;
    v_checks    text[];
    v_attempted integer;
    v_correct   integer;
    v_minutes   integer;
    v_required  integer;
    v_elapsed   integer;
    v_missing   text[] := ARRAY[]::text[];
    v_award     jsonb;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'COMPLETE: sign in to save progress' USING ERRCODE = '42501'; END IF;
    IF p_language IS NULL OR p_language NOT IN ('en', 'hi') THEN RAISE EXCEPTION 'COMPLETE: language must be en or hi' USING ERRCODE = '22023'; END IF;
    SELECT d.node_id, dv.blocks INTO v_node, v_blocks
      FROM public.learning_documents d
      JOIN public.document_versions dv ON dv.document_id = d.id
     WHERE d.id = p_document_id AND d.status = 'PUBLISHED' AND dv.language = p_language AND dv.is_current AND dv.is_published
       AND dv.review_status = 'PUBLISHED' AND dv.content_format = 'BLOCKS'
     LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'COMPLETE: lesson not found' USING ERRCODE = 'P0002'; END IF;

    -- one completion per student and lesson, even from two tabs: lock the progress row
    INSERT INTO public.user_lesson_progress (user_id, document_id, language, node_id, status)
    VALUES (v_user, p_document_id, p_language, v_node, 'READING')
    ON CONFLICT (user_id, document_id) DO NOTHING;
    SELECT status INTO v_status FROM public.user_lesson_progress WHERE user_id = v_user AND document_id = p_document_id FOR UPDATE;
    IF v_status = 'COMPLETED' THEN
        RETURN jsonb_build_object('status', 'COMPLETED', 'completed', true, 'already', true, 'coins_awarded', 0);
    END IF;

    SELECT * INTO v_session FROM public.lesson_reading_sessions WHERE user_id = v_user AND document_id = p_document_id;
    SELECT coalesce(array_agg(b ->> 'id'), ARRAY[]::text[]) INTO v_checks FROM jsonb_array_elements(v_blocks) b WHERE b ->> 'type' = 'quick_check';
    SELECT count(*)::int, count(*) FILTER (WHERE is_correct)::int INTO v_attempted, v_correct
      FROM public.lesson_quick_check_attempts
     WHERE user_id = v_user AND document_id = p_document_id AND language = p_language AND block_id = ANY (v_checks);
    v_minutes  := public.fn_lesson__reading_minutes(v_blocks);
    v_required := greatest(60, ceil(0.4 * v_minutes * 60))::int;
    v_elapsed  := CASE WHEN v_session.user_id IS NULL THEN 0 ELSE floor(extract(epoch FROM (now() - v_session.started_at)))::int END;

    IF v_session.user_id IS NULL THEN v_missing := array_append(v_missing, 'START'); END IF;
    IF v_session.end_reached_at IS NULL THEN v_missing := array_append(v_missing, 'END'); END IF;
    IF v_attempted < cardinality(v_checks) THEN v_missing := array_append(v_missing, 'QUICK_CHECKS'); END IF;
    IF v_elapsed < v_required THEN v_missing := array_append(v_missing, 'TIME'); END IF;

    IF cardinality(v_missing) > 0 THEN
        RETURN jsonb_build_object('status', v_status, 'completed', false, 'missing', to_jsonb(v_missing),
                                  'seconds_left', greatest(0, v_required - v_elapsed),
                                  'quick_checks', jsonb_build_object('total', cardinality(v_checks), 'attempted', v_attempted),
                                  'coins_awarded', 0);
    END IF;

    UPDATE public.user_lesson_progress
       SET status = 'COMPLETED', completed_at = now(), language = p_language, updated_at = now()
     WHERE user_id = v_user AND document_id = p_document_id;
    -- COURSE-UX-1 (137): lesson coins, once, at this transition only
    v_award := public.fn_lesson__award_coins(v_user, p_document_id, v_correct = cardinality(v_checks));
    RETURN jsonb_build_object('status', 'COMPLETED', 'completed', true, 'already', false,
                              'all_correct', v_correct = cardinality(v_checks),
                              'coins_awarded', coalesce((v_award ->> 'coins_awarded')::int, 0), 'coins_reason', v_award ->> 'reason');
END
$fn$;
-- CREATE OR REPLACE keeps the 136 grants (authenticated + service_role)

-- proof
DO $proof$
BEGIN
    IF has_function_privilege('authenticated', 'public.fn_lesson__award_coins(uuid, uuid, boolean)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_lesson__award_coins(uuid, uuid, boolean)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.fn_lesson__award_coins(uuid, uuid, boolean)', 'EXECUTE')
       OR (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_lesson__award_coins(uuid, uuid, boolean)'::regprocedure) THEN
        RAISE EXCEPTION 'COURSE_UX_1_137_PROOF: the award helper is callable or SECURITY DEFINER';
    END IF;
    IF NOT (SELECT prosecdef AND proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'public.fn_lesson_complete(uuid, text)'::regprocedure)
       OR has_function_privilege('anon', 'public.fn_lesson_complete(uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'COURSE_UX_1_137_PROOF: fn_lesson_complete grants / definer changed';
    END IF;
    IF EXISTS (SELECT 1 FROM public.premium_system_configs WHERE config_key = 'COINS_LESSON_EARN') THEN
        RAISE EXCEPTION 'COURSE_UX_1_137_PROOF: lesson coins must ship OFF';
    END IF;
    IF position('frozen' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_award_gamification_reward(uuid, text, text, uuid, text, integer, text, jsonb)'::regprocedure)) = 0 THEN
        RAISE EXCEPTION 'COURSE_UX_1_137_PROOF: the generic award must stay frozen';
    END IF;
END
$proof$;
