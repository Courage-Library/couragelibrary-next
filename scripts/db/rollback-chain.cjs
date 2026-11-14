#!/usr/bin/env node
/**
 * ROLLBACK-CHAIN-1 (owner rule, 2026-11-14): every docs/database/rollback/<n>_rollback.sql states which LATER rollbacks
 * must run first, in one header line:
 *     -- ROLLBACK-CHAIN: run first: 139_rollback.sql[, …]      (in the order to run them)
 *     -- ROLLBACK-CHAIN: run first: none
 * Why: 139 put a CHECK on fn_outline_lines_valid (138), so 138's rollback fails unless 139's ran first (CI dispatch
 * 43579487271, SYLLABUS-MAP-B1-LIVE D-7). Rollbacks in general run in reverse order; the line names the HARD
 * dependencies (the rollback fails without them), proven on a local copy by --probe.
 *
 *   --check                offline (CI offline list): every rollback file has exactly one valid line; every listed file
 *                          exists, is LATER than the file, and is listed latest-first
 *   --probe --local=<port> LOCAL PostgreSQL only (docs/database/LOCAL_PG_TEST.md), every migration applied: for each
 *                          rollback N, inside a transaction that is always rolled back: N alone; if it fails, every later
 *                          rollback (latest first) then N; if that works, the later set is reduced to the ones N needs.
 *                          Prints one line per file; --write puts the result into each file's header line
 * Module: runFirst(n) → the file names (latest first) 'n_rollback.sql' says must run before it.
 */
require('./safe-net.cjs'); // SAFE-NET: masks IPs / hosts / e-mails / keys in all output
const { withLiveTransaction } = require('./live-safety.cjs'); // LIVE-LOCK-SWEEP: the one safe BEGIN (timeouts + rollback)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, 'docs/database/rollback');
const LINE_RE = /^-- ROLLBACK-CHAIN: run first: (none|ALL-LATER \(([^()]{10,200})\)|\d{3}_rollback\.sql(?:, \d{3}_rollback\.sql)*)\s*$/;
const num = (f) => Number(f.slice(0, 3));
const files = () => fs.readdirSync(DIR).filter((f) => /^\d{3}_rollback\.sql$/.test(f)).sort();
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
/**
 * The statements of a rollback file for the probe's own transaction: older files (076–125) wrap themselves in one
 * whole-line BEGIN; … COMMIT; — exactly those two lines are left out IN MEMORY (the files are not changed). Any other
 * transaction control → refused (it could end the probe's transaction and persist the rollback).
 */
function body(f) {
  const lines = read(f).split(/\r?\n/);
  const tc = (l) => /^\s*(BEGIN|COMMIT)\s*;\s*$/i.test(l);
  const kept = lines.filter((l) => !tc(l));
  const dropped = lines.length - kept.length;
  if (dropped !== 0 && dropped !== 2) throw new Error(`${f}: ${dropped} BEGIN / COMMIT lines (expected 0 or 2)`);
  const rest = kept.join('\n').replace(/--[^\n]*/g, '');
  if (/\b(COMMIT|ROLLBACK|START\s+TRANSACTION|SAVEPOINT|RELEASE)\b\s*;/i.test(rest) || /^\s*BEGIN\s*;/im.test(rest)) throw new Error(`${f}: other transaction control — not probed`);
  return kept.join('\n');
}

/**
 * The header line's list for one rollback file, latest first: [] for "none"; for "ALL-LATER (<why>)" — a chain that
 * could not be proven on a local copy — EVERY later rollback, latest first (the conservative reverse order).
 * Throws when the line is missing or malformed.
 */
function parseChain(text, f) {
  const lines = text.split(/\r?\n/).filter((l) => l.startsWith('-- ROLLBACK-CHAIN:'));
  if (lines.length !== 1) throw new Error(`${f}: ${lines.length} ROLLBACK-CHAIN lines (need exactly 1)`);
  const m = lines[0].match(LINE_RE);
  if (!m) throw new Error(`${f}: malformed ROLLBACK-CHAIN line`);
  if (m[1] === 'none') return [];
  if (m[2]) return files().filter((g) => num(g) > num(f)).reverse();
  return m[1].split(', ');
}

function runFirst(n) {
  const f = `${String(n).padStart(3, '0')}_rollback.sql`;
  return parseChain(read(f), f);
}

function check() {
  const all = files();
  const problems = [];
  for (const f of all) {
    try {
      const list = parseChain(read(f), f);
      for (const g of list) {
        if (!all.includes(g)) problems.push(`${f}: lists ${g}, which does not exist`);
        if (num(g) <= num(f)) problems.push(`${f}: lists ${g}, which is not later`);
      }
      if (list.some((g, i) => i > 0 && num(g) > num(list[i - 1]))) problems.push(`${f}: list not latest-first`);
    } catch (e) {
      problems.push(e.message);
    }
  }
  for (const p of problems) console.log(`  FAIL  ${p}`);
  const raw = (f) => (read(f).split(/\r?\n/).find((l) => l.startsWith('-- ROLLBACK-CHAIN:')) || '').replace('-- ROLLBACK-CHAIN: run first: ', '');
  const chains = all.filter((f) => /^\d{3}_/.test(raw(f)));
  const allLater = all.filter((f) => raw(f).startsWith('ALL-LATER'));
  console.log(`ROLLBACK-CHAIN: ${all.length} rollback files, ${problems.length} problem(s); proven chains: ${chains.map((f) => `${f} ← ${raw(f)}`).join('; ') || 'none'}; ALL-LATER: ${allLater.join(', ') || 'none'}`);
  return problems.length === 0;
}

/** the header with its ROLLBACK-CHAIN line set (replaced, or inserted after the first comment block line 2) */
function withLine(text, list, why) {
  const line = `-- ROLLBACK-CHAIN: run first: ${why ? `ALL-LATER (${why})` : list.length ? list.join(', ') : 'none'}`;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => l.startsWith('-- ROLLBACK-CHAIN:'));
  if (at >= 0) lines[at] = line;
  else {
    // right after the leading comment lines (the header block), before the first statement
    let i = 0;
    while (i < lines.length && lines[i].startsWith('--')) i++;
    lines.splice(i, 0, line);
  }
  return lines.join(eol);
}

async function probe(port, write) {
  const { Client } = require('pg');
  if (!/^\d{4,5}$/.test(String(port))) throw new Error('--local=<port>');
  const c = new Client({ host: '127.0.0.1', port: Number(port), user: 'postgres', database: 'postgres' }); // local only
  c.on('error', () => {});
  await c.connect();
  const all = files();
  let lastError = '';
  /** true when the files run, in this order, inside one transaction that is then rolled back (lastError: why not) */
  const works = async (seq) => {
    try { seq.forEach(body); } catch (e) { lastError = e.message; return false; }
    try {
      // LIVE-LOCK-SAFETY: the shared helper (safeBegin + always ROLLBACK), even on the local copy
      await withLiveTransaction(c, async () => {
        for (const f of seq) await c.query(body(f));
      });
      return true;
    } catch (e) {
      lastError = `${e.code || ''} ${String(e.message).slice(0, 160)}`.trim(); // a local schema error: object names only
      return false;
    }
  };
  const result = {};
  const undetermined = {};
  try {
    for (const f of all) {
      try { body(f); } catch (e) { result[f] = null; undetermined[f] = `not probed: ${e.message.replace(/[()]/g, '').slice(0, 120)}`; console.log(`${f}: ALL-LATER — ${e.message}`); continue; }
      if (await works([f])) { result[f] = []; console.log(`${f}: run first: none`); continue; }
      const alone = lastError;
      // the later rollbacks that RUN, latest first (one that fails on this copy is left out, not allowed to block)
      const later = [];
      for (const g of all.filter((x) => num(x) > num(f)).reverse()) if (await works([...later, g])) later.push(g);
      if (!(await works([...later, f]))) {
        result[f] = null;
        undetermined[f] = `not provable on a local copy: fails with ${alone.replace(/[()]/g, '').slice(0, 120)}`;
        console.log(`${f}: ALL-LATER — fails alone (${alone}) and after every later rollback that runs (${lastError})`);
        continue;
      }
      let need = later.slice();
      for (const g of later) {
        const without = need.filter((x) => x !== g);
        if (await works([...without, f])) need = without;
      }
      result[f] = need;
      console.log(`${f}: run first: ${need.join(', ')}`);
    }
  } finally {
    await c.end().catch(() => {});
  }
  if (write) {
    for (const [f, list] of Object.entries(result)) fs.writeFileSync(path.join(DIR, f), withLine(read(f), list || [], undetermined[f]));
    console.log(`written: ${Object.keys(result).length} file(s); proven chains / none: ${Object.values(result).filter(Boolean).length}; ALL-LATER (not provable here): ${Object.keys(undetermined).length}`);
    return Object.keys(result).length === files().length;
  }
  return true;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const local = (args.find((a) => a.startsWith('--local=')) || '').slice('--local='.length);
  const run = args.includes('--probe') ? probe(local, args.includes('--write')) : Promise.resolve(check());
  run.then((ok) => process.exit(ok ? 0 : 1)).catch((e) => { console.log(`ERROR ${String(e.message).slice(0, 200)}`); process.exit(1); });
}

module.exports = { runFirst, parseChain, withLine, body };
