/**
 * Courage Library — Full End-to-End Regression Track Runner
 * Executes all certified test suites and production runtime gates from Phase 4D.1 through Phase 5E.4.
 */

const { execSync } = require('child_process');

const suites = [
  { name: 'Phase 4D.1 — Advanced Adaptive Foundation', script: 'scripts/test_phase4d1_advanced_adaptive_foundation.cjs' },
  { name: 'Phase 4D.2 — Item Calibration & Difficulty', script: 'scripts/test_phase4d2_item_calibration.cjs' },
  { name: 'Phase 4D.3 — MLE Ability Estimation', script: 'scripts/test_phase4d3_advanced_ability_estimation.cjs' },
  { name: 'Phase 4D.4 — CAT Information Selection', script: 'scripts/test_phase4d4_cat_information_selection.cjs' },
  { name: 'Phase 4D.5 — Stopping Rules & Personalization', script: 'scripts/test_phase4d5_stopping_personalization.cjs' },
  { name: 'Phase 4D.6 — Adaptive Analytics & Telemetry', script: 'scripts/test_phase4d6_adaptive_analytics.cjs' },
  { name: 'Phase 4D.7 — Hardening & Invariants', script: 'scripts/test_phase4d7_adaptive_production_hardening.cjs' },
  { name: 'Phase 4D.7 Gate — Supabase Runtime Certification', script: 'scripts/verify_phase4d7_production_runtime_gate.cjs' },
  { name: 'Phase 5A — Live Test Foundation', script: 'scripts/test_phase5a_live_test_foundation.cjs' },
  { name: 'Phase 5B — Event Registration Engine', script: 'scripts/test_phase5b_live_test_registration.cjs' },
  { name: 'Phase 5B Gate — Live Supabase Production Gate', script: 'scripts/verify_phase5b_production_runtime_gate.cjs' },
  { name: 'Phase 5C — Live Test Runner Integration', script: 'scripts/test_phase5c_live_test_runner.cjs' },
  { name: 'Phase 5C Gate — Live Test Runner Runtime Gate', script: 'scripts/verify_phase5c_production_runtime_gate.cjs' },
  { name: 'Phase 5D — Result Engine & National Ranking', script: 'scripts/test_phase5d_result_engine.cjs' },
  { name: 'Phase 5D Gate — Result & Ranking Runtime Gate', script: 'scripts/verify_phase5d_production_runtime_gate.cjs' },
  { name: 'Phase 5E.1 — Rewards & CL Settlement', script: 'scripts/test_phase5e1_rewards.cjs' },
  { name: 'Phase 5E.1 Gate — Rewards & Settlement Runtime Gate', script: 'scripts/verify_phase5e1_production_runtime_gate.cjs' },
  { name: 'Phase 5E.2 — Certificates & Secure Verification', script: 'scripts/test_phase5e2_certificates.cjs' },
  { name: 'Phase 5E.2 Gate — Certificates Runtime Gate', script: 'scripts/verify_phase5e2_production_runtime_gate.cjs' },
  { name: 'Phase 5E.3 — Achievements & Badges Engine', script: 'scripts/test_phase5e3_achievements.cjs' },
  { name: 'Phase 5E.3 Gate — Achievements Runtime Gate', script: 'scripts/verify_phase5e3_production_runtime_gate.cjs' },
  { name: 'Phase 5E.4 — Candidate Historical Intelligence', script: 'scripts/test_phase5e4_candidate_intelligence.cjs' },
  { name: 'Phase 5E.4 Gate — Historical Intelligence Runtime Gate', script: 'scripts/verify_phase5e4_production_runtime_gate.cjs' },
  { name: 'Phase 5E.5 — Admin Competition Intelligence', script: 'scripts/test_phase5e5_admin_competition_intelligence.cjs' },
  { name: 'Phase 5E.5 Gate — Admin Intelligence Runtime Gate', script: 'scripts/verify_phase5e5_production_runtime_gate.cjs' },
];

console.log('================================================================');
console.log(' COURAGE LIBRARY — FULL TRACK END-TO-END REGRESSION');
console.log('================================================================\n');

let totalTrackTests = 0;
let totalTrackPassed = 0;
let totalTrackFailed = 0;
const results = [];

for (const suite of suites) {
  process.stdout.write(`Executing: ${suite.name} ... `);
  try {
    const output = execSync(`node "${suite.script}"`, {
      encoding: 'utf-8',
      maxBuffer: 20 * 1024 * 1024,
      env: process.env,
    });
    const passMatches = output.match(/\[PASS\]/g) || [];
    const failMatches = output.match(/\[FAIL\]/g) || [];

    const passed = passMatches.length;
    const failed = failMatches.length;
    const total = passed + failed;

    totalTrackTests += total;
    totalTrackPassed += passed;
    totalTrackFailed += failed;

    if (failed === 0 && total > 0) {
      console.log(`PASS (${passed}/${total})`);
      results.push({ name: suite.name, status: 'PASS', passed, total });
    } else {
      console.log(`FAIL (${passed}/${total})`);
      results.push({ name: suite.name, status: 'FAIL', passed, total });
    }
  } catch (err) {
    const stdout = err.stdout ? err.stdout.toString() : '';
    const passMatches = stdout.match(/\[PASS\]/g) || [];
    const failMatches = stdout.match(/\[FAIL\]/g) || [];
    const passed = passMatches.length;
    const failed = failMatches.length;
    const total = passed + failed;

    if (failed === 0 && total > 0) {
      console.log(`PASS (${passed}/${total})`);
      totalTrackTests += total;
      totalTrackPassed += passed;
      results.push({ name: suite.name, status: 'PASS', passed, total });
    } else {
      console.log(`ERROR (${err.message.slice(0, 100)})`);
      results.push({ name: suite.name, status: 'ERROR', passed, total });
      totalTrackFailed++;
    }
  }
}

console.log('\n================================================================');
console.log(' FULL REGRESSION TRACK SCORECARD');
console.log('================================================================');
results.forEach((r, idx) => {
  const num = String(idx + 1).padStart(2, '0');
  console.log(`  [${r.status}] ${num}. ${r.name.padEnd(52, ' ')} : ${r.passed}/${r.total} Tests`);
});

console.log('----------------------------------------------------------------');
console.log(`TOTAL TRACK TESTS  : ${totalTrackTests}`);
console.log(`TOTAL TRACK PASSED : ${totalTrackPassed}`);
console.log(`TOTAL TRACK FAILED : ${totalTrackFailed}`);
console.log(`SUCCESS RATE       : ${((totalTrackPassed / totalTrackTests) * 100).toFixed(2)}%`);
console.log('================================================================\n');

if (totalTrackFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
