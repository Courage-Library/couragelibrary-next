#!/usr/bin/env node
/**
 * PROCTOR-LOG-1 — attempt proctoring events (migration 094; route + player wiring behind PROCTOR_LOG_ENABLED, off).
 * Offline gate (no DB, no server; the live behaviour was proven in a rolled-back smoke before commit):
 *   PL-01 migration: append-only table (UPDATE trigger, no client grant), enum of exactly 4 events, server time,
 *         UNIQUE (attempt_id, client_seq), no IP / fingerprint / user-agent column, no BEGIN / COMMIT, rollback present
 *   PL-02 RPC: SECURITY DEFINER, search_path '', auth.uid() (never a client user id), caller's OWN OPEN attempt,
 *         rate caps, fixed codes; EXECUTE authenticated only; listed in the SECDEF allow-list (class A)
 *   PL-03 route: flag off → 204 and no RPC; malformed → 400; on → RPC with the validated values; RPC failure → 204
 *   PL-04 player: the four events are sent fire-and-forget with a per-attempt device counter; nothing awaited or shown;
 *         the notice never claims "recorded" while the flag / migration are not live
 * Run: node scripts/test_proctor_log1.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const sqlCode = (s) => s.replace(/--.*$/gm, '');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1200)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const ts = require('typescript');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
const transpile = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = transpile;
const rpcCalls = [];
let rpcThrows = false;
class FakeResponse {
  constructor(body, init) {
    this.body = body;
    this.status = (init && init.status) || 200;
  }
}
const MOCKS = {
  'next/server': { NextResponse: FakeResponse },
  '@/lib/supabase/server': {
    createServerSupabaseClient: async () => ({
      rpc: async (fn, args) => {
        if (rpcThrows) throw new Error('db down');
        rpcCalls.push([fn, args]);
        return { data: { success: true, code: 'RECORDED' }, error: null };
      },
    }),
  },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return origLoad.call(this, request, parent, isMain);
};

const MIG = 'supabase/migrations/20261025000094_proctor_log1_attempt_events.sql';

(async () => {
  await test('PL-01 migration: append-only, 4 events, server time, idempotent seq, no device data, rollback', () => {
    const raw = read(MIG);
    const m = sqlCode(raw);
    assert(!/^\s*(BEGIN|COMMIT)\s*;/im.test(m), 'top-level BEGIN / COMMIT in a migration');
    assert(/CREATE TYPE public\.proctor_event_type AS ENUM \('tab_hidden', 'tab_visible', 'fullscreen_exit', 'fullscreen_enter'\)/.test(m), 'enum of exactly the four events');
    assert(/occurred_at timestamptz NOT NULL DEFAULT now\(\)/.test(m) && /CONSTRAINT uq_proctor_event_seq UNIQUE \(attempt_id, client_seq\)/.test(m), 'server time + unique seq');
    const table = m.slice(m.indexOf('CREATE TABLE IF NOT EXISTS public.attempt_proctor_events'), m.indexOf(');', m.indexOf('CREATE TABLE IF NOT EXISTS public.attempt_proctor_events')));
    assert(!/\b(ip|client_ip|user_agent|fingerprint|device)\w*\b/i.test(table), 'no IP / fingerprint / device column');
    assert(/REVOKE ALL ON public\.attempt_proctor_events FROM PUBLIC, anon, authenticated;/.test(m) && !/GRANT [A-Z, ]+ ON public\.attempt_proctor_events TO (?!service_role;)/.test(m) && /GRANT SELECT ON public\.attempt_proctor_events TO service_role;/.test(m) && !/CREATE POLICY[\s\S]*attempt_proctor_events/.test(m), 'no client grant / policy');
    assert(/ENABLE ROW LEVEL SECURITY/.test(m) && /BEFORE UPDATE ON public\.attempt_proctor_events/.test(m) && /append-only/.test(m), 'RLS + append-only trigger');
    assert(/ON DELETE CASCADE/.test(table), 'rows go with the attempt (E2E cleanup)');
    const rb = read('docs/database/rollback/094_rollback.sql');
    assert(/DROP FUNCTION IF EXISTS public\.fn_record_proctor_event\(uuid, text, integer\);/.test(rb) && /DROP TABLE IF EXISTS public\.attempt_proctor_events;/.test(rb) && /DROP TYPE IF EXISTS public\.proctor_event_type;/.test(rb), 'rollback drops everything');
  });

  await test('PL-02 RPC: SECDEF, search_path \'\', auth.uid(), own OPEN attempt, caps, authenticated only, allow-listed', () => {
    const m = sqlCode(read(MIG));
    const fn = m.slice(m.indexOf('CREATE OR REPLACE FUNCTION public.fn_record_proctor_event'), m.indexOf('GRANT EXECUTE ON FUNCTION public.fn_record_proctor_event'));
    assert(/SECURITY DEFINER\s+SET search_path = ''/.test(fn), "SECDEF with search_path ''");
    assert(/v_uid\s+uuid := auth\.uid\(\);/.test(fn) && !/p_user_id/.test(fn), 'auth.uid() only');
    assert(/WHERE a\.id = p_attempt_id AND a\.user_id = v_uid;/.test(fn) && /a\.status = 'in_progress' AND a\.submitted_at IS NULL/.test(fn) && /make_interval\(mins => coalesce\(m\.duration_minutes, 0\)\) \+ interval '2 minutes'/.test(fn), "caller's own open attempt (server deadline)");
    assert(/>= 300/.test(fn) && /interval '1 minute'\) >= 60/.test(fn) && /pg_advisory_xact_lock/.test(fn), 'rate caps under a per-attempt lock');
    const codes = [...new Set([...fn.matchAll(/'code', (?:CASE WHEN [^']*THEN )?'([A-Z_]+)'/g)].map((x) => x[1]))].sort();
    assert(JSON.stringify(codes) === JSON.stringify(['AUTH_REQUIRED', 'DUPLICATE', 'INVALID_INPUT', 'NOT_FOUND', 'RATE_LIMITED', 'RECORDED'].sort()), `fixed codes ${codes}`);
    assert(/REVOKE ALL ON FUNCTION public\.fn_record_proctor_event\(uuid, text, integer\) FROM PUBLIC, anon;/.test(m) && /GRANT EXECUTE ON FUNCTION public\.fn_record_proctor_event\(uuid, text, integer\) TO authenticated;/.test(m), 'EXECUTE authenticated only');
    const allow = JSON.parse(read('scripts/secdef/allowlist.json'));
    const e = allow.functions['fn_record_proctor_event(p_attempt_id uuid, p_event_type text, p_client_seq integer)'];
    assert(e && e.class === 'A' && JSON.stringify(e.client) === '["authenticated"]' && e.search_path === '""', 'allow-list entry');
  });

  await test('PL-03 route: flag off → 204 no RPC; malformed → 400; on → validated RPC; failure stays quiet', async () => {
    const { POST } = require(path.join(ROOT, 'app/api/assessment/proctor-event/route.ts'));
    const req = (b) => ({ json: async () => (b instanceof Error ? Promise.reject(b) : b) });
    const ok = { attemptId: '11111111-2222-4333-8444-555555555555', type: 'tab_hidden', seq: 3 };
    delete process.env.PROCTOR_LOG_ENABLED;
    assert((await POST(req(ok))).status === 204 && rpcCalls.length === 0, 'flag off: 204, nothing recorded');
    for (const bad of [new Error('x'), { ...ok, type: 'devtools_open' }, { ...ok, attemptId: 'x' }, { ...ok, seq: -1 }, { ...ok, seq: 1.5 }]) assert((await POST(req(bad))).status === 400, `malformed → 400 (${JSON.stringify(bad)})`);
    process.env.PROCTOR_LOG_ENABLED = 'true';
    assert((await POST(req(ok))).status === 204, 'on: 204');
    assert(JSON.stringify(rpcCalls) === JSON.stringify([['fn_record_proctor_event', { p_attempt_id: ok.attemptId, p_event_type: 'tab_hidden', p_client_seq: 3 }]]), JSON.stringify(rpcCalls));
    rpcThrows = true;
    assert((await POST(req(ok))).status === 204, 'RPC failure stays quiet');
    delete process.env.PROCTOR_LOG_ENABLED;
  });

  await test('PL-04 player: four events, fire-and-forget, device counter; no "recorded" claim', () => {
    const { nextProctorSeq } = require(path.join(ROOT, 'lib/assessment/proctor.ts'));
    const store = new Map();
    const s = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
    assert(nextProctorSeq('a', s) === 1 && nextProctorSeq('a', s) === 2 && nextProctorSeq('b', s) === 1, 'per-attempt counter continues');
    const P = code(read('app/mock-tests/[id]/take/player-client.tsx'));
    for (const ev of ['tab_hidden', 'tab_visible', 'fullscreen_exit', 'fullscreen_enter']) assert(P.includes(`"${ev}"`), `player sends ${ev}`);
    assert(/fetch\("\/api\/assessment\/proctor-event", \{[\s\S]{0,200}keepalive: true,\s*\}\)\.catch\(\(\) => undefined\);/.test(P), 'fire-and-forget (not awaited, errors swallowed)');
    assert(!/await fetch\("\/api\/assessment\/proctor-event"/.test(P), 'never awaited');
    assert(!/recorded with your attempt|is (being )?(recorded|logged|monitored)/i.test(P), 'no "recorded" claim before 094 + flag are live');
  });

  console.log(`\nPROCTOR-LOG-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
