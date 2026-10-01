const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
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
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
        if (['POSTGRES_URL_NON_POOLING', 'DATABASE_URL', 'POSTGRES_URL', 'SUPABASE_DB_URL'].includes(k) && !connectionString) connectionString = val;
      }
    }
  });
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function checkTemplates() {
  const parsed = new URL(connectionString);
  const ips = await dns.promises.resolve4(parsed.hostname).catch(() => [parsed.hostname]);
  const client = new Client({
    host: ips[0],
    port: parseInt(parsed.port || '5432', 10),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, '') || 'postgres',
    ssl: { rejectUnauthorized: false, servername: parsed.hostname },
    connectionTimeoutMillis: 30000
  });
  await client.connect();

  const tplRes = await client.query(`
    SELECT id, exam_id, title, slug, test_type, is_free, is_active 
    FROM public.mock_templates 
    LIMIT 10
  `);
  console.log('=== MOCK TEMPLATES ===');
  console.log(JSON.stringify(tplRes.rows, null, 2));

  for (const table of ['mock_tests', 'mock_sections', 'mock_questions', 'test_attempts', 'test_results']) {
    const res = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = '${table}'
      ORDER BY ordinal_position
    `);
    console.log('=== ' + table + ' ===');
    console.log(res.rows.map(r => r.column_name + ' (' + r.data_type + ', null:' + r.is_nullable + ')').join(', '));
  }

  const checkRes = await client.query(`
    SELECT conname, pg_get_constraintdef(c.oid) 
    FROM pg_constraint c 
    JOIN pg_class t ON c.conrelid = t.oid 
    WHERE t.relname = 'mock_tests'
  `);
  console.log('=== MOCK_TESTS CONSTRAINTS ===', checkRes.rows);

  await client.end();
}

checkTemplates().catch(err => console.error(err));
