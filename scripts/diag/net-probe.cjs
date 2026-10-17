#!/usr/bin/env node
/**
 * DEV-NET-1 network probe (diagnostics only; no app/runtime code). Measures this machine's path to Supabase.
 *
 * Hosts are NEVER printed: the API host is labelled `supabase-api`, the database pooler `supabase-db-pooler`; IP
 * addresses are reported only as their family (IPv4 / IPv6). The anon key is read from .env.local and never printed.
 * TLS is always verified (no rejectUnauthorized:false, no NODE_TLS_REJECT_UNAUTHORIZED).
 *
 * Per iteration (default 20):
 *   supabase-api: DNS lookup (all families; A vs AAAA, time) → per family: TCP connect → TLS handshake (verified,
 *                 SNI = host) → HTTPS GET /rest/v1/ (anon apikey header) → plus one default `fetch` (undici, uses
 *                 Node's DNS order / autoSelectFamily settings — what the app's server does)
 *   supabase-db-pooler: DNS + TCP connect to the pooler port per family (the pg suites' first hop)
 * Output: success rate + p50 / p95 per phase and family; Node settings in effect (dns order, autoSelectFamily).
 *
 * Usage: node scripts/diag/net-probe.cjs [--n=20] [--timeout=10000] [--json=<file>]
 * Modes compared by DEV-NET-1:
 *   default:            node scripts/diag/net-probe.cjs
 *   ipv4first:          NODE_OPTIONS=--dns-result-order=ipv4first node scripts/diag/net-probe.cjs
 *   autoSelectFamily:   node --require ./scripts/diag/autoselect-family.cjs scripts/diag/net-probe.cjs
 */
const dns = require('dns');
const net = require('net');
const tls = require('tls');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { readEnv, dbTarget } = require('../db/_db-env.cjs');

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const N = Number(arg('n', 20));
const TIMEOUT = Number(arg('timeout', 10000));
const JSON_OUT = arg('json', null);

const env = readEnv();
const API_HOST = new URL(env('NEXT_PUBLIC_SUPABASE_URL')).hostname;
const ANON = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
let POOLER = null;
try { const t = dbTarget().pg; POOLER = { host: t.host, port: 6543 }; } catch { /* db env optional */ }

const now = () => Number(process.hrtime.bigint() / 1000n) / 1000; // ms
const errCode = (e) => (e && (e.code || (e.cause && e.cause.code) || e.name)) || 'ERROR';

function tcp(address, family, port) {
  return new Promise((resolve) => {
    const t0 = now();
    const s = net.connect({ host: address, port, family });
    const done = (ok, code) => { s.destroy(); resolve({ ok, ms: now() - t0, code }); };
    s.setTimeout(TIMEOUT, () => done(false, 'TIMEOUT'));
    s.once('connect', () => done(true));
    s.once('error', (e) => done(false, errCode(e)));
  });
}
function tlsHandshake(address, family) {
  return new Promise((resolve) => {
    const t0 = now();
    const s = tls.connect({ host: address, port: 443, family, servername: API_HOST }); // verification ON (default)
    const done = (ok, code) => { s.destroy(); resolve({ ok, ms: now() - t0, code }); };
    s.setTimeout(TIMEOUT, () => done(false, 'TIMEOUT'));
    s.once('secureConnect', () => done(s.authorized, s.authorized ? undefined : 'NOT_AUTHORIZED'));
    s.once('error', (e) => done(false, errCode(e)));
  });
}
function httpsGet(family) {
  return new Promise((resolve) => {
    const t0 = now();
    const req = https.request({ host: API_HOST, port: 443, path: '/rest/v1/', method: 'GET', family, headers: { apikey: ANON }, timeout: TIMEOUT, agent: false }, (res) => {
      res.resume();
      res.on('end', () => resolve({ ok: res.statusCode < 500, ms: now() - t0, code: res.statusCode < 500 ? undefined : `HTTP_${res.statusCode}`, status: res.statusCode }));
    });
    req.on('timeout', () => { req.destroy(new Error('TIMEOUT')); });
    req.on('error', (e) => resolve({ ok: false, ms: now() - t0, code: e.message === 'TIMEOUT' ? 'TIMEOUT' : errCode(e) }));
    req.end();
  });
}
async function defaultFetch() {
  const t0 = now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(`https://${API_HOST}/rest/v1/`, { headers: { apikey: ANON }, signal: ctrl.signal });
    await r.arrayBuffer();
    return { ok: r.status < 500, ms: now() - t0, status: r.status, code: r.status < 500 ? undefined : `HTTP_${r.status}` };
  } catch (e) {
    return { ok: false, ms: now() - t0, code: ctrl.signal.aborted ? 'TIMEOUT' : errCode(e) };
  } finally { clearTimeout(timer); }
}
async function lookup(host) {
  const t0 = now();
  try {
    const all = await dns.promises.lookup(host, { all: true });
    return { ok: all.length > 0, ms: now() - t0, v4: all.filter((a) => a.family === 4).map((a) => a.address), v6: all.filter((a) => a.family === 6).map((a) => a.address) };
  } catch (e) { return { ok: false, ms: now() - t0, code: errCode(e), v4: [], v6: [] }; }
}

const stats = {};
const rec = (key, r) => { (stats[key] ||= []).push(r); };
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

(async () => {
  const settings = {
    node: process.version,
    platform: `${process.platform} ${require('os').release()}`,
    dnsResultOrder: typeof dns.getDefaultResultOrder === 'function' ? dns.getDefaultResultOrder() : 'unknown',
    autoSelectFamily: typeof net.getDefaultAutoSelectFamily === 'function' ? net.getDefaultAutoSelectFamily() : 'unknown',
    autoSelectFamilyAttemptTimeout: typeof net.getDefaultAutoSelectFamilyAttemptTimeout === 'function' ? net.getDefaultAutoSelectFamilyAttemptTimeout() : 'unknown',
    nodeOptions: process.env.NODE_OPTIONS || '',
    iterations: N,
    timeoutMs: TIMEOUT,
  };
  console.log(`net-probe: ${JSON.stringify(settings)}`);
  const families = { api: new Set(), pooler: new Set() };
  for (let i = 0; i < N; i++) {
    const d = await lookup(API_HOST);
    rec('api dns', d);
    if (d.v4.length) families.api.add('IPv4');
    if (d.v6.length) families.api.add('IPv6');
    rec('api dns A count', { ok: true, ms: d.v4.length });
    rec('api dns AAAA count', { ok: true, ms: d.v6.length });
    for (const [fam, list] of [[4, d.v4], [6, d.v6]]) {
      if (!list.length) continue;
      const addr = list[i % list.length];
      rec(`api tcp IPv${fam}`, await tcp(addr, fam, 443));
      rec(`api tls IPv${fam}`, await tlsHandshake(addr, fam));
      rec(`api https IPv${fam}`, await httpsGet(fam));
    }
    rec('api fetch (default)', await defaultFetch());
    if (POOLER) {
      const pd = await lookup(POOLER.host);
      rec('pooler dns', pd);
      for (const [fam, list] of [[4, pd.v4], [6, pd.v6]]) {
        if (!list.length) continue;
        families.pooler.add(`IPv${fam}`);
        rec(`pooler tcp IPv${fam}`, await tcp(list[i % list.length], fam, POOLER.port));
      }
    }
    process.stdout.write(`\r  iteration ${i + 1}/${N}`);
  }
  process.stdout.write('\n');
  const rows = [];
  for (const [key, arr] of Object.entries(stats)) {
    if (key.endsWith('count')) {
      const vals = arr.map((r) => r.ms);
      rows.push({ phase: key, success: '—', p50: `${pct(vals, 50)}`, p95: `${pct(vals, 95)}`, errors: '' });
      continue;
    }
    const ok = arr.filter((r) => r.ok);
    const codes = {};
    for (const r of arr.filter((x) => !x.ok)) codes[r.code || 'FAIL'] = (codes[r.code || 'FAIL'] || 0) + 1;
    const ms = ok.map((r) => r.ms);
    rows.push({
      phase: key,
      success: `${ok.length}/${arr.length} (${((100 * ok.length) / arr.length).toFixed(0)}%)`,
      p50: ms.length ? `${pct(ms, 50).toFixed(0)} ms` : '—',
      p95: ms.length ? `${pct(ms, 95).toFixed(0)} ms` : '—',
      errors: Object.entries(codes).map(([k, v]) => `${k}×${v}`).join(' '),
    });
  }
  console.log(`families seen — supabase-api: ${[...families.api].join(', ') || 'none'}; supabase-db-pooler: ${[...families.pooler].join(', ') || 'none'}`);
  const w = { phase: 26, success: 14, p50: 9, p95: 9 };
  console.log(`${'phase'.padEnd(w.phase)}${'success'.padEnd(w.success)}${'p50'.padEnd(w.p50)}${'p95'.padEnd(w.p95)}errors`);
  for (const r of rows) console.log(`${r.phase.padEnd(w.phase)}${r.success.padEnd(w.success)}${r.p50.padEnd(w.p50)}${r.p95.padEnd(w.p95)}${r.errors}`);
  const total = Object.entries(stats).filter(([k]) => !k.endsWith('count')).flatMap(([, a]) => a);
  const overall = total.filter((r) => r.ok).length / total.length;
  console.log(`overall success: ${(overall * 100).toFixed(1)}%`);
  if (JSON_OUT) fs.writeFileSync(path.resolve(JSON_OUT), JSON.stringify({ settings, families: { api: [...families.api], pooler: [...families.pooler] }, rows, overall }, null, 1));
})().catch((e) => { console.error('net-probe error:', errCode(e)); process.exit(1); });
