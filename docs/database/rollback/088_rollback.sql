-- =============================================================================
-- ROLLBACK for 20261017000088_qb_key1_retire_ca4_fixtures.sql
--
-- Restores questions.status = 'published' for the 8 CA-4 fixtures (allowed by the publication guard: archived →
-- published while the current version is PUBLISHED). The 088 audit rows are kept; the rollback writes one
-- QUESTION_UNARCHIVE audit row per question. Order: 088 → 087 → 086 → …
-- =============================================================================

DO $rb$
DECLARE
  v_ids uuid[] := ARRAY['c6cbfdbf-def4-45a5-9ef6-4d0a24ab61cc',
    '234486ee-4485-49fe-8e7d-e2cab11b250b',
    '597c1c98-9a54-4662-95d1-430b18b8dc61',
    '1fdd3747-a113-4f63-8cef-49aa63ce1c32',
    'd00219c2-13be-47c7-8584-bf00bc187fd4',
    '3735364e-5993-4378-9d89-3b3347fe3bfe',
    '78bd0707-d8eb-4ef7-8c80-ef707df6e1cd',
    '94b30583-2969-493a-80bd-85e179fe1ab4']::uuid[];
  v_n integer;
BEGIN
  UPDATE public.questions SET status = 'published' WHERE id = ANY (v_ids) AND status = 'archived';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
  SELECT NULL, 'system:migration', 'QUESTION_UNARCHIVE', 'question', q::text,
         jsonb_build_object('status', 'archived'), jsonb_build_object('status', 'published', 'migration', '088_rollback'),
         'QB-KEY-1: rollback of 088'
    FROM unnest(v_ids) q;
  RAISE NOTICE 'restored % question(s) to published', v_n;
END
$rb$;
