#!/usr/bin/env node
/**
 * RANGE-ERROR-1 (architect 2026-10-30) — offline gate. /admin/exams/cycles threw "RangeError: Invalid time value"
 * between 00:00 and 00:59 IST: lib/utils.ts getIstCurrentDateTime formatted the hour with hour12:false, which V8 renders
 * as "24" at midnight → "…T24:mm:ss+05:30" → an invalid date → getIstTomorrowDateStr's format() threw.
 *   T-1 every minute of a whole IST day (1 440 instants, incl. 00:00–00:59 IST): a valid timestamp equal to the real
 *       instant, an hour 00–23, the IST calendar date, and tomorrow's date — never a throw
 *   T-2 negative control: the OLD formatter (hour12:false) at 00:13 IST gives hour "24" and an invalid date on this engine
 *       (proves T-1 covers the bug); if the engine ever stops doing that, the control says so instead of passing silently
 *   T-3 no hour12:false anywhere in app / lib / services / components / actions (hourCycle "h23" instead)
 * Run: node scripts/test_ist_time.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 600)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const U = require(path.join(ROOT, 'lib/utils.ts'));
const IST_MS = 330 * 60 * 1000;
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

test('T-1 every minute of an IST day (00:00–00:59 IST included): valid timestamp, hour 00–23, IST date, tomorrow — never a throw', () => {
  const start = Date.parse('2026-10-29T18:30:00Z'); // 2026-10-30 00:00 IST
  let n = 0;
  for (let m = 0; m < 1440; m++) {
    const now = new Date(start + m * 60000);
    const r = U.getIstCurrentDateTime(now);
    const istWall = now.getTime() + IST_MS;
    assert(Number.isFinite(r.istTimestampMs) && r.istTimestampMs === Math.floor(now.getTime() / 1000) * 1000, `${now.toISOString()}: timestamp ${r.istTimestampMs}`);
    assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(r.istTimeStr) && r.istTimeStr === new Date(istWall).toISOString().slice(11, 16), `${now.toISOString()}: time ${r.istTimeStr}`);
    assert(r.istDateStr === ymd(istWall), `${now.toISOString()}: date ${r.istDateStr}`);
    assert(U.getIstTomorrowDateStr(now) === ymd(istWall + 86400000), `${now.toISOString()}: tomorrow ${U.getIstTomorrowDateStr(now)}`);
    n++;
  }
  return `${n} instants`;
});

test('T-2 negative control: the OLD hour12:false formatter at 00:13 IST gives hour "24" → an invalid date (the bug T-1 covers)', () => {
  const at = new Date('2026-10-29T18:43:00Z');
  const old = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const p = Object.fromEntries(old.formatToParts(at).map((x) => [x.type, x.value]));
  const ms = new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+05:30`).getTime();
  assert(p.hour === '24' && Number.isNaN(ms), `this engine no longer reproduces the bug (hour ${p.hour}) — re-check the control`);
  let threw = false;
  try { new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(ms + 86400000)); } catch (e) { threw = /Invalid time value/.test(e.message); }
  assert(threw, 'the old path did not throw RangeError');
  return 'old: hour "24" → NaN → RangeError';
});

test('T-3 no hour12:false in app code (hourCycle "h23")', () => {
  const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : [])) : []);
  const files = ['app', 'lib', 'services', 'components', 'actions'].flatMap((d) => walk(path.join(ROOT, d)));
  assert(files.length > 100, `scanned ${files.length}`);
  const bad = files.filter((f) => /hour12:\s*false/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(ROOT, f));
  assert(bad.length === 0, bad.join(', '));
  return `${files.length} files`;
});

console.log(`\nIST-TIME: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
