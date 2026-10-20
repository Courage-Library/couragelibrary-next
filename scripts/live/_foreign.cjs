/**
 * Live-gate precheck (SECDEF-S2-2 port finding): processes outside this repository that compete with a live run.
 * Another project's `next start` / Lighthouse runs on this machine made our server unreachable and got it terminated
 * from outside JS. scripts/live/with-server.cjs refuses to start while any is detected. Reports kind + pid only (paths
 * are never printed) and never touches the processes.
 */
const { spawnSync } = require('child_process');

const norm = (s) => String(s || '').replace(/\\/g, '/').toLowerCase();

/** Pure: what kind of competing process a command line is (null = none / ours). */
function classifyCommand(cmdLine, root, port) {
  const cmd = norm(cmdLine);
  if (!cmd || cmd.includes(norm(root))) return null; // ours (this repository)
  if (/(next\/dist\/bin\/next|\.bin\/next|npx-cli\.js"?\s+next|(^|\s)next)\b.*\s(start|dev)\b/.test(cmd) || /next-server/.test(cmd)) return 'next server';
  if (/lighthouse|\/lh\//.test(cmd)) return 'lighthouse / audit script';
  if (new RegExp(`(localhost|127\\.0\\.0\\.1):${port}\\b|\\s-p\\s+${port}\\b|--port[= ]${port}\\b`).test(cmd)) return `process targeting :${port}`;
  return null;
}

/** Lists node processes (Windows: CIM; POSIX: ps) and classifies them. Detection unavailable → [] (free-port check still applies). */
function foreignServerProcesses(root, port) {
  let rows = [];
  try {
    if (process.platform === 'win32') {
      const ps = spawnSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress"], { encoding: 'utf8', timeout: 20000 });
      const parsed = JSON.parse(ps.stdout || '[]');
      rows = (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean).map((r) => ({ pid: r.ProcessId, cmd: r.CommandLine || '' }));
    } else {
      const ps = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8', timeout: 20000 });
      rows = (ps.stdout || '').split('\n').map((l) => l.trim().match(/^(\d+)\s+(.*)$/)).filter(Boolean).map((m) => ({ pid: Number(m[1]), cmd: m[2] }));
    }
  } catch {
    return [];
  }
  return rows
    .filter((r) => r.pid !== process.pid && r.pid !== process.ppid)
    .map((r) => ({ pid: r.pid, kind: classifyCommand(r.cmd, root, port) }))
    .filter((r) => r.kind);
}

module.exports = { classifyCommand, foreignServerProcesses };
