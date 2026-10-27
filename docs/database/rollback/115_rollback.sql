-- Rollback for 20261027000115_ca1_master_tree.sql. Run as ONE transaction by the operator.
-- Safe only while: no CONCEPT node exists, no node is deeper than 3 levels, and topic / subtopic slugs are still
-- globally unique (the restore of topics_slug_key / subtopics_slug_key fails otherwise — then STOP: rename first).
-- Aliases and the Hindi name / subject type / state code are DROPPED: export taxonomy_node_aliases and those columns
-- first if any exist. Merges already performed are NOT undone (their audit rows list every re-pointed reference).
BEGIN;

ALTER TABLE public.subtopics DROP CONSTRAINT IF EXISTS uq_subtopics_topic_slug;
ALTER TABLE public.subtopics ADD CONSTRAINT subtopics_slug_key UNIQUE (slug);
ALTER TABLE public.topics DROP CONSTRAINT IF EXISTS uq_topics_subject_slug;
ALTER TABLE public.topics ADD CONSTRAINT topics_slug_key UNIQUE (slug);

DROP INDEX IF EXISTS public.uq_canonical_hierarchy_path;

DROP FUNCTION IF EXISTS public.fn_taxonomy_merge_nodes(uuid, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.fn_taxonomy_move_node(uuid, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.fn_taxonomy_subtree_ids(uuid);
DROP FUNCTION IF EXISTS public.fn_taxonomy_remove_alias(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fn_taxonomy_add_alias(uuid, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.fn_taxonomy_audit(uuid, text, text, uuid, jsonb, jsonb, text);

DROP TRIGGER IF EXISTS trg_guard_master_tree ON public.canonical_taxonomy_nodes;
DROP FUNCTION IF EXISTS public.fn_guard_master_tree();
DROP TABLE IF EXISTS public.taxonomy_node_aliases;
DROP FUNCTION IF EXISTS public.fn_guard_taxonomy_node_alias();
DROP FUNCTION IF EXISTS public.fn_taxonomy_scope_conflict(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.fn_taxonomy_lock_scope(uuid);

ALTER TABLE public.canonical_taxonomy_nodes
    DROP CONSTRAINT IF EXISTS chk_canonical_state_code,
    DROP CONSTRAINT IF EXISTS chk_canonical_subject_type,
    DROP CONSTRAINT IF EXISTS chk_canonical_name_hi,
    DROP COLUMN IF EXISTS state_code,
    DROP COLUMN IF EXISTS subject_type,
    DROP COLUMN IF EXISTS name_hi;

DROP FUNCTION IF EXISTS public.fn_taxonomy_normalize(text);

COMMIT;
