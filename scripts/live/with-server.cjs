#!/usr/bin/env node
/**
 * Live-gate runner (standing rule, docs/testing/LIVE_GATES.md). Starts the LOCAL production build, confirms health,
 * runs gates, and ALWAYS stops the server — pass, fail, timeout or Ctrl-C.
 *
 *   - free-port check before starting (refuses if the port is in use)
 *   - `next start` launched directly (node + next bin; no npx / shell wrappers that outlive a kill)
 *   - health: GET /api/health with Node fetch, hard limit 120 s; not healthy → print the log tail, start NO gate
 *   - each gate: hard limit 15 min (or --gate-timeout=<s>); a timeout kills the gate and fails loudly with log tails
 *   - no unbounded waits anywhere; exit code = number of failed gates (capped at 1 if the server never got healthy → 2)
 *
 * Usage:
 *   node scripts/live/with-server.cjs [--port=3100] [--log=<file>] [--gate-timeout=900] -- "<gate cmd 1>" "<gate cmd 2>" …
 * Gate commands run with BASE_URL=http://localhost:<port> in their environment. Prints no secrets (the app's own log
 * tail is shown with hosts / tokens redacted).
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const sep = args.indexOf('--');
const opts = Object.fromEntries((sep === -1 ? args : args.slice(0, sep)).filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));
const gates = sep === -1 ? [] : args.slice(sep + 1);
const PORT = Number(opts.port || 3100);
const HEALTH_TIMEOUT_MS = 120 * 1000;
const GATE_TIMEOUT_MS = Number(opts['gate-timeout'] || 900) * 1000;
const LOG = opts.log ? path.resolve(opts.log) : path.join(os.tmpdir(), `courage-live-${PORT}.log`);
const BASE = `http://localhost:${PORT}`;

const redact = (s) => s
  .replace(/[a-z0-9]{20}\.supabase\.(co|in)/gi, '<supabase-host>')
  .replace(/eyJ[A-Za-z0-9._-]{20,}/g, '<jwt>')
  .replace(/postgres(ql)?:\/\/[^\s"']+/gi, '<connection-string>');
const tail = (file, n = 40) => {
  try { return redact(fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(-n).join('\n')); } catch { return '(no log)'; }
};
const portFree = (port) => new Promise((resolve) => {
  const srv = net.createServer();
  srv.once('error', () => resolve(false));
  srv.once('listening', () => srv.close(() => resolve(true)));
  srv.listen(port, '0.0.0.0');
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** kills a process and all its children (Windows: taskkill /T; POSIX: process group) */
function killTree(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } } }
}

let server = null;
const cleanup = () => {
  if (server) {
    killTree(server);
    server = null;
    console.log(`[with-server] server on :${PORT} stopped`);
  }
};
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });
process.on('exit', cleanup);

async function waitHealthy() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) return `server exited with code ${server.exitCode}`;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(`${BASE}/api/health`, { signal: ctrl.signal });
      clearTimeout(t);
      if (r.status === 200) return null;
    } catch { /* not up yet */ }
    await sleep(1000);
  }
  return `not healthy within ${HEALTH_TIMEOUT_MS / 1000} s`;
}

function runGate(cmd) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, { cwd: ROOT, shell: true, stdio: 'inherit', env: { ...process.env, BASE_URL: BASE }, detached: process.platform !== 'win32' });
    const timer = setTimeout(() => {
      console.log(`\n[with-server] GATE TIMEOUT after ${GATE_TIMEOUT_MS / 1000} s: ${cmd}`);
      killTree(child);
      resolve({ cmd, ok: false, timedOut: true, ms: Date.now() - started });
    }, GATE_TIMEOUT_MS);
    child.on('exit', (code) => { clearTimeout(timer); resolve({ cmd, ok: code === 0, code, ms: Date.now() - started }); });
  });
}

(async () => {
  if (!fs.existsSync(path.join(ROOT, '.next', 'BUILD_ID'))) { console.error('[with-server] no production build (.next/BUILD_ID): run `npm run build` first'); process.exit(2); }
  if (!(await portFree(PORT))) { console.error(`[with-server] port ${PORT} is in use — stop the other server first (refusing to start)`); process.exit(2); }
  fs.writeFileSync(LOG, '');
  const out = fs.openSync(LOG, 'a');
  const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
  server = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], { cwd: ROOT, stdio: ['ignore', out, out], detached: process.platform !== 'win32', env: process.env });
  console.log(`[with-server] next start on :${PORT} (pid ${server.pid}); log: ${LOG}`);
  const healthErr = await waitHealthy();
  if (healthErr) {
    console.error(`[with-server] SERVER NOT HEALTHY: ${healthErr}. No gate started. Log tail:\n${tail(LOG)}`);
    cleanup();
    process.exit(2);
  }
  console.log(`[with-server] healthy: ${BASE}/api/health → 200`);
  const results = [];
  for (const g of gates) {
    console.log(`\n[with-server] ▶ ${g}`);
    const r = await runGate(g);
    results.push(r);
    if (!r.ok) console.log(`[with-server] ✗ ${g} (${r.timedOut ? 'timeout' : `exit ${r.code}`}). Server log tail:\n${tail(LOG, 25)}`);
  }
  cleanup();
  console.log('\n[with-server] summary');
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${(r.ms / 1000).toFixed(0)} s  ${r.cmd}${r.timedOut ? '  (TIMEOUT)' : ''}`);
  const failedCount = results.filter((r) => !r.ok).length;
  process.exit(failedCount ? 1 : 0);
})().catch((e) => { console.error('[with-server] error', redact(String(e && e.message ? e.message : e))); cleanup(); process.exit(2); });
