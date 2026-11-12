#!/usr/bin/env node
/**
 * LEGAL-PAGES-1 — offline gate. The five public legal pages render the owner-approved docs/legal/LEGAL_PAGES_v1.md
 * VERBATIM; every required link and consent line is in place. Pages are rendered to HTML in Node (no server, no DB).
 *   LP-01 content/legal/legal-pages.ts is the generator's output for the current .md (no hand edit, no drift)
 *   LP-02 each route (/terms /privacy /refund-policy /shipping-policy /contact) renders: one h1 = the page title, the
 *         "Last updated" line from LEGAL_LAST_UPDATED, metadata title / description / canonical
 *   LP-03 verbatim: every paragraph, list item and table cell of the .md appears in the rendered text (whitespace only
 *         normalised); negative control: one changed word in the rendered text fails the same check
 *   LP-04 Coins: flag OFF → no "1.5 Coins" heading and no "Coins are loyalty points"; ON → both present; 1.6+ keep
 *         their numbers either way
 *   LP-05 /grievance → 308 to /contact#grievance-officer (next.config, permanent); the old page is gone; 5.1 has the id
 *   LP-06 footer legal row = the five links; consent lines (exact words + links) on sign-in, sign-up, pricing and
 *         checkout, each BEFORE its button
 *   LP-07 sitemap lists the five; robots does not block them; canonical = https://couragelibrary.in/<route>
 *   LP-08 no "[", "]" or "{{" left in any rendered page; the LEGAL_LAST_UPDATED placeholder is reported as a RELEASE
 *         REMINDER (not a failure)
 *   LP-09 links: the Google policy link is external (rel noopener noreferrer, new tab); support email → mailto; phone →
 *         tel; cross-links to the other policies; a page never links to itself
 *   LP-10 Account settings has the interim "Delete account" mailto entry (no DB); no new dependency; no analytics
 * Run: node scripts/test_legal_pages1.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
const notes = [];
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 900)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const ts = require('typescript');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
const transpile = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } });
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = transpile;
require.extensions['.tsx'] = transpile;
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;
const MOCKS = {
  'next/link': { __esModule: true, default: ({ href, children, prefetch: _p, ...rest }) => h('a', { href, ...rest }, children) },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return origLoad.call(this, request, parent, isMain);
};

const { parseLegalMarkdown, pageTexts } = require('./lib/legal-md.cjs');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'");
const norm = (s) => s.replace(/\s+/g, ' ').trim();
// visible text: no <script> (JSON-LD) and no screen-reader-only suffix; inline tags → nothing; block tags → a space
const textOf = (html) => norm(decode(html.replace(/<script\b[\s\S]*?<\/script>/g, ' ').replace(/<span class="sr-only">[\s\S]*?<\/span>/g, '').replace(/<!-- -->/g, '').replace(/<(\/)?(p|li|td|th|h[1-6]|div|section|nav|ol|ul|table|tr|thead|tbody|header|footer)\b[^>]*>/g, ' ').replace(/<[^>]+>/g, '')));

const ROUTES = [
  ['/terms', 'app/(site)/terms/page.tsx', '1'],
  ['/privacy', 'app/(site)/privacy/page.tsx', '2'],
  ['/refund-policy', 'app/(site)/refund-policy/page.tsx', '3'],
  ['/shipping-policy', 'app/(site)/shipping-policy/page.tsx', '4'],
  ['/contact', 'app/(site)/contact/page.tsx', '5'],
];
const MD = read('docs/legal/LEGAL_PAGES_v1.md');
const PAGES = parseLegalMarkdown(MD);
const pageByNum = (n) => PAGES.find((p) => p.number === n);

function render(file, coins) {
  if (coins) process.env.COINS_LESSON_EARN = 'true';
  else delete process.env.COINS_LESSON_EARN;
  const mod = require(path.join(ROOT, file));
  const html = renderToStaticMarkup(h(mod.default));
  delete process.env.COINS_LESSON_EARN;
  return { html, text: textOf(html), metadata: mod.metadata };
}

/** every text unit of the .md page must appear in the rendered text; returns the missing ones */
const missing = (page, text, coins) => pageTexts(page, { coins }).map(norm).filter((u) => !text.includes(u));

(async () => {
  const L = require(path.join(ROOT, 'content/legal/index.ts'));
  const { siteConfig } = require(path.join(ROOT, 'config/site.ts'));

  await test('LP-01 the generated content matches the approved .md (no hand edit, no drift)', () => {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/content/legal-pages-1-gen.cjs'), '--check'], { cwd: ROOT, stdio: 'pipe' });
    assert(PAGES.length === 5 && PAGES.map((p) => p.number).join() === '1,2,3,4,5', 'five pages');
    return `sha256 ${require(path.join(ROOT, 'content/legal/legal-pages.ts')).LEGAL_SOURCE_SHA256.slice(0, 12)}…`;
  });

  await test('LP-02 each route renders one h1 (the page title) + "Last updated"; metadata title / description / canonical', () => {
    for (const [route, file, num] of ROUTES) {
      const { html, text, metadata } = render(file, false);
      const h1s = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g) || [];
      assert(h1s.length === 1 && textOf(h1s[0]) === pageByNum(num).title, `${route}: h1 ${JSON.stringify(h1s.map(textOf))}`);
      assert(text.includes(`Last updated: ${L.LEGAL_LAST_UPDATED}`) && /data-legal-last-updated/.test(html), `${route}: Last updated`);
      const def = L.legalPageDef(route);
      assert(metadata && metadata.title && String(JSON.stringify(metadata.title)).includes(def.meta.title) && metadata.description === def.meta.description, `${route}: metadata ${JSON.stringify(metadata && metadata.title)}`);
      assert(metadata.alternates && metadata.alternates.canonical === `${siteConfig.url}${route}`, `${route}: canonical ${JSON.stringify(metadata.alternates)}`);
    }
    return `${ROUTES.length} routes`;
  });

  await test('LP-03 verbatim: every paragraph / list item / table cell of the .md is rendered (+ drift negative control)', () => {
    let units = 0;
    for (const [route, file, num] of ROUTES) {
      for (const coins of [false, true]) {
        const { text } = render(file, coins);
        const miss = missing(pageByNum(num), text, coins);
        assert(miss.length === 0, `${route} (coins ${coins}) misses ${miss.length}: ${miss.slice(0, 3).map((m) => JSON.stringify(m.slice(0, 90))).join(' | ')}`);
        units += pageTexts(pageByNum(num), { coins }).length;
      }
    }
    // negative control: one changed word must fail the same check
    const { text } = render('app/(site)/refund-policy/page.tsx', false);
    const drifted = text.replace('within 5–7 working days of approval', 'within 5–10 working days of approval');
    assert(drifted !== text && missing(pageByNum('3'), drifted, false).length === 1, 'a one-word drift is caught');
    return `${units} text units checked`;
  });

  await test('LP-04 Coins: flag OFF → 1.5 absent; ON → present; 1.6+ keep their numbers', () => {
    const off = render('app/(site)/terms/page.tsx', false);
    const on = render('app/(site)/terms/page.tsx', true);
    assert(!off.text.includes('1.5 Coins') && !off.text.includes('Coins are loyalty points') && !/id="coins-and-rewards"/.test(off.html), 'flag off: Coins absent');
    assert(on.text.includes('1.5 Coins and rewards') && on.text.includes('Coins are loyalty points') && /id="coins-and-rewards"/.test(on.html), 'flag on: Coins present');
    for (const r of [off, on]) assert(r.text.includes('1.6 Fair use and exam integrity') && r.text.includes('1.12 Law, disputes and contact'), 'numbering unchanged');
    // the TOC follows the flag too
    assert(!/href="#coins-and-rewards"/.test(off.html) && /href="#coins-and-rewards"/.test(on.html), 'TOC follows the flag');
    assert(/isLessonCoinsEarnEnabled\(\)/.test(read('app/(site)/terms/page.tsx')), 'the existing lesson-coins flag, read server-side');
  });

  await test('LP-05 /grievance → 308 /contact#grievance-officer; old page gone; 5.1 anchor', () => {
    assert(/\{ source: "\/grievance", destination: "\/contact#grievance-officer", permanent: true \}/.test(read('next.config.ts')), 'next.config permanent redirect (308)');
    assert(!fs.existsSync(path.join(ROOT, 'app/(site)/grievance/page.tsx')), 'old /grievance page removed');
    const { html } = render('app/(site)/contact/page.tsx', false);
    assert(/<h2 id="grievance-officer"[^>]*>5\.1(?:<!-- -->)? (?:<!-- -->)?Grievance Officer<\/h2>/.test(html), '5.1 anchor');
    assert(L.GRIEVANCE_ANCHOR_HREF === '/contact#grievance-officer' && /href=\{GRIEVANCE_ANCHOR_HREF\}/.test(read('app/(site)/help/page.tsx')), 'Help links to the anchor');
  });

  await test('LP-06 footer has the five legal links; consent lines (exact words + links) BEFORE the buttons', () => {
    const { FOOTER_LEGAL } = require(path.join(ROOT, 'components/shell/nav-config.ts'));
    const want = [['/terms', 'Terms'], ['/privacy', 'Privacy'], ['/refund-policy', 'Refund Policy'], ['/shipping-policy', 'Shipping Policy'], ['/contact', 'Contact & Grievance']];
    assert(JSON.stringify(FOOTER_LEGAL.map((i) => [i.href, i.label])) === JSON.stringify(want), JSON.stringify(FOOTER_LEGAL));
    assert(/FOOTER_LEGAL\.map/.test(read('components/shell/site-footer.tsx')), 'the footer renders FOOTER_LEGAL on every page (home included)');
    const C = require(path.join(ROOT, 'components/legal/consent-lines.tsx'));
    const auth = renderToStaticMarkup(h(C.AuthConsentLine));
    const pay = renderToStaticMarkup(h(C.PaymentConsentLine));
    assert(textOf(auth) === C.AUTH_CONSENT_TEXT && C.AUTH_CONSENT_TEXT === 'By continuing you confirm you are 18 or older and agree to our Terms and Privacy Policy.', `auth line: ${textOf(auth)}`);
    assert(/href="\/terms"[^>]*>Terms</.test(auth) && /href="\/privacy"[^>]*>Privacy Policy</.test(auth), 'auth links');
    assert(textOf(pay) === C.PAYMENT_CONSENT_TEXT && C.PAYMENT_CONSENT_TEXT === 'By paying you agree to the Terms, Privacy Policy and Refund Policy.', `pay line: ${textOf(pay)}`);
    assert(/href="\/terms"/.test(pay) && /href="\/privacy"/.test(pay) && /href="\/refund-policy"/.test(pay), 'pay links');
    const before = (file, line, button) => {
      const s = read(file);
      const a = s.indexOf(line);
      const b = s.indexOf(button, a);
      assert(a !== -1 && b !== -1 && a < b, `${file}: ${line} must come before ${button}`);
    };
    before('app/(site)/auth/login/login-form.tsx', '<AuthConsentLine />', '<GoogleSignInButton');
    before('app/(site)/auth/login/login-form.tsx', '<AuthConsentLine />', 'type="submit"');
    before('app/(site)/auth/signup/signup-form.tsx', '<AuthConsentLine />', 'type="submit"');
    before('app/(site)/pricing/pricing-client.tsx', '<PaymentConsentLine hrefs={legal}>', '{action}');
    before('app/(site)/checkout/[orderId]/checkout-client.tsx', '<PaymentConsentLine', '<Button');
    assert(/REFUND_POLICY_PATH = "\/refund-policy"/.test(read('config/payments.ts')), 'pricing refund link = the new page');
  });

  await test('LP-07 sitemap lists the five; robots does not block them; canonical on the apex', () => {
    const sm = read('app/sitemap.ts');
    for (const [route] of ROUTES) assert(new RegExp(`"${route.replace('/', '\\/')}"`).test(sm.match(/\.\.\.\[("\/[^\]]+)\]\.map\(\(p\) => \(\{/)?.[1] || ''), `sitemap misses ${route}`);
    assert(!/"\/grievance"/.test(sm), 'the redirect is not listed');
    const robots = read('app/robots.ts');
    const prodDisallow = (robots.match(/disallow: \[([^\]]*)\]/) || [, ''])[1];
    for (const [route] of ROUTES) assert(!prodDisallow.split(',').some((d) => route.startsWith(d.trim().replace(/"/g, '')) && d.trim() !== ''), `robots blocks ${route}`);
    assert(siteConfig.url === 'https://couragelibrary.in', `apex: ${siteConfig.url}`);
    for (const route of ['/refund-policy', '/shipping-policy']) assert(read('lib/auth/age-gate.ts').includes(`"${route}"`), `age gate exempts ${route}`);
  });

  await test('LP-08 no "[", "]" or "{{" left in any rendered page; LEGAL_LAST_UPDATED placeholder reported', () => {
    for (const [route, file] of ROUTES)
      for (const coins of [false, true]) {
        const { text } = render(file, coins);
        assert(!/[[\]]|\{\{|\}\}/.test(text), `${route}: placeholder bracket left: ${(text.match(/.{0,30}(?:[[\]]|\{\{|\}\}).{0,30}/) || [''])[0]}`);
      }
    if (L.LEGAL_LAST_UPDATED === L.LEGAL_LAST_UPDATED_PLACEHOLDER) notes.push(`RELEASE REMINDER: LEGAL_LAST_UPDATED is still the placeholder "${L.LEGAL_LAST_UPDATED}" (content/legal/index.ts) — the owner sets the real date before the release`);
  });

  await test('LP-09 links: external Google policy (noopener noreferrer); mailto; tel; cross-links; never a self-link', () => {
    const priv = render('app/(site)/privacy/page.tsx', false).html;
    const g = (priv.match(/<a [^>]*href="https:\/\/developers\.google\.com\/terms\/api-services-user-data-policy"[^>]*>Google API Services User Data Policy/) || [''])[0];
    assert(g && /target="_blank"/.test(g) && /rel="noopener noreferrer"/.test(g), `external Google link: ${g}`);
    const TEL = require(path.join(ROOT, 'content/support.ts')).GRIEVANCE_PHONE_HREF; // the single source, never retyped
    assert(priv.includes('href="mailto:support@couragelibrary.in"') && priv.includes(`href="${TEL}"`), `mailto + tel (${TEL})`);
    assert(/Founder &amp; Grievance Officer/.test(priv) && !/Founder &amp; <a /.test(priv) && /href="\/contact#grievance-officer"[^>]*>Grievance Officer/.test(priv), 'the job title is not a link; the contact point is');
    const terms = render('app/(site)/terms/page.tsx', false).html;
    assert(/href="\/privacy"[^>]*>Privacy Policy/.test(terms) && /href="\/refund-policy"[^>]*>Refund &amp; Cancellation Policy/.test(terms) && /href="\/contact#grievance-officer"[^>]*>Contact Us &amp; Grievance/.test(terms), 'terms cross-links');
    assert(!/href="\/terms"/.test(terms.replace(/<nav aria-label="Breadcrumb"[\s\S]*?<\/nav>/, '')), 'terms never links to itself');
    const refund = render('app/(site)/refund-policy/page.tsx', false).html;
    assert(/href="\/terms"[^>]*>Terms of Service/.test(refund) && !/href="\/refund-policy"/.test(refund), 'refund: cross-link, no self-link');
    const contact = render('app/(site)/contact/page.tsx', false).html;
    assert(/href="\/help"[^>]*>Help</.test(contact) && !/href="\/contact#grievance-officer"/.test(contact), 'contact: Help link, no self-link');
    // every external link opens safely
    for (const [, file] of ROUTES) {
      const { html } = render(file, true);
      for (const a of html.match(/<a [^>]*href="https?:[^"]*"[^>]*>/g) || []) assert(/rel="noopener noreferrer"/.test(a), `unsafe external link: ${a}`);
    }
  });

  await test('LP-10 interim Delete account mailto in Account settings (no DB); no new dependency; no analytics', () => {
    const s = read('app/(site)/settings/profile/page.tsx');
    assert(s.includes('"mailto:support@couragelibrary.in?subject=Account%20deletion%20request"') && /data-delete-account/.test(s) && />\s*Delete account\s*</.test(s), 'Delete account entry');
    const diff = execFileSync('git', ['diff', 'HEAD', '--', 'package.json'], { cwd: ROOT, encoding: 'utf8' });
    assert(!/^\+\s*"[^"]+": "/m.test(diff), 'no dependency added');
    const pkg = read('package.json');
    assert(!/@vercel\/analytics|@vercel\/speed-insights|react-ga|posthog|mixpanel|gtag/.test(pkg), 'no analytics package');
    assert(fs.existsSync(path.join(ROOT, 'docs/legal/ACCOUNT_DELETION_DESIGN_1.md')), 'deletion design doc');
  });

  for (const n of notes) console.log(`  NOTE  ${n}`);
  console.log(`\nLEGAL-PAGES-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
