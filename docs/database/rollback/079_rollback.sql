-- =============================================================================
-- COURAGE LIBRARY — ROLLBACK of 079 (gap2_4a_syllabus_rpcs)
-- NOT a migration. Apply only with owner approval in ONE transaction, then mark the 079 ledger row ROLLED_BACK.
-- Roll back 080 first (its seed functions call the 079 core helpers).
-- =============================================================================
BEGIN;
DROP FUNCTION IF EXISTS public.fn_exam_syllabus_read_model(uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_syllabus_archive_version(uuid);
DROP FUNCTION IF EXISTS public.fn_syllabus_publish(uuid);
DROP FUNCTION IF EXISTS public.fn_syllabus_validate(uuid);
DROP FUNCTION IF EXISTS public.fn_syllabus_set_unit_mappings(uuid, uuid[], numeric[]);
DROP FUNCTION IF EXISTS public.fn_syllabus_delete_node(uuid);
DROP FUNCTION IF EXISTS public.fn_syllabus_move_node(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.fn_syllabus_upsert_node(uuid, jsonb);
DROP FUNCTION IF EXISTS public.fn_syllabus_create_draft(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fn_syllabus__validate(uuid);
DROP FUNCTION IF EXISTS public.fn_syllabus__insert_node(uuid, uuid, text, text, text, integer, text, text, integer, integer, boolean);
DROP FUNCTION IF EXISTS public.fn_syllabus__create_version(uuid, uuid, text, text, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.fn_syllabus__require_draft(uuid);
DROP FUNCTION IF EXISTS public.fn_syllabus__lock_version(uuid);
DROP FUNCTION IF EXISTS public.fn_syllabus__slugify(text);
DROP FUNCTION IF EXISTS public.fn_syllabus__audit(text, text, uuid, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.fn_syllabus__assert_role(boolean);
DROP FUNCTION IF EXISTS public.fn_jwt_is_admin();
COMMIT;
