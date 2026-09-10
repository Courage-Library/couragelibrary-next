const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[trimmed.slice(0, idx).trim()] = val;
      }
    }
  });
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const dbUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || '';

async function applyMigration() {
  if (!dbUrl) {
    console.error('No database connection URL found in .env.local');
    process.exit(1);
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to PostgreSQL database');

  const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260909000050_phase5e3_achievements_and_badges_rpc.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  console.log('Applying Migration 50: phase5e3_achievements_and_badges_rpc.sql...');
  await client.query(sql);
  console.log('Migration 50 applied successfully!');

  await client.end();
}

applyMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
