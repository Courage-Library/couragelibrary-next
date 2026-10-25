#!/usr/bin/env node
/**
 * F11 (#79) — support tickets (migration 097; flag SUPPORT_TICKETS_ENABLED). Offline gate (the DB behaviour was proven in
 * a rolled-back smoke before commit):
 *   TK-01 form rules = DB rules (category list, subject 5–120, message 10–3000)
 *   TK-02 migration 097: own-rows SELECT only, no client INSERT / UPDATE / DELETE; service role may change status /
 *         reply only (never the student's message); RPC SECDEF '' + auth.uid(), rate caps, authenticated only;
 *         allow-listed; no IP / device columns; rollback
 *   TK-03 actions: flag off → nothing; validated; fixed codes; staff update guarded (admin / staff), audited, writes only
 *         status / staff_reply / timestamps
 *   TK-04 pages flag-gated; "my tickets" reads through the student's session (RLS); ONE primary "New ticket"; the help
 *         page offers the ticket form only when the flag is on
 * Run: node scripts/test_f11_tickets.cjs
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
let reply = null;
let guard = { ok: false };
const writes = [];
const MOCKS = {
  'next/cache': { revalidatePath: () => undefined },
  '@/lib/auth/session-state': { getSessionState: async () => ({ state: 'user', user: { id: 'u1' } }) },
  '@/lib/auth/require-admin': { guardAdminAction: async () => guard },
  '@/lib/supabase/server': {
    createServerSupabaseClient: async () => ({ rpc: async (fn, args) => (rpcCalls.push([fn, args]), reply) }),
    createAdminServerSupabaseClient: () => ({
      from: (t) => {
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: { id: 'x', status: 'OPEN', staff_reply: null } }),
          update: (v) => (writes.push([t, 'update', v]), q),
          insert: async (v) => (writes.push([t, 'insert', v]), { error: null }),
          then: (res) => res({ error: null }),
        };
        return q;
      },
    }),
  },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return origLoad.call(this, request, parent, isMain);
};
const MIG = 'supabase/migrations/20261025000097_f11_support_tickets.sql';
const ID = '11111111-2222-4333-8444-555555555555';

(async () => {
  const T = require(path.join(ROOT, 'lib/support/tickets.ts'));

  await test('TK-01 form rules = DB rules', () => {
    const m = read(MIG);
    const dbCats = (m.match(/category\s+text NOT NULL CHECK \(category IN \(([^)]+)\)\)/) || [])[1];
    assert(dbCats && JSON.stringify(dbCats.match(/'([A-Z_]+)'/g).map((x) => x.slice(1, -1))) === JSON.stringify(T.TICKET_CATEGORIES.map((c) => c.value)), 'category lists differ');
    assert(/BETWEEN 5 AND 120/.test(m) && /BETWEEN 10 AND 3000/.test(m) && T.SUBJECT_MIN === 5 && T.SUBJECT_MAX === 120 && T.MESSAGE_MIN === 10 && T.MESSAGE_MAX === 3000, 'length limits');
    assert(!T.validateTicket({ category: 'X', subject: 'Valid subject', message: 'Valid message body' }).ok && !T.validateTicket({ category: 'TEST', subject: 'abc', message: 'Valid message body' }).ok && T.validateTicket({ category: 'TEST', subject: '  Timer wrong  ', message: 'It jumped a minute.' }).ok, 'validation');
  });

  await test('TK-02 migration 097: own rows, no client writes, staff status/reply only, RPC, rollback', () => {
    const m = sqlCode(read(MIG));
    assert(!/^\s*(BEGIN|COMMIT)\s*;/im.test(m), 'no top-level BEGIN / COMMIT');
    assert(/REVOKE ALL ON public\.support_tickets FROM PUBLIC, anon, authenticated;/.test(m) && /GRANT SELECT ON public\.support_tickets TO authenticated;/.test(m) && /USING \(user_id = auth\.uid\(\)\)/.test(m), 'own-rows SELECT only');
    assert(!/GRANT (INSERT|UPDATE|DELETE)[^;]*TO authenticated/.test(m), 'no client writes');
    assert(/GRANT SELECT, UPDATE \(status, staff_reply, updated_at, resolved_at\) ON public\.support_tickets TO service_role;/.test(m), 'staff column grant (never the message)');
    const table = m.slice(m.indexOf('CREATE TABLE IF NOT EXISTS public.support_tickets'), m.indexOf(');', m.indexOf('CREATE TABLE IF NOT EXISTS public.support_tickets')));
    assert(!/\b(ip|user_agent|device|fingerprint)\w*/i.test(table), 'no device data');
    const fn = m.slice(m.indexOf('CREATE OR REPLACE FUNCTION public.fn_create_support_ticket'), m.indexOf('REVOKE ALL ON FUNCTION public.fn_create_support_ticket'));
    assert(/SECURITY DEFINER\s+SET search_path = ''/.test(fn) && /v_uid\s+uuid := auth\.uid\(\);/.test(fn) && /interval '10 minutes'\) >= 2/.test(fn) && /interval '1 day'\) >= 5/.test(fn), "SECDEF '' + auth.uid() + caps");
    assert(/GRANT EXECUTE ON FUNCTION public\.fn_create_support_ticket\(text, text, text\) TO authenticated;/.test(m) && /FROM PUBLIC, anon;/.test(m), 'authenticated only');
    assert(JSON.parse(read('scripts/secdef/allowlist.json')).functions['fn_create_support_ticket(p_category text, p_subject text, p_message text)']?.class === 'A', 'allow-list');
    assert(/DROP TABLE IF EXISTS public\.support_tickets;/.test(read('docs/database/rollback/097_rollback.sql')), 'rollback');
  });

  await test('TK-03 actions: flag-gated, validated, fixed codes; staff update guarded + audited, status / reply only', async () => {
    const A = require(path.join(ROOT, 'app/help/tickets/actions.ts'));
    delete process.env.SUPPORT_TICKETS_ENABLED;
    assert((await A.createTicketAction({ category: 'TEST', subject: 'Timer wrong', message: 'It jumped a minute.' })).code === 'FAILED' && rpcCalls.length === 0, 'flag off');
    process.env.SUPPORT_TICKETS_ENABLED = 'true';
    assert((await A.createTicketAction({ category: 'TEST', subject: 'ab', message: 'It jumped a minute.' })).code === 'INVALID_INPUT' && rpcCalls.length === 0, 'invalid → no RPC');
    reply = { data: { success: true, code: 'CREATED', ref: 'CL-261025-AB12CD' }, error: null };
    const ok = await A.createTicketAction({ category: 'TEST', subject: 'Timer wrong', message: 'It jumped a minute.' });
    assert(ok.code === 'CREATED' && ok.ref === 'CL-261025-AB12CD' && JSON.stringify(rpcCalls.at(-1)) === JSON.stringify(['fn_create_support_ticket', { p_category: 'TEST', p_subject: 'Timer wrong', p_message: 'It jumped a minute.' }]), 'created');
    reply = { data: { success: false, code: 'boom' }, error: null };
    assert((await A.createTicketAction({ category: 'TEST', subject: 'Timer wrong', message: 'It jumped a minute.' })).code === 'FAILED', 'unknown → FAILED');
    guard = { ok: false };
    assert((await A.updateTicketAction({ id: ID, status: 'RESOLVED', reply: 'Fixed' })).ok === false && writes.length === 0, 'non-staff → refused');
    guard = { ok: true, isAdmin: true, userId: 'admin1', userEmail: 'a@b.c', role: 'staff' };
    assert((await A.updateTicketAction({ id: ID, status: 'DELETED', reply: '' })).ok === false, 'bad status');
    assert((await A.updateTicketAction({ id: ID, status: 'RESOLVED', reply: 'Fixed, thanks.' })).ok === true, 'staff update');
    const upd = writes.find((w) => w[0] === 'support_tickets' && w[1] === 'update')[2];
    assert(JSON.stringify(Object.keys(upd).sort()) === JSON.stringify(['resolved_at', 'staff_reply', 'status', 'updated_at']), `only status / reply / timestamps: ${Object.keys(upd)}`);
    assert(writes.some((w) => w[0] === 'admin_audit_logs' && w[2].action_type === 'SUPPORT_TICKET_UPDATE'), 'audited');
    delete process.env.SUPPORT_TICKETS_ENABLED;
  });

  await test('TK-04 pages flag-gated; own tickets via RLS; one primary; help link only with the flag', () => {
    for (const f of ['app/help/tickets/page.tsx', 'app/help/tickets/new/page.tsx']) assert(/if \(!isSupportTicketsEnabled\(\)\) notFound\(\);/.test(code(read(f))), `${f}: 404 when off`);
    const list = code(read('app/help/tickets/page.tsx'));
    assert(/supabase\.from\("support_tickets"\)/.test(list) && !/createAdminServerSupabaseClient/.test(list), 'student list uses the session (RLS), never the service role');
    assert((list.match(/<ButtonLink\b/g) || []).length === 1, 'ONE primary ("New ticket")');
    assert(/\{isSupportTicketsEnabled\(\) && \(\s*<Link href="\/help\/tickets\/new"/.test(code(read('app/help/page.tsx'))), 'help page link only with the flag');
    assert(/requireAdminPage\(\{ allowStaff: true, path: "\/admin\/support" \}\)/.test(code(read('app/admin/support/page.tsx'))), 'admin queue guarded');
  });

  console.log(`\nF11 tickets: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
