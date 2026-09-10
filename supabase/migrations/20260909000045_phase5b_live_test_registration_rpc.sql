-- ============================================================================
-- COURAGE LIBRARY — PHASE 5B: LIVE TEST REGISTRATION ENGINE
-- Migration 45: Atomic Registration & Cancellation RPCs
-- ============================================================================

-- 1. Atomic Live Test Registration Function
CREATE OR REPLACE FUNCTION public.fn_register_live_test(
    p_event_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_event RECORD;
    v_existing_reg RECORD;
    v_reg_id UUID;
    v_has_premium BOOLEAN := false;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- 1. Fetch event with row-level exclusive lock to prevent capacity race conditions
    SELECT * INTO v_event
    FROM public.live_test_events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'EVENT_NOT_FOUND',
            'message', 'The requested live test event was not found.'
        );
    END IF;

    -- 2. Verify Event Status
    IF v_event.status != 'REGISTRATION_OPEN' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'REGISTRATION_CLOSED',
            'message', 'Registration for this event is currently closed.'
        );
    END IF;

    -- 3. Verify Registration Time Window (Server Wall-Clock)
    IF v_now < v_event.registration_start_at THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'REGISTRATION_NOT_STARTED',
            'message', 'Registration for this event has not started yet.'
        );
    END IF;

    IF v_now > v_event.registration_end_at THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'REGISTRATION_WINDOW_EXPIRED',
            'message', 'The registration window for this event has expired.'
        );
    END IF;

    -- 4. Check If Already Registered (Idempotency)
    SELECT * INTO v_existing_reg
    FROM public.live_test_registrations
    WHERE live_test_event_id = p_event_id AND user_id = p_user_id;

    IF FOUND THEN
        IF v_existing_reg.status = 'REGISTERED' THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_registered', true,
                'registration_id', v_existing_reg.id,
                'registered_at', v_existing_reg.registered_at,
                'status', v_existing_reg.status,
                'message', 'Candidate is already registered for this event.'
            );
        ELSIF v_existing_reg.status = 'CANCELLED' THEN
            -- Re-activate cancelled registration if within capacity
            IF v_event.max_participants IS NOT NULL AND v_event.current_registered_count >= v_event.max_participants THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'CAPACITY_REACHED',
                    'message', 'Event capacity has been reached.'
                );
            END IF;

            UPDATE public.live_test_registrations
            SET status = 'REGISTERED', updated_at = v_now
            WHERE id = v_existing_reg.id;

            UPDATE public.live_test_events
            SET current_registered_count = current_registered_count + 1, updated_at = v_now
            WHERE id = p_event_id;

            RETURN jsonb_build_object(
                'success', true,
                'already_registered', false,
                're为其_activated', true,
                'registration_id', v_existing_reg.id,
                'registered_at', v_now,
                'status', 'REGISTERED',
                'message', 'Registration successfully re-activated.'
            );
        END IF;
    END IF;

    -- 5. Check Capacity Limit
    IF v_event.max_participants IS NOT NULL AND v_event.current_registered_count >= v_event.max_participants THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'CAPACITY_REACHED',
            'message', 'Maximum participant capacity reached for this live event.'
        );
    END IF;

    -- 6. Check Premium Entitlement if required
    IF v_event.is_premium_only THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements
            WHERE user_id = p_user_id
              AND status = 'active'
              AND (expires_at IS NULL OR expires_at > v_now)
        ) INTO v_has_premium;

        IF NOT v_has_premium THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'PREMIUM_REQUIRED',
                'message', 'This All-India Live Mock requires an active Premium membership.'
            );
        END IF;
    END IF;

    -- 7. Insert Registration Record
    INSERT INTO public.live_test_registrations (
        live_test_event_id,
        user_id,
        registered_at,
        status
    )
    VALUES (
        p_event_id,
        p_user_id,
        v_now,
        'REGISTERED'
    )
    RETURNING id INTO v_reg_id;

    -- 8. Increment Event Registration Counter
    UPDATE public.live_test_events
    SET current_registered_count = current_registered_count + 1,
        updated_at = v_now
    WHERE id = p_event_id;

    RETURN jsonb_build_object(
        'success', true,
        'already_registered', false,
        'registration_id', v_reg_id,
        'registered_at', v_now,
        'status', 'REGISTERED',
        'message', 'Registration confirmed successfully.'
    );
END;
$$;

-- 2. Atomic Live Test Cancellation Function
CREATE OR REPLACE FUNCTION public.fn_cancel_live_test_registration(
    p_event_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_event RECORD;
    v_reg RECORD;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- 1. Fetch Event with lock
    SELECT * INTO v_event
    FROM public.live_test_events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'EVENT_NOT_FOUND', 'message', 'Event not found.');
    END IF;

    -- 2. Verify cancellation is permitted (Cannot cancel once LIVE or READY)
    IF v_event.status IN ('READY', 'LIVE', 'GRACE_PERIOD', 'PROCESSING', 'RESULTS_READY', 'PUBLISHED', 'ARCHIVED') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'CANCELLATION_NOT_ALLOWED',
            'message', 'Registration cannot be cancelled once the event preparation or live window has begun.'
        );
    END IF;

    -- 3. Fetch active registration
    SELECT * INTO v_reg
    FROM public.live_test_registrations
    WHERE live_test_event_id = p_event_id AND user_id = p_user_id AND status = 'REGISTERED'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'REGISTRATION_NOT_FOUND', 'message', 'No active registration found.');
    END IF;

    -- 4. Update Status to CANCELLED
    UPDATE public.live_test_registrations
    SET status = 'CANCELLED', updated_at = v_now
    WHERE id = v_reg.id;

    -- 5. Decrement Event Counter
    UPDATE public.live_test_events
    SET current_registered_count = GREATEST(0, current_registered_count - 1),
        updated_at = v_now
    WHERE id = p_event_id;

    RETURN jsonb_build_object('success', true, 'message', 'Registration cancelled successfully.');
END;
$$;
