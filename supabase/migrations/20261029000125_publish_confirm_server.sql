-- =====================================================================================================================
-- 125 PUBLISH-CONFIRM-SERVER (architect CONDITIONAL GO, 2026-10-29) — the typed publish confirmation enforced by the
-- database (SYLLABUS-PUBLISH-IMPACT showed it in the dialog only: student progress is not readable by an admin session).
-- CONDITIONAL GO rules + MIGRATION-LIVE-SET. Rollback: docs/database/rollback/125_rollback.sql. No BEGIN / COMMIT.
--   fn_syllabus_publish(p_version_id, p_confirm text DEFAULT NULL): after validation, inside the same transaction and
--   under the same exam lock, the topics (rolled up) that would LEAVE the exam's syllabus — mapped by any PUBLISHED
--   version of the same exam + cycle (any tier), not by this version — are counted for published lessons (node
--   lessons on the topic or below), published questions and student lesson progress. When any is > 0 and p_confirm is
--   not exactly 'PUBLISH v<version number>', NOTHING is written or audited and CONFIRM_REQUIRED is returned with the
--   list; with the phrase, the publish proceeds and the audit row records the confirmed removals.
-- Same function, same SECURITY DEFINER + search_path '' + admin assertion, same grants (no new privileged function;
-- the SECDEF count is unchanged). One-argument callers keep working (the new argument has a default).
-- =====================================================================================================================

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261028000124_intake_assist_1.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'PC_PREFLIGHT: 124 is not applied';
    END IF;
END
$pre$;

DROP FUNCTION public.fn_syllabus_publish(uuid);

CREATE FUNCTION public.fn_syllabus_publish(p_version_id uuid, p_confirm text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v public.exam_syllabus_versions;
  v_report jsonb;
  v_prev uuid;
  v_removed jsonb;
  v_phrase text;
BEGIN
  PERFORM public.fn_syllabus__assert_role(true);
  v := public.fn_syllabus__require_draft(p_version_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('exam_syllabus:' || v.exam_id::text, 0));
  v_report := public.fn_syllabus__validate(p_version_id);
  IF (v_report ->> 'ok')::boolean IS NOT TRUE THEN -- 105: a missing / NULL ok fails closed
    -- fail closed: nothing written, nothing audited
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_FAILED', 'version_id', p_version_id, 'report', v_report);
  END IF;

  -- 125: published content that would leave the exam's syllabus needs the typed confirmation
  v_phrase := 'PUBLISH v' || v.version_number;
  WITH RECURSIVE
    new_topics AS (
      SELECT DISTINCT m.topic_id FROM public.exam_syllabus_canonical_mappings m
        JOIN public.exam_syllabus_nodes n ON n.id = m.syllabus_node_id
       WHERE n.syllabus_version_id = p_version_id AND m.topic_id IS NOT NULL),
    live_topics AS (
      SELECT DISTINCT m.topic_id FROM public.exam_syllabus_canonical_mappings m
        JOIN public.exam_syllabus_nodes n ON n.id = m.syllabus_node_id
        JOIN public.exam_syllabus_versions pv ON pv.id = n.syllabus_version_id
       WHERE pv.exam_id = v.exam_id AND pv.exam_cycle_id IS NOT DISTINCT FROM v.exam_cycle_id
         AND pv.status = 'PUBLISHED' AND pv.is_active AND pv.id <> p_version_id AND m.topic_id IS NOT NULL),
    removed AS (SELECT topic_id FROM live_topics EXCEPT SELECT topic_id FROM new_topics),
    sub AS (
      SELECT r.topic_id, r.topic_id AS node_id FROM removed r
      UNION ALL
      SELECT s.topic_id, c.id FROM public.canonical_taxonomy_nodes c JOIN sub s ON c.parent_id = s.node_id),
    counted AS (
      SELECT r.topic_id, t.name,
             (SELECT count(*) FROM public.learning_documents d WHERE d.status = 'PUBLISHED'
                AND d.node_id IN (SELECT s.node_id FROM sub s WHERE s.topic_id = r.topic_id))::int AS lessons,
             (SELECT count(*) FROM public.questions q WHERE q.status = 'published' AND q.canonical_topic_id = r.topic_id)::int AS questions,
             (SELECT count(*) FROM public.user_lesson_progress p
               WHERE p.node_id IN (SELECT s.node_id FROM sub s WHERE s.topic_id = r.topic_id))::int AS progress
        FROM removed r JOIN public.canonical_taxonomy_nodes t ON t.id = r.topic_id)
  SELECT coalesce(jsonb_agg(jsonb_build_object('topic_id', c.topic_id, 'name', c.name, 'lessons', c.lessons, 'questions', c.questions,
                                               'progress', c.progress) ORDER BY c.name), '[]'::jsonb)
    INTO v_removed
    FROM counted c WHERE c.lessons + c.questions + c.progress > 0;
  IF jsonb_array_length(v_removed) > 0 AND p_confirm IS DISTINCT FROM v_phrase THEN
    -- fail closed: nothing written, nothing audited
    RETURN jsonb_build_object('success', false, 'code', 'CONFIRM_REQUIRED', 'version_id', p_version_id, 'confirm', v_phrase, 'removed', v_removed);
  END IF;

  SELECT id INTO v_prev FROM public.exam_syllabus_versions
   WHERE exam_id = v.exam_id AND exam_cycle_id IS NOT DISTINCT FROM v.exam_cycle_id AND tier IS NOT DISTINCT FROM v.tier
     AND status = 'PUBLISHED' AND is_active AND id <> p_version_id
   FOR UPDATE;
  IF v_prev IS NOT NULL THEN
    UPDATE public.exam_syllabus_versions SET status = 'ARCHIVED', is_active = false, archived_at = now(), updated_at = now()
     WHERE id = v_prev;
  END IF;
  UPDATE public.exam_syllabus_versions
     SET status = 'PUBLISHED', is_active = true, published_at = now(), published_by = auth.uid(), updated_at = now()
   WHERE id = p_version_id;
  PERFORM public.fn_syllabus__audit('SYLLABUS_PUBLISH', 'exam_syllabus_version', p_version_id,
    CASE WHEN v_prev IS NULL THEN NULL ELSE jsonb_build_object('archived_version_id', v_prev) END,
    jsonb_build_object('exam_id', v.exam_id, 'exam_cycle_id', v.exam_cycle_id, 'tier', v.tier, 'version_number', v.version_number,
                       'previous_version_id', v_prev, 'counts', v_report -> 'counts', 'warning_count', v_report -> 'warning_count',
                       'confirmed_removals', CASE WHEN jsonb_array_length(v_removed) > 0 THEN v_removed END));
  RETURN jsonb_build_object('success', true, 'version_id', p_version_id, 'archived_previous_version_id', v_prev,
                            'counts', v_report -> 'counts', 'warnings', v_report -> 'warnings');
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_syllabus_publish(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_publish(uuid, text) TO authenticated;
