-- Rollback for 20261025000097_f11_support_tickets.sql (F11 support tickets).
-- Run as ONE transaction by the operator (this file is not a migration; it may carry BEGIN / COMMIT).
-- Before running: set SUPPORT_TICKETS_ENABLED off. WARNING (data): drops every support ticket (export first).
BEGIN;

DROP FUNCTION IF EXISTS public.fn_create_support_ticket(text, text, text);
DROP TABLE IF EXISTS public.support_tickets;

COMMIT;
