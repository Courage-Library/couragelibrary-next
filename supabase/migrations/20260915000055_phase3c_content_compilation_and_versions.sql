-- ============================================================================
-- COURAGE LIBRARY — PHASE 3C: CONTROLLED CONTENT COMPILATION & VERSIONS
-- Migration 55: 20260915000055_phase3c_content_compilation_and_versions.sql
-- ============================================================================
-- PURPOSE:
-- 1. Establishes public.learning_documents (canonical document entity bound to learning_units).
-- 2. Establishes public.document_versions (immutable, numbered, audited version lineage).
-- 3. Enforces cryptographic hash constraints, compiler versioning, and lifecycle states.
-- 4. Preserves 100% zero content bodies in PostgreSQL (storage keys and hashes only).
-- 5. Implements strict Row Level Security (RLS) for published read vs admin/service write.
-- ============================================================================

-- 1. Canonical Learning Documents Table
CREATE TABLE IF NOT EXISTS public.learning_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_unit_id UUID NOT NULL REFERENCES public.learning_units(id) ON DELETE CASCADE,
  canonical_slug VARCHAR(150) NOT NULL UNIQUE,
  document_type VARCHAR(50) NOT NULL CHECK (
    document_type IN (
      'CONCEPT_LESSON',
      'WORKED_EXAMPLES',
      'FORMULA_SHORTCUT_SHEET',
      'COMMON_TRAPS_AND_MISTAKES',
      'PYQ_DEEP_DIVE',
      'TOPIC_SUMMARY_REVISION'
    )
  ),
  current_published_version_id UUID,
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (
    status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Immutable Document Versions Table
CREATE TABLE IF NOT EXISTS public.document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.learning_documents(id) ON DELETE CASCADE,
  version_number INT NOT NULL CHECK (version_number >= 1),
  schema_version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  compiler_version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  component_contract_version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  source_spec_storage_key VARCHAR(500) NOT NULL,
  source_spec_hash VARCHAR(64) NOT NULL CHECK (source_spec_hash ~ '^[a-f0-9]{64}$'),
  compiled_artifact_storage_key VARCHAR(500) NOT NULL,
  compiled_artifact_hash VARCHAR(64) NOT NULL CHECK (compiled_artifact_hash ~ '^[a-f0-9]{64}$'),
  author_type VARCHAR(50) NOT NULL DEFAULT 'HUMAN' CHECK (
    author_type IN ('HUMAN', 'AI_ASSISTED', 'LEGACY_CONVERSION')
  ),
  review_status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (
    review_status IN (
      'DRAFT',
      'AI_GENERATED',
      'STRUCTURALLY_VALID',
      'IN_REVIEW',
      'APPROVED',
      'COMPILED',
      'PUBLISHED',
      'REJECTED'
    )
  ),
  approved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_learning_document_version UNIQUE (document_id, version_number)
);

-- 3. Add Foreign Key for current_published_version_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_learning_doc_current_published_version'
  ) THEN
    ALTER TABLE public.learning_documents
      ADD CONSTRAINT fk_learning_doc_current_published_version
      FOREIGN KEY (current_published_version_id)
      REFERENCES public.document_versions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 4. High-Performance Indexes
CREATE INDEX IF NOT EXISTS idx_learning_documents_unit_id ON public.learning_documents(learning_unit_id);
CREATE INDEX IF NOT EXISTS idx_learning_documents_slug ON public.learning_documents(canonical_slug);
CREATE INDEX IF NOT EXISTS idx_learning_documents_status ON public.learning_documents(status);
CREATE INDEX IF NOT EXISTS idx_document_versions_doc_version ON public.document_versions(document_id, version_number);
CREATE INDEX IF NOT EXISTS idx_document_versions_published ON public.document_versions(is_published) WHERE is_published = TRUE;
CREATE INDEX IF NOT EXISTS idx_document_versions_review_status ON public.document_versions(review_status);
CREATE INDEX IF NOT EXISTS idx_document_versions_hashes ON public.document_versions(source_spec_hash, compiled_artifact_hash);

-- 5. Row Level Security (RLS)
ALTER TABLE public.learning_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

-- Candidates & Public: Read published learning documents
CREATE POLICY "Public read published learning documents"
  ON public.learning_documents
  FOR SELECT
  USING (status = 'PUBLISHED');

-- Admins & Service Role: Full access on learning_documents
CREATE POLICY "Admin full access on learning documents"
  ON public.learning_documents
  FOR ALL
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Candidates & Public: Read published document versions
CREATE POLICY "Public read published document versions"
  ON public.document_versions
  FOR SELECT
  USING (is_published = TRUE AND review_status = 'PUBLISHED');

-- Admins & Service Role: Full access on document_versions
CREATE POLICY "Admin full access on document versions"
  ON public.document_versions
  FOR ALL
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- 6. Table Grants
GRANT SELECT ON public.learning_documents TO authenticated, anon;
GRANT SELECT ON public.document_versions TO authenticated, anon;
GRANT ALL ON public.learning_documents TO service_role;
GRANT ALL ON public.document_versions TO service_role;
