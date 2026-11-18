-- =====================================================================================================================
-- 150 PAY-1 B5 transactional e-mail (owner D8 + E1–E7, 2026-11-18; PAY_1_DESIGN.md §13). Table only — no function, so
-- the SECURITY DEFINER count is unchanged. Nothing reads or writes it until the B5 app is deployed AND the owner sets
-- EMAIL_APP_ENABLED (DEPLOY-BEFORE-ACTIVATE). Rollback: docs/database/rollback/150_rollback.sql. No BEGIN / COMMIT
-- (the runner owns the transaction).
--   email_events: ONE row per e-mail event (at most once): the receipt of a paid order, the D7 / D1 reminder of a Pro
--   end date, the confirmation of a refund. event_key is UNIQUE, so a second attempt for the same event finds the row
--   and stops. The row holds NO address, NO name and NO body — only ids, the outcome and the provider's request id.
--     status CLAIMED   — recorded, the send is in progress (a CLAIMED row older than 10 min becomes UNKNOWN)
--            SENT      — the provider accepted it (provider_ref = its request id)
--            FAILED    — the provider answered with an error → the job retries it (at most 3 attempts in all)
--            UNKNOWN   — no answer (timeout / network / crash after the claim): NEVER retried; listed for the owner
--            SUPPRESSED— deliberately not sent (no address on the account; a test-mode event for a non-QA account)
--   RLS on, no policy; service_role only (the server-side mail job). Clients have no access.
-- =====================================================================================================================

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261118000149_pay1_b4_payment_robustness.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'PAY1_B5_PREFLIGHT: 149 is not applied';
    END IF;
END
$pre$;

CREATE TABLE public.email_events (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind          text NOT NULL CHECK (kind IN ('PRO_RECEIPT', 'PRO_EXPIRY_D7', 'PRO_EXPIRY_D1', 'PRO_REFUND')),
    event_key     text NOT NULL UNIQUE CHECK (event_key ~ '^(receipt|expiry|refund):[A-Za-z0-9:._-]{3,160}$'),
    user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    gateway_mode  text NOT NULL DEFAULT 'live' CHECK (gateway_mode IN ('test', 'live')),
    status        text NOT NULL DEFAULT 'CLAIMED' CHECK (status IN ('CLAIMED', 'SENT', 'FAILED', 'UNKNOWN', 'SUPPRESSED')),
    attempts      integer NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 3),
    provider_ref  text CHECK (provider_ref IS NULL OR length(provider_ref) <= 120),
    error_code    text CHECK (error_code IS NULL OR length(error_code) <= 60),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    sent_at       timestamptz
);
COMMENT ON TABLE public.email_events IS 'PAY-1 B5: one row per transactional e-mail event (unique event_key = at most once); ids and outcome only — no address, name or body. Service role only.';

-- the job's work lists: retries (FAILED), stale claims (CLAIMED), the admin list (UNKNOWN / FAILED)
CREATE INDEX idx_email_events_open ON public.email_events (status, updated_at) WHERE status IN ('CLAIMED', 'FAILED', 'UNKNOWN');
CREATE INDEX idx_email_events_user ON public.email_events (user_id);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.email_events TO service_role;

DO $proof$
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.email_events'::regclass) THEN
        RAISE EXCEPTION 'PAY1_B5_PROOF: RLS is off on email_events';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'email_events') THEN
        RAISE EXCEPTION 'PAY1_B5_PROOF: email_events must have no policy (service role only)';
    END IF;
    IF has_table_privilege('anon', 'public.email_events', 'SELECT') OR has_table_privilege('authenticated', 'public.email_events', 'SELECT')
       OR has_table_privilege('anon', 'public.email_events', 'INSERT') OR has_table_privilege('authenticated', 'public.email_events', 'INSERT')
       OR has_table_privilege('authenticated', 'public.email_events', 'UPDATE') OR has_table_privilege('service_role', 'public.email_events', 'DELETE')
       OR NOT has_table_privilege('service_role', 'public.email_events', 'INSERT') THEN
        RAISE EXCEPTION 'PAY1_B5_PROOF: email_events grants are not as designed';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_events'
                AND column_name ~ '(email|address|name|body|subject|html|text)$' AND column_name <> 'error_code') THEN
        RAISE EXCEPTION 'PAY1_B5_PROOF: email_events must not hold an address, a name or a body';
    END IF;
END
$proof$;
