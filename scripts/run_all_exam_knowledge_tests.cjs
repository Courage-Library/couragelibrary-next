const { spawn } = require('child_process');
const path = require('path');

const suites = [
  'scripts/test_phase3h1_exam_knowledge_schema.cjs',
  'scripts/test_phase3h2_exam_prompt_generator.cjs',
  'scripts/test_phase3h3_exam_knowledge_importer.cjs',
  'scripts/test_phase3h4_exam_knowledge_studio.cjs',
  'scripts/test_phase3h4_1_exam_knowledge_hardening.cjs',
  'scripts/test_phase3h4_2_production_boundary_verification.cjs',
  'scripts/test_phase3h5_1_candidate_read_service.cjs',
  'scripts/test_phase3h5_2_candidate_exam_hub_ui.cjs',
  'scripts/test_phase3h5_3_candidate_hub_certification.cjs'
];

async function runSuite(suitePath) {
  return new Promise((resolve, reject) => {
    console.log('\n============================================================');
    console.log('RUNNING SUITE: ' + suitePath);
    console.log('============================================================');

    const child = spawn('node', [suitePath], {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error('Suite ' + suitePath + ' exited with code ' + code));
      }
    });
  });
}

async function main() {
  let passedCount = 0;
  for (const s of suites) {
    try {
      await runSuite(s);
      passedCount++;
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }

  console.log('\n============================================================');
  console.log('ALL ' + passedCount + ' / ' + suites.length + ' SUITES COMPLETED WITH 100% PASS RATE');
  console.log('============================================================\n');
}

main();
