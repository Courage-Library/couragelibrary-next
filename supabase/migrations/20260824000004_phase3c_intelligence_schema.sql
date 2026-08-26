-- ============================================================================
-- COURAGE LIBRARY — PHASE 3C: INTELLIGENCE & MULTI-EXAM STUDY PLANNING SCHEMA
-- Target Database: couragelibrary-next
-- ============================================================================

-- ============================================================================
-- 1. ALGORITHM CONFIGURATIONS (VERSIONED ENGINE CATALOG)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.algorithm_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    algorithm_name TEXT NOT NULL,
    version_tag TEXT NOT NULL UNIQUE,
    description TEXT,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_algorithm_configs_name_version UNIQUE (algorithm_name, version_tag)
);

-- ============================================================================
-- 2. LEARNING ACTIVITY EVENTS (RAW EVIDENCE STREAM)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.learning_activity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE RESTRICT,
    resource_slug TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'ARTICLE_VIEWED',
        'ARTICLE_STARTED',
        'ARTICLE_COMPLETED',
        'RESOURCE_VIEWED',
        'RESOURCE_COMPLETED',
        'TOPIC_LEARNING_ACTIVITY',
        'RESOURCE_REVISITED'
    )),
    time_spent_seconds INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. USER EXAM GOALS (STUDENT TARGET EXAMS & CONSTRAINTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_exam_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    exam_cycle_id UUID NOT NULL REFERENCES public.exam_cycles(id) ON DELETE RESTRICT,
    priority_rank INTEGER NOT NULL DEFAULT 1,
    target_score NUMERIC(6, 2),
    daily_study_minutes INTEGER NOT NULL DEFAULT 120,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_exam_goals UNIQUE (user_id, exam_id, exam_cycle_id)
);

-- ============================================================================
-- 4. USER TOPIC MASTERY (DERIVED CANONICAL KNOWLEDGE STATE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_topic_mastery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    canonical_topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE RESTRICT,
    algorithm_version TEXT NOT NULL DEFAULT 'v1_default',
    mastery_score NUMERIC(5, 4) NOT NULL DEFAULT 0.0000 CHECK (mastery_score >= 0.0 AND mastery_score <= 1.0),
    confidence_factor NUMERIC(5, 4) NOT NULL DEFAULT 0.0000 CHECK (confidence_factor >= 0.0 AND confidence_factor <= 1.0),
    recency_factor NUMERIC(5, 4) NOT NULL DEFAULT 1.0000 CHECK (recency_factor >= 0.0 AND recency_factor <= 1.0),
    coverage_factor NUMERIC(5, 4) NOT NULL DEFAULT 0.0000 CHECK (coverage_factor >= 0.0 AND coverage_factor <= 1.0),
    total_exposure_count INTEGER NOT NULL DEFAULT 0,
    total_correct_count INTEGER NOT NULL DEFAULT 0,
    total_incorrect_count INTEGER NOT NULL DEFAULT 0,
    memory_stability_days NUMERIC(5, 2) NOT NULL DEFAULT 3.00,
    last_practiced_at TIMESTAMPTZ,
    last_recalculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_topic_mastery UNIQUE (user_id, canonical_topic_id)
);

-- ============================================================================
-- 5. USER STUDY PLANS (DAILY PLAN CONTAINER)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_study_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_date DATE NOT NULL,
    allocated_minutes INTEGER NOT NULL DEFAULT 120,
    completed_minutes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'missed', 'archived')),
    is_auto_generated BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_study_plans_date UNIQUE (user_id, plan_date)
);

-- ============================================================================
-- 6. STUDY PLAN ITEMS (CONCRETE ACTIONABLE TASKS WITH REASON PAYLOADS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.study_plan_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_plan_id UUID NOT NULL REFERENCES public.user_study_plans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES public.topics(id) ON DELETE RESTRICT,
    mock_test_id UUID REFERENCES public.mock_tests(id) ON DELETE RESTRICT,
    task_type TEXT NOT NULL CHECK (task_type IN (
        'LEARN',
        'PRACTICE',
        'REVISION',
        'WEAKNESS_REPAIR',
        'PYQ',
        'MOCK',
        'MOCK_ANALYSIS',
        'CURRENT_AFFAIRS'
    )),
    estimated_duration_minutes INTEGER NOT NULL DEFAULT 20,
    priority_score NUMERIC(5, 4) NOT NULL DEFAULT 0.5000,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'snoozed', 'skipped')),
    scheduled_order INTEGER NOT NULL DEFAULT 1,
    reason_code TEXT NOT NULL DEFAULT 'GENERAL_RECOMMENDATION',
    reason_text TEXT NOT NULL,
    is_user_modified BOOLEAN NOT NULL DEFAULT false,
    override_type TEXT CHECK (override_type IN ('SNOOZE', 'MANUAL_SWAP', 'DURATION_EDIT', 'USER_ADDED')),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 7. USER EXAM READINESS (CACHED EXAM-SPECIFIC 0–100 PREPARATION INDEX)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_exam_readiness (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    exam_cycle_id UUID NOT NULL REFERENCES public.exam_cycles(id) ON DELETE RESTRICT,
    algorithm_version TEXT NOT NULL DEFAULT 'v1_default',
    readiness_index NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (readiness_index >= 0.0 AND readiness_index <= 100.0),
    syllabus_coverage_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    weighted_mastery_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    retention_freshness_pct NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
    mock_benchmark_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    last_evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_exam_readiness UNIQUE (user_id, exam_id, exam_cycle_id)
);

-- ============================================================================
-- 8. USER MASTERY HISTORY (APPEND-ONLY HISTORICAL ROLLUP SNAPSHOTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_mastery_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    canonical_topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE RESTRICT,
    algorithm_version TEXT NOT NULL DEFAULT 'v1_default',
    mastery_score NUMERIC(5, 4) NOT NULL,
    confidence_factor NUMERIC(5, 4) NOT NULL,
    recency_factor NUMERIC(5, 4) NOT NULL,
    coverage_factor NUMERIC(5, 4) NOT NULL,
    total_exposure_count INTEGER NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_mastery_history_snap UNIQUE (user_id, canonical_topic_id, snapshot_date, algorithm_version)
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_learning_events_user_time ON public.learning_activity_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_events_topic ON public.learning_activity_events(topic_id);
CREATE INDEX IF NOT EXISTS idx_learning_events_resource ON public.learning_activity_events(resource_slug);

CREATE INDEX IF NOT EXISTS idx_user_exam_goals_user ON public.user_exam_goals(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_exam_goals_exam ON public.user_exam_goals(exam_id, exam_cycle_id);

CREATE INDEX IF NOT EXISTS idx_user_topic_mastery_user ON public.user_topic_mastery(user_id, mastery_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_topic_mastery_topic ON public.user_topic_mastery(canonical_topic_id);
CREATE INDEX IF NOT EXISTS idx_user_topic_mastery_decay ON public.user_topic_mastery(user_id, recency_factor);

CREATE INDEX IF NOT EXISTS idx_user_study_plans_user_date ON public.user_study_plans(user_id, plan_date DESC);

CREATE INDEX IF NOT EXISTS idx_study_plan_items_plan ON public.study_plan_items(study_plan_id, scheduled_order);
CREATE INDEX IF NOT EXISTS idx_study_plan_items_user_status ON public.study_plan_items(user_id, status);
CREATE INDEX IF NOT EXISTS idx_study_plan_items_topic ON public.study_plan_items(topic_id);

CREATE INDEX IF NOT EXISTS idx_user_exam_readiness_user ON public.user_exam_readiness(user_id);
CREATE INDEX IF NOT EXISTS idx_user_mastery_history_user_date ON public.user_mastery_history(user_id, snapshot_date DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.algorithm_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_exam_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_topic_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_study_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_exam_readiness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mastery_history ENABLE ROW LEVEL SECURITY;

-- 1. algorithm_configs: Public read of active configs; modified only by admin / service_role
CREATE POLICY "Public read active algorithm_configs" ON public.algorithm_configs
    FOR SELECT USING (is_active = true);

-- 2. learning_activity_events: Student can insert own events and read own events
CREATE POLICY "Users can insert own learning events" ON public.learning_activity_events
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own learning events" ON public.learning_activity_events
    FOR SELECT USING (auth.uid() = user_id);

-- 3. user_exam_goals: Student has full CRUD over their own exam goals
CREATE POLICY "Users can manage own exam goals" ON public.user_exam_goals
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 4. user_topic_mastery: Student can read own mastery; writes restricted to service_role
CREATE POLICY "Users can read own topic mastery" ON public.user_topic_mastery
    FOR SELECT USING (auth.uid() = user_id);

-- 5. user_study_plans: Student has full CRUD over their own study plans
CREATE POLICY "Users can manage own study plans" ON public.user_study_plans
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 6. study_plan_items: Student has full CRUD over their own plan items
CREATE POLICY "Users can manage own study plan items" ON public.study_plan_items
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 7. user_exam_readiness: Student can read own readiness; writes restricted to service_role
CREATE POLICY "Users can read own exam readiness" ON public.user_exam_readiness
    FOR SELECT USING (auth.uid() = user_id);

-- 8. user_mastery_history: Student can read own history; writes restricted to service_role
CREATE POLICY "Users can read own mastery history" ON public.user_mastery_history
    FOR SELECT USING (auth.uid() = user_id);
