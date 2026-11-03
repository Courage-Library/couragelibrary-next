#!/usr/bin/env node
/**
 * OFFLINE-LOCAL-1 (owner process fix, 2026-11-03): run EXACTLY the CI offline gate list, parsed from the workflow —
 * the "Offline gates" step of .github/workflows/ci-gates.yml — locally, before every push. No name-based skipping, no
 * hand-kept list: what CI runs is what runs here (TSC and LINT included). A gate line that does not parse fails the run
 * (fail closed). Stage new files first (several gates scan tracked files only).
 *   node scripts/ci/run-offline-local.cjs            → one line per gate, then a summary; exit 1 on any failure
 *   node scripts/ci/run-offline-local.cjs --list     → print the parsed list only
 * Background: COURSE-UX-1 push CI 41625360184 failed LIVE-LOCK-SWEEP, which a local run had skipped by name.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const WF = path.join(ROOT, '.github', 'workflows', 'ci-gates.yml');

function parseOfflineGates(yml) {
  const lines = yml.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*- name: Offline gates\b/.test(l));
  if (start < 0) throw new Error('no "Offline gates" step in the workflow');
  const indent = lines[start].search(/\S/);
  const gates = [];
  const bad = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() && l.search(/\S/) <= indent) break; // the next step / job
    if (!/fail=1/.test(l)) continue;
    const m = /^\s*q\s+([A-Z0-9][A-Z0-9-]*)\s+(.+?)\s*\|\|\s*fail=1\s*$/.exec(l);
    if (m) gates.push({ id: m[1], cmd: m[2] });
    else bad.push(l.trim());
  }
  if (bad.length) throw new Error(`unparsed gate line(s): ${bad.join(' | ')}`);
  if (gates.length < 50) throw new Error(`only ${gates.length} gates parsed — refusing (the list must come from the workflow)`);
  return gates;
}

const gates = parseOfflineGates(fs.readFileSync(WF, 'utf8'));
if (process.argv.includes('--list')) {
  for (const g of gates) console.log(`${g.id}\t${g.cmd}`);
  process.exit(0);
}
const failed = [];
const t0 = Date.now();
for (const g of gates) {
  const t = Date.now();
  const r = spawnSync(g.cmd, { cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000 });
  const pass = r.status === 0;
  if (!pass) failed.push(g.id);
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const detail = pass ? '' : ` — ${out.split(/\r?\n/).filter((x) => /FAIL|Error/.test(x)).slice(0, 3).map((x) => x.trim().slice(0, 200)).join(' | ')}`;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${g.id} (${Math.round((Date.now() - t) / 1000)} s)${detail}`);
}
console.log(`OFFLINE-LOCAL: ${gates.length - failed.length}/${gates.length} passed in ${Math.round((Date.now() - t0) / 1000)} s${failed.length ? ` · FAILED ${failed.join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
