#!/usr/bin/env node
/**
 * AUTH-UX-1 gate (owner spec docs/design/AUTH_UX_V1_SPEC.md + decisions 24 Nov 2026) — offline, no network, no DB. The
 * REAL auth components are rendered (the server actions are stubbed; nothing reaches Supabase).
 *   A-1 no age number on any auth screen: sign in / create account / forgot / reset / the brand panel / the consent box
 *       / every ?m= notice and form error they can show / the confirm page's copy — no "18", no "adults only", no
 *       "N or older / years old"
 *   A-2 sign-up cannot proceed without the consent: the box (field ageConfirmed, never pre-ticked, real links) comes
 *       first; an unticked box blocks the email submit; Google: unticked → our button over Google's inert one, and the
 *       callback BLOCKS (the action is never called); ticked → ageConfirmed === true. Server enforcement unchanged
 *       (the age-required check before signUp; the Google refusal — pinned by AGE-18 / AUTH-HARDEN-1)
 *   A-3 sign-in has no consent box and never sends the consent (googleCallbackDecision "login" → without)
 *   A-4 generic credential error: "Email or password is incorrect. Try again or reset your password." — form-level,
 *       never under the email field; no error text says an account exists / does not exist
 *   A-5 eye toggle a11y: a real <button type="button">, aria-label "Show password" / "Hide password", aria-pressed,
 *       aria-controls the input; autocomplete current-password / new-password; inputmode / autocomplete email
 *   A-6 Turnstile: interaction-only, no space reserved until Cloudflare shows the widget; the submit stays ENABLED; no
 *       token → "Finishing security check…" (aria-live) up to 8 s, then the "Quick security check" card; Retry →
 *       turnstile.reset; ?m=captcha-* → the card; server verification untouched (no siteverify in app code)
 *   A-7 claims: the brand panel shows exactly the three static true features (no current-affairs read, no daily-mock
 *       claim); "Free during early access." only while the paywall switch is KNOWN to be off (unknown → hidden)
 *   A-8 copy (spec §6) on the rendered pages; one <h1> per page; every field labelled; 48 px fields / buttons
 *   A-9 the fixture-only `preview` prop is passed nowhere outside *.fixture.tsx
 *   A-10 negative controls: each broken variant is caught
 * Run: node scripts/test_auth_ux1.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

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

let PARAMS = new URLSearchParams();
const actionStub = { __esModule: true, loginAction: async () => null, signupAction: async () => null, forgotPasswordAction: async () => null, updatePasswordAction: async () => null, logoutAction: async () => null };
const STUBS = {
  'next/link': { __esModule: true, default: ({ href, children, prefetch: _p, ...p }) => React.createElement('a', { href: String(href), ...p }, children) },
  'next/script': { __esModule: true, default: (p) => React.createElement('script', { src: p.src }) },
  'next/navigation': { useSearchParams: () => PARAMS, usePathname: () => '/auth/login', useRouter: () => ({}) },
  '@/app/(site)/auth/actions': actionStub,
  '@/app/(site)/auth/google-actions': { __esModule: true, signInWithGoogleAction: async () => null },
};
function loadTs(rel, overrides = {}) {
  const file = path.join(ROOT, rel);
  const js = ts.transpileModule(overrides[rel] ?? read(rel), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m.require = (id) => {
    if (Object.prototype.hasOwnProperty.call(STUBS, id)) return STUBS[id];
    let t = null;
    if (id.startsWith('@/')) t = id.slice(2);
    else if (id.startsWith('./') || id.startsWith('../')) t = path.relative(ROOT, path.resolve(path.dirname(file), id)).split(path.sep).join('/');
    if (t !== null) {
      const cand = [`${t}.ts`, `${t}.tsx`, `${t}/index.ts`].find((c) => fs.existsSync(path.join(ROOT, c)));
      if (!cand) throw new Error(`unresolved ${id}`);
      return loadTs(cand, overrides);
    }
    return require(id);
  };
  m._compile(js, file);
  return m.exports;
}
const h = React.createElement;
const textOf = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const P = {
  login: 'app/(site)/auth/login/login-form.tsx',
  signup: 'app/(site)/auth/signup/signup-form.tsx',
  forgot: 'app/(site)/auth/forgot-password/forgot-password-form.tsx',
  reset: 'app/(site)/auth/update-password/update-password-form.tsx',
  shell: 'components/auth/auth-shell.tsx',
  ui: 'components/auth/auth-ui.tsx',
  pw: 'components/auth/password-field.tsx',
  cb: 'components/auth/consent-checkbox.tsx',
  gb: 'components/auth/google-signin-button.tsx',
  tw: 'components/auth/turnstile-widget.tsx',
  gate: 'components/auth/use-captcha-gate.ts',
  msgs: 'lib/auth/messages.ts',
  confirm: 'app/(site)/confirm-age/page.tsx',
};
const GOOGLE = { clientId: 'x.apps.googleusercontent.com', nonceHash: 'a'.repeat(64) };
const CAPTCHA = { siteKey: '1x00000000000000000000AA' };
function render(key, props = {}, overrides = {}, params = {}) {
  PARAMS = new URLSearchParams(params);
  const mod = loadTs(P[key], overrides);
  const C = { login: mod.LoginForm, signup: mod.SignupForm, forgot: mod.ForgotPasswordForm, reset: mod.UpdatePasswordForm }[key];
  return renderToStaticMarkup(h(C, props));
}
const shell = (earlyAccess, overrides = {}) => renderToStaticMarkup(h(loadTs(P.shell, overrides).AuthShell, { earlyAccess }, h('p', null, 'x')));
const AGE = /\b18\b|\bage of\b|adults? only|\b\d{2}\s*\+|\bor older\b|\byears? old\b/i;

function allTexts(overrides = {}) {
  const out = [];
  const add = (n, html) => out.push([n, textOf(html)]);
  for (const m of ['', 'age-required', 'new-account', 'signed-out', 'captcha-failed', 'google-failed', 'check-email']) {
    add(`login ?m=${m}`, render('login', { google: GOOGLE, captcha: CAPTCHA, signupOpen: true }, overrides, m ? { m } : {}));
    add(`signup ?m=${m}`, render('signup', { google: GOOGLE, captcha: CAPTCHA }, overrides, m ? { m } : {}));
  }
  add('signup consent error', render('signup', { google: GOOGLE, captcha: CAPTCHA, preview: { consentError: true } }, overrides));
  add('forgot', render('forgot', { captcha: CAPTCHA }, overrides));
  add('reset', render('reset', {}, overrides));
  add('panel', shell(true, overrides));
  const msgs = loadTs(P.msgs, overrides);
  for (const [k, v] of Object.entries(msgs.AUTH_NOTICES)) out.push([`notice ${k}`, v.text]);
  for (const [k, v] of Object.entries(msgs.AUTH_ERRORS)) out.push([`error ${k}`, v]);
  // the confirm page's shown strings (comments stripped; one-line string literals only)
  const conf = (overrides[P.confirm] ?? read(P.confirm)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const m of conf.matchAll(/"([^"\n]{12,})"/g)) out.push(['confirm-age copy', m[1]]);
  out.push(['consent label', loadTs('lib/auth/age-gate.ts', overrides).AGE_CONFIRM_LABEL]);
  return out;
}

function checkNoAge(overrides = {}) {
  const t = allTexts(overrides);
  const bad = t.filter(([, s]) => AGE.test(s)).map(([n, s]) => `${n}: "${(s.match(AGE) || [])[0]}"`);
  assert(bad.length === 0, `an age number / adults-only text: ${bad.slice(0, 4).join(' | ')}`);
  return `${t.length} texts (5 pages × notices, every notice / error, panel, consent, confirm page)`;
}

function checkConsent(src = {}, overrides = {}) {
  const su = src.signup ?? read(P.signup);
  const html = render('signup', { google: GOOGLE, captcha: CAPTCHA }, { ...overrides, [P.signup]: su });
  // first element after the heading / notices: the consent, before Google and before the email form
  const iConsent = html.indexOf('data-consent=""');
  const iGoogle = html.indexOf('data-google-signin="signup"');
  const iForm = html.indexOf('data-auth-form="signup"');
  assert(iConsent > 0 && iGoogle > iConsent && iForm > iConsent, `consent not first (consent ${iConsent}, google ${iGoogle}, form ${iForm})`);
  const box = (html.match(/<input\b[^>]*name="ageConfirmed"[^>]*>/) || [''])[0];
  assert(/type="checkbox"/.test(box) && /form="signup-form"/.test(box) && !/\bchecked\b/.test(box), `consent: field ageConfirmed, part of the form, never pre-ticked: ${box}`);
  assert(/href="\/terms" target="_blank" rel="noopener noreferrer"/.test(html) && /href="\/privacy" target="_blank" rel="noopener noreferrer"/.test(html), 'consent links (new tab)');
  // unticked: Google's button is inert behind ours; the email submit is blocked
  assert(/data-google-slot=""[^>]*inert=""|inert=""[^>]*data-google-slot=""/.test(html) && /data-google-blocked=""/.test(html), 'unticked: Google is not blocked');
  assert(/if \(!isTicked\(\)\) \{\s*e\.preventDefault\(\);\s*blockConsent\(\);\s*return;\s*\}\s*gate\.guard\(e\);/.test(su), 'unticked: the email submit is not blocked before anything is sent');
  // the callback decision: Create account unticked → block (never calls the action)
  const g = loadTs('lib/auth/google-signin.ts', overrides);
  const d = g.googleCallbackDecision;
  assert(d('signup', false) === 'block' && d('signup', undefined) === 'block' && d('signup', true) === 'call-with-consent', 'Create account: the callback decision');
  const gb = src.gb ?? read(P.gb);
  const cb = gb.slice(gb.indexOf('callback: (response) =>'), gb.indexOf('gsi.renderButton('));
  assert(cb.indexOf('if (decision === "block")') > 0 && cb.indexOf('if (decision === "block")') < cb.indexOf('signInWithGoogleAction(') && /const ageConfirmed = decision === "call-with-consent";/.test(cb), 'the callback calls the action before / without the block');
  assert(/<GoogleSignInButton[\s\S]*?surface="signup"[\s\S]*?consent=\{\{ ticked, isTicked, onBlocked: blockConsent \}\}/.test(su), 'Create account does not pass the consent to Google');
  return 'first · field ageConfirmed · never pre-ticked · email blocked · Google inert + callback blocks';
}

function checkSignIn(src = {}, overrides = {}) {
  const lf = src.login ?? read(P.login);
  const html = render('login', { google: GOOGLE, captcha: CAPTCHA, signupOpen: true }, { ...overrides, [P.login]: lf }, { m: 'age-required' });
  assert(!/data-consent|name="ageConfirmed"|name="googleAgeConfirmed"|type="checkbox"/.test(html), 'sign-in shows a consent box');
  assert(/surface="login"/.test(lf) && !/consent=\{/.test(lf), 'sign-in passes a consent to Google');
  assert(loadTs('lib/auth/google-signin.ts', overrides).googleCallbackDecision('login', true) === 'call-without-consent', 'sign-in sends the consent');
  return 'no box · never sends the consent';
}

function checkCredentialError(overrides = {}) {
  const msgs = loadTs(P.msgs, overrides);
  const want = 'Email or password is incorrect. Try again or reset your password.';
  assert(msgs.AUTH_ERRORS['invalid-credentials'] === want, `credential text: ${msgs.AUTH_ERRORS['invalid-credentials']}`);
  const html = render('login', { google: null, captcha: null, signupOpen: true, preview: { state: { error: want, code: 'invalid-credentials' } } }, overrides);
  const field = html.slice(html.indexOf('data-auth-field="email"'), html.indexOf('data-auth-field="password"'));
  assert(/role="alert"[^>]*data-auth-error="invalid-credentials"|data-auth-error="invalid-credentials"[^>]*role="alert"|id="login-error" role="alert"/.test(html) && html.includes(want.replace(/'/g, '&#x27;')) && !field.includes('incorrect'), 'credential error not form-level');
  const all = [...Object.values(msgs.AUTH_ERRORS), ...Object.values(msgs.AUTH_NOTICES).map((n) => n.text)];
  assert(!all.some((t) => /no account|not registered|already (registered|exists)|does not exist|user not found|unknown email/i.test(t)), 'a text reveals whether an account exists');
  return 'exact text · form-level · nothing reveals an account';
}

function checkEye(overrides = {}) {
  const { PasswordField } = loadTs(P.pw, overrides);
  const html = renderToStaticMarkup(h(PasswordField, { id: 'pw-x', name: 'password', label: 'Password', autoComplete: 'current-password' }));
  assert(/<button type="button"[^>]*aria-label="Show password"[^>]*aria-pressed="false"[^>]*aria-controls="pw-x"/.test(html), 'eye toggle: type / aria-label / aria-pressed / aria-controls');
  const pwInput = (html.match(/<input\b[^>]*id="pw-x"[^>]*>/) || [''])[0];
  assert(/type="password"/.test(pwInput) && /autocomplete="current-password"/i.test(pwInput) && /name="password"/.test(pwInput), `password input / autocomplete: ${pwInput}`);
  const src = overrides[P.pw] ?? read(P.pw);
  assert(/aria-label=\{visible \? "Hide password" : "Show password"\}/.test(src) && /aria-pressed=\{visible\}/.test(src), 'the toggle label / pressed state do not follow visibility');
  const login = render('login', { google: null, captcha: null, signupOpen: true }, overrides);
  const email = (login.match(/<input\b[^>]*name="email"[^>]*>/) || [''])[0];
  assert(/type="email"/.test(email) && /inputmode="email"/i.test(email) && /autocomplete="email"/i.test(email), `email: type / inputmode / autocomplete: ${email}`);
  return 'button · Show / Hide · aria-pressed · aria-controls · autocomplete';
}

function checkTurnstile(src = {}) {
  const tw = src.tw ?? read(P.tw);
  const gate = src.gate ?? read(P.gate);
  assert(/appearance: "interaction-only"/.test(tw) && /"before-interactive-callback": \(\) => setInteractive\(true\)/.test(tw) && /className=\{interactive \? "flex min-h-\[65px\] w-full justify-center" : "flex w-full justify-center"\}/.test(tw), 'widget: interaction-only, space only while shown');
  assert(/export const CAPTCHA_WAIT_MS = 8000;/.test(gate) && /setPhase\("waiting"\)/.test(gate) && /setPhase\("failed"\)/.test(gate) && /resetRef\.current\?\.\(\)/.test(gate), 'the wait (8 s) → card path / Retry → reset');
  assert(/if \(\(s === "error" \|\| s === "expired"\) && waitingForm\.current\)/.test(gate), 'an error / expiry while waiting does not show the card');
  for (const k of ['login', 'signup', 'forgot']) {
    const f = src[k] ?? read(P[k]);
    assert(/<SecurityCheckCard onRetry=\{gate\.retry\} \/>/.test(f) && /\{phase === "waiting" && <SecurityWaiting \/>\}/.test(f) && /resetRef=\{gate\.resetRef\}/.test(f), `${k}: no waiting text / card / Retry`);
    assert(!/<button type="submit"[^>]*disabled/.test(f), `${k}: the submit is disabled (owner decision 4: it stays enabled)`);
  }
  const ui = read(P.ui);
  assert(/Quick security check/.test(ui) && /Cloudflare needs one more check\. It usually finishes by itself\./.test(ui) && /Try turning off VPN or ad-blocker\./.test(ui) && /data-security-retry/.test(ui) && /aria-live="polite"[^>]*>\s*Finishing security check…|Finishing security check…/.test(ui), 'card / waiting copy');
  const app = ['app', 'components', 'lib'].flatMap((d) => walk(d)).filter((f) => /\.(ts|tsx)$/.test(f)).map(read).join('\n');
  assert(!/siteverify|TURNSTILE_SECRET/.test(app), 'Turnstile verification moved into app code');
  return 'interaction-only · 8 s wait · card + Retry · submit enabled · server verification untouched';
}
const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));

function checkClaims(overrides = {}) {
  const on = textOf(shell(true, overrides));
  const off = textOf(shell(false, overrides));
  for (const f of ['Timed mock tests with full analysis', 'Practice by topic', 'Mistake Vault for smart revision']) assert(on.includes(f), `feature missing: ${f}`);
  assert(!/daily|current affairs|today'?s mock/i.test(on), 'an unverified claim (daily mock / current affairs) in the brand panel');
  assert(on.includes('Free during early access.') && !off.includes('Free during early access.'), 'the early-access note is not tied to the paywall switch');
  for (const p of ['app/(site)/auth/login/page.tsx', 'app/(site)/auth/signup/page.tsx', 'app/(site)/auth/forgot-password/page.tsx', 'app/(site)/auth/update-password/page.tsx', P.confirm]) {
    const s = overrides[p] ?? read(p);
    assert(/earlyAccess=\{(paywall|earlyAccess) === "off"\}|earlyAccess=\{earlyAccess\}/.test(s) && /paywallSwitchForDisplay\(\)/.test(s), `${p}: early access not from the known switch`);
    assert(!/current_affairs|loadLandingData|currentAffairs/.test(s), `${p}: a current-affairs read on an auth page`);
  }
  const pol = read('lib/access/policy.ts');
  assert(/export function paywallSwitchForDisplay\(ms = 800\): Promise<"on" \| "off" \| "unknown">/.test(pol) && /\(\) => "unknown" as const/.test(pol) && /resolve\("unknown"\)/.test(pol), 'an unknown switch is not "unknown"');
  return '3 static features · no CA / daily-mock claim · early access only when the switch is off';
}

function checkCopy(overrides = {}) {
  const login = textOf(render('login', { google: GOOGLE, captcha: CAPTCHA, signupOpen: true }, overrides));
  const signup = textOf(render('signup', { google: GOOGLE, captcha: CAPTCHA }, overrides));
  for (const s of ['Welcome back', 'Sign in to continue your preparation.', 'or sign in with email', 'Email', 'Password', 'Forgot password?', 'Sign in', 'Protected by Cloudflare', 'New here?', 'Create a free account']) assert(login.includes(s), `sign-in copy missing: ${s}`);
  for (const s of ['Create your free account', 'Takes less than a minute.', "I agree to the Terms and Privacy Policy , and confirm I'm eligible to create an account.", 'or with email', 'Full name', 'At least 8 characters, with a letter and a number', 'Create account', 'Already have an account?']) assert(signup.replace(/Policy ,/, 'Policy ,').includes(s) || signup.includes(s.replace(' ,', ',')), `sign-up copy missing: ${s}`);
  const msgs = loadTs(P.msgs, overrides);
  assert(msgs.AUTH_NOTICES['signed-out'].text === "You've been signed out." && msgs.AUTH_NOTICES['new-account'].text === "Looks like you're new here. Accept the Terms and Privacy Policy to create your account." && msgs.AUTH_ERRORS['age-required'] === 'Please accept the Terms and Privacy Policy to continue.', 'notice / error copy');
  for (const [n, html] of [['login', render('login', { google: GOOGLE, captcha: CAPTCHA, signupOpen: true }, overrides)], ['signup', render('signup', { google: GOOGLE, captcha: CAPTCHA }, overrides)], ['forgot', render('forgot', { captcha: CAPTCHA }, overrides)], ['reset', render('reset', {}, overrides)]]) {
    assert((html.match(/<h1\b/g) || []).length === 1, `${n}: not exactly one <h1>`);
    for (const m of html.matchAll(/<input\b[^>]*>/g)) {
      const id = (m[0].match(/\bid="([^"]+)"/) || [])[1];
      if (/type="hidden"/.test(m[0])) continue;
      assert(id && new RegExp(`<label[^>]*for="${id}"`).test(html), `${n}: an unlabelled field ${m[0].slice(0, 80)}`);
    }
  }
  return 'spec §6 copy · one h1 each · every field labelled';
}

function checkPreview() {
  const files = walk('app').concat(walk('components')).filter((f) => /\.tsx$/.test(f) && !/\.fixture\.tsx$/.test(f));
  const bad = files.filter((f) => /<(LoginForm|SignupForm|ForgotPasswordForm|UpdatePasswordForm)\b[^>]*\bpreview=\{/.test(read(f)));
  assert(bad.length === 0, `an auth form gets a preview state outside a fixture: ${bad.join(', ')}`);
  assert(/preview=\{\{ state:/.test(read('app/(site)/dev/auth-fixture/page.fixture.tsx')), 'the fixture no longer uses preview (the check would be vacuous)');
  return `${files.length} files · auth-form preview only in *.fixture.tsx`;
}

test('A-1 no age number on any auth screen (pages, notices, errors, panel, consent, confirm page)', () => checkNoAge());
test('A-2 sign-up cannot proceed (email or Google) without the consent', () => checkConsent());
test('A-3 sign-in: no consent box, never sends the consent', () => checkSignIn());
test('A-4 generic credential error, form-level; nothing reveals an account', () => checkCredentialError());
test('A-5 eye toggle a11y + autocomplete', () => checkEye());
test('A-6 Turnstile: interaction-only, 8 s wait, card + Retry, submit enabled', () => checkTurnstile());
test('A-7 brand-panel claims: static true features; early access only when the switch is off', () => checkClaims());
test('A-8 copy, one h1, labelled fields', () => checkCopy());
test('A-9 the fixture-only preview prop is used only in fixtures', () => checkPreview());

test('A-10 negative controls: each broken variant is caught', () => {
  const mut = (s, a, b) => {
    if (!s.includes(a)) throw new Error(`mutation anchor missing: ${a.slice(0, 80)}`);
    return s.split(a).join(b);
  };
  const S = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, read(v)]));
  const muts = [
    ['an age number in the consent', () => checkNoAge({ 'lib/auth/age-gate.ts': mut(read('lib/auth/age-gate.ts'), "and confirm I'm eligible to create an account.", 'and confirm I am 18 or older.') })],
    ['the old age-required text', () => checkNoAge({ [P.msgs]: mut(S.msgs, '"age-required": "Please accept the Terms and Privacy Policy to continue.",\n  generic', '"age-required": "Please confirm that you are 18 or older. Courage Library is for adults only.",\n  generic') })],
    ['"adults only" on the confirm page', () => checkNoAge({ [P.confirm]: mut(S.confirm, 'sub="Please accept the Terms and Privacy Policy once to continue."', 'sub="Courage Library is for adults only. Please confirm once."') })],
    ['the email submit not blocked without the consent', () => checkConsent({ signup: mut(S.signup, '    if (!isTicked()) {\n      e.preventDefault();\n      blockConsent();\n      return;\n    }\n', '') })],
    ['the callback calls the action without the consent', () => checkConsent({ gb: mut(S.gb, '        if (decision === "block") {\n          consent?.onBlocked();\n          return;\n        }\n', '') })],
    ['Google not inert while unticked', () => checkConsent({}, { [P.gb]: mut(S.gb, 'inert={blocked || undefined}', '') })],
    ['the consent pre-ticked', () => checkConsent({}, { [P.cb]: mut(S.cb, '            type="checkbox"\n', '            type="checkbox"\n            defaultChecked\n') })],
    ['the consent after the Google button', () => checkConsent({ signup: S.signup.replace(/      <ConsentCheckbox[\s\S]*?form="signup-form"\n      \/>\n/, '').replace('<AuthDivider label="or with email" />', '<AuthDivider label="or with email" />\n          <ConsentCheckbox ref={consentRef} id="signup-consent" form="signup-form" />') })],
    ['a consent box on sign-in', () => checkSignIn({ login: mut(S.login, '<AuthDivider label="or sign in with email" />', '<AuthDivider label="or sign in with email" />\n          <input type="checkbox" name="ageConfirmed" />') })],
    ['sign-in sends the consent', () => checkSignIn({}, { 'lib/auth/google-signin.ts': mut(read('lib/auth/google-signin.ts'), 'if (surface !== "signup") return "call-without-consent";', 'if (surface !== "signup") return consentTicked === true ? "call-with-consent" : "call-without-consent";') })],
    ['a credential error that names the account', () => checkCredentialError({ [P.msgs]: mut(S.msgs, '"invalid-credentials": "Email or password is incorrect. Try again or reset your password."', '"invalid-credentials": "No account exists for this email."') })],
    ['the eye toggle without aria-pressed', () => checkEye({ [P.pw]: mut(S.pw, '          aria-pressed={visible}\n', '') })],
    ['the eye toggle as a div', () => checkEye({ [P.pw]: mut(S.pw, '<button\n          type="button"\n          onClick={() => setVisible((v) => !v)}', '<button\n          onClick={() => setVisible((v) => !v)}') })],
    ['Turnstile always visible', () => checkTurnstile({ tw: mut(S.tw, '      appearance: "interaction-only",\n', '') })],
    ['the submit disabled until a token', () => checkTurnstile({ login: mut(S.login, '<button type="submit" className={PRIMARY_BUTTON_CLASS}', '<button type="submit" disabled={!gate.getToken()} className={PRIMARY_BUTTON_CLASS}') })],
    ['no Retry', () => checkTurnstile({ forgot: mut(S.forgot, '<SecurityCheckCard onRetry={gate.retry} />', '<SecurityCheckCard onRetry={() => undefined} />') })],
    ['a daily-mock claim in the panel', () => checkClaims({ [P.shell]: mut(S.shell, '{ icon: "practice", text: "Practice by topic" }', '{ icon: "practice", text: "Daily free mock" }') })],
    ['early access while the switch is unknown', () => checkClaims({ 'app/(site)/auth/login/page.tsx': mut(read('app/(site)/auth/login/page.tsx'), 'earlyAccess={paywall === "off"}', 'earlyAccess={paywall !== "on"}') })],
    ['two h1 on sign-in', () => checkCopy({ [P.login]: mut(S.login, '<AuthHeading title="Welcome back"', '<h1>x</h1>\n      <AuthHeading title="Welcome back"') })],
    ['the wrong password hint', () => checkCopy({ [P.pw]: mut(S.pw, 'export const PASSWORD_HINT = "At least 8 characters, with a letter and a number";', 'export const PASSWORD_HINT = "At least 8 characters";') })],
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

console.log('AUTH-UX-1 (offline)');
console.log(results.join('\n'));
console.log(`\nAUTH-UX-1: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
