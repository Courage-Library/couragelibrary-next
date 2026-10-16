-- =============================================================================
-- COURAGE LIBRARY — GAP2-4b: permanent QA test exam for the syllabus editor tests
-- Migration: 20261016000081_gap2_4b_qa_syllabus_test_exam.sql
--
-- The editor's end-to-end test (scripts/test_gap2_4b_editor.cjs) publishes and archives a TEST syllabus through
-- the real UI. That must never touch a real exam (published rows are visible to students; published and archived
-- versions are immutable by design, so they cannot be cleaned up). This adds ONE permanent, INACTIVE exam used only
-- by tests — the same pattern as the permanent QA identities.
--   * is_active = false: the student exam hub, /exams listing and sitemap skip inactive exams.
--   * Drafts created by the test are deleted through fn_syllabus_delete_node / archive; the archived TEST versions
--     stay as immutable history on this exam only.
--   * Never activate this exam. Its slug is reserved: qa-syllabus-test.
-- Idempotent (ON CONFLICT DO NOTHING). Rollback: docs/database/rollback/081_rollback.sql
-- =============================================================================
INSERT INTO public.exams (org_id, title, slug, category, description, is_active)
SELECT e.org_id, 'QA Syllabus Test (internal)', 'qa-syllabus-test', 'Internal QA',
       'Permanent QA fixture for the syllabus editor tests. Never activate.', false
  FROM public.exams e
 WHERE e.slug = 'ssc-cgl'
ON CONFLICT (slug) DO NOTHING;
