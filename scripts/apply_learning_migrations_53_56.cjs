const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

let connectionString = null;
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'SUPABASE_DB_URL'].includes(k)) {
          connectionString = val;
        }
      }
    }
  });
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const migrationFiles = [
  '20260915000053_phase3a_learning_taxonomy_foundation.sql',
  '20260915000054_phase3b_content_artifact_and_asset_foundation.sql',
  '20260915000055_phase3c_content_compilation_and_versions.sql',
  '20260915000056_phase3d_immutability_and_deletion_guards.sql'
];

async function applyLearningMigrations() {
  if (!connectionString) {
    console.error('No PostgreSQL connection string found.');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to remote PostgreSQL database.');

  for (const filename of migrationFiles) {
    const fullPath = path.join(__dirname, '..', 'supabase', 'migrations', filename);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Migration file not found: ${fullPath}`);
    }

    const sql = fs.readFileSync(fullPath, 'utf-8');
    console.log(`\n============================================================`);
    console.log(`Applying Migration: ${filename}...`);
    console.log(`============================================================`);

    await client.query('BEGIN;');
    try {
      await client.query(sql);
      await client.query('COMMIT;');
      console.log(`[SUCCESS] Migration ${filename} applied successfully.`);
    } catch (err) {
      await client.query('ROLLBACK;');
      console.error(`[ERROR] Migration ${filename} failed:`, err);
      throw err;
    }
  }

  await client.end();
  console.log(`\nAll Learning migrations (53-56) applied successfully!`);
}

applyLearningMigrations().catch(err => {
  console.error('Fatal migration failure:', err.message);
  process.exit(1);
});
