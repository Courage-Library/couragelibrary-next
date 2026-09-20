# Courage Library — Learning / Courses Subsystem
## Phase 3B: Content Artifact & Asset Storage Foundation — Technical Specification & Implementation Book

---

### Executive Summary
Phase 3B establishes the production-grade **Content Artifact and Learning Asset Storage Foundation** for Courage Library.

It enforces the non-negotiable architectural invariant that **PostgreSQL / Supabase stores only structural identity, metadata, version linkages, cryptographic hashes, lifecycle states, and relational bindings**, while **all large educational lesson documents, controlled MDX source payloads, diagrams, charts, illustrations, and images are stored in object storage**.

The architecture introduces a **strictly provider-agnostic storage abstraction** (`IStorageProvider`) supporting memory simulation, Supabase Storage, AWS S3, and Cloudflare R2 without vendor lock-in.

---

### Architectural Invariants & Safety Rules

1. **Zero Content Bodies in PostgreSQL**:
   - `learning_content_artifacts` and `learning_assets` tables contain metadata, SHA-256 integrity hashes, byte sizes, MIME types, and storage keys only.
   - Absolutely zero `content_body TEXT`, Markdown strings, MDX source code, or binary image data (`BYTEA`) is stored in relational tables.
2. **Provider-Agnostic Storage Boundary**:
   - The platform interacts with object storage strictly through the `IStorageProvider` interface (`put`, `get`, `exists`, `delete`, `getMetadata`, `generateSignedUrl`, `verifyIntegrity`).
   - Adapters exist for `MemoryStorageProvider`, `SupabaseStorageProvider`, and `S3CompatibleStorageProvider` (AWS S3 & Cloudflare R2).
3. **Deterministic Cryptographic Hashing (SHA-256)**:
   - Every artifact and asset is hashed over its exact canonical payload bytes before storage and insertion.
   - Any mismatch between metadata SHA-256 and retrieved storage payload is treated as a fatal integrity violation.
4. **Controlled MDX Security & Component Allowlist**:
   - MDX is strictly treated as content, not arbitrary code.
   - Forbidden in MDX: `import` statements, `export` statements, `<script>` tags, `javascript:` URI schemes.
   - Exactly 10 approved Phase 2 components are allowlisted: `FormulaCard`, `ExampleBox`, `WarningBox`, `ExamTip`, `QuestionReference`, `ComparisonTable`, `QuickCheck`, `SummaryCard`, `DiagramBlock`, `Callout`.
   - All unapproved arbitrary React components are rejected at validation time.
5. **Asset Security & SVG Sanitization**:
   - Strict MIME allowlist: `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`, `image/gif`.
   - Size limit: 10MB per asset.
   - SVG validator scans and strictly rejects `<script>` tags, `onload`, `onclick`, `onerror` handlers, `javascript:` URIs, and XML external entity declarations (XXE).
6. **Authorization & Anti-Bypass Protections**:
   - Direct knowledge of `learning_unit_id`, `artifact_id`, or `storage_key` never grants direct access.
   - Multi-tier authorization evaluates `access_class` (`FREE_PUBLIC`, `FREE_AUTHENTICATED`, `PREMIUM`, `ADMIN_ONLY`, `INTERNAL`) and `status` (`DRAFT` requires Admin/Service Role; `PUBLISHED` evaluated against user entitlement).
   - Published artifacts are sealed and immutable.

---

### Database Schema Architecture (Migration 54)

#### 1. `public.learning_content_artifacts` (Artifact Metadata & Storage References)
```sql
CREATE TABLE public.learning_content_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_unit_id UUID NOT NULL REFERENCES public.learning_units(id) ON DELETE CASCADE,
    content_version_id UUID NULL,
    artifact_type TEXT NOT NULL CHECK (
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
    storage_provider TEXT NOT NULL DEFAULT 'SUPABASE_STORAGE' CHECK (
        storage_provider IN ('SUPABASE_STORAGE', 'AWS_S3', 'CLOUDFLARE_R2', 'LOCAL_STORAGE', 'MEMORY')
    ),
    storage_bucket TEXT NOT NULL DEFAULT 'learning-artifacts',
    storage_key TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'text/mdx' CHECK (
        mime_type IN ('text/mdx', 'application/json', 'text/markdown', 'application/octet-stream')
    ),
    byte_size INTEGER NOT NULL CHECK (byte_size > 0),
    sha256_hash TEXT NOT NULL CHECK (sha256_hash ~ '^[a-f0-9]{64}$'),
    compiler_version TEXT NOT NULL DEFAULT 'v1.0.0',
    schema_version TEXT NOT NULL DEFAULT 'v1',
    language TEXT NOT NULL DEFAULT 'en',
    access_class TEXT NOT NULL DEFAULT 'FREE_AUTHENTICATED' CHECK (
        access_class IN ('FREE_PUBLIC', 'FREE_AUTHENTICATED', 'PREMIUM', 'ADMIN_ONLY', 'INTERNAL')
    ),
    is_source_artifact BOOLEAN NOT NULL DEFAULT true,
    is_renderable BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'VALIDATED', 'PUBLISHED', 'ARCHIVED', 'DEPRECATED')
    ),
    published_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_artifact_storage_key UNIQUE (storage_bucket, storage_key)
);
```

#### 2. `public.learning_assets` (Media Asset Metadata)
```sql
CREATE TABLE public.learning_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_type TEXT NOT NULL CHECK (
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
    storage_provider TEXT NOT NULL DEFAULT 'SUPABASE_STORAGE' CHECK (
        storage_provider IN ('SUPABASE_STORAGE', 'AWS_S3', 'CLOUDFLARE_R2', 'LOCAL_STORAGE', 'MEMORY')
    ),
    storage_bucket TEXT NOT NULL DEFAULT 'learning-assets',
    storage_key TEXT NOT NULL,
    original_filename TEXT NULL,
    mime_type TEXT NOT NULL CHECK (
        mime_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif')
    ),
    byte_size INTEGER NOT NULL CHECK (byte_size > 0),
    width INTEGER NULL CHECK (width IS NULL OR width > 0),
    height INTEGER NULL CHECK (height IS NULL OR height > 0),
    aspect_ratio NUMERIC NULL,
    sha256_hash TEXT NOT NULL CHECK (sha256_hash ~ '^[a-f0-9]{64}$'),
    alt_text TEXT NOT NULL,
    caption TEXT NULL,
    attribution TEXT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    access_class TEXT NOT NULL DEFAULT 'FREE_PUBLIC' CHECK (
        access_class IN ('FREE_PUBLIC', 'FREE_AUTHENTICATED', 'PREMIUM', 'ADMIN_ONLY', 'INTERNAL')
    ),
    is_sanitized_svg BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'VALIDATED', 'PUBLISHED', 'ARCHIVED')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_asset_storage_key UNIQUE (storage_bucket, storage_key)
);
```

#### 3. `public.learning_unit_asset_bindings` (Unit-Asset Relational Bindings)
```sql
CREATE TABLE public.learning_unit_asset_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_unit_id UUID NOT NULL REFERENCES public.learning_units(id) ON DELETE CASCADE,
    artifact_id UUID NULL REFERENCES public.learning_content_artifacts(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.learning_assets(id) ON DELETE CASCADE,
    usage_context TEXT NOT NULL DEFAULT 'INLINE' CHECK (
        usage_context IN ('INLINE', 'HERO', 'SUMMARY', 'SOLUTION_STEP', 'DIAGRAM_BLOCK')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_unit_asset_binding UNIQUE (learning_unit_id, asset_id, usage_context)
);
```

---

### Storage Key Design Conventions

1. **Content Artifacts**:
   `learning/units/{learning_unit_id}/artifacts/{artifact_type_lower}/{sha256_hash_prefix_8}_{slug}.mdx`
   - Deterministic and collision-free.
   - Contains no candidate-identifying information.
   - Embeds 8-character SHA-256 hash prefix for content-addressed cache busting.

2. **Learning Assets**:
   `learning/assets/{asset_type_lower}/{sha256_hash_prefix_8}_{slug}.{extension}`
   - Grouped logically by asset type.
   - Clean URLs with verified file extensions.

---

### Verification Matrix (70 Assertions)

| Track | Description | Assertions | Result |
|---|---|---|---|
| Track 1 | Migration 54 SQL Schema, Tables, Constraints, Indices & RLS | T01 – T12 | **PASS (100%)** |
| Track 2 | Provider-Agnostic Storage Abstraction (Memory, Supabase, S3/R2) | T13 – T22 | **PASS (100%)** |
| Track 3 | Cryptographic Integrity, Deterministic SHA-256 & Size Limits | T23 – T30 | **PASS (100%)** |
| Track 4 | Controlled MDX Security & Component Allowlist Enforcement | T31 – T40 | **PASS (100%)** |
| Track 5 | Asset Metadata, MIME Allowlist & SVG Sanitization Security | T41 – T48 | **PASS (100%)** |
| Track 6 | Multi-Tier Authorization & Direct Key Bypass Prevention | T49 – T55 | **PASS (100%)** |
| Track 7 | Database Baseline Invariants & 14 Protected Tables Row Counts | T56 – T70 | **PASS (100%)** |

---

### Phase 3B Completion Status
- **Status**: **CERTIFIED & FROZEN**
- **Migration**: `supabase/migrations/20260915000054_phase3b_content_artifact_and_asset_foundation.sql`
- **Types**: `types/learning-artifact.ts`
- **Storage Layer**: `services/storage/storage-provider.interface.ts`, `services/storage/memory-storage.provider.ts`, `services/storage/supabase-storage.provider.ts`, `services/storage/s3-storage.provider.ts`, `services/storage/storage-factory.ts`
- **Services**: `services/content-artifact.service.ts`, `services/learning-asset.service.ts`
- **Test Suite**: `scripts/test_phase3b_artifact_storage.cjs`
