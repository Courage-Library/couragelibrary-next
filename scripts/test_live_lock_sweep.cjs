#!/usr/bin/env node
/**
 * LIVE-LOCK-SWEEP — offline gate (architect, 2026-10-27): no live script may open a transaction except through the
 * shared safe-begin helper (scripts/db/live-safety.cjs → safeBegin / withLiveTransaction), which sends BEGIN and the
 * LIVE-LOCK-SAFETY settings (lock 3 s, statement 60 s, idle-in-transaction 30 s) in ONE statement and registers the
 * client for rollback-on-stop (SIGINT / SIGTERM).
 *   L-01 no string / template literal that STARTS a transaction (BEGIN … / START TRANSACTION …) in any tracked script
 *        except the helper; lines marked "live-safety: test data" are data for a parser self-test (never executed)
 *   L-02 no script sets lock_timeout / statement_timeout / idle_in_transaction_session_timeout itself (only the helper:
 *        the values can never be raised or dropped per script)
 *   L-03 the helper: the rule's values; safeBegin = BEGIN + the settings in one query; rollback + close on stop;
 *        withLiveTransaction uses safeBegin and always rolls back
 *   L-04 coverage: every script that requires the helper uses it; ≥ 30 scripts go through safeBegin / withLiveTransaction
 *   L-05 self-test: planted unsafe forms FAIL, safe forms and look-alikes (PL/pgSQL BEGIN, regex / comment text) PASS
 * Lexing uses the TypeScript scanner, so comments and regex literals never count. Tracked files only (git ls-files).
 * Run: node scripts/test_live_lock_sweep.cjs
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const HELPER = 'scripts/db/live-safety.cjs';
let passed = 0;
let failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const TX_START = /^\s*(?:BEGIN|START\s+TRANSACTION)(?:\s+(?:WORK|TRANSACTION|READ\s+(?:ONLY|WRITE)|ISOLATION\s+LEVEL\s+(?:READ\s+COMMITTED|REPEATABLE\s+READ|SERIALIZABLE)|DEFERRABLE|NOT\s+DEFERRABLE))*\s*(?:;|$)/i;
const TIMEOUT_SET = /\bSET\s+(?:LOCAL\s+|SESSION\s+)?(?:lock_timeout|statement_timeout|idle_in_transaction_session_timeout)\b|set_config\(\s*'(?:lock_timeout|statement_timeout|idle_in_transaction_session_timeout)'/i;

/** Every string / template literal piece of a JS source, with its line (TypeScript scanner: comments / regex skipped). */
function literals(src) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, src);
  const out = [];
  const lineOf = (pos) => src.slice(0, pos).split('\n').length;
  let prev = ts.SyntaxKind.Unknown;
  const braces = []; // one open-brace counter per open template substitution "${ … }"
  for (let k = scanner.scan(); k !== ts.SyntaxKind.EndOfFileToken; k = scanner.scan()) {
    // a "/" where an expression may start is a regex literal: rescan it so its text is never read as code
    if ((k === ts.SyntaxKind.SlashToken || k === ts.SyntaxKind.SlashEqualsToken) && ![ts.SyntaxKind.Identifier, ts.SyntaxKind.CloseParenToken, ts.SyntaxKind.CloseBracketToken, ts.SyntaxKind.NumericLiteral, ts.SyntaxKind.StringLiteral].includes(prev)) {
      k = scanner.reScanSlashToken();
    }
    if (k === ts.SyntaxKind.OpenBraceToken && braces.length) braces[braces.length - 1]++;
    if (k === ts.SyntaxKind.CloseBraceToken && braces.length) {
      if (braces[braces.length - 1] > 0) braces[braces.length - 1]--;
      else {
        // this "}" closes a template substitution: read the template continuation
        k = scanner.reScanTemplateToken(false);
        out.push({ text: scanner.getTokenValue(), line: lineOf(scanner.getTokenPos()), head: false });
        if (k === ts.SyntaxKind.TemplateTail) braces.pop();
        prev = k;
        continue;
      }
    }
    if (k === ts.SyntaxKind.TemplateHead) braces.push(0);
    if (k === ts.SyntaxKind.StringLiteral || k === ts.SyntaxKind.NoSubstitutionTemplateLiteral || k === ts.SyntaxKind.TemplateHead) {
      out.push({ text: scanner.getTokenValue(), line: lineOf(scanner.getTokenPos()), head: true });
    }
    prev = k;
  }
  return out;
}

/** The violations of one source (file name for messages). */
function violations(src, file) {
  const lines = src.split('\n');
  const bad = [];
  for (const l of literals(src)) {
    if (/live-safety: test data/.test(lines[l.line - 1] || '')) continue;
    if (l.head && TX_START.test(l.text)) bad.push(`${file}:${l.line} opens a transaction directly (${JSON.stringify(l.text.slice(0, 40))}) — use safeBegin()`);
    if (TIMEOUT_SET.test(l.text)) bad.push(`${file}:${l.line} sets a LIVE-LOCK-SAFETY timeout itself (${JSON.stringify(l.text.slice(0, 50))}) — safeBegin owns them`);
  }
  return bad;
}

const tracked = execFileSync('git', ['ls-files', 'scripts'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => /\.(c|m)?js$/.test(f));

test('L-01 / L-02 no tracked script opens a transaction or sets a timeout itself (only the shared helper)', () => {
  const bad = [];
  for (const f of tracked) if (f !== HELPER) bad.push(...violations(fs.readFileSync(path.join(ROOT, f), 'utf8'), f));
  assert(bad.length === 0, bad.join('\n        '));
  return `${tracked.length} scripts scanned`;
});

test('L-03 the helper: 3 s / 60 s / 30 s; BEGIN + settings in ONE query; rollback + close on stop; withLiveTransaction always rolls back', () => {
  const s = require(path.join(ROOT, HELPER));
  assert(s.LOCK_TIMEOUT === '3s' && s.STATEMENT_TIMEOUT === '60s' && s.IDLE_IN_TX_TIMEOUT === '30s', 'values');
  const src = fs.readFileSync(path.join(ROOT, HELPER), 'utf8');
  assert(/await client\.query\(`BEGIN \$\{mode\}; \$\{LIVE_SAFETY_SQL\}`\);/.test(src), 'one round trip');
  assert(/for \(const c of openClients\) \{\s*await c\.query\('ROLLBACK'\)[\s\S]*?await c\.end\(\)/.test(src) && /process\.once\('SIGINT'/.test(src) && /process\.once\('SIGTERM'/.test(src), 'rollback + close on stop');
  const wlt = src.slice(src.indexOf('async function withLiveTransaction'));
  assert(/await safeBegin\(client, \{ readOnly \}\);/.test(wlt) && /finally \{\s*await client\.query\('ROLLBACK'\)/.test(wlt), 'withLiveTransaction');
});

test('L-03b safeBegin sends exactly one statement with BEGIN + the three settings; unknown isolation refused', async () => {
  const s = require(path.join(ROOT, HELPER));
  const calls = [];
  const fake = { query: async (q) => { calls.push(q); }, once: () => undefined };
  await s.safeBegin(fake, { readOnly: true, isolation: 'REPEATABLE READ' });
  await s.safeBegin(fake);
  assert(calls.length === 2, `statements: ${JSON.stringify(calls)}`);
  assert(/^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL lock_timeout = '3s'; SET LOCAL statement_timeout = '60s'; SET LOCAL idle_in_transaction_session_timeout = '30s'$/.test(calls[0]), calls[0]);
  assert(/^BEGIN READ WRITE; SET LOCAL lock_timeout = '3s';/.test(calls[1]), calls[1]);
  let refused = false;
  try { await s.safeBegin(fake, { isolation: 'READ UNCOMMITTED' }); } catch (e) { refused = /unknown isolation/.test(e.message); }
  assert(refused && calls.length === 2, 'an unknown isolation must be refused before any query');
});

test('L-04 coverage: every script that requires the helper uses it; ≥ 30 scripts go through safeBegin / withLiveTransaction', () => {
  const users = [];
  for (const f of tracked) {
    if (f === HELPER) continue;
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (!/live-safety\.cjs/.test(src)) continue;
    assert(/safeBegin\(|withLiveTransaction\(|installStopHandler\(|isLockTimeout\(|LIVE_SAFETY_SQL|LOCK_TIMEOUT|require\(['"]\.\/live-safety\.cjs['"]\)\s*;/.test(src), `${f} requires the helper but uses none of it`);
    if (/safeBegin\(|withLiveTransaction\(/.test(src)) users.push(f);
  }
  assert(users.length >= 30, `${users.length} scripts use the helper`);
  return `${users.length} scripts`;
});

test('L-05 self-test: unsafe forms FAIL; safe forms and look-alikes PASS', () => {
  const fail = {
    bare: "await c.query('BEGIN');",
    readOnly: 'await c.query("BEGIN READ ONLY");',
    wrapper: "await q('BEGIN READ WRITE');",
    template: 'await c.query(`BEGIN ${mode}`);',
    withSettings: 'await c.query(`BEGIN; ${LIVE_SAFETY_SQL}`);',
    start: "await c.query('START TRANSACTION ISOLATION LEVEL SERIALIZABLE');",
    // built at runtime so this file's own literals never look like a timeout SET
    raisedLock: 'await c.query(`SET LOCAL lock' + "_timeout = '5s'`);",
    sessionStatement: 'await c.query("SET statement' + "_timeout = '120s'\");",
    setConfig: 'await c.query("select set_config(\'idle_in_transaction_session' + "_timeout', '0', true)\");",
  };
  const pass = {
    helper: 'await safeBegin(c, { readOnly: true });',
    plpgsql: "await c.query(`DO $$ BEGIN RAISE NOTICE 'x'; END $$`);",
    fnBody: "await c.query(`CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NEW; END; $f$`);",
    regex: "assert(/await pg\\.query\\('BEGIN'\\);/.test(src));",
    comment: "// await c.query('BEGIN');\n/* SET LOCAL lock" + "_timeout = '9s' */ const x = 1;",
    nested: "const a = `x ${f({ k: 1 })} y`; const b = { c: `BEGIN-ish text ${'z'}` };",
    marked: "const cases = [['BEGIN;\\nX;', 'BEGIN']]; // live-safety: test data",
    savepoint: "await c.query('SAVEPOINT s'); await c.query('ROLLBACK TO SAVEPOINT s');",
  };
  const wrong = [];
  for (const [k, src] of Object.entries(fail)) if (violations(src, k).length === 0) wrong.push(`should FAIL: ${k}`);
  for (const [k, src] of Object.entries(pass)) {
    const v = violations(src, k);
    if (v.length) wrong.push(`should PASS: ${k} — ${v.join('; ')}`);
  }
  assert(wrong.length === 0, wrong.join('\n        '));
  return `${Object.keys(fail).length} unsafe forms fail · ${Object.keys(pass).length} safe forms pass`;
});

(async () => {
  for (const [name, fn] of tests) {
    try {
      const info = await fn();
      passed++;
      console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
    } catch (e) {
      failed++;
      console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1500)}`);
    }
  }
  console.log(`\nLIVE-LOCK-SWEEP: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
