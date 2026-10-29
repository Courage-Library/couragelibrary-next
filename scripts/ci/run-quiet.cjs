/**
 * PUBLIC-HARDEN-1 (#57 public repo) — run one gate with its output CAPTURED, never printed.
 * Usage: node scripts/ci/run-quiet.cjs --id <GATE-ID> [--timeout <s>] -- <command> [args...]
 *        node scripts/ci/run-quiet.cjs --self-test
 * - stdout + stderr go to $RUNNER_TEMP/ci-quiet/<GATE-ID>.log (os.tmpdir() locally); the runner discards it at job end
 * - the captured file is log-scanned FIRST; on any finding the gate FAILs and prints no output at all
 * - otherwise prints ONE summary line: <ID> PASS|FAIL exit <code> — passed n/m · fail-lines f · warns w · failing [check IDs]
 *   (check IDs = the first token after "FAIL" when it is an ID like P-9 / K-14 / L-03a or a route path) — never detail text
 * - CI-1: when a failing gate printed NO summary lines (a startup crash), one SAFE diagnostic token is appended:
 *   MISSING_ENV:<VAR[,VAR]> | TLS_CA_MISSING | REF_LOCK | TARGET_REF_MISMATCH | CRASH:<ErrorClass>[/<CODE>][@<frame>] | CRASH:UNKNOWN.
 *   CI-FLAKE-1: <frame> = the FILE PATH of the error's first stack frame only (repo-relative, or from node_modules/ on;
 *   no line numbers, no message text; a path outside the repo is "external").
 *   Names only (strict charset), never values; the token itself is run through the log scan (any hit → CRASH:REDACTED).
 * - CI-FLAKE-1 build diagnostics (opt-in, for `next build` steps):
 *   --build-diag   on a failure prints "<ID> crash-route: <route>" (the page Next was prerendering / collecting, a route
 *                  path only) and "<ID> build-diag: node · next · cpus · memory (total / free at start / MIN free while
 *                  running / free at end, MB)" — numbers and versions only
 *   --keep-log <d> on a failure writes <d>/<ID>.sanitized.log: the full log with every line that the log scan flags
 *                  (secret values, hosts, IPs, JWTs, DB URLs, keys) or that looks like an env assignment replaced by a
 *                  "[redacted …]" marker — for the failure-only CI artifact (public repo: nothing secret, no env)
 * - exit code = the gate's (1 if the scan fails, 124 on timeout)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { scan, scanLine, secretValues } = require('./log-scan.cjs');

function summarize(text) {
  const lines = text.split(/\r?\n/);
  const passLines = lines.filter((l) => /^\s*PASS\s/.test(l)).length;
  const failLines = lines.filter((l) => /^\s*FAIL\s/.test(l));
  const warns = lines.filter((l) => /\bWARN\b/.test(l)).length;
  const ids = [...new Set(failLines.map((l) => {
    const tok = l.replace(/^\s*FAIL\s+/, '').split(/\s+/)[0] || '';
    return /^([A-Z][A-Za-z0-9]*(-[A-Za-z0-9]+)*|\/[A-Za-z0-9/_[\]-]*)$/.test(tok) ? tok.replace(/[0-9a-f-]{36}/g, '[id]') : 'unnamed';
  }))];
  const totals = [...text.matchAll(/(\d+)\/(\d+) passed/g)].pop();
  return { passLines, failLines: failLines.length, warns, ids, totals: totals ? `${totals[1]}/${totals[2]}` : null };
}

const SAFE_TOKEN = /^(MISSING_ENV:[A-Z][A-Z0-9_]{1,40}(,[A-Z][A-Z0-9_]{1,40}){0,2}|TLS_CA_MISSING|REF_LOCK|TARGET_REF_MISMATCH|CRASH:[A-Z][A-Za-z]{0,40}(\/[A-Z][A-Z0-9_]{1,40})?(@[A-Za-z0-9_./()[\]-]{1,120})?|CRASH:UNKNOWN|CRASH:REDACTED)$/;

/** CI-FLAKE-1 (pure): the file path of the first stack frame after `from`, made safe — repo-relative or from node_modules/ on. */
function firstFrame(t, from, cwd = process.cwd()) {
  const line = (t.slice(from).match(/^\s+at\s+([^\r\n]+)$/m) || [])[1]; // the FIRST frame only
  const m = line && (line.match(/\((?:file:\/\/)?([^()\r\n]+?)(?::\d+){1,2}\)\s*$/) || line.match(/^(?:file:\/\/)?(\S+?)(?::\d+){1,2}\s*$/));
  if (!m) return null;
  let f = m[1].replace(/\\/g, '/').replace(/^webpack-internal:\/\/\/(\([a-z-]+\)\/)?\.?\/?/, '');
  const root = cwd.replace(/\\/g, '/').replace(/\/?$/, '/');
  const nm = f.lastIndexOf('node_modules/');
  if (nm >= 0) f = f.slice(nm);
  else if (f.startsWith(root)) f = f.slice(root.length);
  else if (/^(\/|[A-Za-z]:\/)/.test(f)) f = 'external';
  if (f.startsWith('node:')) f = f.replace(':', '-');
  return /^[A-Za-z0-9_./()[\]-]{1,120}$/.test(f) ? f : null;
}

/**
 * Pure: the safe diagnostic token for a gate that failed without printing any summary line, else null.
 * Only names are extracted (env var names, error classes, error codes); the result must match SAFE_TOKEN and pass the
 * log scan against the job's secret values, otherwise it degrades to CRASH:REDACTED.
 */
function crashToken(text, exit, summary, secrets = []) {
  if (exit === 0 || summary.passLines > 0 || summary.failLines > 0) return null;
  const t = String(text || '');
  let tok = null;
  const envLine = t.match(/\bENV_MISSING\b[: ]*([^\r\n]*)/);
  if (envLine) {
    const names = [...new Set((envLine[1].match(/\b[A-Z][A-Z0-9_]{1,40}\b/g) || []).filter((n) => n.includes('_')))].slice(0, 3);
    tok = names.length ? `MISSING_ENV:${names.join(',')}` : 'CRASH:Error/ENV_MISSING'; // e.g. ".env.local not found"
  } else {
    const known = t.match(/\b(TLS_CA_MISSING|REF_LOCK|TARGET_REF_MISMATCH)\b/);
    if (known) tok = known[1];
    else {
      const hit = t.match(/^\s*(?:Uncaught\s+)?((?:[A-Z][A-Za-z]{0,38})?Error)\b/m) || t.match(/\b((?:[A-Z][A-Za-z]{0,38})?Error)\b/);
      const cls = (hit || [])[1];
      const code = (t.match(/\bcode:\s*'([A-Z][A-Z0-9_]{1,40})'/) || [])[1];
      const frame = hit ? firstFrame(t, hit.index) : null;
      tok = cls ? `CRASH:${cls}${code ? `/${code}` : ''}${frame ? `@${frame}` : ''}` : 'CRASH:UNKNOWN';
    }
  }
  if (!SAFE_TOKEN.test(tok) || scanLine(tok, secrets).length) return 'CRASH:REDACTED';
  return tok;
}

/**
 * CI-FLAKE-1 (pure; opt-in --crash-message, used on SC-BUILD only — that job runs with fake env, no secrets): for a
 * crash (no summary lines) the first "<Class>: <message>" line, control characters stripped, ≤ 200 chars — printed ONLY
 * if the log scan finds nothing in it (secret values, hosts, JWTs, DB URLs, IPs, keys); otherwise "REDACTED [classes]".
 */
function crashMessage(text, exit, summary, secrets = []) {
  if (exit === 0 || summary.passLines > 0 || summary.failLines > 0) return null;
  const m = String(text || '').match(/^\s*(?:Uncaught\s+)?((?:[A-Z][A-Za-z]{0,38})?Error)\b:?[ \t]*([^\r\n]*)$/m);
  if (!m) return null;
  const line = `${m[1]}: ${m[2]}`.replace(/[\u0000-\u001f\u007f]|\u001b\[[0-9;]*m/g, '').trim().slice(0, 200);
  const hits = scanLine(line, secrets);
  return hits.length ? `REDACTED [${[...new Set(hits)].join(', ')}]` : line;
}

/** CI-FLAKE-1 (pure): the route Next.js was building when it failed (a path only), else null. */
function crashRoute(text) {
  const t = String(text || '');
  const m = t.match(/Error occurred prerendering page "([^"\r\n]{1,160})"/) || t.match(/Export encountered an error on ([^\s,]{1,160})/)
    || t.match(/Failed to collect page data for ([^\s,]{1,160})/) || t.match(/Static page generation for ([^\s,]{1,160}) is still timing out/);
  if (m) {
    const r0 = m[1].replace(/^\/?(?:app)?/, '/').replace(/\/(page|route)(:.*)?$/, '');
    // "[Error: Failed to collect page data for /x]" — drop an unbalanced closing bracket ("/a/[slug]" keeps its own)
    const r = (r0.match(/\]/g) || []).length > (r0.match(/\[/g) || []).length ? r0.slice(0, -1) : r0;
    return /^\/[A-Za-z0-9_./[\]()-]{0,120}$/.test(r) ? r : null;
  }
  if (/Failed to fetch (?:font|`[^`]{1,60}` from Google Fonts)/.test(t)) return 'next/font (Google Fonts download)';
  return null;
}

const ENV_ASSIGN = /^\s*(?:export\s+)?[A-Z][A-Z0-9_]{2,}\s*[=:]\s*\S/;
/** CI-FLAKE-1 (pure): the log with every flagged / env-looking line replaced (for the failure-only artifact). */
function sanitizeLog(text, secrets = []) {
  const lines = String(text || '').split(/\r?\n/);
  let redacted = 0;
  const out = lines.map((l) => {
    const hits = scanLine(l, secrets);
    if (hits.length) { redacted++; return `[redacted line: ${[...new Set(hits)].join(', ')}]`; }
    if (ENV_ASSIGN.test(l)) { redacted++; return '[redacted line: env]'; }
    return l.replace(/[\u0000-\u0008\u000b-\u001f\u007f]|\u001b\[[0-9;]*m/g, '');
  });
  const MAX = 2 * 1024 * 1024;
  let body = out.join('\n');
  if (body.length > MAX) body = body.slice(0, MAX / 2) + '\n[… middle of the log cut …]\n' + body.slice(-MAX / 2);
  return { text: body + '\n', redacted };
}

function selfTest() {
  const secrets = ['FAKE_SECRET_VALUE_0123456789', 'SUPER_SECRET_PASSWORD_VALUE'];
  const S = { passLines: 0, failLines: 0 };
  const cases = [
    ["Error: ENV_MISSING: NEXT_PUBLIC_SUPABASE_URL / POSTGRES_URL_NON_POOLING\n    at refFromEnv (gen-types.cjs:37:23)", 1, S, 'MISSING_ENV:NEXT_PUBLIC_SUPABASE_URL,POSTGRES_URL_NON_POOLING'],
    ['Error: ENV_MISSING: .env.local not found', 1, S, 'CRASH:Error/ENV_MISSING'],
    ['Error: TLS_CA_MISSING: PROD_CA_PATH not set or file not found', 1, S, 'TLS_CA_MISSING'],
    ["TypeError: fetch failed\n  [cause]: Error: connect\n    code: 'UND_ERR_CONNECT_TIMEOUT'", 1, S, 'CRASH:TypeError/UND_ERR_CONNECT_TIMEOUT'],
    ["Error: Cannot find module 'x'\n  code: 'MODULE_NOT_FOUND'", 1, S, 'CRASH:Error/MODULE_NOT_FOUND'],
    ['something odd happened', 1, S, 'CRASH:UNKNOWN'],
    // CI-FLAKE-1: class + first frame FILE only (no line/col, no message, no absolute path)
    [`TypeError: Cannot read properties of undefined (reading 'x')\n    at f (${process.cwd()}/.next/server/chunks/611.js:1:2345)\n    at g (/x/y.js:1:1)`, 1, S, 'CRASH:TypeError@.next/server/chunks/611.js'],
    ['TypeError: fetch failed\n    at node:internal/deps/undici/undici:13502:13', 1, S, 'CRASH:TypeError@node-internal/deps/undici/undici'],
    ['TypeError: x\n    at Object.<anonymous> (/opt/hostedtoolcache/x/lib/node_modules/next/dist/build/index.js:9:9)', 1, S, 'CRASH:TypeError@node_modules/next/dist/build/index.js'],
    ['TypeError: x\n    at run (/home/someone/secret-place/build.js:9:9)', 1, S, 'CRASH:TypeError@external'],
    // a value that is a secret must never come out — even if it looks like an env var name
    ['Error: ENV_MISSING: SUPER_SECRET_PASSWORD_VALUE', 1, S, 'CRASH:REDACTED'],
    // hosts / JWTs / urls in the crash text are never part of the token
    ['Error: ENV_MISSING: NEXT_PUBLIC_SUPABASE_URL https://abcdefghijklmnopqrst.supabase.co eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.x', 1, S, 'MISSING_ENV:NEXT_PUBLIC_SUPABASE_URL'],
    // not a crash: summary lines exist, or the gate passed
    ['Error: ENV_MISSING: X_Y', 1, { passLines: 1, failLines: 0 }, null],
    ['Error: ENV_MISSING: X_Y', 0, S, null],
  ];
  let ok = true;
  for (const [text, exit, s, want] of cases) {
    const got = crashToken(text, exit, s, secrets);
    const safe = got === null || (SAFE_TOKEN.test(got) && scanLine(got, secrets).length === 0);
    if (got !== want || !safe) { ok = false; console.log(`run-quiet self-test FAIL: want ${want} got ${got}`); }
  }
  const S2 = { passLines: 0, failLines: 0 };
  const msgCases = [
    ["TypeError: fetch failed\n    at node:internal/deps/undici/undici:1:1", 1, S2, 'TypeError: fetch failed'],
    ['Error: connect to https://abcdefghijklmnopqrst.supabase.co failed', 1, S2, 'REDACTED [host]'],
    ['TypeError: bad SUPER_SECRET_PASSWORD_VALUE here', 1, S2, 'REDACTED [secret]'],
    ['RangeError: ' + 'x'.repeat(400), 1, S2, 'RangeError: ' + 'x'.repeat(188)],
    ['TypeError: boom', 0, S2, null],
    ['TypeError: boom', 1, { passLines: 1, failLines: 0 }, null],
  ];
  for (const [text, exit, s, want] of msgCases) {
    const got = crashMessage(text, exit, s, secrets);
    if (got !== want) { ok = false; console.log(`run-quiet self-test FAIL (crash message): want ${want} got ${got}`); }
  }
  // CI-FLAKE-1: the failing route + the sanitized log
  const routeCases = [
    ['Error occurred prerendering page "/sitemap.xml". Read more: https://nextjs.org/docs/messages/prerender-error', '/sitemap.xml'],
    ['Export encountered an error on /articles/[slug]/page: /articles/x, exiting the build.', '/articles/[slug]'],
    ['> Build error occurred\n[Error: Failed to collect page data for /admin/prompts] { type: "Error" }', '/admin/prompts]'.slice(0, 0) + '/admin/prompts'],
    ['Failed to fetch `Inter` from Google Fonts.', 'next/font (Google Fonts download)'],
    ['TypeError: boom', null],
  ];
  for (const [text, want] of routeCases) {
    const got = crashRoute(text);
    if (got !== want) { ok = false; console.log(`run-quiet self-test FAIL (crash route): want ${want} got ${got}`); }
  }
  const san = sanitizeLog(['ok line', 'NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co', 'value FAKE_SECRET_VALUE_0123456789 here', '  SOME_TOKEN: abc', 'TypeError: x', '    at f (/x/y.js:1:1)'].join('\n'), secrets);
  if (san.redacted !== 3 || /FAKE_SECRET|supabase\.co|abc$/m.test(san.text) || !/TypeError: x\n    at f/.test(san.text)) { ok = false; console.log(`run-quiet self-test FAIL (sanitize): ${JSON.stringify(san)}`); }
  console.log(`run-quiet self-test: ${ok ? 'OK' : 'FAIL'} — ${cases.length + msgCases.length + routeCases.length + 1} cases`);
  return ok;
}

function main() {
  const argv = process.argv.slice(2);
  const sep = argv.indexOf('--');
  const opts = argv.slice(0, sep < 0 ? argv.length : sep);
  // only run-quiet's OWN flag (before "--"): a wrapped gate's "--self-test" must reach the gate, not trigger this one
  if (opts.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
  const cmd = sep < 0 ? [] : argv.slice(sep + 1);
  const opt = (k, d) => { const i = opts.indexOf(k); return i >= 0 ? opts[i + 1] : d; };
  const ID = opt('--id', '');
  // CI-SPEED-1 (architect 2026-10-29): --caps <json> = the per-suite cap from the measured-durations file (a live gate
  // without an entry is refused: fail closed); --timeout <s> otherwise (default 900)
  const CAPS = opt('--caps', '');
  let capS = Number(opt('--timeout', '900'));
  if (CAPS) {
    const gates = JSON.parse(fs.readFileSync(path.resolve(CAPS), 'utf8')).gates || {};
    if (!gates[ID] || !(gates[ID].cap > 0)) { console.log(`${ID} FAIL exit 2 — no per-suite cap for this gate in ${path.basename(CAPS)} (CI-SPEED-1)`); process.exit(2); }
    capS = gates[ID].cap;
  }
  const TIMEOUT = capS * 1000;
  const CRASH_MESSAGE = opts.includes('--crash-message');
  const BUILD_DIAG = opts.includes('--build-diag');
  const KEEP_LOG = opt('--keep-log', '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,40}$/.test(ID) || !cmd.length) { console.log('usage: run-quiet.cjs --id <GATE-ID> [--timeout <s>] -- <command> [args...]'); process.exit(2); }

  const dir = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'ci-quiet');
  fs.mkdirSync(dir, { recursive: true });
  const logFile = path.join(dir, `${ID}.log`);
  const out = fs.openSync(logFile, 'w');

  // Windows resolves npm / npx (.cmd shims) only through a shell (arguments quoted); on Linux runners the command is
  // executed directly with no shell
  const win = process.platform === 'win32';
  const quoteWin = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  const child = win
    ? spawn(cmd.map(quoteWin).join(' '), { stdio: ['ignore', out, out], env: process.env, windowsHide: true, shell: true })
    : spawn(cmd[0], cmd.slice(1), { stdio: ['ignore', out, out], env: process.env });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, TIMEOUT);
  // CI-FLAKE-1: free memory while the command runs (the minimum is what matters for a worker OOM)
  const mb = (b) => Math.round(b / 1048576);
  const mem = { start: mb(os.freemem()), min: mb(os.freemem()) };
  const sampler = BUILD_DIAG ? setInterval(() => { mem.min = Math.min(mem.min, mb(os.freemem())); }, 1000) : null;
  child.on('error', () => {});
  child.on('close', (code) => {
    clearTimeout(timer);
    if (sampler) clearInterval(sampler);
    fs.closeSync(out);
    const r = scan([logFile]);
    if (r.findings.length) {
      console.log(`${ID} FAIL — log scan: ${r.findings.length} finding(s) [${[...new Set(r.findings.flatMap((f) => f.classes))].join(', ')}] — output withheld`);
      process.exit(1);
    }
    const text = fs.readFileSync(logFile, 'utf8');
    const s = summarize(text);
    const exit = timedOut ? 124 : code === null ? 1 : code;
    const status = exit === 0 ? 'PASS' : 'FAIL';
    const diag = timedOut ? null : crashToken(text, exit, s, secretValues(process.env));
    console.log(`${ID} ${status} exit ${exit}${timedOut ? ' (timeout)' : ''} — passed ${s.totals || `${s.passLines} line(s)`} · fail-lines ${s.failLines} · warns ${s.warns}${s.ids.length ? ` · failing [${s.ids.join(', ')}]` : ''}${diag ? ` · diag ${diag}` : ''}`);
    if (CRASH_MESSAGE && diag) {
      const msg = crashMessage(text, exit, s, secretValues(process.env));
      if (msg) console.log(`${ID} crash-message: ${msg}`);
    }
    if (BUILD_DIAG && exit !== 0) {
      const route = crashRoute(text);
      if (route) console.log(`${ID} crash-route: ${route}`);
      let next = 'unknown';
      try { next = require(path.join(process.cwd(), 'node_modules/next/package.json')).version; } catch { /* not installed */ }
      console.log(`${ID} build-diag: node ${process.version} · next ${next} · cpus ${os.cpus().length} · memory total ${mb(os.totalmem())} MB, free start ${mem.start} / min ${mem.min} / end ${mb(os.freemem())} MB`);
    }
    if (KEEP_LOG && exit !== 0) {
      fs.mkdirSync(KEEP_LOG, { recursive: true });
      const san = sanitizeLog(text, secretValues(process.env));
      fs.writeFileSync(path.join(KEEP_LOG, `${ID}.sanitized.log`), san.text);
      console.log(`${ID} sanitized log kept for the failure artifact (${san.redacted} line(s) redacted)`);
    }
    process.exit(exit);
  });
}

if (require.main === module) main();

module.exports = { summarize, crashToken, crashMessage, crashRoute, sanitizeLog, selfTest, SAFE_TOKEN };
