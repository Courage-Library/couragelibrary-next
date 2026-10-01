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

async function checkColumns() {
  const client = new Client({
    connectionString: env.POSTGRES_URL_NON_POOLING,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const tables = [
    'test_attempts',
    'user_exam_goals',
    'mock_templates',
    'exam_sources',
    'exam_claims',
    'exam_posts',
    'curriculum_blueprints',
    'exam_announcements',
    'exam_canonical_syllabi'
  ];

  for (const table of tables) {
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
    `, [table]);
    console.log(`Table ${table} columns:`, res.rows.map(r => r.column_name));
  }

  await client.end();
}

checkColumns().catch(console.error);
