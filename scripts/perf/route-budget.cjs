#!/usr/bin/env node
/**
 * PERF-LESSON-1: First Load JS budgets per route (scripts/perf/route-budgets.json) checked against the route table that
 * `next build` prints — the exact number Next reports, no re-derivation. Pure helpers + a CLI:
 *   node scripts/perf/route-budget.cjs --build-log <file>   → one line per budgeted route; exit 1 on a breach or a
 *                                                            budgeted route missing from the table
 * Used by BRAND2-PROBE P-07 (server-checks, after SC-BUILD: the quiet runner's $RUNNER_TEMP/ci-quiet/SC-BUILD.log).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BUDGETS = path.join(ROOT, 'scripts/perf/route-budgets.json');

const toKb = (n, unit) => (unit === 'MB' ? n * 1000 : unit === 'B' ? n / 1000 : n);

/** The route table → { route: firstLoadKb } (lines like "├ ƒ /articles/[slug]   1.34 kB   107 kB"). */
function parseFirstLoad(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^[┌├└│]\s+[○●ƒλ◐]\s+(\/\S*)\s+([\d.]+)\s+(B|kB|MB)\s+([\d.]+)\s+(B|kB|MB)\b/);
    if (m) out[m[1]] = toKb(Number(m[4]), m[5]);
  }
  return out;
}

/** Budget rows → [{ route, kb, max, baseline, ok, why }]. A budgeted route not in the table is a failure. */
function checkBudgets(budgets, measured) {
  return Object.entries(budgets.routes).map(([route, b]) => {
    const kb = measured[route];
    if (kb === undefined) return { route, kb: null, max: b.max, baseline: b.baseline, ok: false, why: 'not in the build route table' };
    return { route, kb, max: b.max, baseline: b.baseline, ok: kb <= b.max, why: kb <= b.max ? '' : `${kb} kB > budget ${b.max} kB` };
  });
}

function selfTest() {
  const table = ['┌ ƒ /                                    860 B         107 kB', '├ ƒ /articles/[slug]                    1.34 kB         118 kB', '└ ○ /robots.txt   333 B   103 kB'].join('\n');
  const m = parseFirstLoad(table);
  const rows = checkBudgets({ routes: { '/': { max: 110, baseline: 107 }, '/articles/[slug]': { max: 110, baseline: 107 }, '/learn/x': { max: 110, baseline: 0 } } }, m);
  return m['/'] === 107 && m['/articles/[slug]'] === 118 && m['/robots.txt'] === 103 && rows[0].ok && !rows[1].ok && !rows[2].ok;
}

if (require.main === module) {
  const i = process.argv.indexOf('--build-log');
  if (process.argv.includes('--self-test')) {
    const ok = selfTest();
    console.log(`route-budget self-test: ${ok ? 'OK' : 'FAIL'}`);
    process.exit(ok ? 0 : 1);
  }
  const file = i > 0 ? process.argv[i + 1] : '';
  if (!file || !fs.existsSync(file)) {
    console.log('route-budget: --build-log <file> (the `next build` output) is required');
    process.exit(2);
  }
  const rows = checkBudgets(JSON.parse(fs.readFileSync(BUDGETS, 'utf8')), parseFirstLoad(fs.readFileSync(file, 'utf8')));
  for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.route} — ${r.kb === null ? r.why : `${r.kb} kB (budget ${r.max}, baseline ${r.baseline})${r.ok ? '' : ' — ' + r.why}`}`);
  process.exit(rows.every((r) => r.ok) ? 0 : 1);
}

module.exports = { parseFirstLoad, checkBudgets, selfTest, BUDGETS };
