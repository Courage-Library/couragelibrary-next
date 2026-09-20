-- ============================================================
-- MIGRATION 54: Phase 3B — Content Artifact & Asset Storage Foundation
-- Module: Learning / Courses Subsystem
-- Mode: Additive Schema Only (Strict Zero Data Loss & Zero Content Body in Relational DB)
-- ============================================================

-- 1. Ensure extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Learning Content Artifacts Table (Metadata & Storage References Only - ZERO CONTENT BODIES)
CREATE TABLE IF NOT EXISTS public.learning_content_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_unit_id UUID NOT NULL REFERENCES public.learning_units(id) ON DELETE CASCADE,
    content_version_id UUID NULL,
    artifact_type TEXT NOT NULL,
    storage_provider TEXT NOT NULL DEFAULT 'SUPABASE_STORAGE',
    storage_bucket TEXT NOT NULL DEFAULT 'learning-artifacts',
    storage_key TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'text/mdx',
    byte_size INTEGER NOT NULL,
    sha256_hash TEXT NOT NULL,
    compiler_version TEXT NOT NULL DEFAULT 'v1.0.0',
    schema_version TEXT NOT NULL DEFAULT 'v1',
    language TEXT NOT NULL DEFAULT 'en',
    access_class TEXT NOT NULL DEFAULT 'FREE_AUTHENTICATED',
    is_source_artifact BOOLEAN NOT NULL DEFAULT true,
    is_renderable BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    published_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_artifact_type CHECK (
        artifact_type IN (
            'LESSON_DOCUMENT_SPEC',
            'CONTROLLED_MDX',
            'COMPILED_IR',
            'SUMMARY_SHEET',
            'FORMULA_SHEET',
            'TRAP_SHEET',
            'WORKED_EXAMPLE_SET',
            'PYQ_BUNDLE'
        )
    ),
    CONSTRAINT chk_artifact_storage_provider CHECK (
        storage_provider IN ('SUPABASE_STORAGE', 'AWS_S3', 'CLOUDFLARE_R2', 'LOCAL_STORAGE', 'MEMORY')
    ),
    CONSTRAINT chk_artifact_mime_type CHECK (
        mime_type IN ('text/mdx', 'application/json', 'text/markdown', 'application/octet-stream')
    ),
    CONSTRAINT chk_artifact_byte_size CHECK (byte_size > 0),
    CONSTRAINT chk_artifact_sha256 CHECK (sha256_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT chk_artifact_access_class CHECK (
        access_class IN ('FREE_PUBLIC', 'FREE_AUTHENTICATED', 'PREMIUM', 'ADMIN_ONLY', 'INTERNAL')
    ),
    CONSTRAINT chk_artifact_status CHECK (
        status IN ('DRAFT', 'VALIDATED', 'PUBLISHED', 'ARCHIVED', 'DEPRECATED')
    ),
    CONSTRAINT uq_artifact_storage_key UNIQUE (storage_bucket, storage_key)
);

-- 3. Learning Assets Table (Image/Diagram/Chart Metadata Only - ZERO BINARY DATA)
CREATE TABLE IF NOT EXISTS public.learning_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_type TEXT NOT NULL,
    storage_provider TEXT NOT NULL DEFAULT 'SUPABASE_STORAGE',
    storage_bucket TEXT NOT NULL DEFAULT 'learning-assets',
    storage_key TEXT NOT NULL,
    original_filename TEXT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    width INTEGER NULL,
    height INTEGER NULL,
    aspect_ratio NUMERIC NULL,
    sha256_hash TEXT NOT NULL,
    alt_text TEXT NOT NULL,
    caption TEXT NULL,
    attribution TEXT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    access_class TEXT NOT NULL DEFAULT 'FREE_PUBLIC',
    is_sanitized_svg BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_asset_type CHECK (
        asset_type IN (
            'DIAGRAM',
            'ILLUSTRATION',
            'PHOTO',
            'CHART',
            'TABLE_IMAGE',
            'MATH_FORMULA',
            'INFOGRAPHIC',
            'ICON'
        )
    ),
    CONSTRAINT chk_asset_storage_provider CHECK (
        storage_provider IN ('SUPABASE_STORAGE', 'AWS_S3', 'CLOUDFLARE_R2', 'LOCAL_STORAGE', 'MEMORY')
    ),
    CONSTRAINT chk_asset_mime_type CHECK (
        mime_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif')
    ),
    CONSTRAINT chk_asset_byte_size CHECK (byte_size > 0),
    CONSTRAINT chk_asset_dimensions CHECK (
        (width IS NULL OR width > 0) AND (height IS NULL OR height > 0)
    ),
    CONSTRAINT chk_asset_sha256 CHECK (sha256_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT chk_asset_access_class CHECK (
        access_class IN ('FREE_PUBLIC', 'FREE_AUTHENTICATED', 'PREMIUM', 'ADMIN_ONLY', 'INTERNAL')
    ),
    CONSTRAINT chk_asset_status CHECK (
        status IN ('DRAFT', 'VALIDATED', 'PUBLISHED', 'ARCHIVED')
    ),
    CONSTRAINT uq_asset_storage_key UNIQUE (storage_bucket, storage_key)
);

-- 4. Learning Unit Asset Bindings (Relational Binding between Units & Assets)
CREATE TABLE IF NOT EXISTS public.learning_unit_asset_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_unit_id UUID NOT NULL REFERENCES public.learning_units(id) ON DELETE CASCADE,
    artifact_id UUID NULL REFERENCES public.learning_content_artifacts(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.learning_assets(id) ON DELETE CASCADE,
    usage_context TEXT NOT NULL DEFAULT 'INLINE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_binding_usage_context CHECK (
        usage_context IN ('INLINE', 'HERO', 'SUMMARY', 'SOLUTION_STEP', 'DIAGRAM_BLOCK')
    ),
    CONSTRAINT uq_unit_asset_binding UNIQUE (learning_unit_id, asset_id, usage_context)
);

-- 5. Performance Indices
CREATE INDEX IF NOT EXISTS idx_learning_artifacts_unit ON public.learning_content_artifacts(learning_unit_id, status);
CREATE INDEX IF NOT EXISTS idx_learning_artifacts_hash ON public.learning_content_artifacts(sha256_hash);
CREATE INDEX IF NOT EXISTS idx_learning_artifacts_version ON public.learning_content_artifacts(content_version_id) WHERE content_version_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_assets_type ON public.learning_assets(asset_type, status);
CREATE INDEX IF NOT EXISTS idx_learning_assets_hash ON public.learning_assets(sha256_hash);
CREATE INDEX IF NOT EXISTS idx_unit_asset_bindings_unit ON public.learning_unit_asset_bindings(learning_unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_asset_bindings_asset ON public.learning_unit_asset_bindings(asset_id);

-- 6. Row Level Security (RLS) Configuration
ALTER TABLE public.learning_content_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_unit_asset_bindings ENABLE ROW LEVEL SECURITY;

-- 6.1 Public / Candidate Read Policies (Published & Visible Artifacts/Assets)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'learning_content_artifacts' AND policyname = 'Public/candidate view published artifacts'
  ) THEN
    CREATE POLICY "Public/candidate view published artifacts"
        ON public.learning_content_artifacts
        FOR SELECT
        USING (status = 'PUBLISHED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'learning_assets' AND policyname = 'Public/candidate view published assets'
  ) THEN
    CREATE POLICY "Public/candidate view published assets"
        ON public.learning_assets
        FOR SELECT
        USING (status = 'PUBLISHED' OR access_class = 'FREE_PUBLIC');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'learning_unit_asset_bindings' AND policyname = 'Public/candidate view asset bindings'
  ) THEN
    CREATE POLICY "Public/candidate view asset bindings"
        ON public.learning_unit_asset_bindings
        FOR SELECT
        USING (true);
  END IF;
END $$;

-- 6.2 Service Role Full Access Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'learning_content_artifacts' AND policyname = 'Service role full access on learning_content_artifacts'
  ) THEN
    CREATE POLICY "Service role full access on learning_content_artifacts"
        ON public.learning_content_artifacts
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'learning_assets' AND policyname = 'Service role full access on learning_assets'
  ) THEN
    CREATE POLICY "Service role full access on learning_assets"
        ON public.learning_assets
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'learning_unit_asset_bindings' AND policyname = 'Service role full access on learning_unit_asset_bindings'
  ) THEN
    CREATE POLICY "Service role full access on learning_unit_asset_bindings"
        ON public.learning_unit_asset_bindings
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
  END IF;
END $$;

-- 7. Table Privileges
GRANT SELECT ON public.learning_content_artifacts TO anon, authenticated;
GRANT SELECT ON public.learning_assets TO anon, authenticated;
GRANT SELECT ON public.learning_unit_asset_bindings TO anon, authenticated;

GRANT ALL ON public.learning_content_artifacts TO service_role;
GRANT ALL ON public.learning_assets TO service_role;
GRANT ALL ON public.learning_unit_asset_bindings TO service_role;
