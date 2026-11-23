#!/usr/bin/env node
/**
 * NIGHTLY-ALERT (LIVE-GREEN-1 deliverable 1, owner 2026-11-24) — offline gate for scripts/ci/nightly-alert.cjs and its
 * ci-gates job. No network: every GitHub call goes to an in-memory fake.
 *   N-1  real FAIL summary lines are kept (long gate IDs, failing [...], diag)
 *   N-2  non-summary lines are dropped (PASS lines, command lines, free text, extra text after a summary)
 *   N-3  summary-shaped lines with anything secret-looking are dropped whole (token, JWT, URL, e-mail, IPv4, password)
 *   N-4  verdict / plan: red → open | comment; green → close | nothing; skipped-only → nothing
 *   N-5  open path: label, one issue, assigned to NIGHTLY_ALERT_ASSIGNEE, body = run link + commit + filtered lines only
 *   N-6  empty / invalid / refused assignee → still opened, unassigned, and the body / a comment says so
 *   N-7  comment path: an open issue gets a comment; no second issue, no close
 *   N-8  close path: green closes the open issue with a comment; green without an issue does nothing
 *   N-9  only the nightly schedule touches the issue (a dispatch / push run exits without any API call)
 *   N-10 the ci-gates job: schedule-only, after every job, job-level issues: write + actions: read only, GITHUB_TOKEN,
 *        the assignee from vars, no secrets, pinned actions; workflow-level permissions stay contents: read
 *   N-11 negative controls: each broken variant is caught
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC_PATH = path.join(ROOT, 'scripts/ci/nightly-alert.cjs');
const WF_PATH = path.join(ROOT, '.github/workflows/ci-gates.yml');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const WF = fs.readFileSync(WF_PATH, 'utf8');

let passed = 0;
let failed = 0;
const results = [];
function assert(c, m) { if (!c) throw new Error(m); }
async function test(name, fn) {
  try { const info = await fn(); passed++; results.push(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; results.push(`  FAIL  ${name} — ${e.message}`); }
}

/** load a (possibly mutated) copy of the script as a module */
let n = 0;
function load(src = SRC) {
  const f = path.join(os.tmpdir(), `nightly-alert-${process.pid}-${n++}.cjs`);
  fs.writeFileSync(f, src);
  try { return require(f); } finally { fs.unlinkSync(f); }
}

const REPO = 'Example-Org/example-repo';
const RUN = '45283048906';
const SHA = 'fae3d45' + '0'.repeat(33);
const RUN_URL = `https://github.com/${REPO}/actions/runs/${RUN}`;
const GOOD = [
  'SMOKE-STUDENT-MISTAKE-2 FAIL exit 1 — passed 1 line(s) · fail-lines 1 · warns 0 · failing [/auth/login]',
  'UX2A-LIVE FAIL exit 1 — passed 12/17 · fail-lines 5 · warns 0 · failing [L-15b, L-17, L-9, L-10, L-14]',
  'AUTH1-RESILIENCE-REFUSE FAIL exit 2 — passed 0 line(s) · fail-lines 0 · warns 0 · diag CRASH:Error/ENV_MISSING',
  'CA6-SEO-LIVE FAIL exit 1 — passed 6/7 · fail-lines 1 · warns 1 · failing [S-05]',
];
const NON_SUMMARY = [
  'UX2A-LIVE PASS exit 0 — passed 17/17 · fail-lines 0 · warns 0',
  '  PASS  10 s  node scripts/ci/run-quiet.cjs --id AUTH1-RESILIENCE-REFUSE -- node scripts/test_auth1.cjs',
  '[with-server] ▶ node scripts/ci/run-quiet.cjs --caps scripts/ci/live-gate-caps.json --id SEC1D-LIVE -- node x',
  '  FAIL  L-01 login form under CAPTCHA — code captcha-failed',
  'Error: something FAIL exit 1',
  'UX2A-LIVE FAIL exit 1 — passed 12/17 · fail-lines 5 · warns 0 · failing [L-9] and more text',
  '##[error]Process completed with exit code 1.',
];
const SECRET_SHAPED = [
  'SEC1D-LIVE FAIL exit 1 — passed 17/19 · fail-lines 2 · warns 0 · failing [aB3dE5fG7hJ9kL1mN3pQ5rS7tU9]',
  'SEC1D-LIVE FAIL exit 1 — passed 17/19 · fail-lines 2 · warns 0 · failing [eyJhbGciOiJIUzI1]',
  'SEC1D-LIVE FAIL exit 1 — passed 17/19 · fail-lines 2 · warns 0 · failing [https://x.example/a]',
  'SEC1D-LIVE FAIL exit 1 — passed 17/19 · fail-lines 2 · warns 0 · failing [user@example.com]',
  'SEC1D-LIVE FAIL exit 1 — passed 17/19 · fail-lines 2 · warns 0 · failing [10.0.12.7]',
  'SEC1D-LIVE FAIL exit 1 — passed 17/19 · fail-lines 2 · warns 0 · failing [password mismatch]',
  'SEC1D-LIVE FAIL exit 1 — passed 17/19 · fail-lines 2 · warns 0 · diag sk_live_abc',
  'SEC1D-LIVE FAIL exit 1 — passed 17/19 · fail-lines 2 · warns 0 · failing [k3y9a8b7c6d5e4f3]',
];
const stamp = (l) => `2026-11-23T22:52:55.4991624Z ${l}`;
const LOG = [...GOOD, ...NON_SUMMARY, ...SECRET_SHAPED].map(stamp).join('\n');

/** in-memory GitHub; records every call */
function fakeGh({ openIssue = null, dropAssignee = false, rejectAssignee = false, jobs = null, logs = null } = {}) {
  const calls = [];
  let next = 7;
  const gh = {
    calls,
    async get(p) {
      calls.push(['GET', p]);
      if (/\/issues\?state=open/.test(p)) return openIssue ? [openIssue] : [];
      if (/\/actions\/runs\/\d+\/jobs/.test(p)) return { jobs: jobs || [{ id: 1, conclusion: 'failure' }, { id: 2, conclusion: 'success' }, { id: 3, conclusion: 'failure' }] };
      throw Object.assign(new Error('unexpected GET'), { status: 404 });
    },
    async text(p) {
      calls.push(['TEXT', p]);
      const id = p.match(/jobs\/(\d+)\/logs/)[1];
      if (logs) return logs[id] || '';
      return id === '1' ? LOG : stamp(GOOD[0]);
    },
    async post(p, b) {
      calls.push(['POST', p, b]);
      if (/\/labels$/.test(p)) return {};
      if (/\/comments$/.test(p)) return { id: 1 };
      if (/\/issues$/.test(p)) {
        if (b.assignees && rejectAssignee) throw Object.assign(new Error('HTTP 422'), { status: 422 });
        return { number: next++, assignees: b.assignees && !dropAssignee ? b.assignees.map((login) => ({ login })) : [] };
      }
      throw new Error('unexpected POST');
    },
    async patch(p, b) { calls.push(['PATCH', p, b]); return {}; },
  };
  return gh;
}
const RED = { scope: { result: 'success' }, offline: { result: 'success' }, 'server-checks': { result: 'success' }, 'live-journeys': { result: 'failure' }, 'live-gates': { result: 'failure' } };
const GREEN = { scope: { result: 'success' }, offline: { result: 'success' }, 'server-checks': { result: 'success' }, 'live-journeys': { result: 'success' }, 'live-gates': { result: 'success' } };
const OPEN = { number: 3, title: 'Nightly live run red', assignees: [] };

/** every body line must be one of the allowed kinds — nothing else may reach the public issue */
function bodyOnly(m, body, lines, note) {
  const allowed = new Set(['Nightly live run: **red**', '', `- Run: ${RUN_URL}`, `- Commit: ${SHA}`, 'Failing gates (summary lines):', '```', 'No gate summary line was found in the failed jobs; open the run.', ...lines]);
  if (note) allowed.add(note);
  const extra = body.split('\n').filter((l) => !allowed.has(l));
  assert(extra.length === 0, `body has other text: ${JSON.stringify(extra.slice(0, 2))}`);
  assert(body.includes(`- Run: ${RUN_URL}`) && body.includes(`- Commit: ${SHA}`), 'body misses the run link / commit');
}

// ---------- checks (each takes the module + workflow so N-11 can feed broken variants) ----------
function checkKeep(m) {
  const kept = m.filterSummaryLines(LOG);
  for (const g of GOOD) assert(kept.includes(g), `dropped a real summary line: ${g.slice(0, 40)}`);
  return `${GOOD.length} real lines kept`;
}
function checkNonSummary(m) {
  const kept = m.filterSummaryLines(NON_SUMMARY.map(stamp).join('\n'));
  assert(kept.length === 0, `kept a non-summary line: ${kept[0] && kept[0].slice(0, 50)}`);
  return `${NON_SUMMARY.length} non-summary lines dropped`;
}
function checkSecret(m) {
  for (const s of SECRET_SHAPED) assert(m.filterSummaryLines(stamp(s)).length === 0, `kept a secret-looking line: ${s.slice(s.indexOf('·') + 2, s.indexOf('·') + 60)}`);
  return `${SECRET_SHAPED.length} secret-looking lines dropped whole`;
}
function checkPlan(m) {
  assert(m.verdict(RED) === 'red' && m.verdict(GREEN) === 'green', 'verdict red / green');
  assert(m.verdict({ ...GREEN, 'live-gates': { result: 'cancelled' } }) === 'red', 'cancelled is not red');
  assert(m.verdict({ ...GREEN, 'live-gates': { result: 'skipped' } }) === 'none' && m.verdict({}) === 'none', 'skipped / empty is not "none"');
  assert(m.plan('red', null) === 'open' && m.plan('red', OPEN) === 'comment', 'red plan');
  assert(m.plan('green', OPEN) === 'close' && m.plan('green', null) === 'none' && m.plan('none', OPEN) === 'none', 'green / none plan');
  return 'red → open | comment · green → close | none · skipped → none';
}
async function checkOpen(m) {
  const gh = fakeGh();
  const r = await m.run({ repo: REPO, runId: RUN, sha: SHA, needs: RED, assignee: 'owner-login', gh });
  const issues = gh.calls.filter((c) => c[0] === 'POST' && /\/issues$/.test(c[1]));
  assert(r.action === 'open' && issues.length === 1, `${r.action}, ${issues.length} issue(s) created`);
  const b = issues[0][2];
  assert(b.title === 'Nightly live run red' && b.labels.join() === 'nightly-red' && (b.assignees || []).join() === 'owner-login' && r.assigned === true, 'title / label / assignee');
  assert(gh.calls.some((c) => c[0] === 'POST' && /\/labels$/.test(c[1])), 'label not ensured');
  const lines = m.filterSummaryLines(LOG);
  bodyOnly(m, b.body, lines);
  assert(GOOD.every((g) => b.body.includes(g)), 'a failing gate line is missing from the body');
  assert(!gh.calls.some((c) => c[0] === 'PATCH'), 'opened and closed');
  assert(gh.calls.filter((c) => c[0] === 'TEXT').length === 2, 'logs read from jobs that did not fail');
  return `issue opened, assigned, ${lines.length} lines, body = link + commit + lines`;
}
async function checkAssignee(m) {
  const out = [];
  for (const [label, assignee, opt, note, viaComment] of [
    ['empty', '', {}, m.NOTE_EMPTY, false],
    ['blank', '   ', {}, m.NOTE_EMPTY, false],
    ['invalid', 'not a user!', {}, m.NOTE_INVALID, false],
    ['rejected (422)', 'owner-login', { rejectAssignee: true }, m.NOTE_REFUSED, false],
    ['dropped silently', 'owner-login', { dropAssignee: true }, m.NOTE_REFUSED, true],
  ]) {
    const gh = fakeGh(opt);
    const r = await m.run({ repo: REPO, runId: RUN, sha: SHA, needs: RED, assignee, gh });
    const created = gh.calls.filter((c) => c[0] === 'POST' && /\/issues$/.test(c[1]));
    const last = created[created.length - 1][2];
    assert(r.action === 'open' && r.assigned === false, `${label}: ${r.action}, assigned ${r.assigned}`);
    assert(!(last.assignees || []).length || viaComment, `${label}: the issue still names an assignee`);
    if (viaComment) {
      assert(gh.calls.some((c) => c[0] === 'POST' && /\/comments$/.test(c[1]) && c[2].body === note), `${label}: no comment saying it is unassigned`);
    } else {
      bodyOnly(m, last.body, m.filterSummaryLines(LOG), note);
      assert(last.body.includes(note), `${label}: the body does not say it is unassigned`);
    }
    out.push(label);
  }
  return `opened unassigned + said so: ${out.join(', ')}`;
}
async function checkComment(m) {
  const gh = fakeGh({ openIssue: OPEN });
  const r = await m.run({ repo: REPO, runId: RUN, sha: SHA, needs: RED, assignee: 'owner-login', gh });
  assert(r.action === 'comment' && r.issue === 3, `${r.action} #${r.issue}`);
  assert(!gh.calls.some((c) => c[0] === 'POST' && /\/issues$/.test(c[1])), 'a second issue was opened');
  assert(!gh.calls.some((c) => c[0] === 'PATCH'), 'the open issue was closed / changed');
  const com = gh.calls.filter((c) => c[0] === 'POST' && /\/issues\/3\/comments$/.test(c[1]));
  assert(com.length === 1, `${com.length} comments`);
  bodyOnly(m, com[0][2].body, m.filterSummaryLines(LOG));
  return 'one comment on #3, body = link + commit + lines';
}
async function checkClose(m) {
  const gh = fakeGh({ openIssue: OPEN });
  const r = await m.run({ repo: REPO, runId: RUN, sha: SHA, needs: GREEN, assignee: 'owner-login', gh });
  const p = gh.calls.filter((c) => c[0] === 'PATCH');
  assert(r.action === 'close' && p.length === 1 && /\/issues\/3$/.test(p[0][1]) && p[0][2].state === 'closed', 'green did not close #3');
  const com = gh.calls.find((c) => c[0] === 'POST' && /\/issues\/3\/comments$/.test(c[1]));
  assert(com && com[2].body === `Nightly live run green: ${RUN_URL} (commit ${SHA}). Closing.`, 'close comment');
  assert(!gh.calls.some((c) => c[0] === 'TEXT'), 'logs read on a green run');
  const gh2 = fakeGh();
  const r2 = await m.run({ repo: REPO, runId: RUN, sha: SHA, needs: GREEN, assignee: 'owner-login', gh: gh2 });
  assert(r2.action === 'none' && gh2.calls.every((c) => c[0] === 'GET'), 'green without an issue wrote something');
  const gh3 = fakeGh({ openIssue: OPEN });
  const r3 = await m.run({ repo: REPO, runId: RUN, sha: SHA, needs: { ...GREEN, 'live-gates': { result: 'skipped' } }, assignee: '', gh: gh3 });
  assert(r3.action === 'none' && gh3.calls.every((c) => c[0] === 'GET'), 'a skipped live job closed / commented');
  return 'green → #3 commented + closed · green, no issue → nothing · skipped → nothing';
}
function checkEventOnly(src = SRC) {
  const f = path.join(os.tmpdir(), `nightly-alert-cli-${process.pid}-${n++}.cjs`);
  fs.writeFileSync(f, src);
  try {
    const out = [];
    for (const ev of ['workflow_dispatch', 'push', '']) {
      const env = { ...process.env, GITHUB_EVENT_NAME: ev, GH_TOKEN: '', NEEDS_JSON: JSON.stringify(RED), GITHUB_API_URL: 'http://127.0.0.1:9' };
      const r = spawnSync(process.execPath, [f], { env, encoding: 'utf8', timeout: 20000 });
      assert(r.status === 0 && /only the nightly schedule touches the issue/.test(r.stdout), `${ev || 'no event'}: exit ${r.status}, ${String(r.stdout + r.stderr).slice(0, 80)}`);
      out.push(ev || 'none');
    }
    return `no API call on ${out.join(' / ')}`;
  } finally { fs.unlinkSync(f); }
}
function jobBlock(wf, id) {
  const m = wf.match(new RegExp(`\\n  ${id}:\\n([\\s\\S]*?)(?=\\n  [a-z][a-z0-9-]*:\\n|$)`));
  return m ? m[1] : '';
}
function checkWorkflow(wf) {
  assert(/\npermissions:\n {2}contents: read\n\n/.test(wf), 'workflow-level permissions are not contents: read only');
  const j = jobBlock(wf, 'nightly-alert');
  assert(j, 'no nightly-alert job');
  const code = '\n' + j.replace(/ *#[^\n]*/g, '');
  assert(/\n {4}needs: \[scope, offline, server-checks, live-journeys, live-gates\]\n/.test(code), 'the job does not wait for every job');
  assert(/\n {4}if: always\(\) && github\.event_name == 'schedule'\n/.test(code), 'the job is not nightly-only (always() + schedule)');
  assert(/\n {4}permissions:\n {6}issues: write\n {6}actions: read\n {4}[a-z]/.test(code), 'job permissions are not exactly issues: write + actions: read');
  assert(!/secrets\./.test(code), 'the job reads a secret');
  assert(/GH_TOKEN: \$\{\{ github\.token \}\}/.test(code) && /NIGHTLY_ALERT_ASSIGNEE: \$\{\{ vars\.NIGHTLY_ALERT_ASSIGNEE \}\}/.test(code) && /NEEDS_JSON: \$\{\{ toJSON\(needs\) \}\}/.test(code), 'token / assignee / needs wiring');
  assert(/run: node scripts\/ci\/nightly-alert\.cjs\n/.test(code), 'the job does not run nightly-alert.cjs');
  const uses = j.match(/uses: [^\n]+/g) || [];
  assert(uses.length === 2, `expected checkout + setup-node, got ${uses.length} actions`);
  for (const u of uses) assert(/@[0-9a-f]{40} # /.test(u), `unpinned action: ${u}`);
  assert(/persist-credentials: false/.test(code), 'checkout keeps credentials');
  const others = wf.replace(j, '');
  assert(!/issues: write/.test(others), 'issues: write outside the nightly-alert job');
  assert(/\n {10}q NIGHTLY-ALERT node scripts\/ci\/test_nightly_alert\.cjs \|\| fail=1\n/.test(wf), 'NIGHTLY-ALERT is not in the offline list');
  return 'schedule-only, after all 5 jobs, issues: write + actions: read on this job only, GITHUB_TOKEN, vars assignee, pinned';
}

(async () => {
  const M = load();
  await test('N-1 real FAIL summary lines are kept', () => checkKeep(M));
  await test('N-2 non-summary lines are dropped', () => checkNonSummary(M));
  await test('N-3 secret-looking summary-shaped lines are dropped whole', () => checkSecret(M));
  await test('N-4 verdict / plan matrix', () => checkPlan(M));
  await test('N-5 open path: one labelled issue, assigned, body = run link + commit + filtered lines', () => checkOpen(M));
  await test('N-6 empty / invalid / refused assignee → opened unassigned and says so', () => checkAssignee(M));
  await test('N-7 comment path: comment on the open issue, no second issue', () => checkComment(M));
  await test('N-8 close path: green closes the open issue; otherwise nothing', () => checkClose(M));
  await test('N-9 only the nightly schedule touches the issue', () => checkEventOnly());
  await test('N-10 ci-gates job wiring + permissions', () => checkWorkflow(WF));

  const mut = (s, a, b) => { assert(s.includes(a), `negative control anchor missing: ${a.slice(0, 50)}`); return s.replace(a, b); };
  const variants = [
    ['no secret guard', async () => checkSecret(load(mut(SRC, '    if (SECRETISH.some((re) => re.test(line)) || opaqueToken(line)) continue;\n', '')))],
    ['no opaque-token guard', async () => checkSecret(load(mut(SRC, ' || opaqueToken(line)) continue;', ') continue;')))],
    ['PASS lines kept', async () => checkNonSummary(load(mut(SRC, ') FAIL exit (', ') (?:FAIL|PASS) exit (')))],
    ['trailing text allowed', async () => checkNonSummary(load(mut(SRC, '{0,80}))?$/;', '{0,80}))?/;')))],
    ['red with an open issue opens another', async () => checkComment(load(mut(SRC, "return openIssue ? 'comment' : 'open';", "return 'open';")))],
    ['green never closes', async () => checkClose(load(mut(SRC, "return openIssue ? 'close' : 'none';", "return 'none';")))],
    ['skipped counts as green', async () => checkClose(load(mut(SRC, "if (results.every((r) => r === 'success')) return 'green';", "if (results.every((r) => r === 'success' || r === 'skipped')) return 'green';")))],
    ['empty assignee → no issue', async () => checkAssignee(load(mut(SRC, "let note = raw === '' ? NOTE_EMPTY", "if (raw === '') return { action: 'none', issue: null, assigned: false, lines: 0 };\n  let note = raw === '' ? NOTE_EMPTY")))],
    ['unassigned without saying so', async () => checkAssignee(load(mut(SRC, "body: buildBody({ runUrl, sha, lines, assigneeNote: note }) });", "body: buildBody({ runUrl, sha, lines }) });")))],
    ['body carries the job names', async () => checkOpen(load(mut(SRC, "if (assigneeNote) parts.push('', assigneeNote);", "if (assigneeNote) parts.push('', assigneeNote);\n  parts.push('jobs: live-gates');")))],
    ['logs of green jobs read', async () => checkOpen(load(mut(SRC, ".filter((j) => j.conclusion === 'failure');", ';')))],
    ['dispatch touches the issue', async () => checkEventOnly(mut(SRC, "if (process.env.GITHUB_EVENT_NAME !== 'schedule') {", "if (process.env.GITHUB_EVENT_NAME === 'never') {"))],
    ['job also on dispatch', async () => checkWorkflow(mut(WF, "    if: always() && github.event_name == 'schedule'\n", "    if: always() && github.event_name != 'push'\n"))],
    ['job without always()', async () => checkWorkflow(mut(WF, "    if: always() && github.event_name == 'schedule'\n", "    if: github.event_name == 'schedule'\n"))],
    ['job with contents: write', async () => checkWorkflow(mut(WF, '      issues: write\n      actions: read\n', '      issues: write\n      actions: read\n      contents: write\n'))],
    ['workflow-level issues: write', async () => checkWorkflow(mut(WF, '\npermissions:\n  contents: read\n', '\npermissions:\n  contents: read\n  issues: write\n'))],
    ['job uses a secret', async () => checkWorkflow(mut(WF, 'GH_TOKEN: ${{ github.token }}', 'GH_TOKEN: ${{ secrets.ALERT_PAT }}'))],
    ['job misses live-gates', async () => checkWorkflow(mut(WF, 'needs: [scope, offline, server-checks, live-journeys, live-gates]', 'needs: [scope, offline, server-checks, live-journeys]'))],
  ];
  await test(`N-11 negative controls: each broken variant is caught`, async () => {
    const missed = [];
    for (const [name, fn] of variants) {
      let caught = false;
      try { await fn(); } catch { caught = true; }
      if (!caught) missed.push(name);
    }
    assert(missed.length === 0, `not caught: ${missed.join(', ')}`);
    return `${variants.length}/${variants.length} broken variants caught`;
  });

  console.log('NIGHTLY-ALERT (LIVE-GREEN-1 deliverable 1)');
  for (const r of results) console.log(r);
  console.log(`\nNIGHTLY-ALERT: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
