-- =============================================================================
-- COURAGE LIBRARY — QB-KEY-1 Stage 2 (2/2): retire the 8 CA-4 test fixtures (audited data step, decision #53)
-- Migration: 20261017000088_qb_key1_retire_ca4_fixtures.sql
--
-- Data only: questions.status published → archived for exactly these 8 questions (same semantics as the admin
-- archive action toggleQuestionStatusAction), plus ONE admin_audit_logs row per question
-- (actor = system:migration, action QUESTION_ARCHIVE, reason "QB-KEY-1: CA-4 test fixture retired").
-- Versions / options / answers are NOT touched (published content stays immutable). Archived questions are not served
-- by practice, drills or battles (they filter questions.status = 'published'); none of these is in any mock.
--
-- The 8 fixtures (docs/reports/qb/QB_KEY1_STAGE1_REPORT.md §1.1; created 2026-10-01 by the CA-4 forensic suite):
--   c6cbfdbf-def4-45a5-9ef6-4d0a24ab61cc  SameDay-Q1
--   234486ee-4485-49fe-8e7d-e2cab11b250b  SameDay-Q2
--   597c1c98-9a54-4662-95d1-430b18b8dc61  SameDay-Q3
--   1fdd3747-a113-4f63-8cef-49aa63ce1c32  SameDay-Q4
--   d00219c2-13be-47c7-8584-bf00bc187fd4  SameDay-Q5
--   3735364e-5993-4378-9d89-3b3347fe3bfe  SameDay-Q6
--   78bd0707-d8eb-4ef7-8c80-ef707df6e1cd  SameDay-Q7
--   94b30583-2969-493a-80bd-85e179fe1ab4  SameWeek-Q1
-- Rollback: docs/database/rollback/088_rollback.sql (restores 'published'; audit rows kept; the rollback is audited).
-- =============================================================================

DO $mig$
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
  v_refs text := '';
  r record;
  v_cnt bigint;
BEGIN
  -- ---------------------------------------------------------- preconditions (abort on any failure)
  SELECT count(*) INTO v_n FROM public.questions WHERE id = ANY (v_ids) AND status = 'published';
  IF v_n <> 8 THEN
    RAISE EXCEPTION 'QB_KEY1_088_PRECHECK: expected 8 published fixture questions, found %', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.questions q
   WHERE q.id = ANY (v_ids)
     AND (SELECT count(*) FROM public.question_versions v WHERE v.question_id = q.id) = 1
     AND EXISTS (SELECT 1 FROM public.question_versions v WHERE v.question_id = q.id AND v.question_text LIKE 'Test question text for %');
  IF v_n <> 8 THEN
    RAISE EXCEPTION 'QB_KEY1_088_PRECHECK: not all 8 questions are single-version CA-4 fixtures (stem pattern), found %', v_n;
  END IF;
  -- zero references anywhere (FK columns to questions / question_versions)
  FOR r IN
    SELECT cl.relname tbl, a.attname col, con.confrelid::regclass::text ref
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      JOIN LATERAL unnest(con.conkey) k(attnum) ON true
      JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = k.attnum
     WHERE con.contype = 'f' AND con.confrelid IN ('public.questions'::regclass, 'public.question_versions'::regclass)
       AND cl.relname NOT IN ('question_versions', 'question_options', 'question_answers', 'question_version_authoring')
       AND array_length(con.conkey, 1) = 1
  LOOP
    IF r.ref = 'questions' THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = ANY ($1)', r.tbl, r.col) INTO v_cnt USING v_ids;
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I IN (SELECT id FROM public.question_versions WHERE question_id = ANY ($1))', r.tbl, r.col) INTO v_cnt USING v_ids;
    END IF;
    IF v_cnt > 0 THEN v_refs := v_refs || format('%s.%s=%s ', r.tbl, r.col, v_cnt); END IF;
  END LOOP;
  -- composite FKs (bookmarks / errata reference (version, question))
  SELECT count(*) INTO v_cnt FROM public.user_question_bookmarks WHERE question_id = ANY (v_ids);
  IF v_cnt > 0 THEN v_refs := v_refs || format('user_question_bookmarks=%s ', v_cnt); END IF;
  SELECT count(*) INTO v_cnt FROM public.question_errata_reports WHERE question_id = ANY (v_ids);
  IF v_cnt > 0 THEN v_refs := v_refs || format('question_errata_reports=%s ', v_cnt); END IF;
  -- non-FK references: every jsonb / uuid[] column in public (drills' questions_data, battle rooms, …)
  FOR r IN
    SELECT c.relname tbl, a.attname col FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
       AND a.atttypid IN ('jsonb'::regtype, 'uuid[]'::regtype)
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I x WHERE EXISTS (SELECT 1 FROM unnest($1) i WHERE x.%I::text LIKE ''%%'' || i::text || ''%%'')', r.tbl, r.col)
      INTO v_cnt USING v_ids;
    IF v_cnt > 0 THEN v_refs := v_refs || format('%s.%s=%s ', r.tbl, r.col, v_cnt); END IF;
  END LOOP;
  IF v_refs <> '' THEN
    RAISE EXCEPTION 'QB_KEY1_088_PRECHECK: a fixture is referenced: %', v_refs;
  END IF;

  -- ---------------------------------------------------------- the data step
  UPDATE public.questions SET status = 'archived' WHERE id = ANY (v_ids) AND status = 'published';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 8 THEN
    RAISE EXCEPTION 'QB_KEY1_088: archived % rows, expected 8', v_n;
  END IF;
  INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
  SELECT NULL, 'system:migration', 'QUESTION_ARCHIVE', 'question', q::text,
         jsonb_build_object('status', 'published'), jsonb_build_object('status', 'archived', 'migration', '088'),
         'QB-KEY-1: CA-4 test fixture retired'
    FROM unnest(v_ids) q;

  -- ---------------------------------------------------------- postconditions
  SELECT count(*) INTO v_n FROM public.questions WHERE id = ANY (v_ids) AND status = 'archived';
  IF v_n <> 8 THEN RAISE EXCEPTION 'QB_KEY1_088_POST: % archived', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.admin_audit_logs
   WHERE action_type = 'QUESTION_ARCHIVE' AND reason = 'QB-KEY-1: CA-4 test fixture retired' AND target_id = ANY (SELECT unnest(v_ids)::text);
  IF v_n <> 8 THEN RAISE EXCEPTION 'QB_KEY1_088_POST: % audit rows', v_n; END IF;
END
$mig$;
