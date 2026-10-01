const fs = require('fs');
const { Client } = require('pg');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      env[trimmed.slice(0, idx).trim()] = val;
    }
  }
});

async function checkExamChildRows() {
  const client = new Client({
    connectionString: env.POSTGRES_URL_NON_POOLING,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const examId = '16ddb81c-cb15-4ff1-ae6c-53c0dcb080ce';
  const { rows: cycles } = await client.query('SELECT id FROM exam_cycles WHERE exam_id = $1', [examId]);
  const cycleIds = cycles.map(c => c.id);
  console.log('Cycle IDs:', cycleIds);

  const tables = [
    'exam_patterns',
    'exam_syllabi',
    'exam_topics',
    'exam_knowledge_documents',
    'exam_doc_versions',
    'exam_cutoff_benchmarks',
    'exam_announcements',
    'exam_sources',
    'exam_claims',
    'exam_syllabus_versions',
    'exam_posts'
  ];

  for (const table of tables) {
    try {
      const res = await client.query(`SELECT count(*) FROM ${table} WHERE exam_id = $1`, [examId]);
      console.log(`${table} (by exam_id):`, res.rows[0].count);
    } catch {
      try {
        if (cycleIds.length > 0) {
          const res = await client.query(`SELECT count(*) FROM ${table} WHERE exam_cycle_id = ANY($1)`, [cycleIds]);
          console.log(`${table} (by exam_cycle_id):`, res.rows[0].count);
        }
      } catch (e) {
        console.log(`${table}: error - ${e.message}`);
      }
    }
  }

  await client.end();
}

checkExamChildRows().catch(console.error);
