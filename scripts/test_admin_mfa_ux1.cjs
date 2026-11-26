#!/usr/bin/env node
/**
 * ADMIN-MFA-UX-1 — the redesigned /admin/mfa (docs/design/ADMIN_MFA_UX_V1_SPEC.md). Offline: TS/TSX transpile + mocks,
 * the REAL components rendered to HTML with react-dom/server; no network, no session, no Supabase.
 *   U-01 masked account: first letter + domain; odd input → "your account"; the page passes ONLY maskEmail(userEmail)
 *   U-02 `next` unchanged: the page passes sanitizeAdminNext(next); open-redirect attempts all become /admin
 *   U-03 MFA logic unchanged: the same Supabase calls (listFactors → unenroll unverified totp → enroll totp;
 *        challengeAndVerify), browser only; no storage / console / fetch anywhere in the MFA files (secret never logged
 *        or persisted); guard line and allowAal1 unchanged
 *   U-04 setup vs return by state: setup steps 1–3 (aria-current="step"), QR + grouped key + Copy only on step 2; the
 *        return screen = one code screen, no steps, no QR, no key (negative control: a return render fed a setup stage)
 *   U-05 the code field: one real input — inputmode numeric, autocomplete one-time-code, maxlength 6, pattern [0-9]*,
 *        labelled; six visual boxes aria-hidden; error copy tied by aria-describedby; plain-words error kinds
 *   U-06 copy + frame: one <h1> per state; masked account + Sign out; "Back to the site" (/); help mailto; NO
 *        "Admin studio" back link anywhere (frame, layout, page); no emoji; success = "You're protected" + backup tip
 *   U-07 AuthShell / AuthHeading unchanged for every other auth page (no panel → the AUTH-UX-1 panel; no muted → no span)
 *   U-08 the fixture exists only in fixture builds (.fixture.tsx, notFound unless EXAM_UX_FIXTURE=1, never production)
 * Run: node scripts/test_admin_mfa_ux1.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 800)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

// ---- loader: TS/TSX → CJS (react-jsx), @/ alias, mocks for Next / Supabase / server-only modules
const ts = require('typescript');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
const transpile = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = transpile;
require.extensions['.tsx'] = transpile;
const React = require('react');
const supabaseCalls = [];
const MOCKS = {
  'server-only': {},
  'next/navigation': { useRouter: () => ({ replace() {}, refresh() {}, push() {} }), notFound: () => { throw new Error('NOT_FOUND'); }, redirect: () => { throw new Error('REDIRECT'); } },
  'next/link': { __esModule: true, default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) },
  'next/image': { __esModule: true, default: (p) => React.createElement('img', { src: typeof p.src === 'string' ? p.src : '', alt: p.alt }) },
  '@/lib/supabase/client': { createClient: () => new Proxy({}, { get: (_, k) => { supabaseCalls.push(String(k)); throw new Error('no Supabase in the offline gate'); } }) },
  '@/app/(site)/auth/actions': { logoutAction: async () => {} },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return origLoad.call(this, request, parent, isMain);
};
const { renderToStaticMarkup } = require('react-dom/server');
const { AdminMfaPanel } = require(path.join(ROOT, 'components/admin/admin-mfa-panel.tsx'));
const { MfaAccountRow } = require(path.join(ROOT, 'components/admin/mfa/mfa-account.tsx'));
const { AdminAuthFrame } = require(path.join(ROOT, 'components/admin/mfa/admin-auth-frame.tsx'));
const { AuthShell } = require(path.join(ROOT, 'components/auth/auth-shell.tsx'));
const { AuthHeading } = require(path.join(ROOT, 'components/auth/auth-ui.tsx'));
const UI = require(path.join(ROOT, 'lib/auth/mfa-ui.ts'));
const { sanitizeAdminPath } = require(path.join(ROOT, 'lib/auth/safe-redirect.ts'));

const KEY = 'JBSWY3DPEHPK3PXP'; // public documentation example
const QR = 'data:image/svg+xml;base64,RklYVFVSRS1RUg==';
const FID = '00000000-0000-4000-8000-00000000f1a0';
const MASKED = UI.maskEmail('jane.fixture@example.test');
const enrol = { factorId: FID, qr: QR, secret: KEY };
const STATES = {
  'setup-1': { stage: { kind: 'install' } },
  'setup-2': { stage: { kind: 'scan', ...enrol } },
  'setup-3': { stage: { kind: 'code', ...enrol } },
  'setup-3-error': { stage: { kind: 'code', ...enrol }, error: 'wrong-code' },
  success: { stage: { kind: 'success' } },
  return: { stage: { kind: 'verify', factorId: FID } },
  'return-error': { stage: { kind: 'verify', factorId: FID }, error: 'rate-limited' },
  already: { stage: { kind: 'already' } },
};
const render = (preview) =>
  renderToStaticMarkup(
    React.createElement(AdminAuthFrame, null, React.createElement(AdminMfaPanel, { next: '/admin', maskedEmail: MASKED, account: React.createElement(MfaAccountRow, { masked: MASKED, inert: true }), helpHref: 'mailto:help@example.test', preview })),
  );
const HTML = Object.fromEntries(Object.entries(STATES).map(([k, v]) => [k, render(v)]));
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/u;
const MFA_FILES = ['components/admin/admin-mfa-panel.tsx', 'components/admin/mfa/otp-input.tsx', 'components/admin/mfa/mfa-parts.tsx', 'components/admin/mfa/mfa-account.tsx', 'components/admin/mfa/admin-auth-frame.tsx', 'lib/auth/mfa-ui.ts', 'app/(site)/(admin-auth)/admin/mfa/page.tsx', 'app/(site)/(admin-auth)/admin/layout.tsx'];
const PAGE = 'app/(site)/(admin-auth)/admin/mfa/page.tsx';

/** the return-screen rule as a reusable check (also run on a deliberately wrong render = negative control) */
const returnScreenProblems = (h) => {
  const p = [];
  if (h.includes(KEY) || h.includes(UI.groupKey(KEY))) p.push('setup key present');
  if (h.includes(QR) || /QR code for your authenticator app/.test(h)) p.push('QR present');
  if (/data-mfa-steps/.test(h)) p.push('setup steps present');
  if (!/Verify and continue/.test(h)) p.push('no "Verify and continue"');
  return p;
};

test('U-01 masked account (first letter + domain; odd input never echoed); the page passes only the masked string', () => {
  const cases = [['jane@example.test', 'j•••@example.test'], ['A.b@sub.example.test', 'A•••@sub.example.test'], ['', 'your account'], [null, 'your account'], ['@example.test', 'your account'], ['jane@', 'your account'], ['jane@localhost', 'your account'], ['x<script>@e.test', 'x•••@e.test']];
  for (const [i, want] of cases) assert(UI.maskEmail(i) === want, `${i} → ${UI.maskEmail(i)}`);
  const page = read(PAGE);
  const uses = page.match(/userEmail/g) || [];
  assert(uses.length === 2 && /const \{ userEmail \} = await requireAdminPage/.test(page) && /maskEmail\(userEmail\)/.test(page), `userEmail must only be destructured and masked (${uses.length} uses)`);
  for (const k of Object.keys(HTML)) assert(!/jane\.fixture@/.test(HTML[k]), `${k}: full e-mail in HTML`);
  assert(/Signed in as/.test(HTML['setup-1']) && HTML['setup-1'].includes(MASKED) && /Sign out/.test(HTML.return), 'account row');
  return `${cases.length} cases`;
});

test('U-02 `next` handling unchanged: sanitizeAdminNext(next) on the page; open-redirect attempts → /admin', () => {
  assert(/next=\{sanitizeAdminNext\(next\)\}/.test(read(PAGE)), 'page must pass sanitizeAdminNext(next)');
  const evil = ['//evil.example', 'https://evil.example/admin', '/\\evil.example', '/admin/../auth/login', 'javascript:alert(1)', '/admin?x=//evil', ' /admin', '/administrator', '/%2F%2Fevil.example'];
  const bad = evil.filter((e) => sanitizeAdminPath(e) !== '/admin' && !/^\/admin(\/|$)/.test(sanitizeAdminPath(e)));
  assert(!bad.length, `escaped: ${bad.map((b) => `${b} → ${sanitizeAdminPath(b)}`).join(', ')}`);
  for (const e of evil) assert(!/evil|javascript|\.\./.test(sanitizeAdminPath(e)), `${e} → ${sanitizeAdminPath(e)}`);
  assert(sanitizeAdminPath('/admin/questions') === '/admin/questions', 'a real admin path survives');
  // negative control: the check above flags an unsanitized pass-through
  assert(!/evil/.test('/admin') && /evil/.test('//evil.example'), 'control');
  return `${evil.length} attempts rejected`;
});

test('U-03 MFA logic unchanged: same Supabase calls in the browser; nothing logged / stored / fetched; guard unchanged', () => {
  const p = read('components/admin/admin-mfa-panel.tsx');
  assert(/^"use client";/.test(p), 'panel is a client component');
  const order = ['sb.auth.mfa.getAuthenticatorAssuranceLevel()', 'sb.auth.mfa.listFactors()', 'x.factor_type === "totp" && x.status !== "verified"', 'sb.auth.mfa.unenroll({ factorId: f.id })', 'sb.auth.mfa.enroll({ factorType: "totp"', 'sb.auth.mfa.challengeAndVerify({ factorId, code: code.trim() })'];
  let at = -1;
  for (const s of order) {
    const i = p.indexOf(s, at + 1);
    assert(i > at, `missing or out of order: ${s}`);
    at = i;
  }
  for (const f of MFA_FILES) {
    const c = read(f);
    assert(!/console\.|localStorage|sessionStorage|indexedDB|document\.cookie|fetch\(|"use server"|sendBeacon|gtag|analytics/i.test(c.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), `${f}: logging / storage / network call`);
  }
  assert(/await requireAdminPage\(\{ allowStaff: true, path: "\/admin\/mfa", allowAal1: true \}\);/.test(read(PAGE)), 'guard line');
  assert(supabaseCalls.length === 0, `preview renders must not touch Supabase (${supabaseCalls})`);
  return 'call order + no storage/log/fetch in ' + MFA_FILES.length + ' files';
});

test('U-04 setup vs return by state; secret / QR only on setup step 2 (negative control: a return check on a setup render fails)', () => {
  const steps = (h) => (h.match(/data-step-state="(\w+)"/g) || []).map((s) => s.split('"')[1]).join(',');
  assert(steps(HTML['setup-1']) === 'current,upcoming,upcoming' && steps(HTML['setup-2']) === 'done,current,upcoming' && steps(HTML['setup-3']) === 'done,done,current', 'step states');
  for (const k of ['setup-1', 'setup-2', 'setup-3']) assert((HTML[k].match(/aria-current="step"/g) || []).length === 1, `${k}: one aria-current step`);
  assert(HTML['setup-2'].includes(UI.groupKey(KEY)) && HTML['setup-2'].includes('JBSW Y3DP EHPK 3PXP') && HTML['setup-2'].includes(QR) && /alt="QR code for your authenticator app"/.test(HTML['setup-2']) && /Copy key/.test(HTML['setup-2']), 'step 2: QR + grouped key + Copy');
  for (const k of ['setup-1', 'setup-3', 'setup-3-error', 'success', 'return', 'return-error', 'already']) assert(!HTML[k].includes(KEY) && !HTML[k].includes(UI.groupKey(KEY)) && !HTML[k].includes(QR), `${k}: secret / QR leaked`);
  for (const k of ['return', 'return-error']) assert(!returnScreenProblems(HTML[k]).length, `${k}: ${returnScreenProblems(HTML[k])}`);
  assert(/I have an app — next/.test(HTML['setup-1']) && /Google Authenticator/.test(HTML['setup-1']) && /Back to scan/.test(HTML['setup-3']), 'setup buttons');
  assert(/data-mfa-panel="setup"/.test(HTML['setup-2']) && /data-mfa-panel="return"/.test(HTML.return) && /Admin studio<\/b> <span class="opacity-75">is protected/.test(HTML['setup-1']) && /One more step<\/b> <span class="opacity-75">to the admin studio/.test(HTML.return), 'brand panel by mode');
  // negative control: the same return-screen check on a setup render must find the leak
  const ctl = returnScreenProblems(HTML['setup-2']);
  assert(ctl.includes('setup key present') && ctl.includes('QR present'), `control not caught: ${ctl}`);
  return 'control: ' + ctl.join(', ');
});

test('U-05 the code field: one real input (numeric, one-time-code, 6, pattern), labelled; boxes hidden; errors described', () => {
  for (const k of ['setup-3', 'return']) {
    const inputs = HTML[k].match(/<input[^>]*>/g) || [];
    assert(inputs.length === 1, `${k}: ${inputs.length} inputs`);
    const i = inputs[0];
    for (const a of ['inputMode="numeric"', 'autoComplete="one-time-code"', 'maxLength="6"', 'pattern="[0-9]*"', 'id="mfa-code"']) assert(i.toLowerCase().includes(a.toLowerCase()), `${k}: ${a}`);
    assert(/<label[^>]*for="mfa-code"/.test(HTML[k]), `${k}: label`);
    assert(/<div aria-hidden="true" class="flex gap-2">(<span[^>]*>[^<]*<\/span>){6}<\/div>/.test(HTML[k]), `${k}: six aria-hidden boxes`);
  }
  assert(/>4<\/span><span[^>]*>8<\/span><span[^>]*>2<\/span><span[^>]*>1</.test(render({ stage: STATES['setup-3'].stage, code: '4821' })), 'digits shown in boxes');
  const err = HTML['setup-3-error'];
  const m = err.match(/aria-describedby="([^"]+)"/);
  assert(m && new RegExp(`id="${m[1].replace(/[:]/g, '\\:')}"`).test(err) && /aria-invalid="true"/.test(err), 'error tied by aria-describedby + aria-invalid');
  assert(text(err).includes("That code didn't work. Codes change every 30 seconds — try the newest one."), 'wrong-code copy');
  assert(text(HTML['return-error']).includes('Too many tries. Wait a minute, then enter the newest code.'), 'rate-limit copy');
  const kinds = [[{ code: 'mfa_verification_failed', status: 422 }, 'wrong-code'], [{ status: 429, code: 'over_request_rate_limit' }, 'rate-limited'], [{ code: 'mfa_factor_not_found' }, 'expired'], [{ code: 'mfa_challenge_expired' }, 'expired'], [{ name: 'AuthRetryableFetchError', status: 0 }, 'network'], [null, 'wrong-code']];
  for (const [e, want] of kinds) assert(UI.mfaErrorKind(e) === want, `${JSON.stringify(e)} → ${UI.mfaErrorKind(e)}`);
  assert(/min-h-11/.test(HTML['setup-3']) && /min-h-11/.test(err), 'error space reserved (no layout shift)');
  // paste: maxlength would cut "123 456" before the digit filter — the field keeps the first 6 digits itself
  assert(/onPaste=\{[\s\S]*?getData\("text"\)\.replace\(\/\\D\/g, ""\)[\s\S]*?slice\(0, 6\)/.test(read('components/admin/mfa/otp-input.tsx')), 'paste handler (digits, first 6)');
  return `${kinds.length} error kinds`;
});

test('U-06 copy + frame: one h1, help, back to the site, NO "Admin studio" back link, no emoji, success state', () => {
  for (const [k, h] of Object.entries(HTML)) {
    assert((h.match(/<h1[\s>]/g) || []).length === 1, `${k}: h1 count`);
    assert(!EMOJI.test(text(h)), `${k}: emoji`);
    assert(!/←\s*Admin studio/.test(text(h)) && !/<a[^>]*href="\/admin"[^>]*>[^<]*Admin studio/.test(h), `${k}: "Admin studio" back link`);
    assert(/href="\/"[^>]*>.*?Back to the site/.test(h), `${k}: back to the site`);
    assert(/data-mfa-topbar/.test(h), `${k}: logo bar`);
  }
  assert(/Trouble\?.*Get help/.test(text(HTML['setup-1'])) && /Lost your phone\?.*Contact support/.test(text(HTML.return)) && /href="mailto:help@example.test"/.test(HTML.return), 'help links');
  assert(/You're protected/.test(text(HTML.success)) && /Go to admin studio/.test(HTML.success) && /second device/.test(HTML.success) && text(HTML.success).includes(MASKED), 'success state');
  // two-tone by colour (only Poppins 600 / 700 are self-hosted — a light weight would fall back to 600)
  assert(/<span class="text-cl-slate"> two-step verification<\/span>/.test(HTML['setup-1']), 'two-tone heading');
  for (const f of [...MFA_FILES, 'app/(mfa-fixture)/dev/admin-mfa-fixture/page.fixture.tsx']) {
    assert(!EMOJI.test(read(f)), `${f}: emoji in source`);
    assert(!/Admin studio<\/Link>|← Admin studio/.test(read(f)), `${f}: old back link`);
  }
  // negative control: the back-link check fires on the old layout's markup
  assert(/←\s*Admin studio/.test('<a href="/admin">← Admin studio</a>'), 'control');
  return `${Object.keys(HTML).length} states`;
});

test('U-07 AuthShell / AuthHeading unchanged for the other auth pages (no panel / no muted = AUTH-UX-1 markup)', () => {
  const plain = renderToStaticMarkup(React.createElement(AuthShell, { earlyAccess: true }, React.createElement('p', null, 'form')));
  assert(/aria-label="About Courage Library"/.test(plain) && /Learn smarter\. Prepare independently\./.test(plain) && (plain.match(/data-auth-feature=/g) || []).length === 3 && /data-auth-early-access/.test(plain), 'default panel');
  const custom = renderToStaticMarkup(React.createElement(AuthShell, { earlyAccess: true, panel: React.createElement('b', null, 'X'), panelLabel: 'Why' }, 'f'));
  assert(!/data-auth-feature|Learn smarter/.test(custom) && /aria-label="Why"/.test(custom) && /cl-auth__mark/.test(custom), 'panel override replaces content only');
  const h = renderToStaticMarkup(React.createElement(AuthHeading, { title: 'Sign in', sub: 's' }));
  assert(h === '<header class="flex flex-col gap-1.5" data-auth-heading=""><h1 class="font-heading text-[28px] font-semibold leading-tight text-cl-charcoal">Sign in</h1><p class="text-body text-cl-slate">s</p></header>', `heading markup changed: ${h}`);
  for (const f of ['app/(site)/auth/login/page.tsx', 'app/(site)/auth/signup/page.tsx', 'app/(site)/auth/forgot-password/page.tsx', 'app/(site)/auth/update-password/page.tsx', 'app/(site)/confirm-age/page.tsx']) assert(!/panel=|panelLabel=/.test(read(f)), `${f} passes a panel`);
  return 'default markup identical';
});

test('U-08 the fixture exists only in fixture builds', () => {
  const f = read('app/(mfa-fixture)/dev/admin-mfa-fixture/page.fixture.tsx');
  assert(/process\.env\.VERCEL_ENV === "production" \|\| process\.env\.EXAM_UX_FIXTURE !== "1"\) notFound\(\)/.test(f), 'fixture guard');
  assert(fs.existsSync(path.join(ROOT, 'app/(mfa-fixture)/layout.fixture.tsx')) && !fs.existsSync(path.join(ROOT, 'app/(mfa-fixture)/layout.tsx')) && !fs.existsSync(path.join(ROOT, 'app/(mfa-fixture)/dev/admin-mfa-fixture/page.tsx')), 'fixture-only extensions');
  assert(/"fixture\.tsx"/.test(read('next.config.ts')) && /EXAM_UX_FIXTURE === "1"/.test(read('next.config.ts')), 'pageExtensions gate');
  assert(/inert/.test(f) && !/supabase/i.test(f.replace(/\/\*[\s\S]*?\*\//, '')), 'fixture: inert sign-out, no Supabase');
  return '';
});

console.log(`\nADMIN-MFA-UX-1: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
