-- Rollback for 20261029000125_publish_confirm_server.sql. Run as ONE transaction by the operator.
-- Restores the exact pre-125 one-argument fn_syllabus_publish (pg_get_functiondef before 125) and its grants.
BEGIN;
DROP FUNCTION public.fn_syllabus_publish(uuid, text);
CREATE OR REPLACE FUNCTION public.fn_syllabus_publish(p_version_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v public.exam_syllabus_versions;
  v_report jsonb;
  v_prev uuid;
BEGIN
  PERFORM public.fn_syllabus__assert_role(true);
  v := public.fn_syllabus__require_draft(p_version_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('exam_syllabus:' || v.exam_id::text, 0));
  v_report := public.fn_syllabus__validate(p_version_id);
  IF (v_report ->> 'ok')::boolean IS NOT TRUE THEN -- 105: a missing / NULL ok fails closed
    -- fail closed: nothing written, nothing audited
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_FAILED', 'version_id', p_version_id, 'report', v_report);
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
                       'previous_version_id', v_prev, 'counts', v_report -> 'counts', 'warning_count', v_report -> 'warning_count'));
  RETURN jsonb_build_object('success', true, 'version_id', p_version_id, 'archived_previous_version_id', v_prev,
                            'counts', v_report -> 'counts', 'warnings', v_report -> 'warnings');
END;
$function$
;
REVOKE ALL ON FUNCTION public.fn_syllabus_publish(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_publish(uuid) TO authenticated;
COMMIT;
