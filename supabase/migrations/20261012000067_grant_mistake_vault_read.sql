-- =============================================================================
-- COURAGE LIBRARY — DRIFT-1c: MISTAKE VAULT READ ACCESS FOR SIGNED-IN STUDENTS
-- Migration: 20261012000067_grant_mistake_vault_read.sql
--
-- Root cause (DRIFT-1c E2E): /mistakes reads through the student's session, but the
-- `authenticated` role had NO table-level SELECT privilege on the mistake tables, so
-- every read failed with 42501 even though row-level policies already exist:
--   user_mistake_vault       p_umv_select : user_id = auth.uid() OR staff (app_metadata)
--   user_mistake_occurrences p_umo_select : user_id = auth.uid() OR staff (app_metadata)
--   user_mistake_drills      p_umd_select : user_id = auth.uid() OR staff (app_metadata)
--   mistake_cognitive_types  p_mct_select : true (reference data)
--
-- Minimal fix: SELECT only, for `authenticated` only. RLS (enabled on all four tables)
-- keeps students to their own rows. No INSERT/UPDATE/DELETE, no anon, no policy change.
-- Writes stay server-side (service role). Idempotent.
-- =============================================================================

GRANT SELECT ON TABLE public.user_mistake_vault TO authenticated;
GRANT SELECT ON TABLE public.user_mistake_occurrences TO authenticated;
GRANT SELECT ON TABLE public.user_mistake_drills TO authenticated;
GRANT SELECT ON TABLE public.mistake_cognitive_types TO authenticated;

-- End of 067.
