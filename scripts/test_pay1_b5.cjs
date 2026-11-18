#!/usr/bin/env node
/**
 * PAY-1 B5 transactional e-mail — offline gate (no network, no DB; owner D8 + E1–E7, 2026-11-18).
 *   B5-01 migration 150: 149 preflight; email_events (kind / key / status / attempts / mode CHECKs, event_key UNIQUE,
 *         FK to auth.users); RLS on, no policy, service_role SELECT / INSERT / UPDATE only (no DELETE); no address /
 *         name / body column; no function (SECDEF count unchanged); no BEGIN / COMMIT; a proof block
 *   B5-02 rollback 150: chain line; drops the table; proof
 *   B5-03 the REAL ZeptoMail client with a fake fetch: the India endpoint, POST, the Zoho-enczapikey header, text + HTML,
 *         reply-to, no tracking; 2xx → SENT (request id); 4xx / 503 → FAILED; other 5xx, a timeout, a network error →
 *         UNKNOWN; no token / a bad address → FAILED with no call
 *   B5-04 the REAL templates: the four e-mails; links only <site>/billing, <site>/pricing and the support mailto; the one
 *         banner image with alt / width / height; nothing remote, no utm_; every value escaped; a plain-text twin with
 *         the same facts; the support address in both; E7 "not a tax invoice" only while not GST-registered; India dates;
 *         E1 the QA subject; refund variants (full / partial / unapplied)
 *   B5-05 sendEvent (at most once): OFF claims nothing; claim → send → SENT; the same event again → DUPLICATE, no send;
 *         FAILED → retried by take-back only (≤ 3 attempts); UNKNOWN never re-sent; a QA account → the QA inbox with the
 *         QA subject; a test-mode event for a non-QA account → SUPPRESSED, no send; no address → SUPPRESSED; unreadable
 *         facts → NO_DATA, nothing recorded; a renewed plan → STALE, no send; no log line holds an address
 *   B5-06 runEmailJob: a held lease → busy, nothing read; the lease is released when a step throws; stale claims expire
 *         after 10 min; reminders only from 09:00 India time; D7 / D1 windows (a missed D7 is not sent late); existing
 *         keys skipped; at most 25 sends a run; retries only after 30 min
 *   B5-07 the route and the trigger: POST only; the ONLY auth is the CRON_SECRET bearer (constant time, SHA-256), before
 *         any read; e-mail off → skipped; the workflow only POSTs (CRON_SECRET + EMAILS_URL, no ZeptoMail value), is gated
 *         by PAYMENTS_EMAILS_ENABLED, has no permissions and never prints the host
 *   B5-08 wiring: the receipt after every fulfil path, the refund confirmation after a recorded refund (webhook + replay,
 *         not for a repeat); the stub and the old GET reminders route are gone; the sender, reply-to, QA inbox and the
 *         EMAIL_APP_ENABLED switch; the admin "E-mails to check" list
 *   B5-09 negative controls: each mutation is caught
 * Run: node scripts/test_pay1_b5.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
const results = [];
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    results.push(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    results.push(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 900)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const ts = require('typescript');
const transpile = (src, filename) => ts.transpileModule(src, { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
require.extensions['.ts'] = (module, filename) => module._compile(transpile(fs.readFileSync(filename, 'utf8'), filename), filename);
/** Load a TS module from (possibly mutated) source, resolving its relative imports from the real file's folder. */
function loadTs(rel, src) {
  const filename = path.join(ROOT, rel);
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  m._compile(transpile(src ?? read(rel), filename), filename);
  return m.exports;
}

const MIG = read('supabase/migrations/20261118000150_pay1_b5_email_events.sql');
const RB = read('docs/database/rollback/150_rollback.sql');
const ZEPTO_SRC = read('lib/email/zeptomail.ts');
const TPL_SRC = read('lib/email/pro-templates.ts');
const CORE_SRC = read('lib/email/pro-emails.ts');
const SERVER_SRC = read('lib/email/pro-email-server.ts');
const ROUTE_SRC = read('app/api/cron/emails/route.ts');
const WF_SRC = read('.github/workflows/payments-emails.yml');
const PROSERVER_SRC = read('lib/payments/pro-server.ts');
const FLOWS_SRC = read('lib/payments/pro-flows.ts');
const ADMIN_SVC = read('services/admin.service.ts');
const ADMIN_UI = read('components/admin/admin-billing-manager.tsx');

const SITE = 'https://couragelibrary.in';
const SUPPORT = ['support', 'couragelibrary.in'].join('@');
const QA_INBOX = ['qa', 'couragelibrary.in'].join('@');

// ------------------------------------------------------------------ checks as functions (re-used by the negative controls)
function checkMigration(sql) {
  const s = sql.replace(/--[^\n]*/g, '');
  assert(/IF NOT EXISTS \(SELECT 1 FROM public\.schema_migration_ledger WHERE filename = '20261118000149_pay1_b4_payment_robustness\.sql' AND status = 'APPLIED'\)/.test(s), 'no 149 preflight');
  assert(/CREATE TABLE public\.email_events \(/.test(s), 'no email_events table');
  assert(/kind\s+text NOT NULL CHECK \(kind IN \('PRO_RECEIPT', 'PRO_EXPIRY_D7', 'PRO_EXPIRY_D1', 'PRO_REFUND'\)\)/.test(s), 'kind CHECK');
  assert(/event_key\s+text NOT NULL UNIQUE CHECK \(event_key ~ '\^\(receipt\|expiry\|refund\):\[A-Za-z0-9:\._-\]\{3,160\}\$'\)/.test(s), 'event_key UNIQUE + format CHECK');
  assert(/user_id\s+uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/.test(s), 'user_id FK');
  assert(/status\s+text NOT NULL DEFAULT 'CLAIMED' CHECK \(status IN \('CLAIMED', 'SENT', 'FAILED', 'UNKNOWN', 'SUPPRESSED'\)\)/.test(s), 'status CHECK');
  assert(/attempts\s+integer NOT NULL DEFAULT 1 CHECK \(attempts BETWEEN 1 AND 3\)/.test(s), 'attempts 1..3');
  assert(/gateway_mode\s+text NOT NULL DEFAULT 'live' CHECK \(gateway_mode IN \('test', 'live'\)\)/.test(s), 'mode CHECK');
  assert(/ALTER TABLE public\.email_events ENABLE ROW LEVEL SECURITY;/.test(s), 'RLS not enabled');
  assert(/REVOKE ALL ON TABLE public\.email_events FROM PUBLIC, anon, authenticated;/.test(s), 'client access not revoked');
  assert(/GRANT SELECT, INSERT, UPDATE ON TABLE public\.email_events TO service_role;/.test(s), 'service_role grant not exactly SELECT, INSERT, UPDATE');
  assert(!/GRANT[^;]*DELETE[^;]*email_events/i.test(s), 'DELETE granted');
  assert(!/CREATE POLICY/i.test(s), 'a policy on email_events');
  assert(!/CREATE (OR REPLACE )?FUNCTION|SECURITY DEFINER/i.test(s), 'a function in 150 (the SECDEF count must not change)');
  assert(!/^\s*(BEGIN|COMMIT)\s*;/im.test(s), 'BEGIN / COMMIT in the migration');
  const cols = (s.match(/CREATE TABLE public\.email_events \(([\s\S]*?)\n\);/) || [])[1] || '';
  const names = cols.split('\n').map((l) => (l.trim().match(/^([a-z_]+)\s/) || [])[1]).filter(Boolean);
  for (const n of names) assert(!/(email|address|name|body|subject|html|^text)$/.test(n), `a column that could hold personal data: ${n}`);
  assert(/DO \$proof\$[\s\S]*relrowsecurity[\s\S]*pg_policies[\s\S]*has_table_privilege\('service_role', 'public\.email_events', 'DELETE'\)/.test(s), 'proof block incomplete');
  return `${names.length} columns`;
}

function checkRollback(sql) {
  assert(/^-- ROLLBACK-CHAIN: run first: none$/m.test(sql), 'chain line');
  assert(/DROP TABLE public\.email_events;/.test(sql), 'does not drop the table');
  assert(/ROLLBACK_150_PROOF/.test(sql), 'no proof');
  assert(!/^\s*(BEGIN|COMMIT)\s*;/im.test(sql.replace(/--[^\n]*/g, '')), 'BEGIN / COMMIT');
}

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return { status: r.status, json: async () => r.body ?? {} };
  };
  fn.calls = calls;
  return fn;
}
const named = (name) => Object.assign(new Error(name), { name });
const IDENT = { from: 'no-reply@couragelibrary.in', fromName: 'Courage Library', replyTo: SUPPORT };
const TOKEN = 'Zoho-enczapikey ' + 'x'.repeat(40);

async function checkZepto(Z) {
  const f = fakeFetch([{ status: 201, body: { request_id: 'req-123', data: [{ code: 'EM_104' }] } }]);
  const mail = Z.createZeptoMail({ token: TOKEN, identity: IDENT, fetch: f });
  const out = await mail.send({ to: 'student@example.com', subject: 'S', html: '<p>h</p>', text: 't' });
  assert(out.kind === 'SENT' && out.ref === 'req-123', `2xx → SENT with the request id (${JSON.stringify(out)})`);
  const call = f.calls[0];
  assert(call.url === 'https://api.zeptomail.in/v1.1/email' && call.init.method === 'POST', 'not the India endpoint / POST');
  assert(call.init.headers.Authorization === TOKEN, 'auth header');
  assert(call.init.signal, 'no timeout signal');
  const body = JSON.parse(call.init.body);
  assert(body.from.address === IDENT.from && body.reply_to[0].address === SUPPORT && body.to[0].email_address.address === 'student@example.com', 'from / reply-to / to');
  assert(body.htmlbody === '<p>h</p>' && body.textbody === 't', 'html + text');
  assert(body.track_clicks === false && body.track_opens === false, 'tracking not off');
  assert(Z.authHeader('abc' + 'y'.repeat(30)) === 'Zoho-enczapikey abc' + 'y'.repeat(30), 'a bare key gets the prefix');
  const expect = [
    [{ status: 400 }, 'FAILED'], [{ status: 401 }, 'FAILED'], [{ status: 429 }, 'FAILED'], [{ status: 503 }, 'FAILED'],
    [{ status: 500 }, 'UNKNOWN'], [{ status: 502 }, 'UNKNOWN'], [{ status: 504 }, 'UNKNOWN'],
    [named('TimeoutError'), 'UNKNOWN'], [named('AbortError'), 'UNKNOWN'], [Object.assign(new TypeError('fetch failed'), { name: 'TypeError' }), 'UNKNOWN'],
  ];
  for (const [resp, kind] of expect) {
    const m = Z.createZeptoMail({ token: TOKEN, identity: IDENT, fetch: fakeFetch([resp]) });
    const o = await m.send({ to: 'a@example.com', subject: 's', html: 'h', text: 't' });
    assert(o.kind === kind, `${resp instanceof Error ? resp.name : resp.status} → ${o.kind}, want ${kind}`);
  }
  const t = await Z.createZeptoMail({ token: TOKEN, identity: IDENT, fetch: fakeFetch([named('TimeoutError')]) }).send({ to: 'a@example.com', subject: 's', html: 'h', text: 't' });
  assert(t.code === 'TIMEOUT', 'a timeout is coded TIMEOUT');
  const nf = fakeFetch([]);
  const noTok = await Z.createZeptoMail({ token: '', identity: IDENT, fetch: nf }).send({ to: 'a@example.com', subject: 's', html: 'h', text: 't' });
  const badTo = await Z.createZeptoMail({ token: TOKEN, identity: IDENT, fetch: nf }).send({ to: 'not an address', subject: 's', html: 'h', text: 't' });
  assert(noTok.kind === 'FAILED' && noTok.code === 'NO_TOKEN' && badTo.kind === 'FAILED' && nf.calls.length === 0, 'no token / bad address must fail with no call');
  return `${expect.length} outcomes`;
}

const ALLOWED_HREFS = (site) => [`${site}/billing`, `${site}/pricing`, `mailto:${SUPPORT}`];
function checkHtml(html, site) {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  for (const h of hrefs) assert(ALLOWED_HREFS(site).includes(h), `link not allowed: ${h}`);
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  assert(imgs.length === 1 && /src="https:\/\/couragelibrary\.in\/email\/banner\.png"/.test(imgs[0]) && /alt="[^"]{3,}"/.test(imgs[0]) && /width="\d+"/.test(imgs[0]) && /height="\d+"/.test(imgs[0]), 'exactly the banner image with alt / width / height');
  assert(!/utm_|<script\b|<link\b|<iframe\b|url\(|srcset=|background="/i.test(html), 'remote resource / script / utm_');
  assert(!/amber|yellow|#f59e0b|#fbbf24|#facc15|#eab308/i.test(html), 'amber / yellow in an e-mail');
  assert(html.includes(`mailto:${SUPPORT}`) && html.includes(SUPPORT), 'no support contact in the HTML');
  assert(/#1d4ed8/i.test(html), 'not the brand button colour');
}

function checkTemplates(T) {
  const ctx = { siteUrl: SITE, supportEmail: SUPPORT };
  const rec = T.renderReceipt({ receiptNumber: 'CL-R-261118-ABC123', planCode: 'PRO_12M', amountPaise: 79900, paidAt: '2026-11-18T06:00:00Z', proUntil: '2027-11-30T20:00:00Z', gstRegistered: false }, ctx);
  checkHtml(rec.html, SITE);
  assert(rec.subject === 'Your Courage Library Pro receipt CL-R-261118-ABC123', `receipt subject: ${rec.subject}`);
  for (const fact of ['CL-R-261118-ABC123', 'Pro · 12 months', '₹799', '18 November 2026', '1 December 2027', 'not a tax invoice', SUPPORT, `${SITE}/billing`]) {
    assert(rec.text.includes(fact), `receipt text misses ${fact}`);
    assert(rec.html.includes(fact.replace(/&/g, '&amp;')), `receipt HTML misses ${fact}`);
  }
  const gst = T.renderReceipt({ receiptNumber: 'CL-R-1', planCode: 'PRO_3M', amountPaise: 29950, paidAt: '2026-11-18T06:00:00Z', proUntil: '2027-02-18T06:00:00Z', gstRegistered: true }, ctx);
  assert(!/not a tax invoice/i.test(gst.html + gst.text) && gst.text.includes('₹299.50'), 'E7: GST-registered → no "not a tax invoice"; paise shown');
  const evil = T.renderReceipt({ receiptNumber: '<script>alert(1)</script>"', planCode: '<b>x</b>', amountPaise: 100, paidAt: 'bad', proUntil: 'bad', gstRegistered: false }, ctx);
  assert(!/<script>|<b>x<\/b>/.test(evil.html) && evil.html.includes('&lt;script&gt;') && evil.html.includes('—'), 'values not escaped / bad dates not handled');
  const d7 = T.renderExpiry('PRO_EXPIRY_D7', { endsAt: '2026-11-25T20:00:00Z' }, ctx);
  const d1 = T.renderExpiry('PRO_EXPIRY_D1', { endsAt: '2026-11-25T20:00:00Z' }, ctx);
  checkHtml(d7.html, SITE);
  checkHtml(d1.html, SITE);
  assert(d7.subject === 'Your Pro plan ends in 7 days' && d1.subject === 'Your Pro plan ends tomorrow', 'reminder subjects');
  assert(d7.text.includes('26 November 2026') && d7.text.includes(`${SITE}/pricing`) && d7.text.includes(SUPPORT), 'reminder: India date / renew link / support');
  const full = T.renderRefund({ receiptNumber: 'CL-R-9', refundedTotalPaise: 79900, full: true, unapplied: false, proUntil: null }, ctx);
  const part = T.renderRefund({ receiptNumber: 'CL-R-9', refundedTotalPaise: 20000, full: false, unapplied: false, proUntil: '2027-05-01T00:00:00Z' }, ctx);
  const dup = T.renderRefund({ receiptNumber: null, refundedTotalPaise: 29900, full: true, unapplied: true, proUntil: '2027-02-01T00:00:00Z' }, ctx);
  for (const r of [full, part, dup]) checkHtml(r.html, SITE);
  assert(full.text.includes('₹799') && full.text.includes('has ended') && full.subject === 'Refund recorded for receipt CL-R-9', 'full refund');
  assert(part.text.includes('₹200') && part.text.includes('active until 1 May 2027'), 'partial refund');
  assert(dup.subject === 'Refund of a duplicate payment' && dup.text.includes('Unchanged') && dup.text.includes('₹299'), 'unapplied refund');
  assert(full.text.includes('5–7 working days'), 'refund timing wording (Refund Policy)');
  const qa = T.renderExpiry('PRO_EXPIRY_D1', { endsAt: '2026-11-25T20:00:00Z' }, { ...ctx, qaFor: 'qa-student@courage-library.test' });
  assert(qa.subject === '[QA test for qa-student@courage-library.test] Your Pro plan ends tomorrow', `QA subject: ${qa.subject}`);
  return '4 kinds, 3 refund variants';
}

// a fake world for the core
function world(over = {}) {
  const rows = new Map();
  const sent = [];
  const logs = [];
  let n = 0;
  const outcomes = over.outcomes || [];
  const deps = {
    enabled: true,
    transport: { send: async (m) => { sent.push(m); return outcomes.shift() || { kind: 'SENT', ref: 'req-' + sent.length }; } },
    ctx: { siteUrl: SITE, supportEmail: SUPPORT },
    qaInbox: QA_INBOX,
    getUserEmail: async (id) => (over.emails ? over.emails[id] : 'student@example.com') ?? null,
    load: async (ev, ctx) => (over.load ? over.load(ev, ctx) : { subject: (ctx.qaFor ? `[QA test for ${ctx.qaFor}] ` : '') + 'Subject ' + ev.kind, html: '<p>h</p>', text: 't' }),
    claim: async (ev) => { if ([...rows.values()].some((r) => r.key === ev.key)) return null; const id = 'e' + ++n; rows.set(id, { ...ev, status: 'CLAIMED', attempts: 1 }); return { id }; },
    reclaim: async (id) => { const r = rows.get(id); if (!r || r.status !== 'FAILED' || r.attempts >= 3) return false; r.status = 'CLAIMED'; r.attempts++; return true; },
    finish: async (id, status, info) => { const r = rows.get(id); if (r && r.status === 'CLAIMED') Object.assign(r, { status, info }); },
    log: (e) => logs.push(JSON.stringify(e)),
  };
  return { deps: { ...deps, ...(over.deps || {}) }, rows, sent, logs };
}
const EV = (o = {}) => ({ kind: 'PRO_RECEIPT', key: 'receipt:11111111-1111-4111-8111-111111111111', userId: 'u1', mode: 'live', ...o });

async function checkCore(C) {
  // OFF
  let w = world({ deps: { enabled: false } });
  assert((await C.sendEvent(EV(), w.deps)) === 'OFF' && w.rows.size === 0 && w.sent.length === 0, 'OFF must claim / send nothing');
  // normal + duplicate
  w = world();
  assert((await C.sendEvent(EV(), w.deps)) === 'SENT', 'first send');
  assert((await C.sendEvent(EV(), w.deps)) === 'DUPLICATE' && w.sent.length === 1, 'the same event again must not send');
  const r1 = [...w.rows.values()][0];
  assert(r1.status === 'SENT' && r1.info.ref === 'req-1' && w.sent[0].to === 'student@example.com', 'SENT with the request id, to the account address');
  // FAILED → retry by take-back, ≤ 3 attempts
  w = world({ outcomes: [{ kind: 'FAILED', code: 'HTTP_429' }, { kind: 'FAILED', code: 'HTTP_429' }, { kind: 'FAILED', code: 'HTTP_429' }, { kind: 'SENT', ref: 'x' }] });
  assert((await C.sendEvent(EV(), w.deps)) === 'FAILED', 'FAILED');
  const fid = [...w.rows.keys()][0];
  assert((await C.sendEvent(EV(), w.deps)) === 'DUPLICATE', 'a FAILED event is not re-sent by a fresh claim');
  assert((await C.sendEvent(EV(), w.deps, fid)) === 'FAILED' && (await C.sendEvent(EV(), w.deps, fid)) === 'FAILED', 'retries 2 and 3');
  assert((await C.sendEvent(EV(), w.deps, fid)) === 'DUPLICATE' && w.sent.length === 3 && w.rows.get(fid).attempts === 3, 'no 4th attempt');
  // UNKNOWN is never re-sent
  w = world({ outcomes: [{ kind: 'UNKNOWN', code: 'TIMEOUT' }] });
  assert((await C.sendEvent(EV(), w.deps)) === 'UNKNOWN', 'UNKNOWN');
  const uid = [...w.rows.keys()][0];
  assert((await C.sendEvent(EV(), w.deps)) === 'DUPLICATE' && (await C.sendEvent(EV(), w.deps, uid)) === 'DUPLICATE' && w.sent.length === 1, 'UNKNOWN must never be sent again');
  // QA → the QA inbox with the QA subject; test mode non-QA → suppressed; no address → suppressed
  w = world({ emails: { u1: 'qa-student@courage-library.test', u2: 'student@example.com', u3: null } });
  assert((await C.sendEvent(EV({ mode: 'test' }), w.deps)) === 'SENT' && w.sent[0].to === QA_INBOX && w.sent[0].subject.startsWith('[QA test for qa-student@courage-library.test]'), 'QA → QA inbox + QA subject');
  assert((await C.sendEvent(EV({ key: 'receipt:22222222-2222-4222-8222-222222222222', userId: 'u2', mode: 'test' }), w.deps)) === 'SUPPRESSED', 'test mode, non-QA → SUPPRESSED');
  assert((await C.sendEvent(EV({ key: 'receipt:33333333-3333-4333-8333-333333333333', userId: 'u3' }), w.deps)) === 'SUPPRESSED', 'no address → SUPPRESSED');
  assert(w.sent.length === 1, 'suppressed events must not send');
  const sup = [...w.rows.values()].filter((r) => r.status === 'SUPPRESSED').map((r) => r.info.code).sort().join(',');
  assert(sup === 'NO_ADDRESS,TEST_NON_QA', `suppression codes: ${sup}`);
  // NO_DATA records nothing; STALE suppresses
  w = world({ load: async () => null });
  assert((await C.sendEvent(EV(), w.deps)) === 'NO_DATA' && w.rows.size === 0 && w.sent.length === 0, 'NO_DATA must record nothing (the job retries)');
  w = world({ load: async () => 'STALE' });
  assert((await C.sendEvent(EV({ kind: 'PRO_EXPIRY_D7', key: 'expiry:D7:u1:1' }), w.deps)) === 'STALE' && w.sent.length === 0 && [...w.rows.values()][0].status === 'SUPPRESSED', 'STALE → recorded, not sent');
  // logs never hold an address
  w = world({ emails: { u1: 'person@example.com' }, outcomes: [{ kind: 'FAILED', code: 'HTTP_400' }] });
  await C.sendEvent(EV(), w.deps);
  assert(w.logs.length > 0 && !w.logs.some((l) => l.includes('@')), `a log line holds an address: ${w.logs.join(' | ')}`);
  return '9 cases';
}

function jobWorld(over = {}) {
  const w = world(over);
  const leases = { held: over.held ?? false, released: 0 };
  const seen = { expireBefore: null, retryBefore: null, reads: 0 };
  const jd = {
    ...w.deps,
    acquireLease: async () => !leases.held,
    releaseLease: async () => { leases.released++; },
    newHolder: () => 'h',
    now: () => over.now ?? new Date('2026-11-18T04:00:00Z'),
    expireClaims: async (t) => { seen.expireBefore = t; return 0; },
    listReceipts: async () => { seen.reads++; if (over.throwIn === 'receipts') throw new Error('boom'); return over.receipts ?? []; },
    listRefunds: async () => over.refunds ?? [],
    listProEnds: async () => over.ends ?? [],
    listRetries: async (t) => { seen.retryBefore = t; return over.retries ?? []; },
    existingKeys: async (keys) => new Set(keys.filter((k) => (over.existing ?? []).includes(k))),
    ...(over.jd || {}),
  };
  return { ...w, jd, leases, seen };
}

async function checkJob(C) {
  let j = jobWorld({ held: true });
  let s = await C.runEmailJob(j.jd);
  assert(s.outcome === 'busy' && j.seen.reads === 0 && j.sent.length === 0, 'a held lease → busy, nothing read');
  j = jobWorld({ throwIn: 'receipts' });
  let threw = false;
  try { await C.runEmailJob(j.jd); } catch { threw = true; }
  assert(threw && j.leases.released === 1, 'the lease must be released when a step throws');
  const now = new Date('2026-11-18T04:00:00Z'); // 09:30 IST
  j = jobWorld({ now });
  await C.runEmailJob(j.jd);
  assert(j.seen.expireBefore.getTime() === now.getTime() - 10 * 60e3, 'stale claims: 10 min');
  assert(j.seen.retryBefore.getTime() === now.getTime() - 30 * 60e3, 'retries: after 30 min');
  // reminder hour (E5): 08:59 IST → none; 09:00 IST → yes
  assert(!C.reminderHourReached(new Date('2026-11-18T03:29:00Z')) && C.reminderHourReached(new Date('2026-11-18T03:30:00Z')), 'reminders from 09:00 India time');
  const end = (days) => ({ userId: 'u' + days, endsAt: new Date(now.getTime() + days * 86400e3).toISOString(), mode: 'live' });
  const k = (d) => C.reminderFor(end(d), now);
  assert(k(8) === null && k(7).kind === 'PRO_EXPIRY_D7' && k(1.5).kind === 'PRO_EXPIRY_D7' && k(1).kind === 'PRO_EXPIRY_D1' && k(0.2).kind === 'PRO_EXPIRY_D1' && k(-0.1) === null, 'D7 / D1 windows');
  assert(/^expiry:D7:u7:\d+$/.test(k(7).key) && /^expiry:D1:u0\.2:\d+$/.test(k(0.2).key), 'reminder keys carry the end');
  const early = jobWorld({ now: new Date('2026-11-18T03:00:00Z'), ends: [end(3)] });
  s = await C.runEmailJob(early.jd);
  assert(s.reminders === false && early.sent.length === 0, 'no reminder before 09:00 IST');
  const late = jobWorld({ now, ends: [end(3), end(0.5), end(9)], existing: [C.reminderFor(end(0.5), now).key] });
  s = await C.runEmailJob(late.jd);
  assert(s.reminders === true && late.sent.length === 1 && late.sent[0].subject.includes('PRO_EXPIRY_D7'), `existing key skipped, one D7 sent (${late.sent.map((m) => m.subject).join(',')})`);
  const many = Array.from({ length: 40 }, (_, i) => EV({ key: `receipt:r${String(i).padStart(4, '0')}`, userId: 'u' + i }));
  const cap = jobWorld({ now, receipts: many });
  s = await C.runEmailJob(cap.jd);
  assert(cap.sent.length === 25, `at most 25 sends a run (${cap.sent.length})`);
  return 'lease, windows, cap';
}

function checkRoute(src) {
  assert(/export async function POST\(/.test(src) && !/export async function (GET|PUT|PATCH|DELETE)\(/.test(src), 'POST only');
  assert(/timingSafeEqual\(digest\(req\.headers\.get\("authorization"\) \?\? ""\), digest\(`Bearer \$\{secret\}`\)\)/.test(src), 'constant-time bearer over SHA-256');
  assert(/if \(secret\.length < 16\) return false;/.test(src), 'secret length floor');
  const post = src.slice(src.indexOf('export async function POST('));
  assert(post.indexOf('authorized(req)') < post.indexOf('emailEnabled()') && post.indexOf('emailEnabled()') < post.indexOf('getEmailJobDeps()'), 'auth before any read; e-mail off before the job');
  assert(/status: 401/.test(post) && /skipped: "EMAIL_OFF"/.test(post), '401 / skipped');
  assert(!/searchParams|nextUrl\.search|cookies\(/.test(src), 'another auth path (query / cookie)');
}

function checkWorkflow(wf) {
  assert(/^permissions: \{\}$/m.test(wf), 'permissions not empty');
  assert(/if: vars\.PAYMENTS_EMAILS_ENABLED == 'true'/.test(wf), 'not gated by PAYMENTS_EMAILS_ENABLED');
  assert(/secrets\.CRON_SECRET/.test(wf) && /secrets\.EMAILS_URL/.test(wf), 'secrets');
  const secretNames = [...wf.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]);
  assert(secretNames.every((n) => n === 'CRON_SECRET' || n === 'EMAILS_URL'), `other secrets: ${secretNames.join(',')}`);
  assert(!/ZEPTO|enczapikey/i.test(wf.replace(/^#.*$/gm, '')), 'a ZeptoMail value in the workflow');
  assert(/curl -s -o body\.json/.test(wf) && /-X POST/.test(wf), 'curl -s POST');
  assert(/cron: "7 \* \* \* \*"/.test(wf), 'hourly schedule');
}

function checkWiring() {
  assert(/afterFulfil: async \(r\) => \{[\s\S]*?sendProEmailNow\(\{ kind: "PRO_RECEIPT", key: `receipt:\$\{r\.order_id\}`, userId: r\.user_id, mode: state\.mode \}\)/.test(PROSERVER_SRC), 'receipt after fulfil');
  assert(/afterRefund: async \(refundId\) => \{[\s\S]*?sendRefundEmailNow\(refundId\)/.test(PROSERVER_SRC), 'refund confirmation hook');
  assert(!/EMAIL_NOT_CONFIGURED|ops\.email_pending/.test(PROSERVER_SRC), 'the old stub is still there');
  assert(!fs.existsSync(path.join(ROOT, 'app/api/cron/pro-reminders/route.ts')), 'the old GET reminders route is still there');
  assert((FLOWS_SRC.match(/already_processed !== true\) await runAfterRefund\(deps, /g) || []).length === 2, 'afterRefund after the webhook refund and the replay, not for a repeat');
  assert(/if \(!r\.already_fulfilled && deps\.afterFulfil\)/.test(FLOWS_SRC), 'afterFulfil only for a new fulfil (all three paths call fulfil)');
  assert(/export const EMAIL_FROM = "no-reply@couragelibrary\.in";/.test(SERVER_SRC) && /replyTo: SUPPORT_EMAIL/.test(SERVER_SRC), 'sender / reply-to');
  assert(SERVER_SRC.includes(`export const QA_INBOX = "${QA_INBOX}";`), 'QA inbox');
  assert(/process\.env\.EMAIL_APP_ENABLED === "true" && \(process\.env\.ZEPTOMAIL_TOKEN \?\? ""\)\.trim\(\)\.length >= 20/.test(SERVER_SRC), 'EMAIL_APP_ENABLED switch + token');
  assert(!/console\.(log|info|warn|error)\(/.test(SERVER_SRC + CORE_SRC + ZEPTO_SRC + TPL_SRC), 'a console call in the e-mail modules (logs go through the ids-only logger)');
  assert(/from\("email_events"\)[\s\S]*?\.or\("status\.eq\.UNKNOWN,and\(status\.eq\.FAILED,attempts\.gte\.3\)"\)/.test(ADMIN_SVC) && /data-email-issues=""/.test(ADMIN_UI), 'admin "E-mails to check" list');
  assert(!/text-(amber|yellow)-/.test(ADMIN_UI), 'amber / yellow class in the admin UI');
}

(async () => {
  const Z = loadTs('lib/email/zeptomail.ts');
  const T = loadTs('lib/email/pro-templates.ts');
  const C = loadTs('lib/email/pro-emails.ts');

  await test('B5-01 migration 150 (table only, RLS, service role, no personal data, proof)', () => checkMigration(MIG));
  await test('B5-02 rollback 150', () => checkRollback(RB));
  await test('B5-03 the real ZeptoMail client (endpoint, header, text + HTML, outcomes)', () => checkZepto(Z));
  await test('B5-04 the real templates (links, image, escaping, text twin, E7, India dates, QA subject, refunds)', () => checkTemplates(T));
  await test('B5-05 sendEvent: at most once, retries, UNKNOWN, QA / test-mode routing, no address in logs', () => checkCore(C));
  await test('B5-06 runEmailJob: lease, stale claims, 09:00 IST, D7 / D1, existing keys, cap, retries', () => checkJob(C));
  await test('B5-07 the route and the workflow', () => { checkRoute(ROUTE_SRC); checkWorkflow(WF_SRC); });
  await test('B5-08 wiring (receipt / refund hooks, stub + old route gone, sender, switch, admin list)', () => checkWiring());

  await test('B5-09 negative controls: each mutation is caught', async () => {
    const mut = (src, a, b) => { assert(src.includes(a), `mutation anchor missing: ${a.slice(0, 50)}`); return src.replace(a, b); };
    const cases = [
      ['migration: DELETE granted', () => checkMigration(mut(MIG, 'GRANT SELECT, INSERT, UPDATE ON TABLE public.email_events TO service_role;', 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_events TO service_role;'))],
      ['migration: no UNIQUE key', () => checkMigration(mut(MIG, 'event_key     text NOT NULL UNIQUE CHECK', 'event_key     text NOT NULL CHECK'))],
      ['migration: RLS off', () => checkMigration(mut(MIG, 'ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;', ''))],
      ['migration: an address column', () => checkMigration(mut(MIG, '    sent_at       timestamptz\n', '    sent_at       timestamptz,\n    to_email      text\n'))],
      ['migration: a SECDEF function', () => checkMigration(MIG + '\nCREATE FUNCTION public.x() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ select 1 $$;')],
      ['rollback: keeps the table', () => checkRollback(mut(RB, 'DROP TABLE public.email_events;', ''))],
      ['zepto: tracking on', () => checkZepto(loadTs('lib/email/zeptomail.ts', mut(ZEPTO_SRC, 'track_opens: false', 'track_opens: true')))],
      ['zepto: 500 retried (FAILED)', () => checkZepto(loadTs('lib/email/zeptomail.ts', mut(ZEPTO_SRC, '(res.status >= 400 && res.status < 500) || res.status === 503', 'res.status >= 400')))],
      ['zepto: timeout treated as FAILED', () => checkZepto(loadTs('lib/email/zeptomail.ts', mut(ZEPTO_SRC, 'return { kind: "UNKNOWN", code: name ===', 'return { kind: "FAILED", code: name ===')))],
      ['zepto: no text body', () => checkZepto(loadTs('lib/email/zeptomail.ts', mut(ZEPTO_SRC, 'textbody: m.text,', '')))],
      ['templates: no escaping', () => checkTemplates(loadTs('lib/email/pro-templates.ts', mut(TPL_SRC, 'export const esc = (s: string) => s.replace', 'export const esc = (s: string) => s; const _unused = (s: string) => s.replace')))],
      ['templates: a tracking link', () => checkTemplates(loadTs('lib/email/pro-templates.ts', mut(TPL_SRC, 'const url = `${site}${l.button.path}`;', 'const url = `${site}${l.button.path}?utm_source=email`;')))],
      ['templates: no "not a tax invoice"', () => checkTemplates(loadTs('lib/email/pro-templates.ts', mut(TPL_SRC, '"Payment receipt — not a tax invoice. No GST is charged. ', '"')))],
      ['templates: UTC dates', () => checkTemplates(loadTs('lib/email/pro-templates.ts', mut(TPL_SRC, 'timeZone: "Asia/Kolkata"', 'timeZone: "UTC"')))],
      ['templates: no QA subject', () => checkTemplates(loadTs('lib/email/pro-templates.ts', mut(TPL_SRC, 'const subject = ctx.qaFor ? `[QA test for ${ctx.qaFor}] ${l.subject}` : l.subject;', 'const subject = l.subject;')))],
      ['core: QA mail to the account', () => checkCore(loadTs('lib/email/pro-emails.ts', mut(CORE_SRC, 'to: qa ? deps.qaInbox : (address as string)', 'to: address as string')))],
      ['core: test mode mails anyone', () => checkCore(loadTs('lib/email/pro-emails.ts', mut(CORE_SRC, 'else if (ev.mode === "test" && !qa) suppress = "TEST_NON_QA";', '')))],
      ['core: claim skipped on duplicate', () => checkCore(loadTs('lib/email/pro-emails.ts', mut(CORE_SRC, '    if (!c) return "DUPLICATE";\n    id = c.id;', '    id = c ? c.id : "x";')))],
      ['core: address in the log', () => checkCore(loadTs('lib/email/pro-emails.ts', mut(CORE_SRC, 'ids: { user_id: ev.userId, key: keyId(ev.key) } });\n  return out.kind;', 'ids: { user_id: ev.userId, to: address, key: keyId(ev.key) } });\n  return out.kind;')))],
      ['job: lease not released', () => checkJob(loadTs('lib/email/pro-emails.ts', mut(CORE_SRC, '  } finally {\n    await deps.releaseLease(holder);\n  }\n  return sum;', '  } finally {\n  }\n  return sum;')))],
      ['job: reminders any hour', () => checkJob(loadTs('lib/email/pro-emails.ts', mut(CORE_SRC, '.getUTCHours() >= EMAIL_JOB.reminderHourIst', '.getUTCHours() >= 0')))],
      ['job: missed D7 sent late', () => checkJob(loadTs('lib/email/pro-emails.ts', mut(CORE_SRC, 'const kind = days <= 1 ? "PRO_EXPIRY_D1" : days <= 7 ? "PRO_EXPIRY_D7" : null;', 'const kind = days <= 7 ? "PRO_EXPIRY_D7" : null;')))],
      ['job: no send cap', () => checkJob(loadTs('lib/email/pro-emails.ts', mut(CORE_SRC, 'maxSends: 25,', 'maxSends: 1000,')))],
      ['route: GET handler', () => checkRoute(ROUTE_SRC + '\nexport async function GET() { return null; }')],
      ['route: query-string auth', () => checkRoute(mut(ROUTE_SRC, 'if (!authorized(req))', 'if (!authorized(req) && !req.nextUrl.searchParams.get("key"))'))],
      ['workflow: no gate', () => checkWorkflow(mut(WF_SRC, "    if: vars.PAYMENTS_EMAILS_ENABLED == 'true'\n", ''))],
      ['workflow: a ZeptoMail secret', () => checkWorkflow(mut(WF_SRC, '          EMAILS_URL: ${{ secrets.EMAILS_URL }}', '          EMAILS_URL: ${{ secrets.EMAILS_URL }}\n          ZEPTOMAIL_TOKEN: ${{ secrets.ZEPTOMAIL_TOKEN }}'))],
    ];
    const missed = [];
    for (const [name, fn] of cases) {
      let caught = false;
      try { await fn(); } catch (e) { caught = !/mutation anchor missing/.test(String(e.message)); if (!caught) missed.push(`${name}: ${e.message}`); continue; }
      if (!caught) missed.push(name);
    }
    assert(missed.length === 0, `not caught: ${missed.join(' | ')}`);
    return `${cases.length} mutations caught`;
  });

  console.log(results.join('\n'));
  console.log(`\nPAY1-B5: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
