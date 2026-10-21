/**
 * PUBLIC-HARDEN-1 (#57 public repo) — run one gate with its output CAPTURED, never printed.
 * Usage: node scripts/ci/run-quiet.cjs --id <GATE-ID> [--timeout <s>] -- <command> [args...]
 *        node scripts/ci/run-quiet.cjs --self-test
 * - stdout + stderr go to $RUNNER_TEMP/ci-quiet/<GATE-ID>.log (os.tmpdir() locally); the runner discards it at job end
 * - the captured file is log-scanned FIRST; on any finding the gate FAILs and prints no output at all
 * - otherwise prints ONE summary line: <ID> PASS|FAIL exit <code> — passed n/m · fail-lines f · warns w · failing [check IDs]
 *   (check IDs = the first token after "FAIL" when it is an ID like P-9 / K-14 / L-03a or a route path) — never detail text
 * - CI-1: when a failing gate printed NO summary lines (a startup crash), one SAFE diagnostic token is appended:
 *   MISSING_ENV:<VAR[,VAR]> | TLS_CA_MISSING | REF_LOCK | TARGET_REF_MISMATCH | CRASH:<ErrorClass>[/<CODE>] | CRASH:UNKNOWN.
 *   Names only (strict charset), never values; the token itself is run through the log scan (any hit → CRASH:REDACTED).
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

const SAFE_TOKEN = /^(MISSING_ENV:[A-Z][A-Z0-9_]{1,40}(,[A-Z][A-Z0-9_]{1,40}){0,2}|TLS_CA_MISSING|REF_LOCK|TARGET_REF_MISMATCH|CRASH:[A-Z][A-Za-z]{0,40}(\/[A-Z][A-Z0-9_]{1,40})?|CRASH:UNKNOWN|CRASH:REDACTED)$/;

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
      const cls = (t.match(/^\s*(?:Uncaught\s+)?((?:[A-Z][A-Za-z]{0,38})?Error)\b/m) || t.match(/\b((?:[A-Z][A-Za-z]{0,38})?Error)\b/) || [])[1];
      const code = (t.match(/\bcode:\s*'([A-Z][A-Z0-9_]{1,40})'/) || [])[1];
      tok = cls ? `CRASH:${cls}${code ? `/${code}` : ''}` : 'CRASH:UNKNOWN';
    }
  }
  if (!SAFE_TOKEN.test(tok) || scanLine(tok, secrets).length) return 'CRASH:REDACTED';
  return tok;
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
  console.log(`run-quiet self-test: ${ok ? 'OK' : 'FAIL'} — ${cases.length} cases`);
  return ok;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
  const sep = argv.indexOf('--');
  const opts = argv.slice(0, sep < 0 ? argv.length : sep);
  const cmd = sep < 0 ? [] : argv.slice(sep + 1);
  const opt = (k, d) => { const i = opts.indexOf(k); return i >= 0 ? opts[i + 1] : d; };
  const ID = opt('--id', '');
  const TIMEOUT = Number(opt('--timeout', '900')) * 1000;
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
  child.on('error', () => {});
  child.on('close', (code) => {
    clearTimeout(timer);
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
    process.exit(exit);
  });
}

if (require.main === module) main();

module.exports = { summarize, crashToken, selfTest, SAFE_TOKEN };
