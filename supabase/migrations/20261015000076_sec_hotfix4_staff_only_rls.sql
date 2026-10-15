-- =============================================================================
-- COURAGE LIBRARY — SEC-HOTFIX-4: admin/staff-only RLS on 11 content-authoring tables
-- Migration: 20261015000076_sec_hotfix4_staff_only_rls.sql
--
-- Each table had a PERMISSIVE policy "… full management of …" FOR ALL TO authenticated USING (true)
-- WITH CHECK (true). Writes were blocked only because authenticated holds no INSERT/UPDATE/DELETE grant,
-- but authenticated DOES hold SELECT, so the FOR ALL policy let ANY signed-in user read every row
-- (unpublished exam knowledge documents and versions, unverified sources/claims, inactive taxonomy nodes,
-- draft syllabus rows). This migration replaces each FOR ALL policy with four role-checked policies:
--   SELECT / INSERT / UPDATE / DELETE TO authenticated, gated by public.fn_jwt_is_admin_or_staff()
--   (JWT app_metadata.role IN ('admin','staff')).
-- Unchanged: every public read policy (published / active / verified rows), table grants (authenticated keeps
-- SELECT only — writes still go through the service role), RLS enablement, all other objects.
-- Rollback: docs/database/rollback/076_rollback.sql
-- =============================================================================

-- canonical_taxonomy_nodes
DROP POLICY IF EXISTS "Staff full management of canonical taxonomy nodes" ON public.canonical_taxonomy_nodes;
CREATE POLICY "canonical_taxonomy_nodes: admin/staff read" ON public.canonical_taxonomy_nodes FOR SELECT TO authenticated USING (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "canonical_taxonomy_nodes: admin/staff insert" ON public.canonical_taxonomy_nodes FOR INSERT TO authenticated WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "canonical_taxonomy_nodes: admin/staff update" ON public.canonical_taxonomy_nodes FOR UPDATE TO authenticated USING (public.fn_jwt_is_admin_or_staff()) WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "canonical_taxonomy_nodes: admin/staff delete" ON public.canonical_taxonomy_nodes FOR DELETE TO authenticated USING (public.fn_jwt_is_admin_or_staff());

-- taxonomy_aliases
DROP POLICY IF EXISTS "Staff full management of taxonomy aliases" ON public.taxonomy_aliases;
CREATE POLICY "taxonomy_aliases: admin/staff read" ON public.taxonomy_aliases FOR SELECT TO authenticated USING (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "taxonomy_aliases: admin/staff insert" ON public.taxonomy_aliases FOR INSERT TO authenticated WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "taxonomy_aliases: admin/staff update" ON public.taxonomy_aliases FOR UPDATE TO authenticated USING (public.fn_jwt_is_admin_or_staff()) WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "taxonomy_aliases: admin/staff delete" ON public.taxonomy_aliases FOR DELETE TO authenticated USING (public.fn_jwt_is_admin_or_staff());

-- exam_syllabus_versions
DROP POLICY IF EXISTS "Staff full management of exam syllabus versions" ON public.exam_syllabus_versions;
CREATE POLICY "exam_syllabus_versions: admin/staff read" ON public.exam_syllabus_versions FOR SELECT TO authenticated USING (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_syllabus_versions: admin/staff insert" ON public.exam_syllabus_versions FOR INSERT TO authenticated WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_syllabus_versions: admin/staff update" ON public.exam_syllabus_versions FOR UPDATE TO authenticated USING (public.fn_jwt_is_admin_or_staff()) WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_syllabus_versions: admin/staff delete" ON public.exam_syllabus_versions FOR DELETE TO authenticated USING (public.fn_jwt_is_admin_or_staff());

-- exam_syllabus_nodes
DROP POLICY IF EXISTS "Staff full management of exam syllabus nodes" ON public.exam_syllabus_nodes;
CREATE POLICY "exam_syllabus_nodes: admin/staff read" ON public.exam_syllabus_nodes FOR SELECT TO authenticated USING (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_syllabus_nodes: admin/staff insert" ON public.exam_syllabus_nodes FOR INSERT TO authenticated WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_syllabus_nodes: admin/staff update" ON public.exam_syllabus_nodes FOR UPDATE TO authenticated USING (public.fn_jwt_is_admin_or_staff()) WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_syllabus_nodes: admin/staff delete" ON public.exam_syllabus_nodes FOR DELETE TO authenticated USING (public.fn_jwt_is_admin_or_staff());

-- exam_syllabus_canonical_mappings
DROP POLICY IF EXISTS "Staff full management of exam syllabus canonical mappings" ON public.exam_syllabus_canonical_mappings;
CREATE POLICY "exam_syllabus_canonical_mappings: admin/staff read" ON public.exam_syllabus_canonical_mappings FOR SELECT TO authenticated USING (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_syllabus_canonical_mappings: admin/staff insert" ON public.exam_syllabus_canonical_mappings FOR INSERT TO authenticated WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_syllabus_canonical_mappings: admin/staff update" ON public.exam_syllabus_canonical_mappings FOR UPDATE TO authenticated USING (public.fn_jwt_is_admin_or_staff()) WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_syllabus_canonical_mappings: admin/staff delete" ON public.exam_syllabus_canonical_mappings FOR DELETE TO authenticated USING (public.fn_jwt_is_admin_or_staff());

-- exam_knowledge_documents
DROP POLICY IF EXISTS "Admin staff full management of exam knowledge documents" ON public.exam_knowledge_documents;
CREATE POLICY "exam_knowledge_documents: admin/staff read" ON public.exam_knowledge_documents FOR SELECT TO authenticated USING (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_knowledge_documents: admin/staff insert" ON public.exam_knowledge_documents FOR INSERT TO authenticated WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_knowledge_documents: admin/staff update" ON public.exam_knowledge_documents FOR UPDATE TO authenticated USING (public.fn_jwt_is_admin_or_staff()) WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_knowledge_documents: admin/staff delete" ON public.exam_knowledge_documents FOR DELETE TO authenticated USING (public.fn_jwt_is_admin_or_staff());

-- exam_doc_versions
DROP POLICY IF EXISTS "Admin staff full management of exam doc versions" ON public.exam_doc_versions;
CREATE POLICY "exam_doc_versions: admin/staff read" ON public.exam_doc_versions FOR SELECT TO authenticated USING (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_doc_versions: admin/staff insert" ON public.exam_doc_versions FOR INSERT TO authenticated WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_doc_versions: admin/staff update" ON public.exam_doc_versions FOR UPDATE TO authenticated USING (public.fn_jwt_is_admin_or_staff()) WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_doc_versions: admin/staff delete" ON public.exam_doc_versions FOR DELETE TO authenticated USING (public.fn_jwt_is_admin_or_staff());

-- exam_posts
DROP POLICY IF EXISTS "Admin staff full management of exam posts" ON public.exam_posts;
CREATE POLICY "exam_posts: admin/staff read" ON public.exam_posts FOR SELECT TO authenticated USING (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_posts: admin/staff insert" ON public.exam_posts FOR INSERT TO authenticated WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_posts: admin/staff update" ON public.exam_posts FOR UPDATE TO authenticated USING (public.fn_jwt_is_admin_or_staff()) WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_posts: admin/staff delete" ON public.exam_posts FOR DELETE TO authenticated USING (public.fn_jwt_is_admin_or_staff());

-- exam_sources
DROP POLICY IF EXISTS "Admin staff full management of exam sources" ON public.exam_sources;
CREATE POLICY "exam_sources: admin/staff read" ON public.exam_sources FOR SELECT TO authenticated USING (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_sources: admin/staff insert" ON public.exam_sources FOR INSERT TO authenticated WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_sources: admin/staff update" ON public.exam_sources FOR UPDATE TO authenticated USING (public.fn_jwt_is_admin_or_staff()) WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_sources: admin/staff delete" ON public.exam_sources FOR DELETE TO authenticated USING (public.fn_jwt_is_admin_or_staff());

-- exam_claims
DROP POLICY IF EXISTS "Admin staff full management of exam claims" ON public.exam_claims;
CREATE POLICY "exam_claims: admin/staff read" ON public.exam_claims FOR SELECT TO authenticated USING (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_claims: admin/staff insert" ON public.exam_claims FOR INSERT TO authenticated WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_claims: admin/staff update" ON public.exam_claims FOR UPDATE TO authenticated USING (public.fn_jwt_is_admin_or_staff()) WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_claims: admin/staff delete" ON public.exam_claims FOR DELETE TO authenticated USING (public.fn_jwt_is_admin_or_staff());

-- exam_claim_sources
DROP POLICY IF EXISTS "Admin staff full management of exam claim sources" ON public.exam_claim_sources;
CREATE POLICY "exam_claim_sources: admin/staff read" ON public.exam_claim_sources FOR SELECT TO authenticated USING (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_claim_sources: admin/staff insert" ON public.exam_claim_sources FOR INSERT TO authenticated WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_claim_sources: admin/staff update" ON public.exam_claim_sources FOR UPDATE TO authenticated USING (public.fn_jwt_is_admin_or_staff()) WITH CHECK (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "exam_claim_sources: admin/staff delete" ON public.exam_claim_sources FOR DELETE TO authenticated USING (public.fn_jwt_is_admin_or_staff());

