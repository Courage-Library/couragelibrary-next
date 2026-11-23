#!/usr/bin/env node
/**
 * DEPLOY-GATE-1 (owner, 2026-11-23, choice (i)) — helpers for .github/workflows/deploy-smoke.yml, the workflow Vercel
 * starts with repository_dispatch `vercel.deployment.ready` (after the deployment is built, BEFORE promotion).
 *
 *   --validate      the payload, read from env (PAYLOAD_ENV / PAYLOAD_SHA / PAYLOAD_URL), BEFORE anything else uses it:
 *                   environment === "production" · sha is 40 lowercase hex · URL is https, no credentials / port / path,
 *                   host ^couragelibrary-next-[a-z0-9-]+\.vercel\.app$. Writes `url=https://<host>` to $GITHUB_OUTPUT.
 *                   Any mismatch → exit 1 (the bypass header is never sent: the smoke step never runs).
 *                   The sha being an ancestor-or-equal of main is checked by git in the workflow (needs the history).
 *   --wait-checks   waits (bounded, --timeout s) until the CI check runs scope / offline / server-checks of EXACTLY
 *                   that sha (GitHub Actions app only, newest run of each name) are complete; all success → exit 0;
 *                   any other conclusion → exit 1; still missing / running at the deadline → exit 1.
 *                   GITHUB_TOKEN with checks: read.
 * The log shows the host only (never a path, query or header).
 * Usage: node scripts/ci/pre-promotion.cjs --validate
 *        node scripts/ci/pre-promotion.cjs --wait-checks --sha <40-hex> [--timeout 1500]
 *        node scripts/ci/pre-promotion.cjs --self-test
 */
const fs = require('fs');

const HOST_RX = /^couragelibrary-next-[a-z0-9-]+\.vercel\.app$/;
const REQUIRED = ['scope', 'offline', 'server-checks'];

/** Pure: { ok: true, url, host } | { ok: false, why } */
function validatePayload({ environment, sha, url }) {
  if (environment !== 'production') return { ok: false, why: `environment is "${String(environment || '').slice(0, 20)}", not production` };
  if (!/^[0-9a-f]{40}$/.test(String(sha || ''))) return { ok: false, why: 'git sha is missing or not 40 hex' };
  let u;
  try {
    u = new URL(String(url || ''));
  } catch {
    return { ok: false, why: 'deployment URL is missing or not a URL' };
  }
  if (u.protocol !== 'https:') return { ok: false, why: 'deployment URL is not https' };
  if (u.username || u.password || u.port) return { ok: false, why: 'deployment URL carries credentials or a port' };
  if ((u.pathname && u.pathname !== '/') || u.search || u.hash) return { ok: false, why: 'deployment URL carries a path, query or fragment' };
  if (!HOST_RX.test(u.hostname)) return { ok: false, why: 'deployment host is not a couragelibrary-next-*.vercel.app deployment' };
  return { ok: true, url: `https://${u.hostname}`, host: u.hostname };
}

/** Pure: check runs of the sha → { kind: 'ok' } | { kind: 'wait', why } | { kind: 'fail', why } */
function decideChecks(checkRuns, sha) {
  if (!/^[0-9a-f]{40}$/.test(String(sha || ''))) return { kind: 'fail', why: 'not a full sha' };
  const ours = (checkRuns || []).filter((c) => c && c.head_sha === sha && c.app && c.app.slug === 'github-actions');
  const missing = [];
  const running = [];
  const bad = [];
  for (const name of REQUIRED) {
    const runs = ours.filter((c) => c.name === name).sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')) || b.id - a.id);
    const c = runs[0];
    if (!c) missing.push(name);
    else if (c.status !== 'completed') running.push(name);
    else if (c.conclusion !== 'success') bad.push(`${name}=${c.conclusion}`);
  }
  if (bad.length) return { kind: 'fail', why: `not success: ${bad.join(', ')}` };
  if (missing.length || running.length) return { kind: 'wait', why: [missing.length ? `missing ${missing.join(', ')}` : '', running.length ? `running ${running.join(', ')}` : ''].filter(Boolean).join('; ') };
  return { kind: 'ok' };
}

async function gh(pathAndQuery) {
  const res = await fetch(`https://api.github.com${pathAndQuery}`, {
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'x-github-api-version': '2022-11-28', 'user-agent': 'ci-pre-promotion' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

function selfTest() {
  const S = 'a'.repeat(40);
  const P = (o = {}) => ({ environment: 'production', sha: S, url: 'https://couragelibrary-next-abc123def-team-x.vercel.app', ...o });
  const v = [
    ['valid production payload → ok', P(), true],
    ['preview → fail', P({ environment: 'preview' }), false],
    ['missing environment → fail', P({ environment: undefined }), false],
    ['missing sha → fail', P({ sha: undefined }), false],
    ['short sha → fail', P({ sha: 'abc1234' }), false],
    ['uppercase / non-hex sha → fail', P({ sha: 'A'.repeat(40) }), false],
    ['sha with shell text → fail', P({ sha: `${S}; echo x` }), false],
    ['http → fail', P({ url: 'http://couragelibrary-next-abc123def-team-x.vercel.app' }), false],
    ['foreign host → fail', P({ url: 'https://evil.example.com' }), false],
    ['other Vercel project → fail', P({ url: 'https://other-project-abc123.vercel.app' }), false],
    ['look-alike suffix → fail', P({ url: 'https://couragelibrary-next-x.vercel.app.evil.com' }), false],
    ['production alias domain → fail', P({ url: 'https://couragelibrary.in' }), false],
    ['credentials in URL → fail', P({ url: Object.assign(new URL('https://couragelibrary-next-abc.vercel.app'), { username: 'u', password: 'p' }).href }), false],
    ['port → fail', P({ url: 'https://couragelibrary-next-abc.vercel.app:8443' }), false],
    ['path / query → fail', P({ url: 'https://couragelibrary-next-abc.vercel.app/x?y=1' }), false],
    ['missing URL → fail', P({ url: undefined }), false],
  ];
  const run = (name, o = {}) => ({ id: 1, name, head_sha: S, status: 'completed', conclusion: 'success', started_at: '2026-11-23T10:00:00Z', app: { slug: 'github-actions' }, ...o });
  const all = () => REQUIRED.map((n) => run(n));
  const c = [
    ['all three success → ok', all(), 'ok'],
    ['offline failure → fail', [run('scope'), run('offline', { conclusion: 'failure' }), run('server-checks')], 'fail'],
    ['server-checks skipped → fail', [run('scope'), run('offline'), run('server-checks', { conclusion: 'skipped' })], 'fail'],
    ['cancelled → fail', [run('scope'), run('offline', { conclusion: 'cancelled' }), run('server-checks')], 'fail'],
    ['server-checks still running → wait', [run('scope'), run('offline'), run('server-checks', { status: 'in_progress', conclusion: null })], 'wait'],
    ['not reported yet → wait', [run('scope')], 'wait'],
    ['another app with the same name → ignored (wait)', REQUIRED.map((n) => run(n, { app: { slug: 'some-app' } })), 'wait'],
    ['another sha → ignored (wait)', REQUIRED.map((n) => run(n, { head_sha: 'b'.repeat(40) })), 'wait'],
    ['rerun: newest attempt wins (old fail, new success → ok)', [...all(), run('offline', { id: 0, conclusion: 'failure', started_at: '2026-11-23T09:00:00Z' })], 'ok'],
    ['rerun: newest attempt wins (old success, new fail → fail)', [...all(), run('offline', { id: 2, conclusion: 'failure', started_at: '2026-11-23T11:00:00Z' })], 'fail'],
  ];
  let bad = 0;
  for (const [name, p, want] of v) {
    const got = validatePayload(p).ok;
    if (got !== want) bad++;
    console.log(`${got === want ? 'PASS' : 'FAIL'}  pre-promotion self-test: payload ${name}`);
  }
  const ok = validatePayload(P());
  const origin = ok.url === 'https://couragelibrary-next-abc123def-team-x.vercel.app' && ok.host === 'couragelibrary-next-abc123def-team-x.vercel.app';
  if (!origin) bad++;
  console.log(`${origin ? 'PASS' : 'FAIL'}  pre-promotion self-test: the URL is reduced to the origin`);
  for (const [name, runs, want] of c) {
    const got = decideChecks(runs, S).kind;
    if (got !== want) bad++;
    console.log(`${got === want ? 'PASS' : 'FAIL'}  pre-promotion self-test: checks ${name}${got === want ? '' : ` (got ${got})`}`);
  }
  const total = v.length + 1 + c.length;
  console.log(`pre-promotion self-test: ${total - bad}/${total} passed`);
  return bad === 0;
}

async function waitChecks(sha, timeoutS) {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!process.env.GITHUB_TOKEN || !repo) {
    console.log('FAIL  CI-CHECKS GITHUB_TOKEN / GITHUB_REPOSITORY missing');
    return 1;
  }
  const deadline = Date.now() + timeoutS * 1000;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const runs = [];
      for (const name of REQUIRED) {
        const r = await gh(`/repos/${repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(name)}&filter=all&per_page=100`);
        runs.push(...(r.check_runs || []));
      }
      const d = decideChecks(runs, sha);
      if (d.kind === 'ok') {
        console.log(`PASS  CI-CHECKS scope, offline and server-checks succeeded for ${sha.slice(0, 7)}`);
        return 0;
      }
      if (d.kind === 'fail') {
        console.log(`FAIL  CI-CHECKS ${d.why} (${sha.slice(0, 7)}) — this deployment must not be promoted`);
        return 1;
      }
      if (d.why !== last) console.log(`waiting: ${d.why}`);
      last = d.why;
    } catch (e) {
      if (`api: ${e.message}` !== last) console.log(`waiting: api ${String(e.message).slice(0, 40)}`);
      last = `api: ${e.message}`;
    }
    await new Promise((res) => setTimeout(res, 20000));
  }
  console.log(`FAIL  CI-CHECKS timed out (${last}) — this deployment must not be promoted`);
  return 1;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
  if (args.includes('--validate')) {
    const r = validatePayload({ environment: process.env.PAYLOAD_ENV, sha: process.env.PAYLOAD_SHA, url: process.env.PAYLOAD_URL });
    if (!r.ok) {
      console.log(`FAIL  PAYLOAD ${r.why} — nothing is smoked, no bypass header is sent`);
      process.exit(1);
    }
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `url=${r.url}\n`);
    console.log(`PASS  PAYLOAD production deployment of ${process.env.PAYLOAD_SHA.slice(0, 7)} — host ${r.host}`);
    process.exit(0);
  }
  if (args.includes('--wait-checks')) {
    const i = args.indexOf('--sha');
    const sha = i >= 0 ? String(args[i + 1] || '') : '';
    const t = args.indexOf('--timeout');
    process.exit(await waitChecks(sha, t >= 0 ? Number(args[t + 1]) : 1500));
  }
  console.log('usage: pre-promotion.cjs --validate | --wait-checks --sha <sha> [--timeout s] | --self-test');
  process.exit(2);
}

if (require.main === module) main();
module.exports = { validatePayload, decideChecks, selfTest, HOST_RX, REQUIRED };
