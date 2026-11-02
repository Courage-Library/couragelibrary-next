-- =====================================================================================================================
-- 133 SEC-PII-SWEEP-2 step 1 (owner GO, 2026-11-02; security fast path): no user id of a student or a staff member is
-- readable by anon (the public, signed-out role). The real-role sweep (scripts/live/sweep_personal_columns.cjs) found:
--   * mock_tests: the legacy policy "Public read published mock_tests" (USING status = 'published') is PERMISSIVE next
--     to the correct "Public read published or own dynamic mock tests" — so every published DYNAMIC (personal) mock,
--     with created_for_user_id and generation_metadata, was readable by anyone. DROP it: the remaining policy still
--     gives everyone the published static mocks and each student their own dynamic ones.
--   * staff ids on published rows (document / guide versions, exam sources, syllabus versions + mappings) and author /
--     creator ids (discussion messages, courses, current affairs) were granted to anon.
-- Fix (RLS unchanged): for each table below, anon loses the table-wide SELECT and gets SELECT on every column EXCEPT
-- the listed personal ones (column grants). A column added later is NOT readable by anon until granted (fail closed).
-- The app reads these tables for anon only with explicit display columns (exam hub, community — same release).
-- authenticated is unchanged in step 1 (admin / staff screens read through the session client); step 2 moves those
-- reads to the server-only admin client and then hides the columns from authenticated too.
-- Rollback: docs/database/rollback/133_rollback.sql. No BEGIN / COMMIT (the runner owns the transaction).
-- No function is created or changed (SECURITY DEFINER count unchanged).
-- =====================================================================================================================
DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261102000132_site_media_no_email.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'PII_SWEEP2_PREFLIGHT: 132 is not applied';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mock_tests' AND policyname = 'Public read published or own dynamic mock tests') THEN
        RAISE EXCEPTION 'PII_SWEEP2_PREFLIGHT: the replacement mock_tests read policy is missing';
    END IF;
END
$pre$;

DROP POLICY "Public read published mock_tests" ON public.mock_tests;

DO $grants$
DECLARE
    r record;
    v_missing text;
    v_cols text;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('mock_tests',                       ARRAY['created_for_user_id', 'generation_metadata']),
            ('discussion_messages',              ARRAY['author_id', 'verified_by_user_id']),
            ('document_versions',                ARRAY['approved_by_user_id']),
            ('exam_doc_versions',                ARRAY['approved_by_user_id']),
            ('exam_sources',                     ARRAY['verified_by_user_id']),
            ('exam_syllabus_versions',           ARRAY['created_by', 'published_by']),
            ('exam_syllabus_canonical_mappings', ARRAY['reviewed_by']),
            ('courses',                          ARRAY['author_id']),
            ('current_affairs_articles',         ARRAY['created_by']),
            ('current_affairs_article_versions', ARRAY['created_by', 'reviewed_by'])
        ) AS t(tbl, hidden)
    LOOP
        -- a typo must never silently leave a column readable
        SELECT string_agg(h, ', ') INTO v_missing FROM unnest(r.hidden) h
         WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = r.tbl AND c.column_name = h);
        IF v_missing IS NOT NULL THEN
            RAISE EXCEPTION 'PII_SWEEP2: %.% does not exist', r.tbl, v_missing;
        END IF;
        SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position) INTO v_cols
          FROM information_schema.columns c
         WHERE c.table_schema = 'public' AND c.table_name = r.tbl AND c.column_name <> ALL (r.hidden);
        EXECUTE format('REVOKE SELECT ON public.%I FROM anon', r.tbl);
        EXECUTE format('GRANT SELECT (%s) ON public.%I TO anon', v_cols, r.tbl);
    END LOOP;
END
$grants$;

-- proof: anon holds SELECT on none of the hidden columns and on every other column of those tables; the legacy policy
-- is gone; authenticated still holds its table SELECT (step 2)
DO $proof$
DECLARE
    v_bad int;
BEGIN
    SELECT count(*) INTO v_bad FROM (VALUES
        ('mock_tests', 'created_for_user_id'), ('mock_tests', 'generation_metadata'),
        ('discussion_messages', 'author_id'), ('discussion_messages', 'verified_by_user_id'),
        ('document_versions', 'approved_by_user_id'), ('exam_doc_versions', 'approved_by_user_id'),
        ('exam_sources', 'verified_by_user_id'), ('exam_syllabus_versions', 'created_by'), ('exam_syllabus_versions', 'published_by'),
        ('exam_syllabus_canonical_mappings', 'reviewed_by'), ('courses', 'author_id'), ('current_affairs_articles', 'created_by'),
        ('current_affairs_article_versions', 'created_by'), ('current_affairs_article_versions', 'reviewed_by')
    ) AS h(t, c)
    WHERE has_column_privilege('anon', format('public.%I', h.t), h.c, 'SELECT');
    IF v_bad <> 0 THEN RAISE EXCEPTION 'PII_SWEEP2_PROOF: anon still reads % hidden column(s)', v_bad; END IF;
    IF has_column_privilege('anon', 'public.mock_tests', 'title', 'SELECT') IS NOT TRUE
       OR has_column_privilege('anon', 'public.exam_sources', 'source_url', 'SELECT') IS NOT TRUE THEN
        RAISE EXCEPTION 'PII_SWEEP2_PROOF: anon lost a display column';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mock_tests' AND policyname = 'Public read published mock_tests') THEN
        RAISE EXCEPTION 'PII_SWEEP2_PROOF: the legacy mock_tests policy is still there';
    END IF;
    IF has_table_privilege('authenticated', 'public.mock_tests', 'SELECT') IS NOT TRUE THEN
        RAISE EXCEPTION 'PII_SWEEP2_PROOF: authenticated lost its SELECT (step 2 is separate)';
    END IF;
END
$proof$;
