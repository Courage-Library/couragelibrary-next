/**
 * Live-gate server forensics (AUTH-1 crash check). Preloaded into the LOCAL `next start` by scripts/live/with-server.cjs
 * (NODE_OPTIONS --require, plus --report-on-fatalerror). Inert in any other process. Writes to the server log only:
 *   - memory every 30 s (rss / heap / external MB, active handles);
 *   - any JS-initiated exit: process.exit / process.reallyExit with the calling stack;
 *   - the final exit code (process 'exit' event);
 *   - process warnings (e.g. MaxListenersExceeded).
 * If the server dies and none of these lines appear, the process was terminated from outside JavaScript.
 * Prints no hosts, keys or request data.
 */
const isNextStart = /[\\/]next[\\/]dist[\\/]bin[\\/]next$/.test(process.argv[1] || '') && process.argv.includes('start');

if (isNextStart && process.env.WITH_SERVER_DIAG === '1') {
  const fs = require('fs');
  const line = (s) => {
    try {
      fs.writeSync(1, `[diag ${new Date().toISOString()}] ${s}\n`);
    } catch {
      /* stdout closed */
    }
  };
  const mb = (n) => Math.round(n / 1048576);
  const sample = () => {
    const m = process.memoryUsage();
    const handles = typeof process._getActiveHandles === 'function' ? process._getActiveHandles().length : -1;
    line(`mem rss ${mb(m.rss)} MB, heap ${mb(m.heapUsed)}/${mb(m.heapTotal)} MB, external ${mb(m.external)} MB, handles ${handles}`);
  };
  setInterval(sample, 30000).unref();
  sample();
  for (const name of ['exit', 'reallyExit']) {
    const orig = process[name];
    if (typeof orig !== 'function') continue;
    process[name] = function (code) {
      line(`process.${name}(${code}) called:\n${new Error('exit stack').stack.split('\n').slice(1, 12).join('\n')}`);
      return orig.apply(this, arguments);
    };
  }
  process.on('exit', (code) => line(`exit event, code ${code}`));
  process.on('warning', (w) => line(`warning ${w.name}: ${w.message}`));
  line(`server diagnostics on (pid ${process.pid}, node ${process.version})`);
}
