-- =====================================================================================================================
-- 094 PROCTOR-LOG-1 — append-only attempt proctoring events (tab hidden / visible, fullscreen exit / enter)
-- NOT APPLIED until the architect's "go". Rollback: docs/database/rollback/094_rollback.sql
-- No BEGIN / COMMIT here: scripts/db/apply-migration.cjs runs the file and its ledger row in ONE transaction.
--
-- 1. public.attempt_proctor_events — one row per event of a mock attempt: attempt_id, user_id, event_type (enum),
--    occurred_at = SERVER time (never client time), client_seq (the player's per-attempt counter; UNIQUE per attempt, so a
--    retried send is recorded once). No device fingerprint, no IP, no user agent.
--    Append-only: UPDATE is refused by a trigger; no client grant at all (no SELECT / INSERT / UPDATE / DELETE) → read
--    by admins through the service role only (explicit SELECT grant: the default ACL gives service_role none); a student never reads anyone's events, own included. Rows go when the
--    attempt goes (ON DELETE CASCADE — E2E cleanup deletes QA attempts).
-- 2. fn_record_proctor_event (SECURITY DEFINER, search_path '', EXECUTE authenticated only) — the ONLY writer: the
--    caller's OWN attempt (auth.uid(), never a client user id) that is OPEN (in_progress, not submitted, before the server
--    deadline + 2 min grace). Rate caps: 300 events per attempt, 60 per rolling minute per user. Fixed codes only:
--    RECORDED / DUPLICATE / RATE_LIMITED / NOT_FOUND / INVALID_INPUT / AUTH_REQUIRED.
-- =====================================================================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'proctor_event_type') THEN
        CREATE TYPE public.proctor_event_type AS ENUM ('tab_hidden', 'tab_visible', 'fullscreen_exit', 'fullscreen_enter');
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.attempt_proctor_events (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    attempt_id  uuid NOT NULL REFERENCES public.test_attempts(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type  public.proctor_event_type NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    client_seq  integer NOT NULL CHECK (client_seq >= 0 AND client_seq <= 100000),
    CONSTRAINT uq_proctor_event_seq UNIQUE (attempt_id, client_seq)
);
CREATE INDEX IF NOT EXISTS idx_proctor_events_user_time ON public.attempt_proctor_events (user_id, occurred_at DESC);

ALTER TABLE public.attempt_proctor_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attempt_proctor_events FROM PUBLIC, anon, authenticated;
-- admin read path: this project's default ACL gives service_role no SELECT on new tables (only Dxtm), so the stated
-- "admin reads via the service role" needs this one explicit, read-only grant (no client role gets anything)
GRANT SELECT ON public.attempt_proctor_events TO service_role;

-- append-only: no row is ever changed (deletes happen only by cascade from the attempt / user)
CREATE OR REPLACE FUNCTION public.fn_proctor_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'attempt_proctor_events is append-only' USING ERRCODE = '42501';
END
$$;
REVOKE ALL ON FUNCTION public.fn_proctor_events_append_only() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_proctor_events_append_only ON public.attempt_proctor_events;
CREATE TRIGGER trg_proctor_events_append_only BEFORE UPDATE ON public.attempt_proctor_events
    FOR EACH ROW EXECUTE FUNCTION public.fn_proctor_events_append_only();

CREATE OR REPLACE FUNCTION public.fn_record_proctor_event(p_attempt_id uuid, p_event_type text, p_client_seq integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid   uuid := auth.uid();
    v_open  boolean;
    v_rows  integer;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'AUTH_REQUIRED');
    END IF;
    IF p_attempt_id IS NULL OR p_client_seq IS NULL OR p_client_seq < 0 OR p_client_seq > 100000
       OR p_event_type IS NULL OR p_event_type NOT IN ('tab_hidden', 'tab_visible', 'fullscreen_exit', 'fullscreen_enter') THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;

    -- the caller's own OPEN attempt only (server deadline + 2 min grace for in-flight events)
    SELECT (a.status = 'in_progress' AND a.submitted_at IS NULL
            AND now() <= a.started_at + pg_catalog.make_interval(mins => coalesce(m.duration_minutes, 0)) + interval '2 minutes')
      INTO v_open
      FROM public.test_attempts a
      JOIN public.mock_tests m ON m.id = a.mock_test_id
     WHERE a.id = p_attempt_id AND a.user_id = v_uid;
    IF v_open IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
    END IF;

    -- serialise this attempt's events (caps and the per-seq idempotency stay exact)
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('proctor_events:' || p_attempt_id::text, 0));
    IF EXISTS (SELECT 1 FROM public.attempt_proctor_events WHERE attempt_id = p_attempt_id AND client_seq = p_client_seq) THEN
        RETURN jsonb_build_object('success', true, 'code', 'DUPLICATE');
    END IF;
    IF (SELECT count(*) FROM public.attempt_proctor_events WHERE attempt_id = p_attempt_id) >= 300
       OR (SELECT count(*) FROM public.attempt_proctor_events WHERE user_id = v_uid AND occurred_at > now() - interval '1 minute') >= 60 THEN
        RETURN jsonb_build_object('success', false, 'code', 'RATE_LIMITED');
    END IF;

    INSERT INTO public.attempt_proctor_events (attempt_id, user_id, event_type, client_seq)
    VALUES (p_attempt_id, v_uid, p_event_type::public.proctor_event_type, p_client_seq)
    ON CONFLICT (attempt_id, client_seq) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN jsonb_build_object('success', true, 'code', CASE WHEN v_rows = 1 THEN 'RECORDED' ELSE 'DUPLICATE' END);
END
$$;
REVOKE ALL ON FUNCTION public.fn_record_proctor_event(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_record_proctor_event(uuid, text, integer) TO authenticated;
