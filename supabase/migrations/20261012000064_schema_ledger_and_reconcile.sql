-- =============================================================================
-- COURAGE LIBRARY — DRIFT-1b: SCHEMA LEDGER + REPO ↔ DB RECONCILIATION
-- Migration: 20261012000064_schema_ledger_and_reconcile.sql
--
-- 1. public.schema_migration_ledger (service-role only) + seed of the pre-ledger
--    state established by DRIFT-1a (47 BASELINED, 17 SUPERSEDED_NOT_APPLIED).
-- 2. Capture out-of-band live objects INTO the repo (D2). For "live wins" objects the
--    definition below is the verbatim pg_get_functiondef() output, so applying it to
--    couragelibrary-next leaves the function body hash unchanged.
-- 3. Close stale overloads (D3).
-- 4. Explicit EXECUTE grants for every SECURITY DEFINER function touched here (B3).
--
-- Never applies or edits migrations 033 / 037–052 (D1). Idempotent.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. MIGRATION LEDGER
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schema_migration_ledger (
    filename TEXT PRIMARY KEY,
    checksum_sha256 TEXT NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
    status TEXT NOT NULL CHECK (status IN ('APPLIED', 'BASELINED', 'SUPERSEDED_NOT_APPLIED', 'FAILED')),
    superseded_by TEXT,
    applied_at TIMESTAMPTZ,
    applied_by_tool TEXT,
    notes TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.schema_migration_ledger.checksum_sha256 IS
    'sha256 of the migration file with CRLF normalized to LF (scripts/db/_db-env.cjs fileChecksum).';

ALTER TABLE public.schema_migration_ledger ENABLE ROW LEVEL SECURITY;
-- Intentionally NO anon/authenticated policies.
REVOKE ALL ON public.schema_migration_ledger FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.schema_migration_ledger TO service_role;

INSERT INTO public.schema_migration_ledger (filename, checksum_sha256, status, superseded_by, applied_at, applied_by_tool, notes)
VALUES
    ('20260824000001_phase3a_core_foundation.sql', 'e8df430ea2c3b1221ebe6af9a74eca9cede20ec3eb2a9e093b8f206f24f597b7', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000002_phase3b_testing_runtime.sql', 'a8ee62fa762a4f47d00da82662ba7540846b1c5c2bce0995bc4a8426e1b69d55', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000003_phase3b_security_patch.sql', '3b94f59e9b7e61d3882ce823350e45fac24fe3e8b284941c4d7c3d0e26e742f1', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000004_phase3c_intelligence_schema.sql', '06986ef2a2d1c29c3209966120c9daa222c9823b2d1c60c40535151674674947', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000005_phase3c_algorithm_configs_hardening.sql', 'b7c412bd738d571b22490d1aaa0198478aa70a29cbfe62c9c7f2c17a6104b232', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger; no schema objects (grants only) — content not independently verifiable'),
    ('20260824000006_phase3d_gamification_foundation.sql', 'df32ef060bf7cabefad3ff2c1ea764a9834f0e606dec891f1d269e551511ca06', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000007_phase3e_content_management.sql', '7d0eeef9ca5f348db752aa2e78917ab7abc29a61007faa7440d684ff77543d9a', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000008_phase3e_security_hardening.sql', 'efbba602a67390fd0a3a8ee46c43d0394c1103ec675cf97e6e3361593600540a', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000009_phase3f_course_runtime.sql', '5c36f15a5459484d51f6530519454719f387dc35621e5efe198422fbffde3ca8', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000010_phase3f_runtime_functions.sql', '8727c837a53d40ba9628221380a0752d22afcb55985da997e978b662166f5d95', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000011_phase3g_revision_vault.sql', '539c6af5b4fed8e525f5d4139aba219f72c99e4277bd25ece5c8d97c08549085', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000012_phase3g_runtime_functions.sql', 'dacd438a47887b10d992722c1b7880074d4ab85f057fae4e11f858957688370b', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000013_phase3g_closure_hardening.sql', '5ddc035a7bf4fd8a4a89173bcdfe19c34e77dcb3fd353261e11f634a21dd6a9b', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000014_phase3h_notifications.sql', 'c1dd064fb5d7890cab6b94bb53c2af0c50570c79fc391c02df3b7a0cfa041b6c', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000015_phase3h_runtime_functions.sql', '10d91f06a5826ab54afbe6f15039595cd63829a5d4bc7212e3fb9f7793cc6785', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000016_phase3h_closure_hardening.sql', '1d599d9c1241db1b4c6d88a16bd50716dd3d4baae47a9272ac7fb42d981b5b62', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000017_phase3i_monetization.sql', 'd5601414493e16676c8194ab250250de4935c650adfc3ef7d7ff4ea9bfcff936', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000018_phase3i_runtime_functions.sql', 'bd3cb4793dc258787a35611d6b8b90ad54b2ad3340523e32b6384b72bdfc6edd', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000019_phase3i_closure_hardening.sql', '22e3be8ff4eeac39d9d5a1525f77e73a319304b46a9d8cf784d522fa34e821a5', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000020_phase3j_intelligence_engine.sql', '7a518cdba0ae7c166db36aa771e8adc4c3de103311fb5845bbe9a0989c0e581a', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000021_phase3j_closure_hardening.sql', '348649a9dc7d735886284cf36bacdb9edb0bee327bd38804ecf20d0eac9759f2', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260824000022_phase3j_final_closure_hardening.sql', '112a3176c4b38eec0f0b6f9eaa39c0cc3fad27a84bbc8e372caa89ebbe92d4ea', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260825000023_phase3k_discovery_engine.sql', '5fc58db1b8321e8836b0d2f7e3cfa84388e340852bd4b1f94456852eb83a4c89', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260825000024_phase3k_closure_hardening.sql', 'fa0ef1b8dadc98ba8b1b788629e622958529633043ed142bf9dc4cc6e40f7bc8', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260825000025_phase3l_community_discussions.sql', '58efab428d55dc2e8ff1f8edfafeb0d7975b68c000c009a92635a001147a6a9f', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260825000026_phase3l_closure_remediation.sql', '6f04dbd5a1e74d5a9e38672e898d2570dae538d39e92fdc1e3adf5548d346e3f', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260825000027_phase3m_flashcards.sql', 'dec7b523adbb4b3dd1799817abc60dc3003335fdab6299ed7a5d53f1eab5f9a6', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260825000028_phase3n_quiz_battles.sql', 'ce3d32975ea7cb25b9dc46635ddc658fc96f5b463c6eb81920c4968200d25d5e', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260825000029_phase3n_security_remediation.sql', '7f7c951b2e7344d6385bc072a9681f3d707805a3f28ad792526c79bd3c589a57', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260825000030_phase3o_mistake_vault.sql', '50dfdc161aab89f58bef94fab7acb2aef37a9bd36bc0d20bc5f7ec2f305d9a86', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260825000031_phase3p_institutional_batches.sql', '29d428011fd0d92944c0acf251cfdc6ed278f277fba9a07dd40062d887587fdf', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260825000032_phase3q_descriptive_evaluations.sql', 'b1ecf5ed8f1203a9cd293b197c43b2a12f74f90d9da85a9b6b5886dfefeef3f6', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260907000033_phase3r_mock_attempt_uniqueness.sql', '285531a812b460e7fb608258c4cf1d4088d949a99d57a6f0f9084b4e8c6a543b', 'SUPERSEDED_NOT_APPLIED', '20261012000065_restore_audit_mistake_lineage_attempt_guard.sql', NULL, NULL, 'Never applied (DRIFT-1a). Original must not be replayed; required objects re-created, hardened, by 065.'),
    ('20260908000034_phase3s_premium_mock_foundation.sql', '592c3acc463940284320b2e203af28b2e9e1ec66b8fed0e81fe2915ec480e40e', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260908000035_phase3t_premium_entitlement_and_quota.sql', 'af2b65de89712d3d160a78131bb70645ff2b878e4c877dc44216e357aee053b2', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260908000036_phase3u_premium_generator_atomic.sql', '3570a785d9c4d011b90c67a97bd15f89cb9349186c65db60c5f1408232d530f6', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260908000037_phase3v_premium_admin_and_audit.sql', 'b72e68b5e3b03f52af5f725bbc704b5629584b45df4ab87442d7c07550e89a88', 'SUPERSEDED_NOT_APPLIED', '20261012000065_restore_audit_mistake_lineage_attempt_guard.sql', NULL, NULL, 'Never applied (DRIFT-1a). Original must not be replayed; required objects re-created, hardened, by 065.'),
    ('20260908000038_phase4a_adaptive_foundation.sql', '5adcc56d84049937e240d7c01f4b6af8ac4c6943c3f6f1b488c29b66cc8e6c6f', 'SUPERSEDED_NOT_APPLIED', 'NOT_RESTORED (feature deferred)', NULL, NULL, 'Never applied (DRIFT-1a). Original unsafe to replay (open policies / ungranted SECURITY DEFINER RPCs); feature deferred to DRIFT-1c.'),
    ('20260908000039_phase4d1_advanced_adaptive_foundation.sql', 'ec7333233af7b5aaaac908a741ab690a39cacfe58f6c8a708cf71a4ca027da66', 'SUPERSEDED_NOT_APPLIED', 'NOT_RESTORED (feature deferred)', NULL, NULL, 'Never applied (DRIFT-1a). Original unsafe to replay (open policies / ungranted SECURITY DEFINER RPCs); feature deferred to DRIFT-1c.'),
    ('20260908000040_phase4d2_item_calibration_and_evidence.sql', '54eb0068c6615489d3e84fb75fd6ff065cdf892d75eb4f49f293ad0defa3b289', 'SUPERSEDED_NOT_APPLIED', 'NOT_RESTORED (feature deferred)', NULL, NULL, 'Never applied (DRIFT-1a). Original unsafe to replay (open policies / ungranted SECURITY DEFINER RPCs); feature deferred to DRIFT-1c.'),
    ('20260908000041_phase4d3_advanced_ability_estimation.sql', '00ac6b8307f71e4d117494160989bca6bffaef65b6a3f7111f87c2ffbf0e7180', 'SUPERSEDED_NOT_APPLIED', 'NOT_RESTORED (feature deferred)', NULL, NULL, 'Never applied (DRIFT-1a). Original unsafe to replay (open policies / ungranted SECURITY DEFINER RPCs); feature deferred to DRIFT-1c.'),
    ('20260908000042_phase4d4_cat_item_selection.sql', 'b76525ed58f5254512ff43b7a27c25b6c519057c4ffdfb567d526ed376b4e7d8', 'SUPERSEDED_NOT_APPLIED', 'NOT_RESTORED (feature deferred)', NULL, NULL, 'Never applied (DRIFT-1a). Original unsafe to replay (open policies / ungranted SECURITY DEFINER RPCs); feature deferred to DRIFT-1c.'),
    ('20260908000043_phase4d5_stopping_personalization.sql', 'fc8d65d1a3e8e8ca08884dcf60ff05b96ecbf46e7f91cb9449242759ac2a491a', 'SUPERSEDED_NOT_APPLIED', 'NOT_RESTORED (feature deferred)', NULL, NULL, 'Never applied (DRIFT-1a). Original unsafe to replay (open policies / ungranted SECURITY DEFINER RPCs); feature deferred to DRIFT-1c.'),
    ('20260908000044_phase5a_live_test_foundation.sql', 'cd1aee5112c3a7e705822d40e63d1a521c02f2534105c71b09e8f98637b1d998', 'SUPERSEDED_NOT_APPLIED', 'NOT_RESTORED (feature deferred)', NULL, NULL, 'Never applied (DRIFT-1a). Original unsafe to replay (open policies / ungranted SECURITY DEFINER RPCs); feature deferred to DRIFT-1c.'),
    ('20260909000045_phase5b_live_test_registration_rpc.sql', 'a4408b6fe9965c30cf748ce6c877a6d6ac08d64572038ec817c6f39444ba6c59', 'SUPERSEDED_NOT_APPLIED', 'NOT_RESTORED (feature deferred)', NULL, NULL, 'Never applied (DRIFT-1a). Original unsafe to replay (open policies / ungranted SECURITY DEFINER RPCs); feature deferred to DRIFT-1c.'),
    ('20260909000046_phase5c_live_test_runner_rpc.sql', '064714577ff6682e6ea71fee88fdbd69d6b6b6707f928f6a15a30c46e7e2fa3b', 'SUPERSEDED_NOT_APPLIED', 'NOT_RESTORED (feature deferred)', NULL, NULL, 'Never applied (DRIFT-1a). Original unsafe to replay (open policies / ungranted SECURITY DEFINER RPCs); feature deferred to DRIFT-1c.'),
    ('20260909000047_phase5d_result_engine_and_ranking_rpc.sql', '2d693550f118d49167f0ac84ab57a6eb12186a19f87698b96d5930080b15cbc0', 'SUPERSEDED_NOT_APPLIED', 'NOT_RESTORED (feature deferred)', NULL, NULL, 'Never applied (DRIFT-1a). Original unsafe to replay (open policies / ungranted SECURITY DEFINER RPCs); feature deferred to DRIFT-1c.'),
    ('20260909000048_phase5e1_rewards_and_settlement_rpc.sql', '8d8e4b1e514a04004e36b818040eb58ef9872d1fe58893f7db4d35c646c9970b', 'SUPERSEDED_NOT_APPLIED', 'NOT_RESTORED (feature deferred)', NULL, NULL, 'Never applied (DRIFT-1a). Original unsafe to replay (open policies / ungranted SECURITY DEFINER RPCs); feature deferred to DRIFT-1c.'),
    ('20260909000049_phase5e2_certificates_and_verification_rpc.sql', 'a45ea90598f3857a199a5a19f9841b85ee4c22283a7c5af1fefeb17276773e18', 'SUPERSEDED_NOT_APPLIED', 'NOT_RESTORED (feature deferred)', NULL, NULL, 'Never applied (DRIFT-1a). Original unsafe to replay (open policies / ungranted SECURITY DEFINER RPCs); feature deferred to DRIFT-1c.'),
    ('20260909000050_phase5e3_achievements_and_badges_rpc.sql', '676290a7c0406cbe0695b1399d1e7249a52d74f5a11325948cf19e24d7e0b822', 'SUPERSEDED_NOT_APPLIED', 'NOT_RESTORED (feature deferred)', NULL, NULL, 'Never applied (DRIFT-1a). Original unsafe to replay (open policies / ungranted SECURITY DEFINER RPCs); feature deferred to DRIFT-1c.'),
    ('20260910000051_phase5e6_psychometrics_foundation.sql', '9b89cda8f909b4b662ff490f24af8b051fae77dea9c22696ff68b17204c914a3', 'SUPERSEDED_NOT_APPLIED', 'NOT_RESTORED (feature deferred)', NULL, NULL, 'Never applied (DRIFT-1a). Original unsafe to replay (open policies / ungranted SECURITY DEFINER RPCs); feature deferred to DRIFT-1c.'),
    ('20260911000052_phase2_mistake_vault_lineage_and_errata.sql', 'd91970524dac4da05341426d69cc204e0a7ca5f7c0c4588674eba41c198126e7', 'SUPERSEDED_NOT_APPLIED', '20261012000065_restore_audit_mistake_lineage_attempt_guard.sql', NULL, NULL, 'Never applied (DRIFT-1a). Original must not be replayed; required objects re-created, hardened, by 065.'),
    ('20260915000053_phase3a_learning_taxonomy_foundation.sql', '0a63bd35979a118a20b280e8a8eb03cb6aa7f0df87dcf4437166434f9075a098', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260915000054_phase3b_content_artifact_and_asset_foundation.sql', '94ab4766b9e0d83b6f6f22cd802210c8f2005bc7a1089dd467a02c3c9ddff60d', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260915000055_phase3c_content_compilation_and_versions.sql', 'f5a52565c5b30c83470e96a0f625e8e21c74dc65e8ebedc4ec7e5371bae70296', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260915000056_phase3d_immutability_and_deletion_guards.sql', '937e9e72b1d82bbbe4f257548115e85538798643861ed60d056ad22f79bc27e0', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20260919000054_phase3h1_exam_knowledge_foundation.sql', '89f4c00f4f337685060026a3c108ff2b95d6519ef9e2a8f2c2d695630bbb6631', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20261001000057_phase3r1_dynamic_syllabus_schema_foundation.sql', '696d60019f0b8f4d31711f2e927c32e72a085a57d6965ac2e664be4168a1ede0', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20261001000058_phase3r2_derived_fields_and_integrity.sql', '5366d7601f67e73e40827a21d4bb6dac44947320fb504ba32f968e69228d33b5', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20261001000059_phase3r3_reconciliation_match_status_and_evidence.sql', '73f8e41872a9fcfd739ecf696729d976a8dca11b2c8fc587cb82678e9c66e707', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20261001000060_phase3r4_resolution_workbench_foundation.sql', 'b20c4d2a6bd642eb4a0f77b902a1aa209fb4c5e913d57fab54e35936c452542b', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20261001000061_phase4a_current_affairs_canonical_schema.sql', '5a8271aa55c67f9bc2b06c40ab848fd2d8e5c630a1069aa01c6f355996f544f5', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20261002000062_controlled_exam_deletion_cascade.sql', '1f47d630e338dc12f13a0bb93130bbf698db77f706c25c1ad448041c42c146ed', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a'),
    ('20261012000063_qf1_question_factory_core.sql', '5d904c8e09112672a7b2f35ce8b8b10b7fffd7e22f699af10dd4d76284ddaf29', 'BASELINED', NULL, NULL, 'pre-ledger', 'pre-ledger, verified by DRIFT-1a')
ON CONFLICT (filename) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 2. RECONCILE OUT-OF-BAND OBJECTS (see DRIFT1B report §3 for evidence)
-- -----------------------------------------------------------------------------

-- 2a. fn_universal_search — REPO WINS (20260825000024).
--     Live hotfix referenced user_entitlements.status / valid_until, which do not exist
--     (live columns: is_active, expires_at). The repo version matches the schema.
CREATE OR REPLACE FUNCTION public.fn_universal_search(
    p_query TEXT,
    p_entity_types TEXT[] DEFAULT NULL,
    p_exam_id UUID DEFAULT NULL,
    p_topic_id UUID DEFAULT NULL,
    p_access_tier TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_has_pro BOOLEAN := false;
    v_clean_query TEXT;
    v_tsquery_en tsquery;
    v_tsquery_hi tsquery;
    v_results JSONB := '[]'::jsonb;
    v_facets JSONB := '{}'::jsonb;
    v_total_count INTEGER := 0;
    v_effective_limit INTEGER := LEAST(GREATEST(p_limit, 1), 50);
    v_effective_offset INTEGER := GREATEST(p_offset, 0);
BEGIN
    v_clean_query := trim(p_query);
    IF v_clean_query IS NULL OR length(v_clean_query) = 0 THEN
        RETURN jsonb_build_object(
            'success', true,
            'query', '',
            'total_count', 0,
            'results', '[]'::jsonb,
            'facets', jsonb_build_object(
                'entity_types', '{}'::jsonb,
                'access_tiers', '{}'::jsonb
            )
        );
    END IF;

    IF length(v_clean_query) > 100 THEN
        v_clean_query := substring(v_clean_query from 1 for 100);
    END IF;

    IF v_user_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements
            WHERE user_id = v_user_id
              AND entitlement_type = 'SUBSCRIPTION'
              AND is_active = true
              AND (expires_at IS NULL OR expires_at > now())
        ) INTO v_has_pro;
    END IF;

    BEGIN
        v_tsquery_en := plainto_tsquery('english', v_clean_query);
    EXCEPTION WHEN OTHERS THEN
        v_tsquery_en := to_tsquery('english', '');
    END;

    BEGIN
        v_tsquery_hi := plainto_tsquery('simple', v_clean_query);
    EXCEPTION WHEN OTHERS THEN
        v_tsquery_hi := to_tsquery('simple', '');
    END;

    WITH authorized_candidates AS (
        SELECT
            s.id as result_id,
            s.entity_type,
            s.source_id,
            s.canonical_url as deep_link,
            COALESCE(s.title_en, s.title_hi, 'Untitled') as title,
            COALESCE(s.body_snippet_en, s.body_snippet_hi, '') as snippet,
            s.exam_id,
            s.subject_id,
            s.topic_id,
            s.category,
            s.year,
            s.access_tier,
            s.quality_rank,
            (
                0.50 * GREATEST(
                    CASE WHEN v_tsquery_en IS NOT NULL AND s.search_vector_en @@ v_tsquery_en THEN ts_rank(s.search_vector_en, v_tsquery_en) ELSE 0.0 END,
                    CASE WHEN v_tsquery_hi IS NOT NULL AND s.search_vector_hi @@ v_tsquery_hi THEN ts_rank(s.search_vector_hi, v_tsquery_hi) ELSE 0.0 END
                ) +
                0.30 * GREATEST(
                    similarity(COALESCE(s.title_en, ''), v_clean_query),
                    similarity(COALESCE(s.title_hi, ''), v_clean_query)
                ) +
                0.10 * (CASE WHEN lower(COALESCE(s.title_en, '')) = lower(v_clean_query) OR COALESCE(s.title_hi, '') = v_clean_query THEN 1.0 ELSE 0.0 END) +
                0.10 * (s.quality_rank::numeric / 1000.0)
            )::numeric(5,4) as relevance_score
        FROM public.search_indexes s
        WHERE s.is_published = true
          AND (v_has_pro = true OR auth.role() = 'service_role' OR s.access_tier = 'FREE')
          AND (p_entity_types IS NULL OR s.entity_type = ANY(p_entity_types))
          AND (p_exam_id IS NULL OR s.exam_id = p_exam_id)
          AND (p_topic_id IS NULL OR s.topic_id = p_topic_id)
          AND (p_access_tier IS NULL OR s.access_tier = p_access_tier)
          AND (
              (v_tsquery_en IS NOT NULL AND s.search_vector_en @@ v_tsquery_en) OR
              (v_tsquery_hi IS NOT NULL AND s.search_vector_hi @@ v_tsquery_hi) OR
              similarity(COALESCE(s.title_en, ''), v_clean_query) > 0.20 OR
              similarity(COALESCE(s.title_hi, ''), v_clean_query) > 0.20 OR
              s.normalized_keywords ILIKE '%' || v_clean_query || '%'
          )
    )
    SELECT
        COUNT(*),
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'result_id', sub.result_id,
                'entity_type', sub.entity_type,
                'source_id', sub.source_id,
                'title', sub.title,
                'snippet', sub.snippet,
                'deep_link', sub.deep_link,
                'exam_id', sub.exam_id,
                'topic_id', sub.topic_id,
                'access_tier', sub.access_tier,
                'relevance_score', sub.relevance_score
            )
        ), '[]'::jsonb),
        jsonb_build_object(
            'entity_types', COALESCE((
                SELECT jsonb_object_agg(entity_type, type_count)
                FROM (SELECT entity_type, count(*) as type_count FROM authorized_candidates GROUP BY entity_type) t
            ), '{}'::jsonb),
            'access_tiers', COALESCE((
                SELECT jsonb_object_agg(access_tier, tier_count)
                FROM (SELECT access_tier, count(*) as tier_count FROM authorized_candidates GROUP BY access_tier) a
            ), '{}'::jsonb)
        )
    INTO v_total_count, v_results, v_facets
    FROM (
        SELECT * FROM authorized_candidates
        ORDER BY relevance_score DESC, quality_rank DESC, result_id ASC
        LIMIT v_effective_limit OFFSET v_effective_offset
    ) sub;

    RETURN jsonb_build_object(
        'success', true,
        'query', v_clean_query,
        'has_pro_access', v_has_pro,
        'total_count', COALESCE(v_total_count, 0),
        'limit', v_effective_limit,
        'offset', v_effective_offset,
        'facets', v_facets,
        'results', v_results
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_universal_search(text, text[], uuid, uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_universal_search(text, text[], uuid, uuid, text, integer, integer) TO service_role;

-- 2b. fn_log_user_search — LIVE WINS (verbatim).
--     Non-ASCII detection regex; schema-valid; no app caller. Repo's Devanagari-only
--     regex noted as optional follow-up.
CREATE OR REPLACE FUNCTION public.fn_log_user_search(p_query text, p_result_count integer DEFAULT 0, p_latency_ms integer DEFAULT 0, p_is_zero_result boolean DEFAULT false, p_clicked_entity_type text DEFAULT NULL::text, p_clicked_source_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_clean_query TEXT := trim(p_query);
    v_query_hash TEXT;
    v_detected_lang TEXT := 'EN';
BEGIN
    IF v_clean_query IS NULL OR length(v_clean_query) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Query cannot be empty');
    END IF;

    IF length(v_clean_query) > 100 THEN
        v_clean_query := substring(v_clean_query from 1 for 100);
    END IF;

    -- Deterministic Language Classification: Any non-ASCII Unicode char indicates Devanagari Hindi
    IF v_clean_query ~ '[^\x00-\x7F]' THEN
        v_detected_lang := 'HI';
    ELSE
        v_detected_lang := 'EN';
    END IF;

    v_query_hash := md5(lower(v_clean_query));

    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.user_search_history (
            user_id, query_text, result_count, clicked_entity_type, clicked_source_id, searched_at
        ) VALUES (
            v_user_id, v_clean_query, p_result_count, p_clicked_entity_type, p_clicked_source_id, now()
        );
    END IF;

    INSERT INTO public.search_query_logs (
        query_hash, sanitized_query, result_count, is_zero_result, execution_latency_ms, language_detected, created_at
    ) VALUES (
        v_query_hash, lower(v_clean_query), p_result_count, (p_result_count = 0 OR p_is_zero_result), LEAST(p_latency_ms, 60000), v_detected_lang, now()
    );

    RETURN jsonb_build_object('success', true, 'language_detected', v_detected_lang);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_log_user_search(text, integer, integer, boolean, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_log_user_search(text, integer, integer, boolean, text, uuid) TO service_role;

-- 2c. Discussion RPCs — LIVE WINS (verbatim).
--     user_notifications.category CHECK allows 'ACADEMIC' (not 'COMMUNITY');
--     gamification_events.reward_status CHECK allows 'REWARDED' (not 'PROCESSED');
--     uq_user_notif_idempotency is a PARTIAL unique index, so ON CONFLICT needs the
--     matching WHERE clause. Called by services/community.service.ts with the user's session.
CREATE OR REPLACE FUNCTION public.fn_post_discussion_message(p_thread_id uuid, p_content_markdown text, p_parent_message_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_thread_status TEXT;
    v_thread_title TEXT;
    v_thread_author_id UUID;
    v_message_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    IF p_content_markdown IS NULL OR length(trim(p_content_markdown)) < 2 OR length(p_content_markdown) > 10000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message content must be between 2 and 10000 characters');
    END IF;

    SELECT status, title, author_id INTO v_thread_status, v_thread_title, v_thread_author_id
    FROM public.discussion_threads
    WHERE id = p_thread_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Discussion thread not found');
    END IF;

    IF v_thread_status IN ('LOCKED', 'ARCHIVED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Discussion thread is locked/archived');
    END IF;

    INSERT INTO public.discussion_messages (
        thread_id, author_id, parent_message_id, content_markdown
    ) VALUES (
        p_thread_id, v_user_id, p_parent_message_id, trim(p_content_markdown)
    ) RETURNING id INTO v_message_id;

    UPDATE public.discussion_threads
    SET message_count = message_count + 1,
        last_activity_at = now(),
        updated_at = now()
    WHERE id = p_thread_id;

    -- Phase 3H Notification to Thread Author (if different from replier)
    IF v_thread_author_id != v_user_id THEN
        INSERT INTO public.user_notifications (
            user_id, category, priority, title, body, action_url,
            metadata_json, idempotency_key, created_at
        ) VALUES (
            v_thread_author_id, 'ACADEMIC', 'NORMAL',
            'New reply on your discussion',
            substring(trim(p_content_markdown) from 1 for 120),
            '/discussions/' || p_thread_id,
            jsonb_build_object('thread_id', p_thread_id, 'message_id', v_message_id),
            'disc_reply_thread_' || v_message_id,
            now()
        ) ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    END IF;

    -- Phase 3C Activity Logging
    INSERT INTO public.learning_activity_events (
        user_id, event_type, metadata, occurred_at
    ) VALUES (
        v_user_id, 'COMMUNITY_DOUBT_ANSWERED',
        jsonb_build_object('thread_id', p_thread_id, 'message_id', v_message_id),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'message_id', v_message_id,
        'thread_id', p_thread_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_mark_accepted_answer(p_thread_id uuid, p_message_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_author_id UUID;
    v_msg_author_id UUID;
    v_msg_thread_id UUID;
    v_is_staff BOOLEAN;
    v_event_key TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    v_is_staff := (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

    SELECT author_id INTO v_author_id
    FROM public.discussion_threads
    WHERE id = p_thread_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Thread not found');
    END IF;

    IF v_author_id != v_user_id AND NOT v_is_staff THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only thread author or staff can mark accepted answer');
    END IF;

    SELECT thread_id, author_id INTO v_msg_thread_id, v_msg_author_id
    FROM public.discussion_messages
    WHERE id = p_message_id;

    IF NOT FOUND OR v_msg_thread_id != p_thread_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message does not belong to this thread');
    END IF;

    UPDATE public.discussion_threads
    SET accepted_answer_id = p_message_id,
        status = 'RESOLVED',
        updated_at = now()
    WHERE id = p_thread_id;

    -- Phase 3D Gamification Event: Award 25 coins for accepted answer
    v_event_key := 'disc_accepted_' || p_thread_id || '_' || p_message_id;
    INSERT INTO public.gamification_events (
        user_id, event_type, source_type, source_id, idempotency_key,
        verification_status, reward_status, calculated_coins, actual_coins_awarded,
        metadata, occurred_at
    ) VALUES (
        v_msg_author_id, 'ACCEPTED_ANSWER_BONUS', 'DISCUSSION_MESSAGE', p_message_id, v_event_key,
        'VERIFIED', 'REWARDED', 25, 25,
        jsonb_build_object('thread_id', p_thread_id, 'message_id', p_message_id),
        now()
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    -- Phase 3H Notification to Answer Author
    IF v_msg_author_id != v_user_id THEN
        INSERT INTO public.user_notifications (
            user_id, category, priority, title, body, action_url,
            metadata_json, idempotency_key, created_at
        ) VALUES (
            v_msg_author_id, 'ACADEMIC', 'HIGH',
            'Your answer was accepted!',
            'Your solution was marked as the accepted answer (+25 coins bonus).',
            '/discussions/' || p_thread_id,
            jsonb_build_object('thread_id', p_thread_id, 'message_id', p_message_id),
            'disc_notif_accepted_' || p_message_id,
            now()
        ) ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'thread_id', p_thread_id,
        'accepted_answer_id', p_message_id,
        'status', 'RESOLVED'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_vote_discussion_message(p_message_id uuid, p_vote_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_msg_author_id UUID;
    v_thread_id UUID;
    v_new_count INTEGER;
    v_event_key TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    SELECT author_id, thread_id INTO v_msg_author_id, v_thread_id
    FROM public.discussion_messages
    WHERE id = p_message_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message not found');
    END IF;

    IF p_vote_action = 'ADD' THEN
        INSERT INTO public.discussion_votes (message_id, user_id)
        VALUES (p_message_id, v_user_id)
        ON CONFLICT (message_id, user_id) DO NOTHING;
    ELSIF p_vote_action = 'REMOVE' THEN
        DELETE FROM public.discussion_votes
        WHERE message_id = p_message_id AND user_id = v_user_id;
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid vote action. Must be ADD or REMOVE');
    END IF;

    SELECT count(*) INTO v_new_count
    FROM public.discussion_votes
    WHERE message_id = p_message_id;

    UPDATE public.discussion_messages
    SET upvote_count = v_new_count,
        updated_at = now()
    WHERE id = p_message_id;

    -- Phase 3D Milestone Bonus (At 5 upvotes, award 10 coins)
    IF v_new_count >= 5 THEN
        v_event_key := 'disc_upvote_milestone_5_' || p_message_id;
        INSERT INTO public.gamification_events (
            user_id, event_type, source_type, source_id, idempotency_key,
            verification_status, reward_status, calculated_coins, actual_coins_awarded,
            metadata, occurred_at
        ) VALUES (
            v_msg_author_id, 'HELPFUL_ANSWER_BONUS', 'DISCUSSION_MESSAGE', p_message_id, v_event_key,
            'VERIFIED', 'REWARDED', 10, 10,
            jsonb_build_object('message_id', p_message_id, 'milestone', 5),
            now()
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message_id', p_message_id,
        'upvote_count', v_new_count
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_post_discussion_message(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_mark_accepted_answer(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_vote_discussion_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_post_discussion_message(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_mark_accepted_answer(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_vote_discussion_message(uuid, text) TO authenticated, service_role;

-- 2d. fn_find_or_create_battle_room(uuid, boolean) — LIVE CAPTURED AS-IS (D5: battles not fixed).
--     The app calls the 3-arg version (with p_access_tier), which is also live. This 2-arg
--     overload has no app caller; EXECUTE restricted to service_role.
CREATE OR REPLACE FUNCTION public.fn_find_or_create_battle_room(p_topic_id uuid DEFAULT NULL::uuid, p_is_private boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_room_id UUID;
    v_room_code TEXT;
    v_q_ids UUID[];
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    -- Ensure initial user_battle_stats exists
    INSERT INTO public.user_battle_stats (user_id)
    VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    -- If public matchmaking, attempt to find an open waiting room
    IF NOT p_is_private THEN
        SELECT id, room_code INTO v_room_id, v_room_code
        FROM public.quiz_battle_rooms
        WHERE status = 'WAITING'
          AND is_private = false
          AND (p_topic_id IS NULL OR topic_id = p_topic_id)
          AND created_by_user_id != v_user_id
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF FOUND THEN
            -- Join this room
            INSERT INTO public.quiz_battle_participants (room_id, user_id, is_ready)
            VALUES (v_room_id, v_user_id, true)
            ON CONFLICT (room_id, user_id) DO NOTHING;

            -- Transition room to READY and start countdown
            UPDATE public.quiz_battle_rooms
            SET status = 'COUNTDOWN',
                current_round = 1,
                round_started_at = now() + INTERVAL '5 seconds',
                round_ends_at = now() + INTERVAL '5 seconds' + (time_per_question_seconds * INTERVAL '1 second'),
                updated_at = now()
            WHERE id = v_room_id;

            RETURN jsonb_build_object(
                'success', true,
                'room_id', v_room_id,
                'room_code', v_room_code,
                'action', 'JOINED',
                'status', 'COUNTDOWN',
                'countdown_seconds', 5
            );
        END IF;
    END IF;

    -- Select 5 random active questions from Phase 3A
    SELECT array_agg(id) INTO v_q_ids
    FROM (
        SELECT id FROM public.questions
        WHERE status = 'published'
          AND (p_topic_id IS NULL OR canonical_topic_id = p_topic_id)
        ORDER BY random()
        LIMIT 5
    ) q_sample;

    IF v_q_ids IS NULL OR array_length(v_q_ids, 1) < 1 THEN
        -- Fallback to any published questions if specific topic has < 5
        SELECT array_agg(id) INTO v_q_ids
        FROM (
            SELECT id FROM public.questions
            WHERE status = 'published'
            ORDER BY random()
            LIMIT 5
        ) q_fallback;
    END IF;

    IF v_q_ids IS NULL OR array_length(v_q_ids, 1) < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient questions available for battle');
    END IF;

    -- Generate cryptographically safe 6-char room code
    v_room_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));

    INSERT INTO public.quiz_battle_rooms (
        room_code, battle_type, topic_id, created_by_user_id,
        is_private, max_participants, total_rounds, time_per_question_seconds,
        question_ids, status
    ) VALUES (
        v_room_code, '1v1', p_topic_id, v_user_id,
        p_is_private, 2, array_length(v_q_ids, 1), 15,
        v_q_ids, 'WAITING'
    ) RETURNING id INTO v_room_id;

    INSERT INTO public.quiz_battle_participants (room_id, user_id, is_ready)
    VALUES (v_room_id, v_user_id, true);

    RETURN jsonb_build_object(
        'success', true,
        'room_id', v_room_id,
        'room_code', v_room_code,
        'action', 'CREATED',
        'status', 'WAITING'
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_find_or_create_battle_room(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_find_or_create_battle_room(uuid, boolean) TO service_role;

-- 2e. rls_auto_enable + event trigger ensure_rls — LIVE CAPTURED (auto-enables RLS on new tables).
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

DO $do$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') THEN
        CREATE EVENT TRIGGER ensure_rls
            ON ddl_command_end
            WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
            EXECUTE FUNCTION public.rls_auto_enable();
    END IF;
END
$do$;

-- 2f. Out-of-band unique index — LIVE CAPTURED.
CREATE UNIQUE INDEX IF NOT EXISTS uq_leaderboard_weekly_snap ON public.leaderboard_weekly_snapshots USING btree (week_start_date, leaderboard_type, COALESCE(exam_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id);

-- 2g. fn_verify_and_fulfill_payment — LIVE body with the ₹ sign restored (was stored as
--     U+FFFD replacement characters by a non-UTF-8 client). No other change.
CREATE OR REPLACE FUNCTION public.fn_verify_and_fulfill_payment(p_order_id uuid, p_gateway_payment_id text, p_gateway_signature text, p_payment_method text DEFAULT 'UPI'::text, p_amount numeric DEFAULT NULL::numeric, p_billing_name text DEFAULT 'Student'::text, p_billing_address text DEFAULT NULL::text, p_billing_state text DEFAULT 'DELHI'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_order RECORD;
    v_plan RECORD;
    v_txn_id UUID;
    v_invoice_id UUID;
    v_invoice_num TEXT;
    v_entitlement_id UUID;
    v_current_expiry TIMESTAMPTZ;
    v_expires_at TIMESTAMPTZ;
    v_cgst NUMERIC(10,2) := 0.00;
    v_sgst NUMERIC(10,2) := 0.00;
    v_igst NUMERIC(10,2) := 0.00;
BEGIN
    IF p_order_id IS NULL OR p_gateway_payment_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'order_id and gateway_payment_id are required');
    END IF;

    SELECT * INTO v_order
    FROM public.payment_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment order not found');
    END IF;

    IF v_order.status = 'PAID' THEN
        RETURN jsonb_build_object('success', true, 'order_id', v_order.id, 'status', 'PAID', 'already_fulfilled', true);
    END IF;

    IF v_order.status IN ('CANCELLED', 'EXPIRED', 'REFUNDED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot fulfill order in ' || v_order.status || ' state');
    END IF;

    IF p_amount IS NOT NULL AND p_amount != v_order.total_payable_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount mismatch');
    END IF;

    INSERT INTO public.payment_transactions (
        order_id, gateway, gateway_payment_id, gateway_signature,
        payment_method, amount, currency, status, captured_at
    ) VALUES (
        v_order.id, v_order.gateway, p_gateway_payment_id, p_gateway_signature,
        p_payment_method, v_order.total_payable_amount, v_order.currency, 'SUCCESS', now()
    ) ON CONFLICT (gateway_payment_id) DO UPDATE
        SET status = 'SUCCESS', captured_at = now()
    RETURNING id INTO v_txn_id;

    UPDATE public.payment_orders
    SET status = 'PAID', updated_at = now()
    WHERE id = v_order.id;

    UPDATE public.coupon_redemptions
    SET status = 'COMMITTED', committed_at = now()
    WHERE order_id = v_order.id;

    UPDATE public.discount_coupons dc
    SET current_usage_count = current_usage_count + 1, updated_at = now()
    FROM public.coupon_redemptions cr
    WHERE cr.order_id = v_order.id AND cr.coupon_id = dc.id;

    IF v_order.order_type = 'SUBSCRIPTION_PURCHASE' THEN
        SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_order.plan_id;

        SELECT valid_until INTO v_current_expiry
        FROM public.user_entitlements
        WHERE user_id = v_order.user_id
          AND entitlement_type = 'SUBSCRIPTION'
          AND status = 'ACTIVE'
        ORDER BY valid_until DESC
        LIMIT 1;

        IF v_current_expiry IS NOT NULL AND v_current_expiry > now() THEN
            v_expires_at := v_current_expiry + (v_plan.duration_days || ' days')::interval;
        ELSE
            v_expires_at := now() + (v_plan.duration_days || ' days')::interval;
        END IF;

        INSERT INTO public.user_entitlements (
            user_id, entitlement_type, status, valid_from, valid_until
        ) VALUES (
            v_order.user_id, 'SUBSCRIPTION', 'ACTIVE', now(), v_expires_at
        ) RETURNING id INTO v_entitlement_id;

    ELSIF v_order.order_type = 'COURSE_PURCHASE' THEN
        INSERT INTO public.user_entitlements (
            user_id, entitlement_type, course_id, status, valid_from
        ) VALUES (
            v_order.user_id, 'COURSE_PURCHASE', v_order.course_id, 'ACTIVE', now()
        ) RETURNING id INTO v_entitlement_id;
    END IF;

    IF upper(trim(p_billing_state)) = 'DELHI' THEN
        v_cgst := round(v_order.tax_amount / 2.00, 2);
        v_sgst := v_order.tax_amount - v_cgst;
    ELSE
        v_igst := v_order.tax_amount;
    END IF;

    v_invoice_num := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('public.seq_invoice_number')::text, 7, '0');

    INSERT INTO public.billing_invoices (
        invoice_number, user_id, order_id, transaction_id, invoice_date,
        billing_name, billing_address, billing_state, place_of_supply,
        taxable_amount, tax_rate_pct, cgst_amount, sgst_amount, igst_amount,
        total_amount, currency, status
    ) VALUES (
        v_invoice_num, v_order.user_id, v_order.id, v_txn_id, now(),
        p_billing_name, p_billing_address, p_billing_state, p_billing_state,
        v_order.taxable_amount, v_order.tax_rate_pct, v_cgst, v_sgst, v_igst,
        v_order.total_payable_amount, v_order.currency, 'ISSUED'
    ) RETURNING id INTO v_invoice_id;

    PERFORM public.fn_send_user_notification(
        p_user_id := v_order.user_id,
        p_title := 'Payment Successful & Access Activated!',
        p_body := 'Your order ' || v_invoice_num || ' for ₹' || v_order.total_payable_amount::text || ' is confirmed. Your access is active.',
        p_category := 'SYSTEM',
        p_priority := 'HIGH',
        p_idempotency_key := 'order_success:' || v_order.id::text
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'transaction_id', v_txn_id,
        'entitlement_id', v_entitlement_id,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'status', 'PAID'
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_verify_and_fulfill_payment(uuid, text, text, text, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_verify_and_fulfill_payment(uuid, text, text, text, numeric, text, text, text) TO service_role;


-- -----------------------------------------------------------------------------
-- 3. STALE OVERLOADS (D3) — no caller in app/services/lib/actions, no SQL caller, no pg_depend.
-- -----------------------------------------------------------------------------
-- 3a. 4-arg custom practice generator (pre-013 signature). Current 5-arg version stays.
DROP FUNCTION IF EXISTS public.fn_generate_custom_practice_session(text, text, uuid[], integer);

-- 3b. 9-arg notification sender (015 signature). It made named-argument calls from
--     fn_verify_and_fulfill_payment / fn_publish_exam_announcement AMBIGUOUS (both
--     overloads matched) and was EXECUTE-able by authenticated. The 10-arg version stays.
DROP FUNCTION IF EXISTS public.fn_send_user_notification(uuid, text, text, text, text, text, text, text, jsonb);

-- End of 064.
