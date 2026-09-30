const fs = require('fs');
const path = require('path');
const dns = require('dns');
const { Client } = require('e:/Courage Library/node_modules/pg');

// Force IPv4 first in Node DNS
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

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
        if (['POSTGRES_URL_NON_POOLING', 'DATABASE_URL', 'POSTGRES_URL', 'SUPABASE_DB_URL'].includes(k)) {
          if (!connectionString) connectionString = val;
        }
      }
    }
  });
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function getClient() {
  // Parse URL
  const parsed = new URL(connectionString);
  const hostname = parsed.hostname;

  // Resolve IPv4 addresses
  let hostIp = hostname;
  try {
    const ips = await dns.promises.resolve4(hostname);
    if (ips && ips.length > 0) {
      hostIp = ips[0];
      console.log(`Resolved ${hostname} -> ${hostIp}`);
    }
  } catch (err) {
    console.log(`DNS resolve fallback: ${err.message}`);
  }

  const client = new Client({
    host: hostIp,
    port: parseInt(parsed.port || '5432', 10),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, '') || 'postgres',
    ssl: {
      rejectUnauthorized: false,
      servername: hostname
    },
    connectionTimeoutMillis: 15000
  });

  return client;
}

async function applyMigration() {
  if (!connectionString) {
    console.error('No PostgreSQL connection string found.');
    process.exit(1);
  }

  console.log('Connecting to remote PostgreSQL database...');
  const client = await getClient();

  await client.connect();
  console.log('Connected to remote PostgreSQL database.');

  const filename = '20261001000057_phase3r1_dynamic_syllabus_schema_foundation.sql';
  const fullPath = path.join(__dirname, '..', 'supabase', 'migrations', filename);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Migration file not found: ${fullPath}`);
  }

  const sql = fs.readFileSync(fullPath, 'utf-8');
  console.log(`\n============================================================`);
  console.log(`Applying Migration: ${filename}...`);
  console.log(`============================================================`);

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`SUCCESS: ${filename} applied successfully!`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`FAILED: ${filename}:`, err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration().catch(console.error);
