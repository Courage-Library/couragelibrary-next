#!/usr/bin/env node
/**
 * DEPLOY-GATE-1 — the Vercel deployment of EXACTLY one commit, before it is promoted to production.
 * The Vercel GitHub integration records every deployment as a GitHub Deployment (environment "Production" for the
 * production branch) whose latest status carries the deployment's own URL (environment_url). This reads them with the
 * job's built-in GITHUB_TOKEN (deployments: read) — no Vercel token, no long-lived secret.
 *
 * Rules (owner, fail closed): the deployment's sha === the commit sha (full, exact) · environment === "Production" ·
 * latest status state === "success" · URL https on *.vercel.app. A failed / errored Vercel deployment fails at once;
 * "pending / in_progress / queued" waits (≤ --timeout s); anything else fails. Several matching deployments (a
 * redeploy): the most recently created one.
 *
 * Output: `url=<deployment URL>` appended to $GITHUB_OUTPUT (never printed); the log shows the HOST only.
 * Usage: node scripts/ci/resolve-deployment.cjs --sha <full sha> [--environment Production] [--timeout 960]
 *        node scripts/ci/resolve-deployment.cjs --self-test
 */
const fs = require('fs');

const WAITING = new Set(['pending', 'queued', 'in_progress']);

/**
 * Pure: decide from GitHub's deployments (newest first) and each one's statuses (newest first).
 * Returns { kind: 'ok', url, host, id } | { kind: 'wait', why } | { kind: 'fail', why }.
 */
function decide(deployments, statusesById, sha, environment = 'Production') {
  if (!/^[0-9a-f]{40}$/.test(sha)) return { kind: 'fail', why: 'not a full commit sha' };
  const mine = (deployments || []).filter((d) => d && d.sha === sha && d.environment === environment);
  if (mine.length === 0) return { kind: 'wait', why: `no ${environment} deployment for this commit yet` };
  mine.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id);
  const d = mine[0];
  const statuses = statusesById[d.id] || [];
  const latest = statuses[0];
  if (!latest) return { kind: 'wait', why: 'deployment has no status yet' };
  if (WAITING.has(latest.state)) return { kind: 'wait', why: `deployment ${latest.state}` };
  if (latest.state !== 'success') return { kind: 'fail', why: `deployment state ${latest.state}` };
  const raw = latest.environment_url || '';
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { kind: 'fail', why: 'success status without a deployment URL' };
  }
  if (u.protocol !== 'https:' || !/\.vercel\.app$/i.test(u.hostname)) return { kind: 'fail', why: 'deployment URL is not an https *.vercel.app address' };
  return { kind: 'ok', url: `https://${u.hostname}`, host: u.hostname, id: d.id };
}

async function gh(pathAndQuery) {
  const res = await fetch(`https://api.github.com${pathAndQuery}`, {
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'x-github-api-version': '2022-11-28', 'user-agent': 'ci-resolve-deployment' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

function selfTest() {
  const S = 'a'.repeat(40);
  const dep = (id, o = {}) => ({ id, sha: S, environment: 'Production', created_at: `2026-11-23T10:0${id}:00Z`, ...o });
  const ok = [{ state: 'success', environment_url: 'https://proj-abc123-team.vercel.app' }];
  const cases = [
    ['success → ok, host only', [dep(1)], { 1: ok }, 'ok'],
    ['no deployment yet → wait', [], {}, 'wait'],
    ['other commit only → wait', [dep(1, { sha: 'b'.repeat(40) })], { 1: ok }, 'wait'],
    ['other environment (ci-public / Preview) → wait', [dep(1, { environment: 'ci-public' }), dep(2, { environment: 'Preview' })], { 1: ok, 2: ok }, 'wait'],
    ['building → wait', [dep(1)], { 1: [{ state: 'in_progress' }] }, 'wait'],
    ['Vercel error → fail', [dep(1)], { 1: [{ state: 'error' }] }, 'fail'],
    ['Vercel failure → fail', [dep(1)], { 1: [{ state: 'failure' }] }, 'fail'],
    ['inactive → fail', [dep(1)], { 1: [{ state: 'inactive' }] }, 'fail'],
    ['success without URL → fail', [dep(1)], { 1: [{ state: 'success' }] }, 'fail'],
    ['non-vercel URL → fail', [dep(1)], { 1: [{ state: 'success', environment_url: 'https://couragelibrary.in' }] }, 'fail'],
    ['http URL → fail', [dep(1)], { 1: [{ state: 'success', environment_url: 'http://x.vercel.app' }] }, 'fail'],
    ['newest of two → its state wins (newest failed → fail)', [dep(1), dep(2)], { 1: ok, 2: [{ state: 'error' }] }, 'fail'],
    ['short sha → fail', [dep(1)], { 1: ok }, 'fail', 'abc1234'],
  ];
  let bad = 0;
  for (const [name, deps, st, want, sha] of cases) {
    const got = decide(deps, st, sha || S).kind;
    const pass = got === want;
    if (!pass) bad++;
    console.log(`${pass ? 'PASS' : 'FAIL'}  resolve-deployment self-test: ${name}${pass ? '' : ` (got ${got})`}`);
  }
  const r = decide([dep(1)], { 1: ok }, S);
  const hostOnly = r.url === 'https://proj-abc123-team.vercel.app' && r.host === 'proj-abc123-team.vercel.app';
  if (!hostOnly) bad++;
  console.log(`${hostOnly ? 'PASS' : 'FAIL'}  resolve-deployment self-test: the URL is reduced to the origin (no path / query)`);
  console.log(`resolve-deployment self-test: ${cases.length + 1 - bad}/${cases.length + 1} passed`);
  return bad === 0;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
  const arg = (k, d) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : d;
  };
  const sha = String(arg('--sha', '')).toLowerCase();
  const environment = arg('--environment', 'Production');
  const deadline = Date.now() + Number(arg('--timeout', '960')) * 1000;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!process.env.GITHUB_TOKEN || !repo) {
    console.log('FAIL  RESOLVE GITHUB_TOKEN / GITHUB_REPOSITORY missing');
    process.exit(1);
  }
  let last = '';
  while (Date.now() < deadline) {
    try {
      const deps = await gh(`/repos/${repo}/deployments?sha=${encodeURIComponent(sha)}&environment=${encodeURIComponent(environment)}&per_page=20`);
      const statusesById = {};
      for (const d of deps.filter((x) => x.sha === sha && x.environment === environment).slice(0, 5)) statusesById[d.id] = await gh(`/repos/${repo}/deployments/${d.id}/statuses?per_page=10`);
      const r = decide(deps, statusesById, sha, environment);
      if (r.kind === 'ok') {
        if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `url=${r.url}\n`);
        console.log(`PASS  RESOLVE ${environment} deployment of ${sha.slice(0, 7)} is ready — host ${r.host}`);
        process.exit(0);
      }
      if (r.kind === 'fail') {
        console.log(`FAIL  RESOLVE ${r.why} (${sha.slice(0, 7)})`);
        process.exit(1);
      }
      if (r.why !== last) console.log(`waiting: ${r.why}`);
      last = r.why;
    } catch (e) {
      if (`api: ${e.message}` !== last) console.log(`waiting: api ${String(e.message).slice(0, 40)}`);
      last = `api: ${e.message}`;
    }
    await new Promise((res) => setTimeout(res, 15000));
  }
  console.log(`FAIL  RESOLVE timed out waiting for the ${environment} deployment of ${sha.slice(0, 7)} (${last})`);
  process.exit(1);
}

if (require.main === module) main();
module.exports = { decide, selfTest };
