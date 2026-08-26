-- ============================================================================
-- COURAGE LIBRARY — PHASE 3C FINAL HARDENING MIGRATION
-- Target Database: couragelibrary-next
-- Description: Revoke public SELECT on algorithm_configs to protect scoring IP.
-- ============================================================================

-- 1. Drop public read RLS policy
DROP POLICY IF EXISTS "Public read active algorithm_configs" ON public.algorithm_configs;

-- 2. Revoke table-level permissions from anon and authenticated
REVOKE ALL ON public.algorithm_configs FROM anon, authenticated, public;

-- 3. Ensure service_role retains full management access
GRANT ALL ON public.algorithm_configs TO service_role;
