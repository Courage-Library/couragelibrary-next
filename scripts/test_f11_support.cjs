#!/usr/bin/env node
/**
 * F11 (#79) — support: help centre + grievance redressal (static part). Offline gate (TS transpile + static render):
 *   SP-01 help centre renders every topic; every link points to an existing route; no promise of unbuilt features
 *   SP-02 grievance: the approved Grievance Officer details + response times render from ONE source (content/support.ts)
 *         on /grievance and the /help footer; no placeholder left; the online ticket only while the form is on
 *   SP-03 footer + sitemap list /help and /grievance; English UI; 48 px links
 * Run: node scripts/test_f11_support.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1200)}`);
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
  '@/lib/seo/metadata': { constructMetadata: (m) => m },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return origLoad.call(this, request, parent, isMain);
};
const routeExists = (href) => {
  const p = href.split(/[?#]/)[0].replace(/^\//, '');
  return fs.existsSync(path.join(ROOT, 'app', p, 'page.tsx')) || fs.existsSync(path.join(ROOT, 'app', p, 'page.ts'));
};
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

(async () => {
  const S = require(path.join(ROOT, 'content/support.ts'));

  await test('SP-01 help centre: every topic rendered, every link real, nothing unbuilt promised', () => {
    const { default: HelpPage } = require(path.join(ROOT, 'app/help/page.tsx'));
    const html = renderToStaticMarkup(h(HelpPage));
    const t = text(html);
    for (const topic of S.HELP_PAGE.topics) {
      assert(t.includes(topic.title), `topic ${topic.title}`);
      for (const it of topic.items) {
        assert(t.includes(it.q.replace(/[“”]/g, (c) => c)), `question rendered: ${it.q}`);
        if (it.link) assert(routeExists(it.link.href), `dead help link ${it.link.href}`);
      }
    }
    const all = JSON.stringify(S.HELP_PAGE);
    assert(!/Memory Lock|coins|rank|percentile|24\/7|instant|guarantee|AI tutor|live chat|call us/i.test(all), 'help promises something not built');
    assert(/Paid plans are not available yet/.test(all), 'payments described as they are (off)');
    assert(html.includes(`mailto:${S.SUPPORT_EMAIL}`) && html.includes('href="/grievance"'), 'contact + grievance links');
    return `${S.HELP_PAGE.topics.length} topics`;
  });

  await test('SP-02 grievance: the approved officer details + timelines render from ONE source; no placeholder left', () => {
    const O = S.GRIEVANCE_OFFICER;
    const want = { name: 'Jan', designation: 'Founder & Grievance Officer', email: 'support@couragelibrary.in', phone: '+91 83606 03173', phoneHours: 'Mon–Sat, 10 AM–6 PM IST', postalAddress: 'Bus Stop Ramaipur, Kanpur Nagar, Uttar Pradesh 209214' };
    assert(JSON.stringify(O) === JSON.stringify(want), JSON.stringify(O));
    const TEL = `tel:${want.phone.replace(/[^+\d]/g, '')}`; // derived from the single source, never retyped
    assert(S.GRIEVANCE_PHONE_HREF === TEL && /^tel:\+91\d{10}$/.test(TEL), S.GRIEVANCE_PHONE_HREF);
    assert(/24 hours/.test(S.GRIEVANCE_TIMELINES.acknowledge) && /15 days/.test(S.GRIEVANCE_TIMELINES.resolve), 'timelines');
    const { default: GrievancePage } = require(path.join(ROOT, 'app/grievance/page.tsx'));
    for (const on of [false, true]) {
      if (on) process.env.SUPPORT_TICKETS_ENABLED = 'true'; else delete process.env.SUPPORT_TICKETS_ENABLED;
      const html = renderToStaticMarkup(h(GrievancePage));
      const t = text(html);
      for (const v of Object.values(want)) assert(t.includes(v.replace(/&/g, '&')) || html.includes(v.replace(/&/g, '&amp;')), `grievance page misses "${v}"`);
      assert(html.includes('href="mailto:support@couragelibrary.in?subject=Grievance"') && html.includes(`href="${TEL}"`), 'mailto + tel links');
      assert(t.includes('Acknowledgement within 24 hours.') && t.includes('Resolution within 15 days.'), 'timelines render');
      assert(on ? t.includes('Raise a ticket online (fastest). Email/phone also accepted.') && html.includes('href="/help/tickets/new"') : !html.includes('/help/tickets/new'), `ticket channel only when the ticket form is on (${on})`);
    }
    delete process.env.SUPPORT_TICKETS_ENABLED;
    // no placeholder anywhere (content, pages, gate-visible copy)
    for (const f of ['content/support.ts', 'app/grievance/page.tsx', 'app/help/page.tsx']) assert(!/will be published|Until then|OWNER: fill|officerPending|grievanceOfficerReady|placeholder|: null,/i.test(read(f)), `${f}: placeholder left`);
    // single source: the officer values are typed only in content/support.ts
    const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : /\.(tsx?)$/.test(e.name) ? [`${d}/${e.name}`] : []));
    const dup = ['app', 'components', 'content', 'lib'].flatMap(walk).filter((f) => f !== 'content/support.ts' && /83606 03173|Bus Stop Ramaipur|Founder & Grievance Officer/.test(read(f)));
    assert(dup.length === 0, `officer details duplicated in ${dup.join(', ')}`);
    // /help footer shows them from the same source
    const { default: HelpPage } = require(path.join(ROOT, 'app/help/page.tsx'));
    const help = renderToStaticMarkup(h(HelpPage));
    assert(/data-help-grievance-officer=""/.test(help) && /Founder &amp; Grievance Officer(?:<!-- -->)?: (?:<!-- -->)?Jan/.test(help) && help.includes(`href="${TEL}"`), 'help footer');
  });

  await test('SP-03 footer + sitemap; 48 px links; English UI', () => {
    const pp = read('content/public-pages.ts');
    assert(/\{ href: "\/help", label: "Help" \}/.test(pp) && /\{ href: "\/grievance", label: "Grievance redressal" \}/.test(pp), 'footer links');
    assert(/"\/help", "\/grievance"/.test(read('app/sitemap.ts')), 'sitemap');
    for (const f of ['app/help/page.tsx', 'app/grievance/page.tsx']) {
      const s = read(f);
      const links = (s.match(/<(?:Link|a)\b[^>]*className="[^"]*"/g) || []).filter((l) => !/mailto:\$\{SUPPORT_EMAIL\}\?subject/.test(l));
      assert(links.every((l) => /min-h-12|inline/.test(l) || /focus-ring/.test(l)), `${f}: link targets`);
      assert(!/[ऀ-ॿ]/.test(s), `${f}: English UI (R9)`);
    }
  });

  console.log(`\nF11 support: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
