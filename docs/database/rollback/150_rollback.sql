-- =====================================================================================================================
-- Rollback for 150 PAY-1 B5 transactional e-mail (supabase/migrations/20261118000150_pay1_b5_email_events.sql).
-- ROLLBACK-CHAIN: run first: none
-- Roll the B5 APP back first (it reads and writes email_events) and turn the e-mail job off (repository variable
-- PAYMENTS_EMAILS_ENABLED and the Vercel EMAIL_APP_ENABLED). Drops email_events with its indexes. The e-mail history it
-- held (ids and outcomes only) is lost; the e-mails themselves were already sent. Nothing else changes.
-- Run inside ONE transaction (no BEGIN / COMMIT here).
-- =====================================================================================================================

DROP TABLE public.email_events;

DO $proof$
BEGIN
    IF to_regclass('public.email_events') IS NOT NULL THEN
        RAISE EXCEPTION 'ROLLBACK_150_PROOF: email_events is still there';
    END IF;
END
$proof$;
