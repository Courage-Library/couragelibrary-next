-- =====================================================================================================================
-- 097 F11 (#79) — support tickets: a ticket form + "my tickets" status page; staff answer from the admin studio
-- NOT APPLIED until the architect's "go". Rollback: docs/database/rollback/097_rollback.sql
-- No BEGIN / COMMIT here: scripts/db/apply-migration.cjs runs the file and its ledger row in ONE transaction.
--
-- 1. public.support_tickets — one row per ticket: ref (CL-YYMMDD-XXXXXX, shown to the student), user_id, category,
--    subject (5–120), message (10–3000), status (OPEN / IN_PROGRESS / RESOLVED / CLOSED), staff_reply (≤ 3000),
--    timestamps. RLS on; the student reads ONLY their own tickets (SELECT policy); no client INSERT / UPDATE / DELETE;
--    staff work through the service role (explicit grant — the default ACL gives service_role nothing on new tables),
--    audited by the admin action. No attachments, no IP / device data.
-- 2. fn_create_support_ticket (SECURITY DEFINER, search_path '', authenticated only): auth.uid(); validated inputs;
--    rate caps 2 per 10 minutes and 5 per rolling day per user; returns the ticket ref. Fixed codes only.
-- =====================================================================================================================

CREATE TABLE IF NOT EXISTS public.support_tickets (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ref         text NOT NULL UNIQUE CHECK (ref ~ '^CL-[0-9]{6}-[A-Z0-9]{6}$'),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category    text NOT NULL CHECK (category IN ('ACCOUNT', 'TEST', 'QUESTION', 'PAYMENT', 'DATA_PRIVACY', 'GRIEVANCE', 'OTHER')),
    subject     text NOT NULL CHECK (length(btrim(subject)) BETWEEN 5 AND 120),
    message     text NOT NULL CHECK (length(btrim(message)) BETWEEN 10 AND 3000),
    status      text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    staff_reply text CHECK (staff_reply IS NULL OR length(staff_reply) <= 3000),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_created ON public.support_tickets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created ON public.support_tickets (status, created_at DESC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_tickets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.support_tickets TO authenticated;
CREATE POLICY p_support_tickets_select_own ON public.support_tickets FOR SELECT TO authenticated USING (user_id = auth.uid());
-- staff path (admin studio, service role): read + status / reply updates only
GRANT SELECT, UPDATE (status, staff_reply, updated_at, resolved_at) ON public.support_tickets TO service_role;

CREATE OR REPLACE FUNCTION public.fn_create_support_ticket(p_category text, p_subject text, p_message text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid     uuid := auth.uid();
    v_subject text := btrim(coalesce(p_subject, ''));
    v_message text := btrim(coalesce(p_message, ''));
    v_ref     text;
    v_try     integer := 0;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_SIGNED_IN');
    END IF;
    IF p_category IS NULL OR p_category NOT IN ('ACCOUNT', 'TEST', 'QUESTION', 'PAYMENT', 'DATA_PRIVACY', 'GRIEVANCE', 'OTHER')
       OR length(v_subject) NOT BETWEEN 5 AND 120 OR length(v_message) NOT BETWEEN 10 AND 3000 THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('support_tickets:' || v_uid::text, 0));
    IF (SELECT count(*) FROM public.support_tickets WHERE user_id = v_uid AND created_at > pg_catalog.now() - interval '10 minutes') >= 2
       OR (SELECT count(*) FROM public.support_tickets WHERE user_id = v_uid AND created_at > pg_catalog.now() - interval '1 day') >= 5 THEN
        RETURN jsonb_build_object('success', false, 'code', 'RATE_LIMITED');
    END IF;

    LOOP
        v_try := v_try + 1;
        v_ref := 'CL-' || to_char(pg_catalog.now() AT TIME ZONE 'Asia/Kolkata', 'YYMMDD') || '-'
                 || upper(substr(translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/=', 'XYZ'), 1, 6));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.support_tickets WHERE ref = v_ref) OR v_try >= 5;
    END LOOP;

    INSERT INTO public.support_tickets (ref, user_id, category, subject, message)
    VALUES (v_ref, v_uid, p_category, v_subject, v_message);
    RETURN jsonb_build_object('success', true, 'code', 'CREATED', 'ref', v_ref);
END
$$;
REVOKE ALL ON FUNCTION public.fn_create_support_ticket(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_create_support_ticket(text, text, text) TO authenticated;
