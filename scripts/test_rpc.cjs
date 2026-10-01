const fs = require('fs');
const path = require('path');
global.WebSocket = class WebSocket {};
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf-8');
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      process.env[trimmed.slice(0, idx).trim()] = val;
    }
  }
});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testRpc() {
  console.log('Testing RPC or SQL function...');
  // We can create an RPC function fn_delete_exam_atomic that verifies the slug, cleans child tables, and removes the exam atomically!
  const sql = `
CREATE OR REPLACE FUNCTION public.fn_delete_exam_controlled(p_exam_id UUID, p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_exam RECORD;
    v_cycle_ids UUID[];
    v_syl_ids UUID[];
    v_doc_ids UUID[];
    v_attempts_count INTEGER;
    v_goals_count INTEGER;
    v_templates_count INTEGER;
    v_questions_count INTEGER;
BEGIN
    -- 1. Lock and fetch exam
    SELECT id, title, slug, is_active, category, created_at
    INTO v_exam
    FROM public.exams
    WHERE id = p_exam_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Exam with ID % not found.', p_exam_id;
    END IF;

    -- 2. Strict slug confirmation
    IF TRIM(v_exam.slug) != TRIM(p_slug) THEN
        RAISE EXCEPTION 'Slug confirmation mismatch. Expected "%", got "%".', v_exam.slug, p_slug;
    END IF;

    -- 3. Check protected dependencies (attempts, goals, templates, question mappings)
    SELECT COUNT(*) INTO v_attempts_count FROM public.test_attempts WHERE exam_id = p_exam_id;
    IF v_attempts_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete exam: candidate test attempts exist (%).', v_attempts_count;
    END IF;

    SELECT COUNT(*) INTO v_goals_count FROM public.user_exam_goals WHERE exam_id = p_exam_id;
    IF v_goals_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete exam: active student goals exist (%).', v_goals_count;
    END IF;

    SELECT COUNT(*) INTO v_templates_count FROM public.mock_templates WHERE exam_id = p_exam_id;
    IF v_templates_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete exam: mock templates exist (%).', v_templates_count;
    END IF;

    -- 4. Enable session flag for controlled cascade
    PERFORM set_config('app.allow_exam_deletion', 'true', true);

    -- 5. Collect cycle IDs
    SELECT ARRAY_AGG(id) INTO v_cycle_ids FROM public.exam_cycles WHERE exam_id = p_exam_id;

    -- 6. Clean syllabi & topics
    IF v_cycle_ids IS NOT NULL AND ARRAY_LENGTH(v_cycle_ids, 1) > 0 THEN
        SELECT ARRAY_AGG(id) INTO v_syl_ids FROM public.exam_syllabi WHERE exam_cycle_id = ANY(v_cycle_ids);
        IF v_syl_ids IS NOT NULL AND ARRAY_LENGTH(v_syl_ids, 1) > 0 THEN
            DELETE FROM public.exam_topics WHERE syllabus_id = ANY(v_syl_ids);
            DELETE FROM public.exam_syllabi WHERE id = ANY(v_syl_ids);
        END IF;
    END IF;

    -- 7. Clean knowledge docs & versions
    SELECT ARRAY_AGG(id) INTO v_doc_ids FROM public.exam_knowledge_documents WHERE exam_id = p_exam_id;
    IF v_doc_ids IS NOT NULL AND ARRAY_LENGTH(v_doc_ids, 1) > 0 THEN
        -- Nullify current_published_version_id pointers
        UPDATE public.exam_knowledge_documents SET current_published_version_id = NULL WHERE id = ANY(v_doc_ids);
        DELETE FROM public.exam_doc_versions WHERE document_id = ANY(v_doc_ids);
        DELETE FROM public.exam_knowledge_documents WHERE id = ANY(v_doc_ids);
    END IF;

    -- 8. Clean child metadata tables
    DELETE FROM public.exam_sources WHERE exam_id = p_exam_id;
    DELETE FROM public.exam_claims WHERE exam_id = p_exam_id;
    DELETE FROM public.exam_posts WHERE exam_id = p_exam_id;
    DELETE FROM public.curriculum_blueprints WHERE exam_id = p_exam_id;
    DELETE FROM public.exam_announcements WHERE exam_id = p_exam_id;
    DELETE FROM public.exam_canonical_syllabi WHERE exam_id = p_exam_id;

    IF v_cycle_ids IS NOT NULL AND ARRAY_LENGTH(v_cycle_ids, 1) > 0 THEN
        DELETE FROM public.exam_cycles WHERE exam_id = p_exam_id;
    END IF;

    -- 9. Delete the exam record
    DELETE FROM public.exams WHERE id = p_exam_id;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_exam', jsonb_build_object(
            'id', v_exam.id,
            'title', v_exam.title,
            'slug', v_exam.slug,
            'isActive', v_exam.is_active
        )
    );
END;
$$;
  `;

  console.log('Deploying RPC...');
  // We can deploy via Supabase if direct SQL is available or test through postgres
}

testRpc().catch(console.error);
