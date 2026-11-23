#!/usr/bin/env node
/**
 * DEPLOY-GATE-1 gate (owner, 2026-11-23) — production changes only after CI is green. Offline: reads the workflows and
 * the CI scripts; runs no network request.
 *   G-1 every push to main runs ci-gates (no `paths` filter), so the checks Vercel waits for always report
 *   G-2 docs-only fast path: a `scope` job (scripts/ci/change-scope.cjs, fails safe to "code"); offline / server-checks
 *       keep their names, skip only their heavy steps on docs-only pushes, and still report
 *   G-3 deploy-smoke (a required check): needs offline + server-checks; resolves the Vercel deployment of EXACTLY
 *       github.sha (environment Production, state success — scripts/ci/resolve-deployment.cjs) with the built-in token
 *       (deployments: read); smokes THAT URL read-only and anonymously with --bypass and --expect-sha; the old
 *       wait-for-production smoke is gone from ci-gates (it would deadlock against the promotion)
 *   G-4 the bypass secret: only as ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}, only on the deploy-smoke step, never
 *       with a fallback; the smoke FAILS CLOSED without it (run here as a real subprocess: missing / blank → exit 1);
 *       the header value is never printed; the log scan flags the secret's value and the header / query with a value
 *   G-5 post-promotion-smoke.yml: repository_dispatch vercel.deployment.promoted (+ manual), payload read through env and
 *       validated (sha, production only, the canonical base), anonymous smoke of couragelibrary.in with --expect-sha, no
 *       bypass secret; not part of ci-gates (not a required check)
 *   G-6 resolve-deployment / change-scope / log-scan self-tests pass
 *   G-7 negative controls: each broken variant is caught
 * Run: node scripts/test_deploy_gate1.cjs
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
const results = [];
function test(name, fn) {
  try {
    const info = fn();
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

const WF = '.github/workflows/ci-gates.yml';
const PP = '.github/workflows/post-promotion-smoke.yml';
const SRC = { wf: read(WF), pp: read(PP), smoke: read(path.join('scripts', 'smoke', fs.readdirSync(path.join(ROOT, 'scripts/smoke')).find((f) => /^anonymous-smoke\.cjs$/.test(f)))) };
const job = (wf, id) => {
  const i = wf.indexOf(`\n  ${id}:\n`);
  if (i < 0) return '';
  const rest = wf.slice(i + 1);
  const next = rest.slice(1).search(/\n  [a-z][a-z0-9-]*:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
};
const step = (blk, nameStart) => {
  const i = blk.indexOf(`- name: ${nameStart}`);
  if (i < 0) return '';
  const rest = blk.slice(i);
  const next = rest.slice(1).search(/\n {6}- (name|uses):/);
  return next < 0 ? rest : rest.slice(0, next + 1);
};

function checkTrigger(wf) {
  const on = wf.slice(wf.indexOf('\non:\n'), wf.indexOf('\npermissions:'));
  const push = on.slice(on.indexOf('\n  push:\n'), on.indexOf('\n  schedule:'));
  assert(/\n {4}branches: \[main\]/.test(push), 'push to main missing');
  assert(!/paths(-ignore)?:/.test(push), 'push still has a paths filter (docs-only commits would never report their checks)');
  return 'every push to main';
}

function checkScope(wf) {
  const scope = job(wf, 'scope');
  assert(/outputs:\n {6}code: \$\{\{ steps\.scope\.outputs\.code \}\}/.test(scope) && /run: node scripts\/ci\/change-scope\.cjs/.test(scope), 'no scope job running change-scope');
  const off = job(wf, 'offline');
  const sc = job(wf, 'server-checks');
  assert(/\n {4}needs: scope\n/.test(off) && /\n {4}needs: \[scope, offline\]\n/.test(sc), 'offline / server-checks do not depend on scope');
  const gated = (blk, names) => names.every((n) => /if: needs\.scope\.outputs\.code == 'true'/.test(step(blk, n)));
  assert(gated(off, ['Install (lockfile only)', 'Offline gates (summary lines only)']) && /if: always\(\) && needs\.scope\.outputs\.code == 'true'/.test(step(off, 'Log scan of the captured outputs')), 'offline heavy steps not gated on scope');
  assert(gated(sc, ['Install (lockfile only)', 'Production build (summary only)', 'LOGO-P0 sharp', 'Server checks (4 bounded server runs']) && /if: always\(\) && needs\.scope\.outputs\.code == 'true'/.test(step(sc, 'Log scan of the captured outputs (always)')), 'server-checks heavy steps not gated on scope');
  assert(/\n {4}if:/.test(off.split('\n    steps:')[0]) === false && /\n {4}if:/.test(sc.split('\n    steps:')[0]) === false, 'offline / server-checks have a job-level if (a skipped job may not count as a passed check)');
  return 'scope job · offline + server-checks report on docs-only pushes';
}

function checkDeploySmoke(wf) {
  const ds = job(wf, 'deploy-smoke');
  assert(ds, 'no deploy-smoke job');
  assert(!job(wf, 'prod-smoke'), 'the old prod-smoke job is still there');
  assert(/\n {4}needs: \[scope, offline, server-checks\]\n/.test(ds), 'deploy-smoke does not need offline + server-checks');
  assert(/permissions:\n {6}contents: read\n {6}deployments: read\n/.test(ds), 'deploy-smoke lacks deployments: read (least privilege)');
  const res = step(ds, 'Find the Vercel deployment of exactly this commit');
  assert(/id: resolve/.test(res) && /GITHUB_TOKEN: \$\{\{ github\.token \}\}/.test(res) && /resolve-deployment\.cjs --sha "\$GITHUB_SHA" --environment Production/.test(res), 'the deployment is not resolved for exactly github.sha / Production');
  const sm = step(ds, 'Anonymous smoke of the NEW deployment');
  assert(/DEPLOY_URL: \$\{\{ steps\.resolve\.outputs\.url \}\}/.test(sm) && /anonymous-smoke\.cjs "\$DEPLOY_URL" --bypass --expect-sha "\$GITHUB_SHA"/.test(sm), 'the smoke does not target the resolved deployment with --bypass and --expect-sha');
  assert(!/wait-for-deploy\.cjs/.test(wf), 'ci-gates still waits for production (deadlock under Deployment Checks)');
  return 'needs offline + server-checks · exact sha · bypass + sha check';
}

function checkSecret(wf, pp, smoke) {
  const uses = wf.match(/VERCEL_AUTOMATION_BYPASS_SECRET[^\n]*/g) || [];
  assert(uses.length === 1 && uses[0] === 'VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}', `the secret is used other than once, plainly: ${uses.join(' | ')}`);
  assert(/VERCEL_AUTOMATION_BYPASS_SECRET: \$\{\{ secrets\.VERCEL_AUTOMATION_BYPASS_SECRET \}\}/.test(step(job(wf, 'deploy-smoke'), 'Anonymous smoke of the NEW deployment')), 'the secret is not scoped to the smoke step');
  assert(!/VERCEL_AUTOMATION_BYPASS_SECRET/.test(pp), 'the post-promotion smoke uses the bypass secret');
  assert(!/x-vercel-protection-bypass\s*[:=]/i.test(wf + pp), 'a bypass header value in a workflow');
  // the smoke script: fails closed, never prints the header or its value
  assert(/if \(BYPASS && !BYPASS_SECRET\) \{\s*console\.log\('FAIL {2}BYPASS-SECRET/.test(smoke) && /process\.exit\(1\);/.test(smoke), 'the smoke does not fail closed without the secret');
  // the variables, not the env-var NAME inside the fail-closed message text
  assert(!/console\.(log|error)\([^)]*(?<![A-Z_])(BYPASS_SECRET|BYPASS_HEADERS)\b/.test(smoke), 'the smoke prints the secret / header');
  // behaviour: a real subprocess with a missing / blank secret exits 1 before any request
  const file = path.join(ROOT, 'scripts', 'smoke', 'anonymous-smoke.cjs');
  const env = { ...process.env };
  delete env.VERCEL_AUTOMATION_BYPASS_SECRET;
  for (const val of [undefined, '   ']) {
    const r = spawnSync(process.execPath, [file, 'https://example.invalid', '--bypass'], { env: val === undefined ? env : { ...env, VERCEL_AUTOMATION_BYPASS_SECRET: val }, encoding: 'utf8', timeout: 20000 });
    assert(r.status === 1 && /FAIL {2}BYPASS-SECRET/.test(r.stdout), `the smoke ran without the secret (${val === undefined ? 'missing' : 'blank'}): exit ${r.status}`);
  }
  // the log scan: the secret's value and the header / query with a value are findings; the bare name is not
  const { scanLine, secretValues } = require(path.join(ROOT, 'scripts/ci/log-scan.cjs'));
  const sec = secretValues({ VERCEL_AUTOMATION_BYPASS_SECRET: 'test-bypass-value-0123456789' });
  assert(scanLine('x test-bypass-value-0123456789 y', sec).includes('secret') && scanLine('x-vercel-protection-bypass: AbCdEf123456', []).includes('bypass-header') && scanLine('?x-vercel-protection-bypass=AbCdEf123456', []).includes('bypass-header') && scanLine('with the x-vercel-protection-bypass header', []).length === 0, 'the log scan does not cover the bypass secret / header');
  return 'one plain use · fails closed (missing + blank) · never printed · log-scanned';
}

function checkPostPromotion(pp, wf) {
  assert(/on:\n {2}repository_dispatch:\n {4}types: \[vercel\.deployment\.promoted\]\n/.test(pp), 'post-promotion-smoke is not on vercel.deployment.promoted');
  assert(/PAYLOAD_SHA: \$\{\{ github\.event\.client_payload\.git\.sha \|\| inputs\.sha \}\}/.test(pp) && !/run:[^\n]*\$\{\{ github\.event/.test(pp), 'the payload is interpolated into a script (read it through env)');
  assert(/grep -Eq '\^\[0-9a-f\]\{7,40\}\$'/.test(pp) && /production\|Production\)/.test(pp) && /"\$PROD_BASE_URL" != "https:\/\/couragelibrary\.in"/.test(pp), 'the payload is not validated (sha, production, canonical base)');
  assert(/wait-for-deploy\.cjs "\$PROD_BASE_URL" "\$\{PAYLOAD_SHA::7\}"/.test(pp) && /anonymous-smoke\.cjs "\$PROD_BASE_URL" --expect-sha "\$PAYLOAD_SHA"/.test(pp) && !/--bypass/.test(pp), 'the post-promotion smoke is not the anonymous smoke of the live site for the promoted commit');
  assert(!/post-promotion/.test(wf.replace(/#[^\n]*/g, '')), 'ci-gates runs the post-promotion smoke (it must not be a required check)');
  assert(/permissions:\n {2}contents: read\n/.test(pp), 'post-promotion permissions not read-only');
  return 'repository_dispatch · env + validated payload · anonymous · not required';
}

function checkSelfTests() {
  const out = [];
  for (const rel of ['scripts/ci/resolve-deployment.cjs', 'scripts/ci/change-scope.cjs', 'scripts/ci/log-scan.cjs']) {
    const r = spawnSync(process.execPath, [path.join(ROOT, rel), '--self-test'], { encoding: 'utf8', timeout: 30000 });
    assert(r.status === 0, `${rel} --self-test failed`);
    out.push(path.basename(rel, '.cjs'));
  }
  return out.join(' · ');
}

test('G-1 every push to main runs ci-gates (no paths filter)', () => checkTrigger(SRC.wf));
test('G-2 docs-only fast path: scope job; offline + server-checks always report', () => checkScope(SRC.wf));
test('G-3 deploy-smoke: exact-sha deployment, bypass + commit check, no wait for production', () => checkDeploySmoke(SRC.wf));
test('G-4 bypass secret: one plain use, fails closed, never printed, log-scanned', () => checkSecret(SRC.wf, SRC.pp, SRC.smoke));
test('G-5 post-promotion smoke: repository_dispatch, validated payload, not a required check', () => checkPostPromotion(SRC.pp, SRC.wf));
test('G-6 resolve-deployment / change-scope / log-scan self-tests', () => checkSelfTests());

test('G-7 negative controls: each broken variant is caught', () => {
  const mut = (s, a, b) => {
    if (!s.includes(a)) throw new Error(`mutation anchor missing: ${a.slice(0, 80)}`);
    return s.split(a).join(b);
  };
  const W = SRC.wf;
  const muts = [
    ['paths filter back', () => checkTrigger(mut(W, '  push:\n    branches: [main]\n', "  push:\n    branches: [main]\n    paths:\n      - '!docs/**'\n"))],
    ['offline skipped as a job on docs-only', () => checkScope(mut(W, '  offline:\n    needs: scope\n', "  offline:\n    needs: scope\n    if: needs.scope.outputs.code == 'true'\n"))],
    ['server build not gated', () => checkScope(mut(W, "      - name: Production build (summary only)\n        if: needs.scope.outputs.code == 'true'\n", '      - name: Production build (summary only)\n'))],
    ['deploy-smoke without server-checks', () => checkDeploySmoke(mut(W, 'needs: [scope, offline, server-checks]', 'needs: [scope, offline]'))],
    ['resolve by a short / other sha', () => checkDeploySmoke(mut(W, '--sha "$GITHUB_SHA" --environment Production', '--sha "${GITHUB_SHA::7}" --environment Production'))],
    ['resolve any environment', () => checkDeploySmoke(mut(W, '--environment Production --timeout 940', '--environment Preview --timeout 940'))],
    ['smoke without the bypass', () => checkDeploySmoke(mut(W, '"$DEPLOY_URL" --bypass --expect-sha "$GITHUB_SHA"', '"$DEPLOY_URL" --expect-sha "$GITHUB_SHA"'))],
    ['smoke the live site (deadlock)', () => checkDeploySmoke(mut(W, '      - name: Log scan of the captured outputs\n        if: always()\n        run: node scripts/ci/log-scan.cjs "$RUNNER_TEMP/ci-quiet"\n', '      - name: Wait\n        run: node scripts/smoke/wait-for-deploy.cjs https://couragelibrary.in "${GITHUB_SHA::7}"\n      - name: Log scan of the captured outputs\n        if: always()\n        run: node scripts/ci/log-scan.cjs "$RUNNER_TEMP/ci-quiet"\n'))],
    ['secret with a fallback', () => checkSecret(mut(W, '${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}', "${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET || 'none' }}"), SRC.pp, SRC.smoke)],
    ['secret on the whole job', () => checkSecret(mut(W, '      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1 (node24)\n        with:\n          persist-credentials: false\n      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0 (node24)\n        with:\n          node-version: ${{ env.NODE_VERSION }}\n          cache: npm\n      - name: Install (lockfile only)\n        run: npm ci --no-audit --no-fund --loglevel=error\n      - name: Mask values derived from secrets\n        run: node scripts/ci/mask-derived.cjs\n      - name: Find the Vercel', '      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}\n      VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1 (node24)\n        with:\n          persist-credentials: false\n      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0 (node24)\n        with:\n          node-version: ${{ env.NODE_VERSION }}\n          cache: npm\n      - name: Install (lockfile only)\n        run: npm ci --no-audit --no-fund --loglevel=error\n      - name: Mask values derived from secrets\n        run: node scripts/ci/mask-derived.cjs\n      - name: Find the Vercel'), SRC.pp, SRC.smoke)],
    ['smoke prints the header', () => checkSecret(W, SRC.pp, mut(SRC.smoke, "const BYPASS_HEADERS = BYPASS ? { ['x-vercel-protection-bypass']: BYPASS_SECRET } : {};", "const BYPASS_HEADERS = BYPASS ? { ['x-vercel-protection-bypass']: BYPASS_SECRET } : {};\nconsole.log(BYPASS_HEADERS);"))],
    ['post-promotion uses the bypass', () => checkSecret(W, SRC.pp + '\n      VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}\n', SRC.smoke)],
    ['post-promotion on another event', () => checkPostPromotion(mut(SRC.pp, 'types: [vercel.deployment.promoted]', 'types: [vercel.deployment.success]'), W)],
    ['payload interpolated into a script', () => checkPostPromotion(mut(SRC.pp, 'node scripts/smoke/wait-for-deploy.cjs "$PROD_BASE_URL" "${PAYLOAD_SHA::7}" 600', 'node scripts/smoke/wait-for-deploy.cjs "$PROD_BASE_URL" "${{ github.event.client_payload.git.sha }}" 600'), W)],
    ['payload not validated', () => checkPostPromotion(mut(SRC.pp, "grep -Eq '^[0-9a-f]{7,40}$'", "grep -Eq '.*'"), W)],
    ['post-promotion as a required ci-gates job', () => checkPostPromotion(SRC.pp, W + '\n  post-promotion-smoke:\n    runs-on: ubuntu-24.04\n')],
  ];
  const missed = [];
  for (const [name, run] of muts) {
    try {
      run();
      missed.push(name);
    } catch (e) {
      if (/mutation anchor missing/.test(String(e && e.message))) missed.push(`${name} (${e.message})`);
    }
  }
  assert(missed.length === 0, `not caught: ${missed.join('; ')}`);
  return `${muts.length}/${muts.length} broken variants caught`;
});

console.log('DEPLOY-GATE-1 (offline)');
console.log(results.join('\n'));
console.log(`\nDEPLOY-GATE-1: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
