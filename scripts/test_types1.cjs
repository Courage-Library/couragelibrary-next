/**
 * COURAGE LIBRARY — TYPES-1 GUARDRAILS (decision #24: type truth)
 *
 *   T-01 db:types:check passes (committed types/database.ts == live public schema)        [network; --offline skips]
 *   T-02 every Supabase client factory is typed with Database (static scan)
 *   T-03 escape counts (as any / : any / unknown as / @ts-expect-error / @ts-ignore) ≤ committed ratchet; 0 @ts-ignore
 *   T-04 every @ts-expect-error carries a TYPES-1:<ID> tag
 *   T-05 docs/reports/types/TYPES1_ESCAPES.json ↔ code: every tracked escape / quarantine tag is registered and
 *        every register entry exists in code (fails on mismatch either way)
 *   T-06 gen-types ref lock: refuses fake / malformed refs (unit, no network); static safety of the script
 *   T-07 query escapes ≤ committed ratchet; no untracked query escape in files outside the ratchet's remaining scope
 *   T-08 lib/supabase/quarantine is imported only by quarantined modules; every quarantined file carries its tag
 *
 * Run: node scripts/test_types1.cjs [--offline] [--update-ratchet]
 *   --update-ratchet [--batch=<B>] rewrites TYPES1_RATCHET.json to the CURRENT counts (only allowed downwards; refuses
 *        increases — except tsExpectError when every directive is a registered TYPES-1:B-<ID>, recorded in exceptions[]).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ARGS = new Set(process.argv.slice(2));
const RATCHET = path.join(ROOT, 'docs/reports/types/TYPES1_RATCHET.json');
const REGISTER = path.join(ROOT, 'docs/reports/types/TYPES1_ESCAPES.json');
const DIRS = ['app', 'services', 'lib', 'actions', 'components'];
const QUARANTINED = /^(services\/adaptive\/|services\/admin-adaptive\.service\.ts|services\/live-test-|app\/admin\/live-tests\/|app\/live-tests\/|services\/battle\.service\.ts|app\/battles\/|app\/api\/battles\/|services\/psychometrics\.service\.ts|app\/performance\/|services\/admin-competition-intelligence\.service\.ts|services\/candidate-intelligence\.service\.ts|components\/admin\/adaptive\/|components\/admin\/live-tests\/)/;

let passed = 0;
let failed = 0;
const lines = [];
async function test(name, fn) {
  try { const info = await fn(); passed++; lines.push(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; lines.push(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 3000)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const walk = (dir, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(p, acc); } else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
};
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const FILES = DIRS.flatMap((d) => walk(path.join(ROOT, d)));
const SRC = Object.fromEntries(FILES.map((f) => [rel(f), fs.readFileSync(f, 'utf8')]));

/** Current counts — the same definition the ratchet stores. */
function counts() {
  const all = Object.values(SRC).join('\n');
  const n = (re) => (all.match(re) || []).length;
  const { scan } = require('./types1-query-escapes.cjs');
  return {
    queryEscapes: scan().length,
    asAny: n(/\bas any\b/g),
    colonAny: n(/:\s*any\b/g),
    unknownAs: n(/\bunknown as\b/g),
    tsExpectError: n(/@ts-expect-error/g),
    tsIgnore: n(/@ts-ignore/g),
  };
}

(async () => {
  const now = counts();
  if (ARGS.has('--update-ratchet')) {
    const prev = fs.existsSync(RATCHET) ? JSON.parse(fs.readFileSync(RATCHET, 'utf8')) : null;
    const exceptions = (prev && prev.exceptions) || [];
    if (prev && prev.values) {
      let up = Object.keys(now).filter((k) => now[k] > prev.values[k]);
      // Architect rule 3: an ambiguous Class B error is tracked with `@ts-expect-error TYPES-1:B-<ID>`, so
      // tsExpectError may rise — only when EVERY directive carries a Class B id registered in TYPES1_ESCAPES.json.
      if (up.includes('tsExpectError')) {
        const reg = JSON.parse(fs.readFileSync(REGISTER, 'utf8'));
        const classB = new Set(reg.escapes.filter((e) => e.class === 'B').map((e) => e.id));
        const directives = Object.values(SRC).flatMap((s) => s.split(/\r?\n/).filter((l) => /@ts-expect-error/.test(l)));
        const untracked = directives.filter((l) => !classB.has((l.match(/TYPES-1:B-[A-Z0-9-]+/) || [])[0]));
        if (untracked.length === 0) {
          const batch = (process.argv.find((a) => a.startsWith('--batch=')) || '').slice(8) || 'unspecified';
          exceptions.push({ batch, key: 'tsExpectError', from: prev.values.tsExpectError, to: now.tsExpectError, reason: 'tracked ambiguous Class B (architect rule 3); every directive carries a registered TYPES-1:B-<ID>' });
          up = up.filter((k) => k !== 'tsExpectError');
        }
      }
      if (up.length) { console.error(`refusing to raise the ratchet: ${up.map((k) => `${k} ${prev.values[k]} → ${now[k]}`).join(', ')}`); process.exit(1); }
    }
    const out = { ...(prev || {}), values: now, exceptions, updatedAt: new Date().toISOString().slice(0, 10) };
    fs.writeFileSync(RATCHET, JSON.stringify(out, null, 2) + '\n');
    console.log('ratchet updated', JSON.stringify(now));
    return;
  }
  const ratchet = JSON.parse(fs.readFileSync(RATCHET, 'utf8'));
  const register = JSON.parse(fs.readFileSync(REGISTER, 'utf8'));

  // GATE-HYGIENE-1: 0 files scanned would make T-02 … T-08 and the ratchet counts pass vacuously
  await test('T-00 minimum coverage: every scanned dir exists and holds files; ≥ 400 .ts/.tsx files', async () => {
    const empty = DIRS.filter((d) => !fs.existsSync(path.join(ROOT, d)) || walk(path.join(ROOT, d)).length === 0);
    assert(empty.length === 0 && FILES.length >= 400, `missing / empty dirs: ${empty.join(', ') || 'none'}; files ${FILES.length} (min 400)`);
    return `${FILES.length} files`;
  });

  await test('T-01 db:types:check — committed types/database.ts equals the live public schema', async () => {
    if (ARGS.has('--offline')) return 'skipped (--offline)';
    let r;
    for (let i = 1; i <= 3; i++) {
      r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/db/gen-types.cjs'), '--check'], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
      if (r.status === 0 || /differs from the live public schema|REF_LOCK/.test(r.stderr)) break;
    }
    assert(r.status === 0, (r.stderr || r.stdout).trim().slice(0, 300));
    assert(/^\/\/ GENERATED — DO NOT EDIT/.test(fs.readFileSync(path.join(ROOT, 'types/database.ts'), 'utf8')), 'generated header missing');
    return (r.stdout || '').trim().split('\n').pop();
  });

  await test('T-02 every Supabase client factory is typed with Database (or is the registered quarantine)', async () => {
    const bad = [];
    for (const [f, src] of Object.entries(SRC)) {
      src.split(/\r?\n/).forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line) || /^\s*import\b/.test(line)) return;
        const m = line.match(/\b(createServerClient|createBrowserClient|createClient)\s*(<[^>(]*>)?\s*\(/);
        if (!m) return;
        if (f === 'lib/supabase/client.ts' && /export function createClient\(/.test(line)) return; // the factory's own export
        if (/^\s*(export\s+)?(async\s+)?function\b/.test(line)) return;
        if (!m[2] || !/\bDatabase\b/.test(m[2])) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    // B1: @supabase/ssr 0.5.2 returns SupabaseClient<Database, SchemaName, Schema> (pre-2.5x generic order), which
    // supabase-js 2.109 resolves to `never` tables — the session factory must state its real typed return.
    if (!/export async function createServerSupabaseClient\(\): Promise<SupabaseClient<Database>>/.test(SRC['lib/supabase/server.ts'] || '')) bad.push('lib/supabase/server.ts: createServerSupabaseClient must return Promise<SupabaseClient<Database>>');
    // re-exported wrappers must not be untyped either
    for (const [f, src] of Object.entries(SRC)) if (/createClient\(\)\s+as\s+any/.test(src) && !QUARANTINED.test(f)) bad.push(`${f}: client factory result cast to any`);
    assert(bad.length === 0, bad.join('\n        '));
  });

  await test(`T-03 escape counts ≤ ratchet (${JSON.stringify(ratchet.values)}); 0 @ts-ignore`, async () => {
    const over = ['asAny', 'colonAny', 'unknownAs', 'tsExpectError', 'tsIgnore'].filter((k) => now[k] > ratchet.values[k]);
    assert(now.tsIgnore === 0, `@ts-ignore found: ${now.tsIgnore}`);
    assert(over.length === 0, over.map((k) => `${k}: ${now[k]} > ratchet ${ratchet.values[k]}`).join(', '));
    return JSON.stringify(now);
  });

  await test('T-04 every @ts-expect-error carries a TYPES-1:<ID> tag', async () => {
    const bad = [];
    for (const [f, src] of Object.entries(SRC)) src.split(/\r?\n/).forEach((l, i) => { if (/@ts-expect-error/.test(l) && !/@ts-expect-error\s+TYPES-1:[A-Z0-9-]+\s+\S/.test(l)) bad.push(`${f}:${i + 1}`); });
    assert(bad.length === 0, bad.join(', '));
  });

  await test('T-05 escape register ↔ code (both directions)', async () => {
    const inCode = new Map();
    for (const [f, src] of Object.entries(SRC)) {
      if (f === 'lib/supabase/quarantine.ts') continue; // the helper's documentation is not an escape
      for (const m of src.matchAll(/TYPES-1:((?:C|B)-[A-Z0-9-]+)/g)) {
        const id = `TYPES-1:${m[1]}`;
        if (!inCode.has(id)) inCode.set(id, new Set());
        inCode.get(id).add(f);
      }
    }
    const reg = new Map(register.escapes.map((e) => [e.id, e]));
    const bad = [];
    for (const [id, files] of inCode) {
      const e = reg.get(id);
      if (!e) bad.push(`unregistered: ${id} in ${[...files].join(', ')}`);
      else if (![...files].includes(e.file)) bad.push(`${id}: register file ${e.file} ≠ code ${[...files].join(', ')}`);
    }
    for (const [id, e] of reg) if (!inCode.has(id)) bad.push(`registered but not in code: ${id} (${e.file})`);
    for (const e of register.escapes) for (const k of ['id', 'file', 'class', 'module', 'owner', 'precondition']) if (!e[k]) bad.push(`${e.id}: missing ${k}`);
    assert(bad.length === 0, bad.join('\n        '));
    return `${reg.size} registered`;
  });

  await test('T-06 gen-types ref lock: fake / malformed refs refused (no network); script safety', async () => {
    const g = require('./db/gen-types.cjs');
    const refused = (ref) => { try { g.assertProjectRef(ref); return false; } catch (e) { return /REF_LOCK/.test(e.message); } };
    assert(refused('abcdefghijklmnopqrst'), 'fake 20-char ref accepted');
    assert(refused('zzzzzzzzzzzzzzzzzzzz'), 'fake ref accepted');
    assert(refused('') && refused(undefined) && refused('ABCDEFGHIJKLMNOPQRST') && refused('abc') && refused('abcdefghijklmnopqrst; rm -rf'), 'malformed ref accepted');
    assert(/^[a-f0-9]{64}$/.test(g.EXPECTED_REF_SHA256), 'fingerprint missing');
    const s = fs.readFileSync(path.join(ROOT, 'scripts/db/gen-types.cjs'), 'utf8');
    assert(/'--schema', 'public'/.test(s) && !/retired/.test(s.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')), 'schema not locked to public');
    assert(!/process\.argv\[\d\]|argv\.(?:find|indexOf)\([^)]*ref/i.test(s), 'ref read from argv');
    assert(/shell: false/.test(s), 'CLI must run without a shell');
    assert(!/console\.(log|error|warn)\([^)]*\btoken\b/.test(s), 'token may be logged');
    assert(g.scrub('x sbp_0123456789abcdefghijABCDEFGHIJ y', []) === 'x [redacted] y', 'scrub does not redact PAT shapes');
    assert(!fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).every((l) => l.trim() !== 'supabase/.temp/'), 'supabase/.temp not ignored');
  });

  await test(`T-07 query escapes ${now.queryEscapes} ≤ ratchet ${ratchet.values.queryEscapes}; untracked ones only in the ratchet's remaining scope`, async () => {
    assert(now.queryEscapes <= ratchet.values.queryEscapes, `query escapes rose: ${now.queryEscapes} > ${ratchet.values.queryEscapes}`);
    const { scan } = require('./types1-query-escapes.cjs');
    const scopes = (ratchet.remaining || []).map((r) => new RegExp(r.scope));
    const outside = scan().filter((x) => !x.tracked && !scopes.some((re) => re.test(x.file)));
    assert(outside.length === 0, `untracked query escapes outside remaining batches:\n        ${outside.slice(0, 15).map((x) => `${x.file}:${x.line} ${x.text}`).join('\n        ')}`);
  });

  await test('T-08 quarantinedClient is imported only by quarantined modules; each importer carries its TYPES-1:C tag', async () => {
    const bad = [];
    for (const [f, src] of Object.entries(SRC)) {
      if (f === 'lib/supabase/quarantine.ts') continue;
      if (!/from ["']@\/lib\/supabase\/quarantine["']/.test(src)) continue;
      if (!QUARANTINED.test(f)) bad.push(`${f}: imports the quarantine helper but is not a quarantined module`);
      if (!/TYPES-1:C-[A-Z0-9-]+/.test(src)) bad.push(`${f}: no TYPES-1:C tag`);
    }
    assert(bad.length === 0, bad.join('\n        '));
  });

  console.log(lines.join('\n'));
  console.log(`\nTYPES-1 guardrails: ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.log('SUITE ERROR', String(e && e.stack ? e.stack : e).slice(0, 1500)); process.exit(1); });
