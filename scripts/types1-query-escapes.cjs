/**
 * TYPES-1: inventory of type escapes that sit directly on a Supabase query path (they defeat generated types).
 *
 * Categories (per line):
 *   CLIENT  — a Supabase client cast or annotated as any:  `(supabase as any)`, `sb = supabase as any`,
 *             `adminSb as any`, `client: any`, `supabase.rpc as any`, `const db: any = …createServerSupabaseClient()`
 *   CALL    — an escape inside `.from(…)` / `.rpc(…)` arguments
 *   RESULT  — the immediate query result cast: `data as any`, `(data as any[])`, `const { data }: any = await …`,
 *             `(await query) as any`, `res.data as unknown as …`
 *
 * Usage: node scripts/types1-query-escapes.cjs [--json] [--list]
 * Exported for scripts/test_types1.cjs.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DIRS = ['app', 'services', 'lib', 'actions', 'components'];

const CLIENT_NAMES = '(?:supabase|supabaseClient|sb|adminSb|adminClient|admin|client|db|ctx\\.supabase|this\\.supabase|this\\.supabaseClient|supabaseRaw|serviceClient|sessionClient|publicClient|svc)';
const RULES = [
  { cat: 'CLIENT', re: new RegExp(`\\b${CLIENT_NAMES}\\s+as\\s+(?:any|unknown\\s+as)`) },
  { cat: 'CLIENT', re: /\b(?:createServerSupabaseClient|createAdminServerSupabaseClient|createPublicServerSupabaseClient|createClient)\(\)\)?\s+as\s+(?:any|unknown\s+as)/ },
  { cat: 'CLIENT', re: new RegExp(`\\b${CLIENT_NAMES}\\.rpc\\s+as\\s+any`) },
  { cat: 'CLIENT', re: new RegExp(`\\b${CLIENT_NAMES}\\??:\\s*any\\b`) },
  { cat: 'CALL', re: /\.(?:from|rpc)\([^)]*\b(?:as\s+any|unknown\s+as)\b/ },
  { cat: 'RESULT', re: /\b(?:data|error|count|rows|result|res|response|qres|r)\b(?:\.data)?\s+as\s+(?:any\b|unknown\s+as)/ },
  { cat: 'RESULT', re: /\{\s*data[^}]*\}\s*:\s*any\s*=\s*await\b/ },
  { cat: 'RESULT', re: /\(\s*await\s+[^;]*\.(?:from|rpc)\([^;]*\)\s*as\s+(?:any|unknown\s+as)/ },
];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(p, acc); } else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/** Returns [{ file, line, cat, text, tracked }] — tracked = previous line carries a TYPES-1:<ID> escape. */
function scan() {
  const out = [];
  for (const f of DIRS.flatMap((d) => walk(path.join(ROOT, d)))) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    lines.forEach((text, i) => {
      if (/^\s*(\/\/|\*)/.test(text)) return;
      const rule = RULES.find((r) => r.re.test(text));
      if (!rule) return;
      const tracked = /TYPES-1:[A-Z0-9-]+/.test(lines[i - 1] || '') || /TYPES-1:[A-Z0-9-]+/.test(text);
      out.push({ file: rel, line: i + 1, cat: rule.cat, text: text.trim().slice(0, 160), tracked });
    });
  }
  return out;
}

if (require.main === module) {
  const all = scan();
  const byCat = all.reduce((a, x) => ((a[x.cat] = (a[x.cat] || 0) + 1), a), {});
  const byFile = all.reduce((a, x) => ((a[x.file] = (a[x.file] || 0) + 1), a), {});
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ total: all.length, byCat, byFile }, null, 1)); return; }
  console.log(`query escapes: ${all.length} (untracked ${all.filter((x) => !x.tracked).length}) ${JSON.stringify(byCat)}`);
  console.log(`files: ${Object.keys(byFile).length}`);
  Object.entries(byFile).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`  ${String(n).padStart(4)}  ${f}`));
  if (process.argv.includes('--list')) all.forEach((x) => console.log(`${x.file}:${x.line} [${x.cat}] ${x.text}`));
}
module.exports = { scan };
