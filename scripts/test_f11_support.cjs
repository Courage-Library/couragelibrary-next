#!/usr/bin/env node
/**
 * F11 (#79) — support: help centre + grievance redressal (static part). Offline gate (TS transpile + static render):
 *   SP-01 help centre renders every topic; every link points to an existing route; no promise of unbuilt features
 *   SP-02 grievance page: no invented person — the officer block appears only when ALL owner fields are set, otherwise
 *         "details will be published" + the real support email; response times only after the owner confirms them
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

  await test('SP-02 grievance: no invented person; officer only when all owner fields are set; timelines only when confirmed', () => {
    assert(Object.values(S.GRIEVANCE_OFFICER).every((v) => v === null) && S.GRIEVANCE_TIMELINES.confirmed === false, 'shipped with owner placeholders (null) and unconfirmed timelines');
    const { default: GrievancePage } = require(path.join(ROOT, 'app/grievance/page.tsx'));
    const pending = renderToStaticMarkup(h(GrievancePage));
    assert(/data-grievance-pending=""/.test(pending) && !/data-grievance-officer/.test(pending) && !/data-grievance-timelines/.test(pending), 'pending state');
    assert(text(pending).includes('details will be published') && pending.includes(`mailto:${S.SUPPORT_EMAIL}?subject=Grievance`), 'interim channel = real support email');
    assert(S.grievanceOfficerReady({ name: 'A', designation: 'B', email: 'c@d.e', postalAddress: null }) === false, 'all four fields needed');
    assert(S.grievanceOfficerReady({ name: 'A', designation: 'B', email: 'c@d.e', postalAddress: 'F' }) === true, 'ready when all set');
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
