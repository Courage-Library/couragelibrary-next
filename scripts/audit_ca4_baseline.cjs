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

async function checkBaseline() {
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
  
  const tables = [
    'current_affairs_articles',
    'current_affairs_article_versions',
    'current_affairs_question_mappings',
    'current_affairs_learning_mappings',
    'current_affairs_exam_mappings',
    'current_affairs_sources',
    'questions',
    'question_versions',
    'question_options',
    'question_answers',
    'mock_tests',
    'test_attempts',
    'test_results',
    'attempt_answers',
    'user_mistake_vault',
    'user_mistake_occurrences',
    'learning_resources'
  ];
  
  console.log('=== DATABASE BASELINE AUDIT ===');
  for (const t of tables) {
    try {
      const res = await client.query(`SELECT count(*) FROM public.${t}`);
      console.log(`public.${t}: ${res.rows[0].count} rows`);
    } catch (e) {
      console.log(`public.${t}: ERROR (${e.message})`);
    }
  }
  
  // Inspect mock_tests schema columns
  const mockCols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'mock_tests'
    ORDER BY ordinal_position
  `);
  console.log('=== public.mock_tests COLUMNS ===');
  console.log(JSON.stringify(mockCols.rows, null, 2));

  for (const table of ['mock_templates', 'mock_tests', 'mock_sections', 'mock_questions']) {
    const res = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = '${table}'
      ORDER BY ordinal_position
    `);
    console.log('=== ' + table + ' ===');
    console.log(res.rows.map(r => r.column_name + ' (' + r.data_type + ', nullable: ' + r.is_nullable + ')').join(', '));
  }

  // Inspect existing mock tests
  const existingMocks = await client.query(`
    SELECT id, title, slug, status, total_questions, total_marks, duration_minutes 
    FROM public.mock_tests 
    LIMIT 10
  `);
  console.log('=== EXISTING MOCK TESTS ===');
  console.log(JSON.stringify(existingMocks.rows, null, 2));

  // Inspect mistake_vault schema columns
  const mvCols = await client.query(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'mistake_vault'
    ORDER BY ordinal_position
  `);
  console.log('=== public.mistake_vault COLUMNS ===');
  console.log(JSON.stringify(mvCols.rows, null, 2));

  await client.end();
}

checkBaseline().catch(err => console.error(err));
