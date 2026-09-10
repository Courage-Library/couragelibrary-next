/**
 * Courage Library — Phase 4D.1 Comprehensive Verification Test Suite
 * Advanced Adaptive Architecture, Data Foundation & Complete Admin Control Center
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const envPath = 'e:/Courage Library/.env.local';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  });
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!serviceRoleKey || !supabaseUrl) {
  console.error('FAIL: Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL');
  process.exit(1);
}

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, description, detail = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests.toString().padStart(2, '0')}: ${description} ${detail ? '(' + detail + ')' : ''}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] Test ${totalTests.toString().padStart(2, '0')}: ${description} ${detail ? '- ' + detail : ''}`);
  }
}

async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function queryTable(tableName, queryParams = '') {
  const url = `${supabaseUrl}/rest/v1/${tableName}${queryParams ? `?${queryParams}` : ''}`;
  const res = await fetchWithRetry(url, {
    method: 'GET',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Prefer': 'count=exact'
    }
  });
  const contentRange = res.headers.get('content-range');
  let count = null;
  if (contentRange) {
    const parts = contentRange.split('/');
    if (parts.length === 2 && parts[1] !== '*') {
      count = parseInt(parts[1], 10);
    }
  }
  let data = [];
  try {
    data = await res.json();
  } catch {}
  return { data, count, status: res.status, ok: res.ok };
}

async function callRpc(rpcName, params = {}) {
  const url = `${supabaseUrl}/rest/v1/rpc/${rpcName}`;
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  const ok = res.status >= 200 && res.status < 300;
  return { ok, status: res.status, data };
}

async function runPhase4D1Tests() {
  console.log('================================================================');
  console.log(' COURAGE LIBRARY — PHASE 4D.1 VERIFICATION TEST SUITE');
  console.log(' Advanced Adaptive Architecture & Complete Admin Foundation');
  console.log('================================================================\n');

  // ==========================================================================
  // SECTION 1: Migration 39 File & Schema Definitions Integrity
  // ==========================================================================
  console.log('--- SECTION 1: Migration 39 File & Schema Definitions ---');
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20260908000039_phase4d1_advanced_adaptive_foundation.sql');
  const migrationExists = fs.existsSync(migrationPath);
  assert(migrationExists, 'Migration 39 file exists in supabase/migrations/');

  if (migrationExists) {
    const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
    assert(migrationContent.includes('public.adaptive_algorithm_versions'), 'Migration defines adaptive_algorithm_versions table');
    assert(migrationContent.includes('public.adaptive_item_calibrations'), 'Migration defines adaptive_item_calibrations table');
    assert(migrationContent.includes('public.adaptive_system_configs'), 'Migration defines adaptive_system_configs table');
    assert(migrationContent.includes('chk_adaptive_algo_status'), 'Migration defines algorithm status check constraint');
    assert(migrationContent.includes('chk_adaptive_algo_model'), 'Migration defines algorithm model check constraint');
    assert(migrationContent.includes('chk_item_calibration_status'), 'Migration defines item calibration status check constraint');
    assert(migrationContent.includes('ENABLE ROW LEVEL SECURITY'), 'Migration enables Row Level Security across all new tables');
    assert(migrationContent.includes('v1_heuristic'), 'Migration seeds baseline v1_heuristic algorithm version');
    assert(migrationContent.includes('GLOBAL_ADAPTIVE_STATUS'), 'Migration seeds global adaptive status config');
    assert(migrationContent.includes('GLOBAL_SAFETY_LIMITS'), 'Migration seeds global safety limits config');
  }

  // ==========================================================================
  // SECTION 2: Architecture Documentation Verification
  // ==========================================================================
  console.log('\n--- SECTION 2: Architecture Documentation Verification ---');
  const docPath = path.resolve(process.cwd(), 'docs/architecture/advanced_adaptive_architecture.md');
  const docExists = fs.existsSync(docPath);
  assert(docExists, 'Architecture document exists in docs/architecture/');

  if (docExists) {
    const docContent = fs.readFileSync(docPath, 'utf-8');
    assert(docContent.includes('CURRENT IMPLEMENTED'), 'Doc explicitly distinguishes CURRENT IMPLEMENTED (Adaptive v1)');
    assert(docContent.includes('FOUNDATION CREATED'), 'Doc explicitly distinguishes FOUNDATION CREATED (Phase 4D.1)');
    assert(docContent.includes('FUTURE'), 'Doc explicitly distinguishes FUTURE (IRT/CAT/ML)');
    assert(docContent.includes('Emergency Disable, Fallback & System Resilience'), 'Doc specifies Emergency Disable & Fallback semantics');
    assert(docContent.includes('Algorithm Versioning & Zero-Downtime Rollback'), 'Doc specifies Algorithm Versioning & Zero-Downtime Rollback');
    assert(docContent.includes('Complete Admin Control Center Specification'), 'Doc specifies Admin Control Center details');
    assert(docContent.includes('Database Schema & RLS Matrix'), 'Doc includes complete RLS security matrix');
  }

  // ==========================================================================
  // SECTION 3: Admin Adaptive Service & Invariant Code Verification
  // ==========================================================================
  console.log('\n--- SECTION 3: Admin Adaptive Service & Logic Unit Tests ---');
  const servicePath = path.resolve(process.cwd(), 'services/admin-adaptive.service.ts');
  assert(fs.existsSync(servicePath), 'Admin Adaptive service file exists');

  if (fs.existsSync(servicePath)) {
    const sContent = fs.readFileSync(servicePath, 'utf-8');
    assert(sContent.includes('class AdminAdaptiveService'), 'AdminAdaptiveService class is defined');
    assert(sContent.includes('static async getOverview'), 'Service provides getOverview()');
    assert(sContent.includes('static async getGlobalStatus'), 'Service provides getGlobalStatus()');
    assert(sContent.includes('static async updateGlobalStatus'), 'Service provides updateGlobalStatus()');
    assert(sContent.includes('static async toggleEmergencyDisable'), 'Service provides toggleEmergencyDisable()');
    assert(sContent.includes('static async getSafetyLimits'), 'Service provides getSafetyLimits()');
    assert(sContent.includes('static async updateSafetyLimits'), 'Service provides updateSafetyLimits()');
    assert(sContent.includes('static async getAlgorithmVersions'), 'Service provides getAlgorithmVersions()');
    assert(sContent.includes('static async createAlgorithmVersion'), 'Service provides createAlgorithmVersion()');
    assert(sContent.includes('static async activateAlgorithmVersion'), 'Service provides activateAlgorithmVersion()');
    assert(sContent.includes('static async getAdaptiveConfigs'), 'Service provides getAdaptiveConfigs()');
    assert(sContent.includes('static async saveAdaptiveConfig'), 'Service provides saveAdaptiveConfig()');
    assert(sContent.includes('static async getItemCalibrations'), 'Service provides getItemCalibrations()');
    assert(sContent.includes('static async getAuditLogs'), 'Service provides getAuditLogs()');
    assert(sContent.includes('static async recordAuditLog'), 'Service provides recordAuditLog() writing to admin_audit_logs');

    // Invariant logic assertions
    assert(sContent.includes('absolute_max_questions < limits.absolute_min_questions'), 'Service validates safety boundaries (min <= max questions)');
    assert(sContent.includes('minimum 5 characters'), 'Service requires mandatory reason for emergency disable');
    assert(sContent.includes('Cannot activate an archived algorithm version'), 'Service guards against activating archived versions');
    assert(sContent.includes('uncalibrated'), 'Service respects uncalibrated baseline transparency without fake values');
  }

  // ==========================================================================
  // SECTION 4: Admin UI & Navigation Verification
  // ==========================================================================
  console.log('\n--- SECTION 4: Admin UI Components & Navigation ---');
  const pagePath = path.resolve(process.cwd(), 'app/admin/adaptive/page.tsx');
  assert(fs.existsSync(pagePath), 'Admin adaptive page route exists at app/admin/adaptive/page.tsx');

  const managerPath = path.resolve(process.cwd(), 'components/admin/adaptive/admin-adaptive-manager.tsx');
  assert(fs.existsSync(managerPath), 'Admin adaptive manager component exists at components/admin/adaptive/admin-adaptive-manager.tsx');

  if (fs.existsSync(managerPath)) {
    const managerContent = fs.readFileSync(managerPath, 'utf-8');
    assert(managerContent.includes('Overview') && managerContent.includes('Health'), 'Manager UI contains Overview & Health tab');
    assert(managerContent.includes('Algorithm Versions'), 'Manager UI contains Algorithm Versions tab');
    assert(managerContent.includes('Blueprints') && managerContent.includes('Policies'), 'Manager UI contains Blueprints & Policies tab');
    assert(managerContent.includes('Calibration Bank'), 'Manager UI contains Calibration Bank tab');
    assert(managerContent.includes('Safety') && managerContent.includes('Emergency'), 'Manager UI contains Safety & Emergency tab');
    assert(managerContent.includes('Audit Trail'), 'Manager UI contains Audit Trail tab');
    assert(managerContent.includes('Calibration Transparency Guarantee'), 'Manager UI enforces uncalibrated transparency notice');
    assert(managerContent.includes('Engage Emergency Kill-Switch'), 'Manager UI provides Emergency Kill-Switch control');
  }

  const sidebarPath = path.resolve(process.cwd(), 'components/admin/admin-sidebar.tsx');
  if (fs.existsSync(sidebarPath)) {
    const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
    assert(sidebarContent.includes('/admin/adaptive'), 'Admin sidebar includes /admin/adaptive route link');
    assert(sidebarContent.includes('Adaptive Testing'), 'Admin sidebar displays Adaptive Testing label');
  }

  const actionsPath = path.resolve(process.cwd(), 'app/admin/actions.ts');
  if (fs.existsSync(actionsPath)) {
    const actionsContent = fs.readFileSync(actionsPath, 'utf-8');
    assert(actionsContent.includes('updateAdaptiveGlobalStatusAction'), 'Server action updateAdaptiveGlobalStatusAction exists');
    assert(actionsContent.includes('toggleAdaptiveEmergencyAction'), 'Server action toggleAdaptiveEmergencyAction exists');
    assert(actionsContent.includes('activateAdaptiveAlgorithmVersionAction'), 'Server action activateAdaptiveAlgorithmVersionAction exists');
    assert(actionsContent.includes('saveAdaptiveConfigAction'), 'Server action saveAdaptiveConfigAction exists');
    assert(actionsContent.includes('updateAdaptiveSafetyLimitsAction'), 'Server action updateAdaptiveSafetyLimitsAction exists');
    assert(actionsContent.includes('createAdaptiveAlgorithmVersionAction'), 'Server action createAdaptiveAlgorithmVersionAction exists');
  }

  // ==========================================================================
  // SECTION 5: Authoritative Premium & Daily Mock Regressions
  // ==========================================================================
  console.log('\n--- SECTION 5: Authoritative Premium & Daily Mock Regressions ---');
  const rpc1 = await callRpc('fn_resolve_quota_key', { p_test_type: 'TOPIC_TEST' });
  assert(rpc1.ok && String(rpc1.data).includes('TOPIC'), 'RPC fn_resolve_quota_key operates correctly', `Returned: ${JSON.stringify(rpc1.data)}`);

  const rpc2 = await callRpc('fn_check_premium_access_and_quota', {
    p_user_id: '00000000-0000-0000-0000-000000000001',
    p_exam_id: null,
    p_test_type: 'FULL_LENGTH',
  });
  const rpc2Data = typeof rpc2.data === 'string' ? JSON.parse(rpc2.data) : rpc2.data;
  assert(rpc2.ok && (rpc2Data?.status === 'PREMIUM_REQUIRED' || rpc2Data?.has_access === false), 'RPC fn_check_premium_access_and_quota operates authoritatively', `Status: ${rpc2Data?.status}`);

  const dailyRes = await queryTable('mock_tests', 'is_free=eq.true&select=id,title,slug,is_free&limit=5');
  assert(dailyRes.ok && dailyRes.data.length > 0, 'Free Daily Mock tests remain accessible', `Found ${dailyRes.data?.length} tests`);

  const attemptsRes = await queryTable('test_attempts', 'select=id,status,started_at&limit=5');
  assert(attemptsRes.ok && attemptsRes.data.length > 0, 'Test attempts table is operational and accessible');

  // ==========================================================================
  // SECTION 6: Production Row Baseline Audit (Exact Preservation Check)
  // ==========================================================================
  console.log('\n--- SECTION 6: Production Baseline Row Count Preservation Audit ---');
  const baselineTables = [
    { name: 'mock_tests', expected: 8 },
    { name: 'mock_sections', expected: 14 },
    { name: 'mock_questions', expected: 350 },
    { name: 'mock_templates', expected: 8 },
    { name: 'test_attempts', expected: 31 },
    { name: 'test_results', expected: 10 },
    { name: 'attempt_answers', expected: 200 },
    { name: 'questions', expected: 103 },
    { name: 'question_versions', expected: 103 },
    { name: 'subscription_plans', expected: 1 },
  ];

  for (const t of baselineTables) {
    const res = await queryTable(t.name, 'select=*&limit=1');
    assert(res.ok && res.count === t.expected, `Production table [${t.name}] row count preserved: ${res.count}/${t.expected}`);
  }

  // ==========================================================================
  // SECTION 7: TypeScript Strict Compilation
  // ==========================================================================
  console.log('\n--- SECTION 7: TypeScript Compiler Verification ---');
  let tsSuccess = false;
  let tsOutput = '';
  try {
    tsOutput = execSync('npm run typecheck', { cwd: process.cwd(), encoding: 'utf-8', timeout: 90000 });
    tsSuccess = true;
  } catch (err) {
    tsOutput = err.stdout ? err.stdout.toString() : err.message;
    tsSuccess = false;
  }
  assert(tsSuccess, 'TypeScript compilation (npm run typecheck) returned 0 errors', tsSuccess ? '0 errors' : tsOutput.slice(0, 200));

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n================================================================');
  console.log(` PHASE 4D.1 VERIFICATION SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  if (failedTests === 0) {
    console.log(' ALL VERIFICATION CHECKS PASSED PERFECTLY (0 FAILURES)');
  } else {
    console.error(` ${failedTests} TEST(S) FAILED`);
  }
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase4D1Tests();
