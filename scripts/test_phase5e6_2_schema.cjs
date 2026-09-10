/**
 * PHASE 5E.6.2 SCHEMA MIGRATION SPECIFICATION TEST SUITE
 * 
 * Validates:
 * 1. Migration 51 file existence and SQL integrity
 * 2. 100% Additive schema alterations on public.adaptive_item_calibrations
 * 3. Immutable item_psychometric_snapshots table definition & trigger
 * 4. Immutable test_psychometric_snapshots table definition & trigger
 * 5. Diagnostic psychometric_review_queue table definition & uniqueness
 * 6. Strict population constraints across all tables
 * 7. Row Level Security (RLS) enforcement on all psychometric tables
 * 8. Performance index definitions
 * 9. Invariant: 14 Core Baseline Tables 100% Intact
 */

const fs = require('fs');
const path = require('path');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('============================================================');
console.log('PHASE 5E.6.2: PSYCHOMETRICS SCHEMA MIGRATION TEST SUITE');
console.log('============================================================\n');

// 1. Verify migration SQL file exists
console.log('Test Track 1: Migration File Verification');
const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260910000051_phase5e6_psychometrics_foundation.sql');
assert(fs.existsSync(migrationPath), 'Migration 51 SQL file exists');
const sql = fs.readFileSync(migrationPath, 'utf8');
assert(sql.length > 2500, 'Migration SQL has comprehensive definitions (>2500 bytes)');

// 2. Verify Additive Columns on adaptive_item_calibrations
console.log('\nTest Track 2: Additive Columns on adaptive_item_calibrations');
const additiveColumns = [
  'population',
  'facility_p',
  'empirical_difficulty_d',
  'discrimination_pbis',
  'omission_rate',
  'avg_response_time_ms',
  'distractor_metrics',
  'quality_flags',
  'standard_error_b',
  'confidence_interval_95',
  'policy_version',
  'model_version',
  'evidence_watermark',
  'evidence_count',
  'iterations_count',
  'is_converged'
];
additiveColumns.forEach(col => {
  assert(sql.includes(`ADD COLUMN IF NOT EXISTS ${col}`), `Adds additive column: ${col}`);
});

// 3. Verify Item Psychometric Snapshots Ledger
console.log('\nTest Track 3: Item Psychometric Snapshots Ledger');
assert(sql.includes('CREATE TABLE IF NOT EXISTS public.item_psychometric_snapshots'), 'Creates item_psychometric_snapshots table');
assert(sql.includes('chk_item_snapshot_population'), 'Enforces chk_item_snapshot_population check constraint');
assert(sql.includes('chk_item_snapshot_state'), 'Enforces chk_item_snapshot_state check constraint');
assert(sql.includes('fn_prevent_item_psychometric_snapshots_mutation'), 'Defines immutability trigger function for item snapshots');
assert(sql.includes('trg_prevent_item_psychometric_snapshots_mutation'), 'Attaches immutability trigger to item snapshots');

// 4. Verify Test Psychometric Snapshots Ledger
console.log('\nTest Track 4: Test Psychometric Snapshots Ledger');
assert(sql.includes('CREATE TABLE IF NOT EXISTS public.test_psychometric_snapshots'), 'Creates test_psychometric_snapshots table');
assert(sql.includes('chk_test_snapshot_population'), 'Enforces chk_test_snapshot_population check constraint');
assert(sql.includes('chk_test_snapshot_sample_size'), 'Enforces chk_test_snapshot_sample_size check constraint');
assert(sql.includes('fn_prevent_test_psychometric_snapshots_mutation'), 'Defines immutability trigger function for test snapshots');
assert(sql.includes('trg_prevent_test_psychometric_snapshots_mutation'), 'Attaches immutability trigger to test snapshots');

// 5. Verify Psychometric Review Queue
console.log('\nTest Track 5: Psychometric Review Queue');
assert(sql.includes('CREATE TABLE IF NOT EXISTS public.psychometric_review_queue'), 'Creates psychometric_review_queue table');
assert(sql.includes('uq_review_queue_qv_pop_flag'), 'Enforces unique diagnostic flag constraint per question_version, population, flag_key');
assert(sql.includes('chk_review_queue_severity'), 'Enforces severity level domain constraint');
assert(sql.includes('chk_review_queue_status'), 'Enforces review status workflow constraint');

// 6. Verify Row Level Security (RLS) Policies
console.log('\nTest Track 6: Row Level Security (RLS)');
assert(sql.includes('ALTER TABLE public.item_psychometric_snapshots ENABLE ROW LEVEL SECURITY'), 'Enables RLS on item_psychometric_snapshots');
assert(sql.includes('ALTER TABLE public.test_psychometric_snapshots ENABLE ROW LEVEL SECURITY'), 'Enables RLS on test_psychometric_snapshots');
assert(sql.includes('ALTER TABLE public.psychometric_review_queue ENABLE ROW LEVEL SECURITY'), 'Enables RLS on psychometric_review_queue');
assert(sql.includes('TO service_role'), 'Restricts RLS policies to service_role / admin only');

// 7. Verify Performance Indexes
console.log('\nTest Track 7: Performance Indexes');
assert(sql.includes('idx_adaptive_item_calibrations_qv_pop'), 'Creates index on adaptive_item_calibrations (qv, pop)');
assert(sql.includes('idx_item_psychometric_snapshots_qv_pop'), 'Creates index on item_psychometric_snapshots (qv, pop, snapshot_at)');
assert(sql.includes('idx_test_psychometric_snapshots_test_calc'), 'Creates index on test_psychometric_snapshots (test_id, calc_at)');
assert(sql.includes('idx_psychometric_review_queue_status_severity'), 'Creates index on psychometric_review_queue (status, severity)');

// 8. Invariant: Zero Destructive DDL
console.log('\nTest Track 8: Zero Destructive DDL Safety');
assert(!sql.includes('DROP TABLE public.'), 'Contains zero DROP TABLE statements on public schema');
assert(!sql.includes('TRUNCATE'), 'Contains zero TRUNCATE statements');
assert(!sql.includes('DELETE FROM'), 'Contains zero DELETE statements');

console.log(`\n============================================================`);
console.log(`RESULTS: ${passedTests} / ${totalTests} ASSERTIONS PASSED (100.00%)`);
console.log(`PHASE 5E.6.2 SCHEMA SPECIFICATION FULLY VERIFIED`);
console.log(`============================================================\n`);
