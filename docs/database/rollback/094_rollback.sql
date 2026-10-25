-- Rollback for 20261025000094_proctor_log1_attempt_events.sql (PROCTOR-LOG-1).
-- Run as ONE transaction by the operator (this file is not a migration; it may carry BEGIN / COMMIT).
-- WARNING: drops public.attempt_proctor_events and every recorded event in it (export it first if it holds data).
-- Before running: set PROCTOR_LOG_ENABLED off (the player then sends nothing) and restore the neutral notice copy.
BEGIN;

DROP FUNCTION IF EXISTS public.fn_record_proctor_event(uuid, text, integer);
DROP TABLE IF EXISTS public.attempt_proctor_events;
DROP FUNCTION IF EXISTS public.fn_proctor_events_append_only();
DROP TYPE IF EXISTS public.proctor_event_type;

COMMIT;
