#!/usr/bin/env node
/**
 * SAFE-NET (owner ruling 2026-11-02) — offline gate: every tracked script under scripts/ that opens a database or
 * Supabase connection (imports pg, @supabase/supabase-js or @supabase/ssr) requires scripts/db/safe-net.cjs BEFORE
 * that import, so its output is masked (IPs, hosts, project ref, e-mails, JWTs, keys) structurally.
 *   S-1 every connecting script requires safe-net before its first pg / supabase import
 *   S-2 safe-net itself masks: an IPv4, a pooler host, a real-looking e-mail, a postgres URL, a JWT (fake test-domain
 *       e-mails stay readable)
 * --self-test: NEGATIVE CONTROLS — a connecting script without the wrapper, and one that requires it only AFTER pg,
 *   must each fail; a script that does not connect needs nothing.
 * Tracked files only (git ls-files): stage a new script before running the gate.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

const CONNECTS = /require\(\s*['"](pg|@supabase\/supabase-js|@supabase\/ssr)['"]\s*\)|from\s+['"](pg|@supabase\/supabase-js|@supabase\/ssr)['"]/;
const WRAPPER = /require\([^)]*safe-net(\.cjs)?['"`]\s*\)/;

function check(files) {
  const bad = [];
  for (const [f, src] of Object.entries(files)) {
    if (f === 'scripts/db/safe-net.cjs') continue; // the wrapper itself
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const c = CONNECTS.exec(code);
    if (!c) continue;
    const w = WRAPPER.exec(code);
    if (!w) bad.push(`${f}: connects without scripts/db/safe-net.cjs`);
    else if (w.index > c.index) bad.push(`${f}: requires safe-net only after its first pg / supabase import`);
  }
  return bad;
}

function tracked() {
  const out = execFileSync('git', ['ls-files', 'scripts'], { cwd: ROOT, encoding: 'utf8' });
  return Object.fromEntries(out.split('\n').filter((f) => /\.(c?js|mjs)$/.test(f)).map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
}

function maskCheck() {
  const { mask } = require(path.join(ROOT, 'scripts/db/safe-net.cjs'));
  const ip = [10, 1, 2, 3].join('.');
  const mail = ['someone', 'gmail.com'].join('@');
  const jwt = ['eyJ' + 'a'.repeat(12), 'b'.repeat(12), 'c'.repeat(12)].join('.');
  const m = mask(`${ip} aws-0-ap-south-1.pooler.supabase.com ${mail} postgresql://u:p@h:5432/db ${jwt} qa-student@courage-library.test`);
  const ok = !m.includes(ip) && !/pooler\.supabase/.test(m) && !m.includes(mail) && !/postgresql:/.test(m) && !m.includes(jwt) && m.includes('qa-student@courage-library.test');
  return ok ? [] : [`S-2 mask() leaves something: ${m}`];
}

if (process.argv.includes('--self-test')) {
  const controls = [
    ['a connecting script without the wrapper', { 'scripts/zz-a.cjs': "const { Client } = require('pg');\n" }, true],
    ['the wrapper required after pg', { 'scripts/zz-b.cjs': "const { Client } = require('pg');\nrequire('./db/safe-net.cjs');\n" }, true],
    ['supabase-js without the wrapper', { 'scripts/zz-c.cjs': "const { createClient } = require('@supabase/supabase-js');\n" }, true],
    ['a wrapped script', { 'scripts/zz-d.cjs': "require('./db/safe-net.cjs');\nconst { Client } = require('pg');\n" }, false],
    ['a script that does not connect', { 'scripts/zz-e.cjs': "const fs = require('fs');\n" }, false],
  ];
  let bad = 0;
  for (const [n, files, shouldFail] of controls) {
    const failed = check(files).length > 0;
    if (failed !== shouldFail) bad++;
    console.log(`${failed === shouldFail ? 'OK  ' : 'MISS'} control: ${n} → ${failed ? 'fails' : 'passes'}`);
  }
  console.log(bad ? 'SAFE-NET self-test: FAILED' : 'SAFE-NET self-test: all controls behave');
  process.exit(bad ? 1 : 0);
}

const files = tracked();
const fails = [...check(files), ...maskCheck()];
for (const f of fails) console.log('FAIL ' + f);
const n = Object.entries(files).filter(([, s]) => CONNECTS.test(s)).length;
console.log(fails.length ? `SAFE-NET: ${fails.length} FAILURES` : `SAFE-NET: ALL PASS (${n} connecting scripts wrapped; mask self-check ok)`);
process.exit(fails.length ? 1 : 0);
