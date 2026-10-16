-- =============================================================================
-- COURAGE LIBRARY — ROLLBACK of 081 (gap2_4b_qa_syllabus_test_exam)
-- NOT a migration. Apply only with owner approval in ONE transaction, then mark the 081 ledger row ROLLED_BACK.
-- Deletes the QA test exam only if it has no syllabus versions (archived TEST versions are immutable history and
-- block the delete through ON DELETE RESTRICT — in that case the exam stays, inactive).
-- =============================================================================
BEGIN;
DELETE FROM public.exams e
 WHERE e.slug = 'qa-syllabus-test' AND e.is_active = false
   AND NOT EXISTS (SELECT 1 FROM public.exam_syllabus_versions v WHERE v.exam_id = e.id);
COMMIT;
