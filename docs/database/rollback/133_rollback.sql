-- Rollback for 20261102000133_pii_sweep2_anon.sql (SEC-PII-SWEEP-2 step 1). RE-EXPOSES user ids to anon — only on an
-- architect / owner instruction. Restores the table-wide anon SELECT on the 10 tables and the legacy mock_tests policy.
DO $rb$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['mock_tests', 'discussion_messages', 'document_versions', 'exam_doc_versions', 'exam_sources',
                             'exam_syllabus_versions', 'exam_syllabus_canonical_mappings', 'courses', 'current_affairs_articles',
                             'current_affairs_article_versions']
    LOOP
        EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
    END LOOP;
END
$rb$;
CREATE POLICY "Public read published mock_tests" ON public.mock_tests FOR SELECT USING (status = 'published'::text);
