/**
 * PUBLIC-HARDEN-1 (#57 public repo) — run one gate with its output CAPTURED, never printed.
 * Usage: node scripts/ci/run-quiet.cjs --id <GATE-ID> [--timeout <s>] -- <command> [args...]
 * - stdout + stderr go to $RUNNER_TEMP/ci-quiet/<GATE-ID>.log (os.tmpdir() locally); the runner discards it at job end
 * - the captured file is log-scanned FIRST; on any finding the gate FAILs and prints no output at all
 * - otherwise prints ONE summary line: <ID> PASS|FAIL exit <code> — passed n/m · fail-lines f · warns w · failing [check IDs]
 *   (check IDs = the first token after "FAIL" when it is an ID like P-9 / K-14 / L-03a or a route path) — never detail text
 * - exit code = the gate's (1 if the scan fails, 124 on timeout)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { scan } = require('./log-scan.cjs');

const argv = process.argv.slice(2);
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
  const s = summarize(fs.readFileSync(logFile, 'utf8'));
  const exit = timedOut ? 124 : code === null ? 1 : code;
  const status = exit === 0 ? 'PASS' : 'FAIL';
  console.log(`${ID} ${status} exit ${exit}${timedOut ? ' (timeout)' : ''} — passed ${s.totals || `${s.passLines} line(s)`} · fail-lines ${s.failLines} · warns ${s.warns}${s.ids.length ? ` · failing [${s.ids.join(', ')}]` : ''}`);
  process.exit(exit);
});
