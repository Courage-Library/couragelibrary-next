-- ============================================================
-- MIGRATION 53: Phase 3A — Academic Taxonomy & Exam Syllabus Foundation
-- Module: Learning / Courses Subsystem
-- Mode: Additive Schema Only (Strict Zero Data Loss & Zero Content Body)
-- ============================================================

-- 1. Ensure extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Enhance existing exam_topics table with additive columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exam_topics' AND column_name = 'required_depth'
  ) THEN
    ALTER TABLE public.exam_topics 
    ADD COLUMN required_depth TEXT NOT NULL DEFAULT 'INTERMEDIATE_APPLICATION';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exam_topics' AND column_name = 'is_mandatory'
  ) THEN
    ALTER TABLE public.exam_topics 
    ADD COLUMN is_mandatory BOOLEAN NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exam_topics' AND column_name = 'weightage_override'
  ) THEN
    ALTER TABLE public.exam_topics 
    ADD COLUMN weightage_override NUMERIC;
  END IF;
END $$;

-- 3. Topic Relationships Table (Canonical Knowledge Graph)
CREATE TABLE IF NOT EXISTS public.topic_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
    to_topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL,
    strength TEXT NOT NULL DEFAULT 'STRONG',
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_topic_relationship_type CHECK (
        relationship_type IN ('PREREQUISITE', 'RELATED', 'ADVANCED_APPLICATION', 'COREQUISITE')
    ),
    CONSTRAINT chk_topic_relationship_strength CHECK (
        strength IN ('CRITICAL', 'STRONG', 'RECOMMENDED', 'OPTIONAL')
    ),
    CONSTRAINT chk_no_self_relationship CHECK (
        from_topic_id != to_topic_id
    ),
    CONSTRAINT uq_topic_relationship UNIQUE (from_topic_id, to_topic_id, relationship_type)
);

-- 4. Learning Units Table (Structural Identity & Metadata Only - ZERO CONTENT BODIES)
CREATE TABLE IF NOT EXISTS public.learning_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
    subtopic_id UUID REFERENCES public.subtopics(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    unit_type TEXT NOT NULL,
    estimated_minutes INTEGER NOT NULL DEFAULT 10,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_unit_type CHECK (
        unit_type IN (
            'CONCEPT_LESSON',
            'WORKED_EXAMPLES',
            'FORMULA_SHORTCUT_SHEET',
            'COMMON_TRAPS_AND_MISTAKES',
            'PYQ_DEEP_DIVE',
            'TOPIC_SUMMARY_REVISION'
        )
    ),
    CONSTRAINT chk_estimated_minutes CHECK (estimated_minutes > 0),
    CONSTRAINT uq_learning_unit_topic_slug UNIQUE (topic_id, slug)
);

-- 5. Exam Unit Mappings Table (Exam-Specific Learning Unit Sequencing)
CREATE TABLE IF NOT EXISTS public.exam_unit_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_topic_id UUID NOT NULL REFERENCES public.exam_topics(id) ON DELETE CASCADE,
    learning_unit_id UUID NOT NULL REFERENCES public.learning_units(id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL DEFAULT 0,
    is_exam_core BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_exam_unit_mapping UNIQUE (exam_topic_id, learning_unit_id)
);

-- 6. Performance Indices
CREATE INDEX IF NOT EXISTS idx_topic_relationships_from ON public.topic_relationships(from_topic_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_topic_relationships_to ON public.topic_relationships(to_topic_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_learning_units_topic ON public.learning_units(topic_id, display_order) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_learning_units_subtopic ON public.learning_units(subtopic_id) WHERE is_active = true AND subtopic_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exam_unit_mappings_exam_topic ON public.exam_unit_mappings(exam_topic_id, sequence_order) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_exam_unit_mappings_learning_unit ON public.exam_unit_mappings(learning_unit_id) WHERE is_active = true;

-- 7. Row Level Security (RLS) Configuration
ALTER TABLE public.topic_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_unit_mappings ENABLE ROW LEVEL SECURITY;

-- 7.1 Public / Authenticated Read Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'topic_relationships' AND policyname = 'Public and authenticated users can view active topic relationships'
  ) THEN
    CREATE POLICY "Public and authenticated users can view active topic relationships"
        ON public.topic_relationships
        FOR SELECT
        USING (is_active = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'learning_units' AND policyname = 'Public and authenticated users can view active learning units'
  ) THEN
    CREATE POLICY "Public and authenticated users can view active learning units"
        ON public.learning_units
        FOR SELECT
        USING (is_active = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'exam_unit_mappings' AND policyname = 'Public and authenticated users can view active exam unit mappings'
  ) THEN
    CREATE POLICY "Public and authenticated users can view active exam unit mappings"
        ON public.exam_unit_mappings
        FOR SELECT
        USING (is_active = true);
  END IF;
END $$;

-- 7.2 Service Role Full Access Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'topic_relationships' AND policyname = 'Service role full access on topic_relationships'
  ) THEN
    CREATE POLICY "Service role full access on topic_relationships"
        ON public.topic_relationships
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'learning_units' AND policyname = 'Service role full access on learning_units'
  ) THEN
    CREATE POLICY "Service role full access on learning_units"
        ON public.learning_units
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'exam_unit_mappings' AND policyname = 'Service role full access on exam_unit_mappings'
  ) THEN
    CREATE POLICY "Service role full access on exam_unit_mappings"
        ON public.exam_unit_mappings
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
  END IF;
END $$;

-- 8. Table Privileges
GRANT SELECT ON public.topic_relationships TO anon, authenticated;
GRANT SELECT ON public.learning_units TO anon, authenticated;
GRANT SELECT ON public.exam_unit_mappings TO anon, authenticated;

GRANT ALL ON public.topic_relationships TO service_role;
GRANT ALL ON public.learning_units TO service_role;
GRANT ALL ON public.exam_unit_mappings TO service_role;
