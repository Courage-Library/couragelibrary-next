#!/usr/bin/env node
/**
 * CI-FIX-1: stop a test server left behind by a cancelled / timed-out live step, so the always-run fixture restore
 * can start its own server (run #13: "port 3100 is in use — refusing to start", fixture not restored).
 *
 * Kills ONLY processes this repository started: a `next start` whose command line contains this repository's path
 * and targets the given port (scripts/live/with-server.cjs launches `node <repo>/node_modules/next/dist/bin/next
 * start -p <port>` detached, so the whole process group is signalled). Anything else is never touched. POSIX (CI)
 * only; on Windows it lists nothing. SIGTERM, ≤ 10 s grace, then SIGKILL. Prints counts only (no paths, no args).
 *
 *   node scripts/ci/kill-leftover-server.cjs --port=3100        node scripts/ci/kill-leftover-server.cjs --self-test
 */
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const norm = (s) => String(s || '').replace(/\\/g, '/').toLowerCase();

/** Pure: the rows that are OUR next server on `port` (repo path in the command line AND next start AND the port). */
function selectOurs(rows, root, port) {
  const r = norm(root);
  const portRx = new RegExp(`(\\s-p\\s+|--port[= ])${port}\\b`);
  return rows.filter(({ cmd }) => {
    const c = norm(cmd);
    return c.includes(r) && /next\/dist\/bin\/next\s+start\b/.test(c) && portRx.test(c);
  });
}

function listProcesses() {
  if (process.platform === 'win32') return [];
  const ps = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8', timeout: 20000 });
  return String(ps.stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => ({ pid: Number(l.split(/\s+/, 1)[0]), cmd: l.replace(/^\d+\s+/, '') }))
    .filter((r) => Number.isInteger(r.pid) && r.pid !== process.pid);
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const signal = (pid, sig) => {
  try {
    process.kill(-pid, sig); // the process group (with-server starts the server detached)
  } catch {
    try {
      process.kill(pid, sig);
    } catch {
      /* already gone */
    }
  }
};

async function main(port) {
  const ours = selectOurs(listProcesses(), ROOT, port);
  for (const { pid } of ours) signal(pid, 'SIGTERM');
  const deadline = Date.now() + 10000;
  while (ours.some(({ pid }) => alive(pid)) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
  const stubborn = ours.filter(({ pid }) => alive(pid));
  for (const { pid } of stubborn) signal(pid, 'SIGKILL');
  console.log(`kill-leftover-server :${port} — found ${ours.length}, stopped ${ours.length - stubborn.length} with SIGTERM, ${stubborn.length} with SIGKILL`);
}

function selfTest() {
  const root = '/home/runner/work/repo/repo';
  const rows = [
    { pid: 1, cmd: `node ${root}/node_modules/next/dist/bin/next start -p 3100 -H 127.0.0.1` }, // ours, right port
    { pid: 2, cmd: `node ${root}/node_modules/next/dist/bin/next start -p 3300 -H 127.0.0.1` }, // ours, other port
    { pid: 3, cmd: 'node /other/project/node_modules/next/dist/bin/next start -p 3100' }, // foreign
    { pid: 4, cmd: `node ${root}/scripts/live/with-server.cjs --port=3100 -- x` }, // our runner, not a server
    { pid: 5, cmd: 'lighthouse http://localhost:3100' }, // foreign
  ];
  const got = selectOurs(rows, root, 3100).map((r) => r.pid);
  const ok = JSON.stringify(got) === '[1]';
  console.log(`${ok ? 'PASS' : 'FAIL'}  self-test: only our next server on the port is selected (${JSON.stringify(got)})`);
  return ok;
}

module.exports = { selectOurs };

if (require.main === module) {
  if (process.argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
  const port = Number((process.argv.find((a) => a.startsWith('--port=')) || '').split('=')[1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.log('usage: kill-leftover-server.cjs --port=<1024..65535>');
    process.exit(2);
  }
  main(port).catch(() => process.exit(0)); // best effort: never fails the cleanup step
}
