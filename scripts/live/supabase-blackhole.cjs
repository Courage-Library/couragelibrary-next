/**
 * TEST-ONLY preload (AUTH-1 Stage 2a resilience gate). Simulates a Supabase outage inside the LOCAL `next start`
 * process, deterministically and without touching the network:
 *
 *   AUTH1_BLACKHOLE=refuse  every connection to *.supabase.co / *.supabase.in is refused at once (a real
 *                           ECONNREFUSED from a closed local port)
 *   AUTH1_BLACKHOLE=hang    every such connection goes to a local listener that accepts and never answers, and
 *                           Node's global fetch never settles unless the caller's AbortSignal fires
 *
 * Two layers, because the server has two fetch implementations:
 *   1. globalThis.fetch (server components, route handlers, server actions);
 *   2. tls.connect / net.connect (everything else, incl. the middleware's edge-sandbox fetch, which brings its own
 *      undici but still opens sockets through Node's tls module).
 * Loaded only through NODE_OPTIONS by the AUTH-1 resilience gate (scripts/live/with-server.cjs). Inert unless
 * AUTH1_BLACKHOLE is set AND the process is `next start`. Never part of a deployment. Prints counters, no hosts.
 */
const MODE = process.env.AUTH1_BLACKHOLE;
const isNextStart = /[\\/]next[\\/]dist[\\/]bin[\\/]next$/.test(process.argv[1] || '') && process.argv.includes('start');

if ((MODE === 'refuse' || MODE === 'hang') && isNextStart) {
  const net = require('net');
  const tls = require('tls');
  const isSupabaseHost = (h) => /\.supabase\.(co|in)$/i.test(String(h || ''));
  const hits = { fetch: 0, socket: 0 };
  const count = (layer) => {
    hits[layer]++;
    if (hits[layer] === 1 || hits[layer] % 100 === 0) console.log(`[blackhole] ${MODE}: ${layer} layer intercepted ${hits[layer]}`);
  };

  // --- local stand-ins: a port that refuses (bound then closed) and a listener that never answers ---
  let refusePort = 0;
  let silentPort = 0;
  const silent = [];
  {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      refusePort = probe.address().port;
      probe.close();
    });
    const srv = net.createServer((sock) => {
      silent.push(sock); // accept, read nothing back, never answer
      sock.on('error', () => undefined);
    });
    srv.listen(0, '127.0.0.1', () => (silentPort = srv.address().port));
    srv.unref();
  }

  // --- layer 2: sockets ---
  const redirect = (orig, mod) =>
    function (...args) {
      const o = args[0];
      if (o && typeof o === 'object' && isSupabaseHost(o.host || o.servername || o.hostname)) {
        count('socket');
        const target = MODE === 'refuse' ? refusePort : silentPort;
        return orig.call(mod, { ...o, host: '127.0.0.1', hostname: undefined, port: target, servername: undefined, lookup: undefined }, ...args.slice(1));
      }
      return orig.apply(mod, args);
    };
  tls.connect = redirect(tls.connect, tls);
  net.connect = redirect(net.connect, net);
  net.createConnection = net.connect;

  // --- layer 1: Node's global fetch ---
  const realFetch = globalThis.fetch;
  globalThis.fetch = function (input, init) {
    let host = '';
    try {
      host = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).hostname;
    } catch {
      /* not a URL we judge */
    }
    if (!isSupabaseHost(host)) return realFetch.apply(this, arguments);
    count('fetch');
    const signal = (init && init.signal) || (input && typeof input === 'object' && input.signal) || null;
    if (MODE === 'refuse') {
      const cause = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      return Promise.reject(new TypeError('fetch failed', { cause }));
    }
    return new Promise((_, reject) => {
      const abort = () => reject(signal.reason instanceof Error ? signal.reason : Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
      if (signal) {
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      }
    });
  };
  console.log(`[blackhole] active: ${MODE} (test-only preload; fetch + socket layers)`);
}
