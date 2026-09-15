const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const scriptsDir = path.join(__dirname);
const files = fs.readdirSync(scriptsDir)
  .filter(f => f.startsWith('test_') && f.endsWith('.cjs') && f !== 'test_insert_status.cjs')
  .sort();

console.log('============================================================');
console.log(`RUNNING FULL PLATFORM REGRESSION (${files.length} TEST SUITES)`);
console.log('============================================================\n');

let passedSuites = 0;
let failedSuites = 0;
const failures = [];

const startTime = Date.now();

for (const file of files) {
  const filePath = path.join(scriptsDir, file);
  process.stdout.write(`▶ Running ${file.padEnd(50)} `);
  const suiteStart = Date.now();
  try {
    const output = execSync(`node "${filePath}"`, {
      encoding: 'utf8',
      env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const duration = Date.now() - suiteStart;
    console.log(`✓ PASS (${duration}ms)`);
    passedSuites++;
  } catch (err) {
    const duration = Date.now() - suiteStart;
    console.log(`✗ FAIL (${duration}ms)`);
    failedSuites++;
    failures.push({ file, error: err.stderr || err.stdout || err.message });
  }
}

const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

console.log('\n============================================================');
console.log('PLATFORM REGRESSION SUMMARY:');
console.log(`  - Total Suites:  ${files.length}`);
console.log(`  - Passed Suites: ${passedSuites}`);
console.log(`  - Failed Suites: ${failedSuites}`);
console.log(`  - Total Time:    ${totalDuration}s`);
console.log('============================================================');

if (failedSuites > 0) {
  console.error('\nFAILURES DETECTED:');
  for (const f of failures) {
    console.error(`\n--- [${f.file}] ---`);
    console.error(f.error);
  }
  process.exit(1);
} else {
  console.log('\nALL PLATFORM TEST SUITES PASSED (100% REGRESSION-FREE)!');
  process.exit(0);
}
