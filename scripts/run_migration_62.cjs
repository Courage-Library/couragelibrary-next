const fs = require('fs');
const path = require('path');
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

const postgresUrl = env.POSTGRES_URL_NON_POOLING;
if (!postgresUrl) {
  console.error('POSTGRES_URL_NON_POOLING not found in .env.local');
  process.exit(1);
}

async function runMigration() {
  const client = new Client({
    connectionString: postgresUrl,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to PostgreSQL successfully.');

  const migrationSql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20261002000062_controlled_exam_deletion_cascade.sql'),
    'utf-8'
  );

  console.log('Executing migration 20261002000062_controlled_exam_deletion_cascade.sql...');
  await client.query(migrationSql);
  console.log('Migration executed successfully!');

  await client.end();
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
