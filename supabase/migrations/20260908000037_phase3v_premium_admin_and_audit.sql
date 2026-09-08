-- ============================================================================
-- COURAGE LIBRARY — PHASE 3V: PREMIUM ADMIN SYSTEM CONFIG & AUDIT LOG
-- Target Database: couragelibrary-next
-- Safety: 100% Additive, Idempotent, Zero Modification to Existing Rows
-- ============================================================================

-- ============================================================================
-- 1. TABLE: premium_system_configs
-- Purpose: Server-authoritative structured configuration for Premium controls
-- Domains: GLOBAL, EXAM, TEST_TYPE, GENERATOR_POLICY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.premium_system_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_domain TEXT NOT NULL,
    config_key TEXT NOT NULL UNIQUE,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    config_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_premium_config_domain CHECK (
        config_domain IN ('GLOBAL', 'EXAM', 'TEST_TYPE', 'GENERATOR_POLICY')
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_premium_system_configs_domain_enabled
    ON public.premium_system_configs (config_domain, is_enabled);

CREATE INDEX IF NOT EXISTS idx_premium_system_configs_key
    ON public.premium_system_configs (config_key);

-- Enable RLS
ALTER TABLE public.premium_system_configs ENABLE ROW LEVEL SECURITY;

-- Policy: Candidates / Authenticated users can read active system configs
-- (Needed for maintenance mode notice, exam availability, and generator rules)
DROP POLICY IF EXISTS "Allow authenticated read premium configs" ON public.premium_system_configs;
CREATE POLICY "Allow authenticated read premium configs"
    ON public.premium_system_configs
    FOR SELECT
    TO authenticated
    USING (is_enabled = true);

-- Policy: Service role / Admin full control
DROP POLICY IF EXISTS "Allow service role full access premium configs" ON public.premium_system_configs;
CREATE POLICY "Allow service role full access premium configs"
    ON public.premium_system_configs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 2. TABLE: admin_audit_logs
-- Purpose: Platform-wide immutable administrative audit trail
-- Properties: Append-only, Zero Updates/Deletes Allowed
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email TEXT NOT NULL,
    action_type TEXT NOT NULL,
    target_entity TEXT NOT NULL,
    target_id TEXT,
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for audit query efficiency
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor
    ON public.admin_audit_logs (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity
    ON public.admin_audit_logs (target_entity, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action
    ON public.admin_audit_logs (action_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Candidates have NO access to audit logs.
-- Only service role and server-side administrative clients can read/insert.
DROP POLICY IF EXISTS "Allow service role read insert admin audit logs" ON public.admin_audit_logs;
CREATE POLICY "Allow service role read insert admin audit logs"
    ON public.admin_audit_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Explicitly enforce immutability: No updates or deletes allowed on audit logs
CREATE OR REPLACE FUNCTION public.fn_prevent_admin_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'admin_audit_logs records are strictly immutable and cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_admin_audit_log_mutation ON public.admin_audit_logs;
CREATE TRIGGER trg_prevent_admin_audit_log_mutation
    BEFORE UPDATE OR DELETE ON public.admin_audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_prevent_admin_audit_log_mutation();

-- ============================================================================
-- 3. MINIMAL ESSENTIAL DEFAULT CONFIGURATION
-- Purpose: Authoritative operational baseline with safe fallback semantics
-- ============================================================================

-- A. GLOBAL System Status & Maintenance
INSERT INTO public.premium_system_configs (config_domain, config_key, is_enabled, config_value)
VALUES (
    'GLOBAL',
    'GLOBAL_PREMIUM_STATUS',
    true,
    jsonb_build_object(
        'is_premium_enabled', true,
        'maintenance_mode', false,
        'maintenance_message', 'Premium practice systems are currently undergoing scheduled maintenance. Daily Mocks remain active.',
        'emergency_disable_reason', null
    )
)
ON CONFLICT (config_key) DO NOTHING;

-- B. GENERATOR POLICY Baseline Constraints
INSERT INTO public.premium_system_configs (config_domain, config_key, is_enabled, config_value)
VALUES (
    'GENERATOR_POLICY',
    'DEFAULT_GENERATOR_POLICY',
    true,
    jsonb_build_object(
        'dynamic_test_ttl_hours', 48,
        'min_pool_multiplier', 3,
        'max_weak_area_ratio', 0.70,
        'min_syllabus_ratio', 0.30,
        'max_active_dynamic_tests_per_user', 5
    )
)
ON CONFLICT (config_key) DO NOTHING;
