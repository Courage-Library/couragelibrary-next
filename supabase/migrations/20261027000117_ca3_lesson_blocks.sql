-- =====================================================================================================================
-- 117 CA-3 LESSON BLOCKS IN THE DB (CONTENT-ARCH-1 §C / M3, lessons part)
-- Architect GO (CA-3) as a CONDITIONAL GO: backup → dry-run (alone) → chunked rolled-back smoke AS THE REAL ROLES →
-- apply → live verify → counts + types diff 0 + link snapshot unchanged. Rollback: docs/database/rollback/117_rollback.sql.
-- No BEGIN / COMMIT: the runner owns the transaction.
--
--   document_versions — + content_format (LEGACY_MDX | BLOCKS), language (en | hi), lesson_meta + blocks (jsonb,
--     validated BY THE DATABASE: fn_lesson_blocks_errors = lib/lessons/blocks.ts), blocks_hash (computed by the DB),
--     blocks_schema_version, is_current (ONE current published version per document + language). The four legacy
--     Storage key / hash columns become NULLable: a BLOCKS version has none, a LEGACY_MDX version keeps all four
--     (chk_document_version_content). Existing rows: LEGACY_MDX, en; the current published pointer → is_current.
--   fn_prevent_published_version_mutation — also guards blocks / meta / hash / format / language (published = frozen).
--   fn_lesson_save_draft / fn_lesson_publish — SECURITY INVOKER, EXECUTE service_role only, audited (LESSON_*).
--     Publishing demotes the previous current version of the same language; en moves the document's pointer.
--   storage bucket lesson-images (private; no client policies — images reach students through the server only).
--   blocks / lesson_meta: never client-readable (column grants replace any client table-level SELECT).
--   fn_syllabus_mapping_node_fields — CA-2 follow-up: the topic roll-up inlined (a client insert is refused by RLS again).
-- Out of this migration (later phases): node lessons (learning_documents.node_id, CA-4 studio), exam_node_notes (CA-6).
-- =====================================================================================================================

-- ------------------------------------------------------------------ preflight
DO $pre$
DECLARE
    v_n integer;
BEGIN
    SELECT count(*) INTO v_n FROM public.document_versions
     WHERE source_spec_storage_key IS NULL OR compiled_artifact_storage_key IS NULL;
    IF v_n > 0 THEN RAISE EXCEPTION 'CA3_PREFLIGHT: % versions without legacy storage keys', v_n; END IF;
    SELECT count(*) INTO v_n FROM public.learning_documents d
     WHERE d.current_published_version_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.document_versions v WHERE v.id = d.current_published_version_id AND v.document_id = d.id);
    IF v_n > 0 THEN RAISE EXCEPTION 'CA3_PREFLIGHT: % documents point at a foreign version', v_n; END IF;
END
$pre$;

-- ------------------------------------------------------------------ columns
ALTER TABLE public.document_versions
    ADD COLUMN content_format text NOT NULL DEFAULT 'LEGACY_MDX' CHECK (content_format IN ('LEGACY_MDX', 'BLOCKS')),
    ADD COLUMN language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hi')),
    ADD COLUMN lesson_meta jsonb,
    ADD COLUMN blocks jsonb,
    ADD COLUMN blocks_hash text CHECK (blocks_hash IS NULL OR blocks_hash ~ '^[0-9a-f]{64}$'),
    ADD COLUMN blocks_schema_version text CHECK (blocks_schema_version IS NULL OR blocks_schema_version = '2.0.0'),
    ADD COLUMN is_current boolean NOT NULL DEFAULT false;
ALTER TABLE public.document_versions
    ALTER COLUMN source_spec_storage_key DROP NOT NULL,
    ALTER COLUMN source_spec_hash DROP NOT NULL,
    ALTER COLUMN compiled_artifact_storage_key DROP NOT NULL,
    ALTER COLUMN compiled_artifact_hash DROP NOT NULL;
ALTER TABLE public.document_versions ADD CONSTRAINT chk_document_version_content CHECK (
    (content_format = 'LEGACY_MDX' AND source_spec_storage_key IS NOT NULL AND source_spec_hash IS NOT NULL
         AND compiled_artifact_storage_key IS NOT NULL AND compiled_artifact_hash IS NOT NULL AND blocks IS NULL AND lesson_meta IS NULL)
    OR (content_format = 'BLOCKS' AND blocks IS NOT NULL AND lesson_meta IS NOT NULL AND blocks_hash IS NOT NULL
         AND blocks_schema_version = '2.0.0' AND source_spec_storage_key IS NULL AND source_spec_hash IS NULL
         AND compiled_artifact_storage_key IS NULL AND compiled_artifact_hash IS NULL));
ALTER TABLE public.document_versions ADD CONSTRAINT chk_document_version_current_published CHECK (NOT is_current OR is_published);

-- the document's current published pointer is the current en version (backfill touches only the new column)
UPDATE public.document_versions v SET is_current = true
  FROM public.learning_documents d
 WHERE d.current_published_version_id = v.id;
CREATE UNIQUE INDEX uq_document_versions_one_current_per_language
    ON public.document_versions (document_id, language) WHERE is_current;

COMMENT ON COLUMN public.document_versions.blocks IS 'CA-3: LessonBlocksSpec v2 (ordered typed blocks), validated by fn_lesson_blocks_errors = lib/lessons/blocks.ts.';
COMMENT ON COLUMN public.document_versions.is_current IS 'CA-3: the current published version of this document in this language (one per document + language).';

-- ------------------------------------------------------------------ validation (mirror of lib/lessons/blocks.ts)
CREATE OR REPLACE FUNCTION public.fn_lesson__text_problem(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
    SELECT CASE
        WHEN s ~ '<[a-zA-Z!/?]' THEN 'HTML'
        WHEN position('](' in s) > 0 THEN 'MARKUP_LINK'
        WHEN s ~* '(https?://|javascript:|data:|vbscript:)' THEN 'URL'
        WHEN translate(s, E'\n\t', '') ~ '[[:cntrl:]]' THEN 'CONTROL_CHAR'
    END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_lesson__latex_problem(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
    SELECT coalesce(public.fn_lesson__text_problem(s),
        (SELECT 'LATEX_COMMAND:' || m[1] FROM regexp_matches(s, '\\([a-zA-Z]+|.)', 'g') AS m
          WHERE NOT (m[1] = ANY (ARRAY[
            'frac','dfrac','tfrac','sqrt','times','div','cdot','pm','mp','le','leq','ge','geq','ne','neq','approx','equiv',
            'left','right','text','mathrm','mathbf','overline','underline','hat','bar','vec','sum','prod','int','lim','infty',
            'log','ln','sin','cos','tan','cot','sec','csc','circ','degree','angle','triangle','parallel','perp','therefore',
            'because','rightarrow','leftarrow','Rightarrow','Leftrightarrow','to','in','notin','subset','cup','cap','ldots','cdots',
            'quad','qquad','percent','alpha','beta','gamma','delta','Delta','theta','lambda','mu','pi','rho','sigma','Sigma',
            'phi','omega','Omega','binom','pmod','mod','max','min','lfloor','rfloor','lceil','rceil','{','}','%','$','&',',',';','!']))
          LIMIT 1));
$fn$;

-- one string field: [] when fine, else one error {path, code}
CREATE OR REPLACE FUNCTION public.fn_lesson__str(o jsonb, k text, p text, max_len integer, required boolean, latex boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v jsonb := o -> k;
    s text;
    pr text;
    e jsonb := '[]'::jsonb;
BEGIN
    IF v IS NULL OR jsonb_typeof(v) = 'null' THEN
        RETURN CASE WHEN required THEN jsonb_build_array(jsonb_build_object('path', p || '.' || k, 'code', 'REQUIRED')) ELSE e END;
    END IF;
    IF jsonb_typeof(v) <> 'string' THEN RETURN jsonb_build_array(jsonb_build_object('path', p || '.' || k, 'code', 'TYPE')); END IF;
    s := v #>> '{}';
    IF s ~ '^\s*$' THEN
        RETURN CASE WHEN required THEN jsonb_build_array(jsonb_build_object('path', p || '.' || k, 'code', 'REQUIRED')) ELSE e END;
    END IF;
    IF char_length(s) > max_len THEN e := e || jsonb_build_object('path', p || '.' || k, 'code', 'TOO_LONG'); END IF;
    pr := CASE WHEN latex THEN public.fn_lesson__latex_problem(s) ELSE public.fn_lesson__text_problem(s) END;
    IF pr IS NOT NULL THEN e := e || jsonb_build_object('path', p || '.' || k, 'code', CASE WHEN pr LIKE 'LATEX%' THEN 'LATEX' ELSE 'UNSAFE_TEXT' END, 'detail', pr); END IF;
    RETURN e;
END
$fn$;

CREATE OR REPLACE FUNCTION public.fn_lesson__strlist(o jsonb, k text, p text, min_n integer, max_n integer, item_max integer, required boolean, latex boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v jsonb := o -> k;
    e jsonb := '[]'::jsonb;
    i integer;
BEGIN
    IF v IS NULL OR jsonb_typeof(v) = 'null' THEN
        RETURN CASE WHEN required THEN jsonb_build_array(jsonb_build_object('path', p || '.' || k, 'code', 'REQUIRED')) ELSE e END;
    END IF;
    IF jsonb_typeof(v) <> 'array' THEN RETURN jsonb_build_array(jsonb_build_object('path', p || '.' || k, 'code', 'TYPE')); END IF;
    IF jsonb_array_length(v) < min_n OR jsonb_array_length(v) > max_n THEN e := e || jsonb_build_object('path', p || '.' || k, 'code', 'COUNT'); END IF;
    FOR i IN 0 .. jsonb_array_length(v) - 1 LOOP
        e := e || public.fn_lesson__str(jsonb_build_object(i::text, v -> i), i::text, p || '.' || k, item_max, true, latex);
    END LOOP;
    RETURN e;
END
$fn$;

CREATE OR REPLACE FUNCTION public.fn_lesson__keys(o jsonb, allowed text[], p text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
    SELECT coalesce(jsonb_agg(jsonb_build_object('path', p || '.' || k, 'code', 'UNKNOWN_KEY')), '[]'::jsonb)
      FROM jsonb_object_keys(o) k WHERE NOT (k = ANY (allowed));
$fn$;

CREATE OR REPLACE FUNCTION public.fn_lesson__oneof(o jsonb, k text, p text, allowed text[], required boolean)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
    SELECT CASE
        WHEN o -> k IS NULL OR jsonb_typeof(o -> k) = 'null' THEN
            CASE WHEN required THEN jsonb_build_array(jsonb_build_object('path', p || '.' || k, 'code', 'REQUIRED')) ELSE '[]'::jsonb END
        WHEN jsonb_typeof(o -> k) = 'string' AND (o ->> k) = ANY (allowed) THEN '[]'::jsonb
        ELSE jsonb_build_array(jsonb_build_object('path', p || '.' || k, 'code', 'VALUE'))
    END;
$fn$;

-- the whole lesson: [] = valid (the same verdict as validateLesson in lib/lessons/blocks.ts)
CREATE OR REPLACE FUNCTION public.fn_lesson_blocks_errors(p_meta jsonb, p_blocks jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
    e    jsonb := '[]'::jsonb;
    b    jsonb;
    o    jsonb;
    p    text;
    op   text;
    t    text;
    i    integer;
    j    integer;
    ids  text[] := '{}';
    oids text[];
    nh   integer;
    k    integer;
    c_types constant text[] := ARRAY['heading','paragraph','list','formula','solved_example','callout','trap','table','image',
                                     'practice_link','quick_check','revision_summary','memory_lock_points'];
BEGIN
    -- meta
    IF p_meta IS NULL OR jsonb_typeof(p_meta) <> 'object' THEN
        e := e || jsonb_build_object('path', '$.meta', 'code', 'TYPE');
    ELSE
        e := e || public.fn_lesson__keys(p_meta, ARRAY['title','summary','estimated_minutes','seo'], '$.meta')
               || public.fn_lesson__str(p_meta, 'title', '$.meta', 200, true)
               || public.fn_lesson__str(p_meta, 'summary', '$.meta', 500, false);
        IF p_meta -> 'estimated_minutes' IS NOT NULL AND (jsonb_typeof(p_meta -> 'estimated_minutes') <> 'number'
           OR (p_meta ->> 'estimated_minutes')::numeric <> trunc((p_meta ->> 'estimated_minutes')::numeric)
           OR (p_meta ->> 'estimated_minutes')::numeric NOT BETWEEN 1 AND 240) THEN
            e := e || jsonb_build_object('path', '$.meta.estimated_minutes', 'code', 'VALUE');
        END IF;
        IF p_meta -> 'seo' IS NOT NULL THEN
            IF jsonb_typeof(p_meta -> 'seo') <> 'object' THEN
                e := e || jsonb_build_object('path', '$.meta.seo', 'code', 'TYPE');
            ELSE
                e := e || public.fn_lesson__keys(p_meta -> 'seo', ARRAY['meta_title','meta_description','focus_keywords'], '$.meta.seo')
                       || public.fn_lesson__str(p_meta -> 'seo', 'meta_title', '$.meta.seo', 120, false)
                       || public.fn_lesson__str(p_meta -> 'seo', 'meta_description', '$.meta.seo', 300, false);
                IF p_meta -> 'seo' -> 'focus_keywords' IS NOT NULL THEN
                    e := e || public.fn_lesson__strlist(p_meta -> 'seo', 'focus_keywords', '$.meta.seo', 0, 10, 60, false);
                END IF;
            END IF;
        END IF;
    END IF;

    -- blocks
    IF p_blocks IS NULL OR jsonb_typeof(p_blocks) <> 'array' THEN
        RETURN e || jsonb_build_object('path', '$.blocks', 'code', 'TYPE');
    END IF;
    IF jsonb_array_length(p_blocks) < 1 OR jsonb_array_length(p_blocks) > 300 THEN e := e || jsonb_build_object('path', '$.blocks', 'code', 'COUNT'); END IF;
    IF octet_length(p_blocks::text) > 262144 THEN e := e || jsonb_build_object('path', '$.blocks', 'code', 'TOO_LARGE'); END IF;

    FOR i IN 0 .. jsonb_array_length(p_blocks) - 1 LOOP
        b := p_blocks -> i;
        p := format('$.blocks[%s]', i);
        IF jsonb_typeof(b) <> 'object' THEN
            e := e || jsonb_build_object('path', p, 'code', 'TYPE');
            CONTINUE;
        END IF;
        IF jsonb_typeof(b -> 'id') IS DISTINCT FROM 'string' OR (b ->> 'id') !~ '^[a-z0-9][a-z0-9-]{0,39}$' THEN
            e := e || jsonb_build_object('path', p || '.id', 'code', 'VALUE');
        ELSIF (b ->> 'id') = ANY (ids) THEN
            e := e || jsonb_build_object('path', p || '.id', 'code', 'DUPLICATE_ID');
        ELSE
            ids := ids || (b ->> 'id');
        END IF;
        t := b ->> 'type';
        IF jsonb_typeof(b -> 'type') IS DISTINCT FROM 'string' OR NOT (t = ANY (c_types)) THEN
            e := e || jsonb_build_object('path', p || '.type', 'code', 'VALUE');
            CONTINUE;
        END IF;
        CASE t
        WHEN 'heading' THEN
            e := e || public.fn_lesson__keys(b, ARRAY['id','type','level','text'], p) || public.fn_lesson__str(b, 'text', p, 300, true);
            IF (b -> 'level') IS DISTINCT FROM '2'::jsonb AND (b -> 'level') IS DISTINCT FROM '3'::jsonb THEN
                e := e || jsonb_build_object('path', p || '.level', 'code', 'VALUE');
            END IF;
        WHEN 'paragraph' THEN
            e := e || public.fn_lesson__keys(b, ARRAY['id','type','text'], p) || public.fn_lesson__str(b, 'text', p, 4000, true);
        WHEN 'list' THEN
            e := e || public.fn_lesson__keys(b, ARRAY['id','type','ordered','items'], p) || public.fn_lesson__strlist(b, 'items', p, 1, 30, 4000, true);
            IF jsonb_typeof(b -> 'ordered') IS DISTINCT FROM 'boolean' THEN e := e || jsonb_build_object('path', p || '.ordered', 'code', 'TYPE'); END IF;
        WHEN 'formula' THEN
            e := e || public.fn_lesson__keys(b, ARRAY['id','type','name','latex','reading'], p)
                   || public.fn_lesson__str(b, 'name', p, 120, false) || public.fn_lesson__str(b, 'latex', p, 500, true, true)
                   || public.fn_lesson__str(b, 'reading', p, 600, true);
        WHEN 'solved_example' THEN
            e := e || public.fn_lesson__keys(b, ARRAY['id','type','difficulty','question','steps','answer','shortcut','mistake'], p)
                   || public.fn_lesson__oneof(b, 'difficulty', p, ARRAY['EASY','MEDIUM','HARD'], true)
                   || public.fn_lesson__str(b, 'question', p, 4000, true) || public.fn_lesson__str(b, 'answer', p, 4000, false)
                   || public.fn_lesson__str(b, 'shortcut', p, 4000, false) || public.fn_lesson__str(b, 'mistake', p, 4000, false);
            IF jsonb_typeof(b -> 'steps') IS DISTINCT FROM 'array' OR jsonb_array_length(b -> 'steps') NOT BETWEEN 1 AND 20 THEN
                e := e || jsonb_build_object('path', p || '.steps', 'code', 'COUNT');
            ELSE
                FOR j IN 0 .. jsonb_array_length(b -> 'steps') - 1 LOOP
                    o := b -> 'steps' -> j;
                    op := format('%s.steps[%s]', p, j);
                    IF jsonb_typeof(o) <> 'object' THEN e := e || jsonb_build_object('path', op, 'code', 'TYPE'); CONTINUE; END IF;
                    e := e || public.fn_lesson__keys(o, ARRAY['text','math'], op) || public.fn_lesson__str(o, 'text', op, 4000, true)
                           || public.fn_lesson__str(o, 'math', op, 500, false, true);
                END LOOP;
            END IF;
        WHEN 'callout' THEN
            e := e || public.fn_lesson__keys(b, ARRAY['id','type','variant','title','text'], p)
                   || public.fn_lesson__oneof(b, 'variant', p, ARRAY['TIP','WARNING','INFO','MEMORY_HOOK'], true)
                   || public.fn_lesson__str(b, 'title', p, 120, false) || public.fn_lesson__str(b, 'text', p, 4000, true);
        WHEN 'trap' THEN
            e := e || public.fn_lesson__keys(b, ARRAY['id','type','kind','text','why'], p)
                   || public.fn_lesson__oneof(b, 'kind', p, ARRAY['CALCULATION_SLIP','MISREAD_KEYWORD','FORMULA_CONFUSION','DISTRACTOR_TRAP'], false)
                   || public.fn_lesson__str(b, 'text', p, 4000, true) || public.fn_lesson__str(b, 'why', p, 4000, true);
        WHEN 'table' THEN
            e := e || public.fn_lesson__keys(b, ARRAY['id','type','caption','headers','rows'], p)
                   || public.fn_lesson__str(b, 'caption', p, 300, false) || public.fn_lesson__strlist(b, 'headers', p, 1, 8, 120, true);
            nh := CASE WHEN jsonb_typeof(b -> 'headers') = 'array' THEN jsonb_array_length(b -> 'headers') ELSE 0 END;
            IF jsonb_typeof(b -> 'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(b -> 'rows') NOT BETWEEN 1 AND 50 THEN
                e := e || jsonb_build_object('path', p || '.rows', 'code', 'COUNT');
            ELSE
                FOR j IN 0 .. jsonb_array_length(b -> 'rows') - 1 LOOP
                    o := b -> 'rows' -> j;
                    op := format('%s.rows[%s]', p, j);
                    IF jsonb_typeof(o) <> 'array' OR jsonb_array_length(o) <> nh THEN
                        e := e || jsonb_build_object('path', op, 'code', 'SHAPE');
                        CONTINUE;
                    END IF;
                    FOR k IN 0 .. jsonb_array_length(o) - 1 LOOP
                        e := e || public.fn_lesson__str(jsonb_build_object(k::text, o -> k), k::text, op, 300, false);
                    END LOOP;
                END LOOP;
            END IF;
        WHEN 'image' THEN
            e := e || public.fn_lesson__keys(b, ARRAY['id','type','asset_id','alt','caption'], p)
                   || public.fn_lesson__str(b, 'asset_id', p, 200, true) || public.fn_lesson__str(b, 'alt', p, 300, true)
                   || public.fn_lesson__str(b, 'caption', p, 300, false);
            IF jsonb_typeof(b -> 'asset_id') = 'string' AND ((b ->> 'asset_id') !~ '^[a-z0-9][a-z0-9_.-]*(/[a-z0-9][a-z0-9_.-]*){0,4}$'
                                                             OR position('..' in (b ->> 'asset_id')) > 0) THEN
                e := e || jsonb_build_object('path', p || '.asset_id', 'code', 'VALUE');
            END IF;
        WHEN 'practice_link' THEN
            e := e || public.fn_lesson__keys(b, ARRAY['id','type','node_id','mode','label'], p)
                   || public.fn_lesson__oneof(b, 'mode', p, ARRAY['PRACTICE','PYQ','MOCK'], true)
                   || public.fn_lesson__str(b, 'label', p, 120, false);
            IF jsonb_typeof(b -> 'node_id') IS DISTINCT FROM 'string'
               OR (b ->> 'node_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                e := e || jsonb_build_object('path', p || '.node_id', 'code', 'VALUE');
            END IF;
        WHEN 'quick_check' THEN
            e := e || public.fn_lesson__keys(b, ARRAY['id','type','prompt','options'], p) || public.fn_lesson__str(b, 'prompt', p, 4000, true);
            IF jsonb_typeof(b -> 'options') IS DISTINCT FROM 'array' OR jsonb_array_length(b -> 'options') NOT BETWEEN 2 AND 6 THEN
                e := e || jsonb_build_object('path', p || '.options', 'code', 'COUNT');
            ELSE
                oids := '{}';
                FOR j IN 0 .. jsonb_array_length(b -> 'options') - 1 LOOP
                    o := b -> 'options' -> j;
                    op := format('%s.options[%s]', p, j);
                    IF jsonb_typeof(o) <> 'object' THEN e := e || jsonb_build_object('path', op, 'code', 'TYPE'); CONTINUE; END IF;
                    e := e || public.fn_lesson__keys(o, ARRAY['id','text','correct','feedback'], op)
                           || public.fn_lesson__str(o, 'text', op, 600, true) || public.fn_lesson__str(o, 'feedback', op, 4000, false);
                    IF jsonb_typeof(o -> 'id') IS DISTINCT FROM 'string' OR (o ->> 'id') !~ '^[a-z0-9][a-z0-9-]{0,39}$' OR (o ->> 'id') = ANY (oids) THEN
                        e := e || jsonb_build_object('path', op || '.id', 'code', 'VALUE');
                    ELSE
                        oids := oids || (o ->> 'id');
                    END IF;
                    IF jsonb_typeof(o -> 'correct') IS DISTINCT FROM 'boolean' THEN e := e || jsonb_build_object('path', op || '.correct', 'code', 'TYPE'); END IF;
                END LOOP;
                IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(b -> 'options') x WHERE x -> 'correct' = 'true'::jsonb) THEN
                    e := e || jsonb_build_object('path', p || '.options', 'code', 'NO_CORRECT');
                END IF;
            END IF;
        WHEN 'revision_summary' THEN
            e := e || public.fn_lesson__keys(b, ARRAY['id','type','bullets','formulas','speed_rules'], p)
                   || public.fn_lesson__strlist(b, 'bullets', p, 1, 20, 4000, true);
            IF b -> 'formulas' IS NOT NULL THEN e := e || public.fn_lesson__strlist(b, 'formulas', p, 0, 20, 500, false, true); END IF;
            IF b -> 'speed_rules' IS NOT NULL THEN e := e || public.fn_lesson__strlist(b, 'speed_rules', p, 0, 20, 4000, false); END IF;
        WHEN 'memory_lock_points' THEN
            e := e || public.fn_lesson__keys(b, ARRAY['id','type','points'], p) || public.fn_lesson__strlist(b, 'points', p, 3, 10, 300, true);
        END CASE;
    END LOOP;
    RETURN e;
END
$fn$;

-- ------------------------------------------------------------------ the DB validates + hashes every BLOCKS version
CREATE OR REPLACE FUNCTION public.fn_lesson_version_blocks_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_errors jsonb;
BEGIN
    IF NEW.content_format = 'BLOCKS' THEN
        v_errors := public.fn_lesson_blocks_errors(NEW.lesson_meta, NEW.blocks);
        IF jsonb_array_length(v_errors) > 0 THEN
            RAISE EXCEPTION 'LESSON_BLOCKS_INVALID: % problem(s), first: %', jsonb_array_length(v_errors),
                (SELECT string_agg(x ->> 'path' || ' ' || (x ->> 'code'), '; ') FROM (SELECT x FROM jsonb_array_elements(v_errors) x LIMIT 5) y)
                USING ERRCODE = '22023';
        END IF;
        NEW.blocks_schema_version := '2.0.0';
        NEW.blocks_hash := encode(sha256(convert_to(NEW.lesson_meta::text || E'\n' || NEW.blocks::text, 'UTF8')), 'hex');
    END IF;
    RETURN NEW;
END
$fn$;
-- fires before the published-version guard (alphabetical), so a changed hash on a published row is still refused
DROP TRIGGER IF EXISTS trg_a_lesson_version_blocks_guard ON public.document_versions;
CREATE TRIGGER trg_a_lesson_version_blocks_guard
    BEFORE INSERT OR UPDATE OF content_format, lesson_meta, blocks, blocks_hash, blocks_schema_version ON public.document_versions
    FOR EACH ROW EXECUTE FUNCTION public.fn_lesson_version_blocks_guard();

-- published versions stay frozen: the guard now also covers the CA-3 content columns (is_current may move on supersede)
CREATE OR REPLACE FUNCTION public.fn_prevent_published_version_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- If previously published, strictly disallow any modification to content, hashes, versioning, metadata, or flags
  IF OLD.review_status = 'PUBLISHED' OR OLD.is_published = TRUE THEN
    IF NEW.review_status IS DISTINCT FROM OLD.review_status OR
       NEW.source_spec_storage_key IS DISTINCT FROM OLD.source_spec_storage_key OR
       NEW.source_spec_hash IS DISTINCT FROM OLD.source_spec_hash OR
       NEW.compiled_artifact_storage_key IS DISTINCT FROM OLD.compiled_artifact_storage_key OR
       NEW.compiled_artifact_hash IS DISTINCT FROM OLD.compiled_artifact_hash OR
       NEW.compiler_version IS DISTINCT FROM OLD.compiler_version OR
       NEW.schema_version IS DISTINCT FROM OLD.schema_version OR
       NEW.component_contract_version IS DISTINCT FROM OLD.component_contract_version OR
       NEW.version_number IS DISTINCT FROM OLD.version_number OR
       NEW.is_published IS DISTINCT FROM OLD.is_published OR
       NEW.document_id IS DISTINCT FROM OLD.document_id OR
       NEW.created_at IS DISTINCT FROM OLD.created_at OR
       -- CA-3
       NEW.content_format IS DISTINCT FROM OLD.content_format OR
       NEW.language IS DISTINCT FROM OLD.language OR
       NEW.lesson_meta IS DISTINCT FROM OLD.lesson_meta OR
       NEW.blocks IS DISTINCT FROM OLD.blocks OR
       NEW.blocks_hash IS DISTINCT FROM OLD.blocks_hash OR
       NEW.blocks_schema_version IS DISTINCT FROM OLD.blocks_schema_version THEN
      RAISE EXCEPTION 'Cannot mutate published document version % (v%). Published content versions are strictly immutable. Create version % instead.',
        OLD.id, OLD.version_number, (OLD.version_number + 1);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------ RPCs (service_role only, audited)
CREATE OR REPLACE FUNCTION public.fn_lesson_audit(p_actor_id uuid, p_actor_email text, p_action text, p_target_id uuid, p_new jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'LESSON: an actor is required' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
    VALUES (p_actor_id, p_actor_email, p_action, 'document_version', p_target_id::text, NULL, p_new, NULL);
END
$fn$;

-- Saves the DRAFT of (document, language): updates the open BLOCKS draft or creates the next version. The trigger
-- validates (fn_lesson_blocks_errors) and hashes; nothing published changes.
CREATE OR REPLACE FUNCTION public.fn_lesson_save_draft(
    p_document_id uuid, p_language text, p_meta jsonb, p_blocks jsonb, p_author_type text, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_draft uuid;
    v_number integer;
    v_row public.document_versions%ROWTYPE;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'LESSON: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_language NOT IN ('en', 'hi') THEN RAISE EXCEPTION 'LESSON: language must be en or hi' USING ERRCODE = '22023'; END IF;
    IF p_author_type NOT IN ('HUMAN', 'AI_ASSISTED', 'LEGACY_CONVERSION') THEN RAISE EXCEPTION 'LESSON: unknown author type' USING ERRCODE = '22023'; END IF;
    PERFORM 1 FROM public.learning_documents WHERE id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LESSON: document % does not exist', p_document_id USING ERRCODE = 'P0002'; END IF;
    SELECT id INTO v_draft FROM public.document_versions
     WHERE document_id = p_document_id AND language = p_language AND content_format = 'BLOCKS'
       AND NOT is_published AND review_status = 'DRAFT'
     ORDER BY version_number DESC LIMIT 1;
    IF v_draft IS NOT NULL THEN
        UPDATE public.document_versions SET lesson_meta = p_meta, blocks = p_blocks, author_type = p_author_type, updated_at = now()
         WHERE id = v_draft RETURNING * INTO v_row;
    ELSE
        SELECT coalesce(max(version_number), 0) + 1 INTO v_number FROM public.document_versions WHERE document_id = p_document_id;
        INSERT INTO public.document_versions
            (document_id, version_number, schema_version, compiler_version, component_contract_version, author_type, review_status,
             is_published, content_format, language, lesson_meta, blocks, blocks_hash, blocks_schema_version)
        VALUES (p_document_id, v_number, '2.0.0', 'blocks-2', 'blocks-2', p_author_type, 'DRAFT', false, 'BLOCKS', p_language,
                p_meta, p_blocks, repeat('0', 64), '2.0.0')
        RETURNING * INTO v_row;
    END IF;
    PERFORM public.fn_lesson_audit(p_actor_id, p_actor_email, 'LESSON_DRAFT_SAVE', v_row.id,
        jsonb_build_object('document_id', p_document_id, 'language', p_language, 'version_number', v_row.version_number,
                           'blocks', jsonb_array_length(p_blocks), 'blocks_hash', v_row.blocks_hash, 'author_type', p_author_type));
    RETURN jsonb_build_object('version_id', v_row.id, 'version_number', v_row.version_number, 'blocks_hash', v_row.blocks_hash);
END
$fn$;

-- Publishes a BLOCKS draft: the previous current version of the same language is demoted; en moves the document's
-- pointer; hi needs a current en version first (the EN master).
CREATE OR REPLACE FUNCTION public.fn_lesson_publish(p_version_id uuid, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v public.document_versions%ROWTYPE;
    v_prev uuid;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'LESSON: an actor is required' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v FROM public.document_versions WHERE id = p_version_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LESSON: version % does not exist', p_version_id USING ERRCODE = 'P0002'; END IF;
    IF v.content_format <> 'BLOCKS' THEN RAISE EXCEPTION 'LESSON: only BLOCKS versions are published here (the MDX path is retired)' USING ERRCODE = 'P0001'; END IF;
    IF v.is_published OR v.review_status = 'PUBLISHED' THEN RAISE EXCEPTION 'LESSON: version % is already published', v.version_number USING ERRCODE = 'P0001'; END IF;
    PERFORM 1 FROM public.learning_documents WHERE id = v.document_id FOR UPDATE;
    IF v.language = 'hi' AND NOT EXISTS (SELECT 1 FROM public.document_versions WHERE document_id = v.document_id AND language = 'en' AND is_current) THEN
        RAISE EXCEPTION 'LESSON: publish the English version first (Hindi follows the English master)' USING ERRCODE = 'P0001';
    END IF;
    -- re-validate at publish (the rules may have tightened since the draft was saved)
    IF jsonb_array_length(public.fn_lesson_blocks_errors(v.lesson_meta, v.blocks)) > 0 THEN
        RAISE EXCEPTION 'LESSON_BLOCKS_INVALID: fix the draft before publishing' USING ERRCODE = '22023';
    END IF;
    SELECT id INTO v_prev FROM public.document_versions WHERE document_id = v.document_id AND language = v.language AND is_current;
    IF v_prev IS NOT NULL THEN
        UPDATE public.document_versions SET is_current = false WHERE id = v_prev;
    END IF;
    UPDATE public.document_versions
       SET review_status = 'PUBLISHED', is_published = true, published_at = now(), approved_by_user_id = p_actor_id, is_current = true, updated_at = now()
     WHERE id = p_version_id;
    IF v.language = 'en' THEN
        UPDATE public.learning_documents SET current_published_version_id = p_version_id, updated_at = now() WHERE id = v.document_id;
    END IF;
    PERFORM public.fn_lesson_audit(p_actor_id, p_actor_email, 'LESSON_PUBLISH', p_version_id,
        jsonb_build_object('document_id', v.document_id, 'language', v.language, 'version_number', v.version_number,
                           'previous_current_version_id', v_prev, 'blocks_hash', v.blocks_hash));
    RETURN jsonb_build_object('version_id', p_version_id, 'version_number', v.version_number, 'language', v.language,
                              'previous_current_version_id', v_prev);
END
$fn$;

-- ------------------------------------------------------------------ CA-2 follow-up (dispatch 40543930020, RLS P-2)
-- 116's mapping trigger called fn_taxonomy_topic_of (EXECUTE: service_role only), so a CLIENT insert into syllabus
-- mappings failed with "permission denied for function" before RLS could refuse it. The roll-up is inlined here (plain
-- reads of canonical_taxonomy_nodes under the caller's own rights), so a client insert is refused by RLS again, exactly
-- as before 116. No grant is widened.
CREATE OR REPLACE FUNCTION public.fn_syllabus_mapping_node_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_type text;
BEGIN
    IF NEW.canonical_node_id IS NULL THEN
        NEW.canonical_node_type := 'TOPIC';
        NEW.rollup_topic_id := NULL;
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.canonical_node_id IS NOT DISTINCT FROM OLD.canonical_node_id THEN
        NEW.canonical_node_type := OLD.canonical_node_type;
        NEW.rollup_topic_id := OLD.rollup_topic_id;
        RETURN NEW;
    END IF;
    SELECT node_type INTO v_type FROM public.canonical_taxonomy_nodes WHERE id = NEW.canonical_node_id;
    IF v_type IS NULL OR v_type NOT IN ('TOPIC', 'SUBTOPIC', 'CONCEPT') THEN
        RAISE EXCEPTION 'SYLLABUS_MAPPING_NODE_TYPE: a syllabus unit maps to a TOPIC, SUBTOPIC or CONCEPT (got %)', coalesce(v_type, 'nothing')
            USING ERRCODE = '23514';
    END IF;
    NEW.canonical_node_type := v_type;
    IF v_type = 'TOPIC' THEN
        NEW.rollup_topic_id := NULL;
    ELSE
        WITH RECURSIVE up AS (
            SELECT id, parent_id, node_type, 1 AS hop FROM public.canonical_taxonomy_nodes WHERE id = NEW.canonical_node_id
            UNION ALL
            SELECT p.id, p.parent_id, p.node_type, up.hop + 1 FROM public.canonical_taxonomy_nodes p JOIN up ON p.id = up.parent_id
             WHERE up.node_type <> 'TOPIC' AND up.hop < 6)
        SELECT id INTO NEW.rollup_topic_id FROM up WHERE node_type = 'TOPIC' LIMIT 1;
    END IF;
    RETURN NEW;
END
$fn$;

-- ------------------------------------------------------------------ lesson bodies are never client-readable
-- Bodies used to live in a service-only Storage bucket; now they are columns. A table-level SELECT grant would override
-- any column revoke (GRANT-AUDIT-1), so: for each client role that can SELECT the table, replace the table grant by a
-- column grant on every column EXCEPT blocks + lesson_meta. The reader fetches bodies with the service role after the
-- FREE / PRO access check (exactly as the Storage download before). Row policies are unchanged.
DO $grants$
DECLARE
    r    text;
    cols text;
BEGIN
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'document_versions' AND column_name NOT IN ('blocks', 'lesson_meta');
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF has_table_privilege(r, 'public.document_versions', 'SELECT') THEN
            EXECUTE format('REVOKE SELECT ON TABLE public.document_versions FROM %I', r);
            EXECUTE format('GRANT SELECT (%s) ON TABLE public.document_versions TO %I', cols, r);
        END IF;
    END LOOP;
    IF has_column_privilege('anon', 'public.document_versions', 'blocks', 'SELECT')
       OR has_column_privilege('authenticated', 'public.document_versions', 'blocks', 'SELECT')
       OR has_column_privilege('anon', 'public.document_versions', 'lesson_meta', 'SELECT')
       OR has_column_privilege('authenticated', 'public.document_versions', 'lesson_meta', 'SELECT') THEN
        RAISE EXCEPTION 'CA3_PROOF: a client role can read lesson bodies';
    END IF;
END
$grants$;

-- ------------------------------------------------------------------ lesson images: private bucket, server access only
INSERT INTO storage.buckets (id, name, public)
VALUES ('lesson-images', 'lesson-images', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- ------------------------------------------------------------------ grants
REVOKE ALL ON FUNCTION public.fn_lesson__text_problem(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lesson__latex_problem(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lesson__str(jsonb, text, text, integer, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lesson__strlist(jsonb, text, text, integer, integer, integer, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lesson__keys(jsonb, text[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lesson__oneof(jsonb, text, text, text[], boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lesson_blocks_errors(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lesson_version_blocks_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lesson_audit(uuid, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lesson_save_draft(uuid, text, jsonb, jsonb, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lesson_publish(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lesson__text_problem(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lesson__latex_problem(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lesson__str(jsonb, text, text, integer, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lesson__strlist(jsonb, text, text, integer, integer, integer, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lesson__keys(jsonb, text[], text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lesson__oneof(jsonb, text, text, text[], boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lesson_blocks_errors(jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lesson_audit(uuid, text, text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lesson_save_draft(uuid, text, jsonb, jsonb, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lesson_publish(uuid, uuid, text) TO service_role;

-- ------------------------------------------------------------------ proof
DO $proof$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'lesson-images' AND public = false) THEN
        RAISE EXCEPTION 'CA3_PROOF: private lesson-images bucket missing';
    END IF;
    IF EXISTS (SELECT 1 FROM public.learning_documents d WHERE d.current_published_version_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM public.document_versions v WHERE v.id = d.current_published_version_id AND v.is_current)) THEN
        RAISE EXCEPTION 'CA3_PROOF: a current pointer is not marked is_current';
    END IF;
    IF jsonb_array_length(public.fn_lesson_blocks_errors('{"title":"T"}'::jsonb, '[{"id":"a","type":"paragraph","text":"ok"}]'::jsonb)) <> 0
       OR jsonb_array_length(public.fn_lesson_blocks_errors('{"title":"T"}'::jsonb, '[{"id":"a","type":"paragraph","text":"<b>x</b>"}]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'CA3_PROOF: the blocks validator does not behave';
    END IF;
END
$proof$;
