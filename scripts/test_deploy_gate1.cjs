#!/usr/bin/env node
/**
 * DEPLOY-GATE-1 gate (owner, 2026-11-23; design (i)) — production changes only after CI is green. Offline: reads the
 * workflows and the CI scripts; runs no network request.
 *   G-1 every push to main runs ci-gates (no `paths` filter), so the checks deploy-smoke waits for always report
 *   G-2 docs-only fast path: a `scope` job (scripts/ci/change-scope.cjs, fails safe to "code"); offline / server-checks
 *       keep their names, skip only their heavy steps on docs-only pushes, and still report
 *   G-3 .github/workflows/deploy-smoke.yml — the ONE required Vercel check (commit status "deploy-smoke"):
 *       repository_dispatch vercel.deployment.ready only · one job, id NOT deploy-smoke · least privilege · Vercel's status
 *       action pinned to a full sha as the FIRST step, name deploy-smoke · no continue-on-error, no step timeout · payload
 *       via env only · order: validate → on main → CI checks of that sha all success → checkout that sha → smoke the
 *       VALIDATED URL with --bypass --expect-sha; ci-gates has no deploy-smoke / prod-smoke job any more
 *   G-4 payload validation (a real subprocess): foreign host, http, missing sha, preview … → exit 1, nothing smoked
 *   G-5 the bypass secret: only as ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}, once, on the smoke step of
 *       deploy-smoke.yml, never with a fallback, nowhere else; the smoke FAILS CLOSED without it (missing / blank → exit 1);
 *       never printed; the log scan flags the secret's value and the header / query with a value
 *   G-6 post-promotion-smoke.yml: repository_dispatch vercel.deployment.promoted (+ manual), validated payload,
 *       anonymous smoke of couragelibrary.in with --expect-sha, no bypass; not a required check
 *   G-7 pre-promotion / change-scope / log-scan self-tests pass
 *   G-8 negative controls: each broken variant is caught
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

const DS = '.github/workflows/deploy-smoke.yml';
SRC.ds = read(DS);
const STATUS_ACTION = /^vercel\/repository-dispatch\/actions\/status@[0-9a-f]{40}(?: #.*)?$/;
const stepList = (wfText) => {
  const body = wfText.slice(wfText.indexOf('\n    steps:\n') + '\n    steps:\n'.length);
  return body.split(/\n(?= {6}- (?:name|uses):)/);
};
const idx = (steps, re) => steps.findIndex((s) => re.test(s));

function checkDeploySmoke(ds, wf) {
  // ci-gates: the push-run deploy-smoke (deadlock under Deployment Checks) is gone
  assert(!job(wf, 'deploy-smoke') && !job(wf, 'prod-smoke'), 'ci-gates still has a deploy-smoke / prod-smoke job');
  assert(!/wait-for-deploy\.cjs|prod_smoke|repository_dispatch/.test(wf.replace(/#[^\n]*/g, '')), 'ci-gates still waits for production / has prod_smoke / a dispatch trigger');
  // trigger: Vercel's pre-promotion event only
  const on = ds.slice(ds.indexOf('\non:\n'), ds.indexOf('\nrun-name:'));
  assert(/^\non:\n {2}repository_dispatch:\n {4}types: \[vercel\.deployment\.ready\]\n*$/.test(on), `trigger is not repository_dispatch [vercel.deployment.ready] only: ${on.trim().replace(/\n/g, ' ')}`);
  assert(/\npermissions: \{\}\n/.test(ds), 'workflow-level permissions are not {}');
  // one job, its id NOT deploy-smoke (its own check run lands on main's HEAD)
  const jobsBlock = ds.slice(ds.indexOf('\njobs:\n'));
  const ids = [...jobsBlock.matchAll(/\n {2}([a-z][a-z0-9-]*):\n/g)].map((m) => m[1]);
  assert(ids.length === 1 && ids[0] !== 'deploy-smoke', `jobs: ${ids.join(', ')} (one job, not named deploy-smoke)`);
  assert(/\n {4}permissions:\n {6}contents: read\n {6}actions: read\n {6}checks: read\n {6}statuses: write\n {4}env:/.test(jobsBlock), 'job permissions are not exactly contents/actions/checks read + statuses write');
  const code = ds.replace(/^\s*#[^\n]*$/gm, '');
  assert(!/continue-on-error/.test(code), 'continue-on-error: a failed step would report success');
  assert(!/\n {8}timeout-minutes:/.test(code), 'a step-level timeout: a cancelled step would report success');
  const noEnvDefs = ds.replace(/\n {6}(PAYLOAD_ENV|PAYLOAD_SHA|PAYLOAD_URL): [^\n]*/g, '');
  assert(!/(run|DEPLOY_URL):[^\n]*\$\{\{ *github\.event/.test(noEnvDefs) && !/\n {10}[^\n]*\$\{\{ *github\.event/.test(noEnvDefs), 'the payload is interpolated into a script / step (read it through env)');
  assert(/\n {6}PAYLOAD_ENV: \$\{\{ github\.event\.client_payload\.environment \}\}\n {6}PAYLOAD_SHA: \$\{\{ github\.event\.client_payload\.git\.sha \}\}\n {6}PAYLOAD_URL: \$\{\{ github\.event\.client_payload\.url \}\}\n/.test(ds), 'payload env missing');
  const steps = stepList(jobsBlock);
  // the status action: FIRST step, pinned to a full sha, fixed name deploy-smoke
  const first = steps[0] || '';
  const uses = (first.match(/uses: ([^\n]*)/) || [])[1] || '';
  assert(STATUS_ACTION.test(uses) && /\n {8}with:\n {10}name: deploy-smoke$/.test(first.replace(/\n+$/, '')), `the first step is not Vercel's pinned status action named deploy-smoke: ${uses}`);
  const iValidate = idx(steps, /id: payload\n\s+run: node scripts\/ci\/pre-promotion\.cjs --validate$/);
  const iMain = idx(steps, /git merge-base --is-ancestor "\$PAYLOAD_SHA" origin\/main; then echo "PASS[^\n]*; else echo "FAIL[^\n]*; exit 1; fi/);
  const iChecks = idx(steps, /GITHUB_TOKEN: \$\{\{ github\.token \}\}\n\s+run: node scripts\/ci\/run-quiet\.cjs --id CI-CHECKS --timeout \d+ -- node scripts\/ci\/pre-promotion\.cjs --wait-checks --sha "\$PAYLOAD_SHA" --timeout 1500/);
  const iCheckout = idx(steps, /run: git -c advice\.detachedHead=false checkout --detach "\$PAYLOAD_SHA"/);
  const iSmoke = idx(steps, /VERCEL_AUTOMATION_BYPASS_SECRET:/);
  assert(/uses: actions\/checkout@/.test(steps[1] || '') && /persist-credentials: false/.test(steps[1]) && /fetch-depth: 0/.test(steps[1]), 'checkout (main, full history, no credentials) is not the second step');
  assert(iValidate === 2, 'payload validation is not right after the checkout (before anything else uses the payload)');
  assert(iMain > iValidate && iChecks > iMain && iCheckout > iChecks && iSmoke > iCheckout, `order validate → on-main → CI checks → checkout sha → smoke broken (${[iValidate, iMain, iChecks, iCheckout, iSmoke].join(',')})`);
  const sm = steps[iSmoke];
  assert(/DEPLOY_URL: \$\{\{ steps\.payload\.outputs\.url \}\}/.test(sm) && /anonymous-smoke\.cjs "\$DEPLOY_URL" --bypass --expect-sha "\$PAYLOAD_SHA"/.test(sm) && !/PAYLOAD_URL/.test(sm), 'the smoke does not use the VALIDATED URL with --bypass and --expect-sha');
  assert(!/\n {8}if:/.test(steps.slice(0, iSmoke + 1).join('\n')), 'a step up to the smoke has its own if: (it could be skipped)');
  assert((ds.match(/PAYLOAD_URL/g) || []).length === 1, 'the raw payload URL is used somewhere other than its env definition');
  return 'ready event · one job · pinned status action first · validate → on main → CI → sha → smoke';
}

function checkValidation() {
  const file = path.join(ROOT, 'scripts/ci/pre-promotion.cjs');
  const S = 'a'.repeat(40);
  const good = { PAYLOAD_ENV: 'production', PAYLOAD_SHA: S, PAYLOAD_URL: 'https://couragelibrary-next-abc123xyz-team.vercel.app' };
  const run = (env) => spawnSync(process.execPath, [file, '--validate'], { env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env }, encoding: 'utf8', timeout: 20000 });
  const ok = run(good);
  assert(ok.status === 0 && /PASS {2}PAYLOAD/.test(ok.stdout), `a valid payload is refused: exit ${ok.status}`);
  const bad = {
    'foreign host': { PAYLOAD_URL: 'https://evil.example.com' },
    http: { PAYLOAD_URL: 'http://couragelibrary-next-abc123xyz-team.vercel.app' },
    'missing sha': { PAYLOAD_SHA: '' },
    'short sha': { PAYLOAD_SHA: 'abc1234' },
    preview: { PAYLOAD_ENV: 'preview' },
    'other project': { PAYLOAD_URL: 'https://someone-else-abc.vercel.app' },
    'missing url': { PAYLOAD_URL: '' },
  };
  for (const [name, o] of Object.entries(bad)) {
    const r = run({ ...good, ...o });
    assert(r.status === 1 && /FAIL {2}PAYLOAD .*nothing is smoked, no bypass header is sent/.test(r.stdout), `payload "${name}" was not refused: exit ${r.status}`);
  }
  return `valid → ok · ${Object.keys(bad).length} bad payloads refused (${Object.keys(bad).join(', ')})`;
}

function checkSecret(ds, wf, pp, smoke) {
  const uses = ds.match(/VERCEL_AUTOMATION_BYPASS_SECRET[^\n]*/g) || [];
  assert(uses.length === 1 && uses[0] === 'VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}', `the secret is used other than once, plainly: ${uses.join(' | ')}`);
  assert(/\n {10}VERCEL_AUTOMATION_BYPASS_SECRET: /.test(ds), 'the secret is not scoped to one step');
  assert(!/VERCEL_AUTOMATION_BYPASS_SECRET/.test(wf) && !/VERCEL_AUTOMATION_BYPASS_SECRET/.test(pp), 'ci-gates / post-promotion-smoke use the bypass secret');
  assert(!/x-vercel-protection-bypass\s*[:=]/i.test(ds + wf + pp), 'a bypass header value in a workflow');
  assert(/if \(BYPASS && !BYPASS_SECRET\) \{\s*console\.log\('FAIL {2}BYPASS-SECRET/.test(smoke) && /process\.exit\(1\);/.test(smoke), 'the smoke does not fail closed without the secret');
  // the variables, not the env-var NAME inside the fail-closed message text
  assert(!/console\.(log|error)\([^)]*(?<![A-Z_])(BYPASS_SECRET|BYPASS_HEADERS)\b/.test(smoke), 'the smoke prints the secret / header');
  const file = path.join(ROOT, 'scripts', 'smoke', 'anonymous-smoke.cjs');
  const env = { ...process.env };
  delete env.VERCEL_AUTOMATION_BYPASS_SECRET;
  for (const val of [undefined, '   ']) {
    const r = spawnSync(process.execPath, [file, 'https://example.invalid', '--bypass'], { env: val === undefined ? env : { ...env, VERCEL_AUTOMATION_BYPASS_SECRET: val }, encoding: 'utf8', timeout: 20000 });
    assert(r.status === 1 && /FAIL {2}BYPASS-SECRET/.test(r.stdout), `the smoke ran without the secret (${val === undefined ? 'missing' : 'blank'}): exit ${r.status}`);
  }
  const { scanLine, secretValues } = require(path.join(ROOT, 'scripts/ci/log-scan.cjs'));
  const sec = secretValues({ VERCEL_AUTOMATION_BYPASS_SECRET: 'test-bypass-value-0123456789' });
  assert(scanLine('x test-bypass-value-0123456789 y', sec).includes('secret') && scanLine('x-vercel-protection-bypass: AbCdEf123456', []).includes('bypass-header') && scanLine('?x-vercel-protection-bypass=AbCdEf123456', []).includes('bypass-header') && scanLine('with the x-vercel-protection-bypass header', []).length === 0, 'the log scan does not cover the bypass secret / header');
  return 'one plain use on one step · fails closed (missing + blank) · never printed · log-scanned';
}

function checkPostPromotion(pp, wf) {
  assert(/on:\n {2}repository_dispatch:\n {4}types: \[vercel\.deployment\.promoted\]\n/.test(pp), 'post-promotion-smoke is not on vercel.deployment.promoted');
  assert(/PAYLOAD_SHA: \$\{\{ github\.event\.client_payload\.git\.sha \|\| inputs\.sha \}\}/.test(pp) && !/run:[^\n]*\$\{\{ github\.event/.test(pp), 'the payload is interpolated into a script (read it through env)');
  assert(/grep -Eq '\^\[0-9a-f\]\{7,40\}\$'/.test(pp) && /production\|Production\)/.test(pp) && /"\$PROD_BASE_URL" != "https:\/\/couragelibrary\.in"/.test(pp), 'the payload is not validated (sha, production, canonical base)');
  assert(/wait-for-deploy\.cjs "\$PROD_BASE_URL" "\$\{PAYLOAD_SHA::7\}"/.test(pp) && /anonymous-smoke\.cjs "\$PROD_BASE_URL" --expect-sha "\$PAYLOAD_SHA"/.test(pp) && !/--bypass/.test(pp), 'the post-promotion smoke is not the anonymous smoke of the live site for the promoted commit');
  assert(!/post-promotion/.test(wf.replace(/#[^\n]*/g, '')), 'ci-gates runs the post-promotion smoke (it must not be a required check)');
  assert(!/vercel\/repository-dispatch\/actions\/status/.test(pp), 'post-promotion reports a commit status (it must not be a required check)');
  assert(/permissions:\n {2}contents: read\n/.test(pp), 'post-promotion permissions not read-only');
  return 'repository_dispatch promoted · env + validated payload · anonymous · not required';
}

function checkSelfTests() {
  const out = [];
  for (const rel of ['scripts/ci/pre-promotion.cjs', 'scripts/ci/change-scope.cjs', 'scripts/ci/log-scan.cjs']) {
    const r = spawnSync(process.execPath, [path.join(ROOT, rel), '--self-test'], { encoding: 'utf8', timeout: 30000 });
    assert(r.status === 0, `${rel} --self-test failed`);
    out.push(path.basename(rel, '.cjs'));
  }
  assert(!fs.existsSync(path.join(ROOT, 'scripts/ci/resolve-deployment.cjs')), 'the old resolve-deployment.cjs (GitHub Deployments lookup — deadlocks) is still there');
  return out.join(' · ');
}

test('G-1 every push to main runs ci-gates (no paths filter)', () => checkTrigger(SRC.wf));
test('G-2 docs-only fast path: scope job; offline + server-checks always report', () => checkScope(SRC.wf));
test('G-3 deploy-smoke.yml: ready event, pinned status action first, validate → on main → CI → smoke', () => checkDeploySmoke(SRC.ds, SRC.wf));
test('G-4 payload validation refuses foreign host / http / missing sha / preview (subprocess)', () => checkValidation());
test('G-5 bypass secret: one plain use, fails closed, never printed, log-scanned', () => checkSecret(SRC.ds, SRC.wf, SRC.pp, SRC.smoke));
test('G-6 post-promotion smoke: repository_dispatch promoted, validated payload, not a required check', () => checkPostPromotion(SRC.pp, SRC.wf));
test('G-7 pre-promotion / change-scope / log-scan self-tests', () => checkSelfTests());

test('G-8 negative controls: each broken variant is caught', () => {
  const mut = (s, a, b) => {
    if (!s.includes(a)) throw new Error(`mutation anchor missing: ${a.slice(0, 80)}`);
    return s.split(a).join(b);
  };
  const W = SRC.wf;
  const D = SRC.ds;
  const cd = (d) => () => checkDeploySmoke(d, W);
  const muts = [
    ['paths filter back', () => checkTrigger(mut(W, '  push:\n    branches: [main]\n', "  push:\n    branches: [main]\n    paths:\n      - '!docs/**'\n"))],
    ['offline skipped as a job on docs-only', () => checkScope(mut(W, '  offline:\n    needs: scope\n', "  offline:\n    needs: scope\n    if: needs.scope.outputs.code == 'true'\n"))],
    ['server build not gated', () => checkScope(mut(W, "      - name: Production build (summary only)\n        if: needs.scope.outputs.code == 'true'\n", '      - name: Production build (summary only)\n'))],
    ['old push-run deploy-smoke job back in ci-gates', () => checkDeploySmoke(D, W + '\n  deploy-smoke:\n    runs-on: ubuntu-24.04\n')],
    ['ci-gates waits for production again', () => checkDeploySmoke(D, W + '\n        run: node scripts/smoke/wait-for-deploy.cjs x\n')],
    ['trigger vercel.deployment.success (not pre-promotion)', cd(mut(D, 'types: [vercel.deployment.ready]', 'types: [vercel.deployment.success]'))],
    ['an extra push trigger', cd(mut(D, '    types: [vercel.deployment.ready]\n', '    types: [vercel.deployment.ready]\n  push:\n    branches: [main]\n'))],
    ['status action unpinned (@v1)', cd(mut(D, 'actions/status@30f760c6640485cd92f8c785ef361382555fb712 # v1', 'actions/status@v1'))],
    ['status action with another name', cd(mut(D, '          name: deploy-smoke\n', '          name: Vercel - deploy-smoke\n'))],
    ['status action not first', cd(mut(D, '    steps:\n      - name: Report to Vercel', '    steps:\n      - name: Debug\n        run: echo x\n      - name: Report to Vercel'))],
    ['job id deploy-smoke', cd(mut(D, '  pre-promotion-smoke:\n', '  deploy-smoke:\n'))],
    ['a second job', cd(D + '  other:\n    runs-on: ubuntu-24.04\n')],
    ['continue-on-error', cd(mut(D, '        id: payload\n', '        id: payload\n        continue-on-error: true\n'))],
    ['step-level timeout', cd(mut(D, '        id: payload\n', '        id: payload\n        timeout-minutes: 5\n'))],
    ['permissions widened', cd(mut(D, '      contents: read\n      actions: read\n', '      contents: write\n      actions: read\n'))],
    ['no payload validation', cd(mut(D, '        id: payload\n        run: node scripts/ci/pre-promotion.cjs --validate\n', '        id: payload\n        run: echo "url=$PAYLOAD_URL" >> "$GITHUB_OUTPUT"\n'))],
    ['smoke uses the raw payload URL', cd(mut(D, 'DEPLOY_URL: ${{ steps.payload.outputs.url }}', 'DEPLOY_URL: ${{ github.event.client_payload.url }}'))],
    ['no on-main check', cd(mut(D, 'git merge-base --is-ancestor "$PAYLOAD_SHA" origin/main', 'true'))],
    ['no CI-checks wait', cd(mut(D, '--wait-checks --sha "$PAYLOAD_SHA" --timeout 1500', '--self-test'))],
    ['smoke without --expect-sha', cd(mut(D, '--bypass --expect-sha "$PAYLOAD_SHA"', '--bypass'))],
    ['smoke step can be skipped', cd(mut(D, '      - name: Anonymous smoke of the deployment, before promotion (summary only)\n', "      - name: Anonymous smoke of the deployment, before promotion (summary only)\n        if: env.PAYLOAD_ENV == 'x'\n"))],
    ['payload interpolated into a script', cd(mut(D, 'run: git -c advice.detachedHead=false checkout --detach "$PAYLOAD_SHA"', 'run: git -c advice.detachedHead=false checkout --detach "${{ github.event.client_payload.git.sha }}"'))],
    ['secret with a fallback', () => checkSecret(mut(D, '${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}', "${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET || 'none' }}"), W, SRC.pp, SRC.smoke)],
    ['secret on the whole job', () => checkSecret(mut(mut(D, '          VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}\n', ''), '      PAYLOAD_URL: ${{ github.event.client_payload.url }}\n', '      PAYLOAD_URL: ${{ github.event.client_payload.url }}\n      VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}\n'), W, SRC.pp, SRC.smoke)],
    ['secret in ci-gates', () => checkSecret(D, W + '\n      VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}\n', SRC.pp, SRC.smoke)],
    ['smoke prints the header', () => checkSecret(D, W, SRC.pp, mut(SRC.smoke, "const BYPASS_HEADERS = BYPASS ? { ['x-vercel-protection-bypass']: BYPASS_SECRET } : {};", "const BYPASS_HEADERS = BYPASS ? { ['x-vercel-protection-bypass']: BYPASS_SECRET } : {};\nconsole.log(BYPASS_HEADERS);"))],
    ['post-promotion uses the bypass', () => checkSecret(D, W, SRC.pp + '\n      VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}\n', SRC.smoke)],
    ['post-promotion on another event', () => checkPostPromotion(mut(SRC.pp, 'types: [vercel.deployment.promoted]', 'types: [vercel.deployment.success]'), W)],
    ['post-promotion payload interpolated', () => checkPostPromotion(mut(SRC.pp, 'node scripts/smoke/wait-for-deploy.cjs "$PROD_BASE_URL" "${PAYLOAD_SHA::7}" 600', 'node scripts/smoke/wait-for-deploy.cjs "$PROD_BASE_URL" "${{ github.event.client_payload.git.sha }}" 600'), W)],
    ['post-promotion payload not validated', () => checkPostPromotion(mut(SRC.pp, "grep -Eq '^[0-9a-f]{7,40}$'", "grep -Eq '.*'"), W)],
    ['post-promotion reports a required status', () => checkPostPromotion(SRC.pp + '      - uses: vercel/repository-dispatch/actions/status@30f760c6640485cd92f8c785ef361382555fb712\n', W)],
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
