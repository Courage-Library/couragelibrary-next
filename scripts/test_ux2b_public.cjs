#!/usr/bin/env node
/**
 * UX-2b public pages gate (decisions #32 / #46 / #49 / #51 / #55).
 *
 * Offline (default; static + render checks, no network):
 *   P-1  copy file (content/public-pages.ts): no numbers except the documented facts (2024; CNTS Classes 5–8)
 *   P-2  no audience-size / ranking / guarantee claims, no "official" / "verified", no prices anywhere in the public
 *        pages, their components and their copy; no "thousands of" / "lakhs of" / "Fact-checked" in app/ components/
 *        content/ config/ (non-admin)
 *   P-3  legal pages render through LegalPage with the visible "Draft — under legal review" notice
 *   P-4  every internal href in the new pages / components / copy resolves to an existing route
 *   P-5  /premium is a permanent redirect to /pricing and app/premium/page.tsx is gone
 *   P-6  coming-soon hubs: only the listed slugs (SSC CHSL, SSC MTS), only while inactive, noindex metadata; the sitemap
 *        lists active exams only plus the six new public pages
 *   P-7  /cnts and /contact have no <form> / <input> / price / date; CNTS says "Registrations open soon"
 *   P-8  new files use design-system components and tokens only (no legacy imports, palette classes, raw colours, dark:)
 *   P-9  render: /exams with a failed data read → no-number fallback; with data → live counts only; coming-soon hub →
 *        planned list, no numbers, links back; legal pages → draft notice first
 * Live (--live, BASE_URL from scripts/live/with-server.cjs; CI live job):
 *   W-1  every new page answers 200 with one h1; W-2 /premium → 308 /pricing; W-3 coming-soon hub 200 + noindex,
 *        unlisted inactive exam → 404; W-4 sitemap lists the six pages and no coming-soon hub; W-5 no "thousands of",
 *        no ₹ / price on any new page; legal pages show the draft notice
 * Run: node scripts/test_ux2b_public.cjs [--live]
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const LIVE = process.argv.includes('--live');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1500)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const NEW_PAGES = ['app/about/page.tsx', 'app/cnts/page.tsx', 'app/contact/page.tsx', 'app/privacy/page.tsx', 'app/terms/page.tsx', 'app/exams/page.tsx'];
const NEW_COMPONENTS = ['components/public/public-page.tsx', 'components/public/coming-soon-hub.tsx'];
const COPY = 'content/public-pages.ts';
const PUBLIC_ROUTES = ['/about', '/cnts', '/contact', '/privacy', '/terms', '/pricing'];
// GATE-SCOPE-SWEEP (2026-10-29): the coming-soon slugs come from content/landing.ts (LANDING_EXAMS.comingSoon); whether
// each one is still a coming-soon HUB is read from its page — the owner may activate SSC CHSL / MTS at any time
const SOON_SLUGS = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'content/landing.ts'), 'utf8');
  const block = (src.match(/comingSoon:\s*\[([\s\S]*?)\]/) || [])[1] || '';
  return [...block.matchAll(/slug:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
})();
const hubSlugs = new Set();

/** route table from app/**\/page.tsx (route groups and dynamic segments supported) */
function routeTable() {
  const out = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), `${rel}/${e.name}`);
      else if (e.name === 'page.tsx') out.push(rel.replace(/\/\([^)]+\)/g, '') || '/');
    }
  };
  walk(path.join(ROOT, 'app'), '');
  return out;
}
const ROUTES = routeTable();
const routeExists = (p) => {
  const clean = p.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  return ROUTES.some((r) => new RegExp('^' + r.replace(/\/\[\[?\.\.\.[^\]]+\]\]?/g, '(?:/.*)?').replace(/\[[^\]]+\]/g, '[^/]+') + '$').test(clean));
};
/** strip comments so rules apply to shipped strings / markup only */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

async function offline() {
  await test('P-1 copy: no numbers except the documented facts (founding year 2024; CNTS Classes 5–8)', () => {
    const src = code(read(COPY));
    const strings = [...src.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2]);
    assert(strings.length >= 60, `only ${strings.length} strings scanned (min 60)`); // GATE-HYGIENE-1
    const bad = [];
    for (const s of strings) {
      if (/^\//.test(s) || /^@\//.test(s)) continue; // routes / imports
      const digits = s.replace(/\$\{[^}]*\}/g, '').match(/\d+/g) || [];
      for (const d of digits) {
        const ok = d === '2024' || (['5', '6', '7', '8'].includes(d) && /Class(es)? \d/.test(s));
        if (!ok) bad.push(`${d} in "${s.slice(0, 60)}"`);
      }
    }
    assert(bad.length === 0, bad.join('; '));
    return `${strings.length} strings; only 2024 and the CNTS class range`;
  });

  const BANNED = /\b(thousands|lakhs?|millions?|crores?)\b|\btrusted by\b|\bstudents trust\b|#1\b|\bbest\b|\bguarantee[ds]?\b|\btoppers?\b|\btestimonials?\b|\bofficial\b|\bverified\b|\bfact-checked\b|\bselected\b/i;
  const PRICE = /₹|\bRs\.?\s?\d|\bINR\b|\bper month\b|\/month\b|\bprice[sd]?\b/i;
  await test('P-2 no claims / prices in the public pages, components and copy; no "thousands of" etc. site-wide', () => {
    const files = [...NEW_PAGES, ...NEW_COMPONENTS, COPY];
    const hits = [];
    for (const f of files) {
      const s = code(read(f));
      const strings = [...s.matchAll(/"([^"]*)"|`([^`]*)`|>([^<>{}]+)</g)].map((m) => m[1] ?? m[2] ?? m[3]).filter((t) => t && !/^[@./]/.test(t) && !/className|^[a-z-]+$/.test(t));
      for (const t of strings) {
        if (BANNED.test(t)) hits.push(`${f}: "${t.slice(0, 70)}" (${t.match(BANNED)[0]})`);
        if (PRICE.test(t)) hits.push(`${f}: "${t.slice(0, 70)}" (price)`);
      }
    }
    // site-wide: unbacked audience-size / fact-check claims (non-admin)
    const wide = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) { if (!/admin/.test(e.name)) walk(rel); continue; }
        if (!/\.(tsx?|ts)$/.test(e.name)) continue;
        const s = read(rel);
        const m = s.match(/\b(thousands|lakhs|millions) of\b|fact-checked/i);
        if (m) wide.push(`${rel} (${m[0]})`);
      }
    };
    ['app', 'components', 'content', 'config'].forEach(walk);
    assert(hits.length === 0 && wide.length === 0, [...hits, ...wide].join('; '));
    return `${files.length} files clean; site-wide clean`;
  });

  await test('P-3 legal pages: rendered by LegalPage with the visible "Draft — under legal review" notice', () => {
    const lp = read('components/public/public-page.tsx');
    assert(/LEGAL_DRAFT_NOTICE\.title/.test(lp) && /data-legal-draft/.test(lp), 'LegalPage does not render the draft notice');
    assert(/title: "Draft — under legal review"/.test(read(COPY)), 'draft notice title changed');
    for (const f of ['app/privacy/page.tsx', 'app/terms/page.tsx']) assert(/<LegalPage /.test(read(f)), `${f} does not use LegalPage`);
    return 'privacy + terms';
  });

  await test('P-4 every internal href in the new pages, components and copy resolves to a route', () => {
    const hrefs = new Set();
    for (const f of [...NEW_PAGES, ...NEW_COMPONENTS, COPY, 'components/shell/nav-config.ts']) {
      for (const m of read(f).matchAll(/href(?:=|: )"(\/[^"]*)"/g)) hrefs.add(m[1]);
    }
    assert(hrefs.size >= 10, `only ${hrefs.size} hrefs (min 10)`);
    const dead = [...hrefs].filter((h) => !routeExists(h));
    assert(dead.length === 0, `no route for: ${dead.join(', ')}`);
    return `${hrefs.size} hrefs routed`;
  });

  await test('P-5 /premium → permanent redirect to /pricing; the old page is gone', () => {
    const nc = read('next.config.ts');
    assert(/\{\s*source:\s*"\/premium",\s*destination:\s*"\/pricing",\s*permanent:\s*true\s*\}/.test(nc), 'redirect missing');
    assert(!exists('app/premium/page.tsx') && !exists('app/premium/loading.tsx'), 'app/premium page still present');
    return 'next.config redirect';
  });

  await test('P-6 coming-soon hubs: listed slugs only, only while inactive, noindex; sitemap: active exams + six pages', () => {
    const hub = read('app/exams/[slug]/page.tsx');
    // any non-FOUND status (anonymous RLS hides inactive rows → NOT_FOUND); FOUND (active) renders the real hub
    assert(/status !== "FOUND" \? COMING_SOON_EXAMS\.find/.test(hub), 'coming-soon must apply to listed exams whenever they are not FOUND');
    const metaLine = hub.split('\n').find((l) => l.includes('(coming soon)')) || '';
    assert(/noIndex: true/.test(metaLine), 'coming-soon metadata is not noindex');
    assert(/if \(soon\) return <ComingSoonHub/.test(hub) && /notFound\(\)/.test(hub), 'unlisted exams must still 404');
    const listed = (read('content/landing.ts').match(/comingSoon: \[([\s\S]*?)\]/) || [])[1] || '';
    const slugs = [...listed.matchAll(/slug: "([a-z0-9-]+)"/g)].map((m) => m[1]);
    assert(JSON.stringify(slugs) === JSON.stringify(['ssc-chsl', 'ssc-mts']), `coming-soon list: ${slugs.join(', ')}`);
    const sm = read('app/sitemap.ts');
    for (const p of PUBLIC_ROUTES) assert(sm.includes(`"${p}"`), `sitemap misses ${p}`);
    assert(/\.eq\("is_active", true\)|is_active/.test(sm) && !/ssc-chsl|ssc-mts/.test(sm), 'sitemap must list active exams only');
    return `${slugs.join(', ')}; sitemap +${PUBLIC_ROUTES.length}`;
  });

  await test('P-7 /cnts and /contact: no form, no input, no price, no date; CNTS registration is "open soon"', () => {
    for (const f of ['app/cnts/page.tsx', 'app/contact/page.tsx']) {
      const s = code(read(f));
      assert(!/<form|<input|<textarea|<select|action=/i.test(s), `${f} has a form control`);
    }
    const c = read(COPY);
    assert(/registrationTitle: "Registrations open soon"/.test(c), 'CNTS registration notice missing');
    const cnts = (c.match(/export const CNTS_PAGE = \{([\s\S]*?)\n\} as const;/) || [])[1] || '';
    assert(cnts.length > 200 && !/\b(19|20)\d\d\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b \d|₹|fee/i.test(cnts), 'CNTS copy has a date or price');
    assert(/mailto:\$\{CONTACT_PAGE\.email\}/.test(read('app/contact/page.tsx')) && /email: SHELL_COPY\.supportEmail/.test(c), 'contact mailto missing');
    return 'no forms; CNTS closed; mailto support';
  });

  await test('P-8 new files: design-system components and tokens only', () => {
    const bad = [];
    for (const f of [...NEW_PAGES, ...NEW_COMPONENTS]) {
      const s = read(f);
      if (/components\/ui\/legacy/.test(s)) bad.push(`${f}: legacy import`);
      if (/\b(?:bg|text|border|from|to|via|ring)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d/.test(s)) bad.push(`${f}: palette class`);
      if (/#[0-9a-fA-F]{3,8}\b|rgb\(/.test(code(s))) bad.push(`${f}: raw colour`);
      if (/\bdark:/.test(s)) bad.push(`${f}: dark:`);
      if (/max-w-7xl|max-w-6xl/.test(s)) bad.push(`${f}: non-1200 container`);
    }
    assert(bad.length === 0, bad.join('; '));
    return `${NEW_PAGES.length + NEW_COMPONENTS.length} files`;
  });

  await renderChecks();
}

// ---------- render checks (TS transpile + mocks; no network) ----------
async function renderChecks() {
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
  let landingData = { ok: false };
  let examStatus = 'NOT_FOUND';
  class NotFoundSignal extends Error {}
  const MOCKS = {
    'next/navigation': { notFound: () => { throw new NotFoundSignal('NEXT_NOT_FOUND'); }, redirect: () => { throw new Error('redirect'); } },
    '@/services/exam-knowledge/exam-knowledge-candidate.service': {
      ExamKnowledgeCandidateService: { getExamKnowledgeCandidateView: async () => ({ status: examStatus, data: null }) },
    },
    'server-only': {},
    'next/headers': { cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => undefined }), headers: async () => new Map() },
    '@/lib/supabase/server': { createServerSupabaseClient: async () => ({}) },
    '@/lib/landing/landing-data': { loadLandingData: async () => landingData },
  };
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
    return origLoad.call(this, request, parent, isMain);
  };
  const { renderToStaticMarkup } = require('react-dom/server');
  const html = async (el) => renderToStaticMarkup(await el);
  const text = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

  const examsPage = require(path.join(ROOT, 'app/exams/page.tsx')).default;
  await test('P-9a /exams with a failed data read → no-number fallback, coming-soon cards still shown', async () => {
    landingData = { ok: false };
    const h = await html(examsPage());
    const t = text(h);
    assert(/data-exams-fallback/.test(h) && /couldn't load the exam list/.test(t), 'fallback missing');
    assert(!/\d/.test(t.replace(/SSC CGL|SSC CHSL|SSC MTS/g, '')), `digits rendered: ${t.match(/.{0,30}\d.{0,30}/)}`);
    assert(/SSC CHSL/.test(t) && /SSC MTS/.test(t) && /href="\/exams\/ssc-chsl"/.test(h), 'coming-soon cards missing');
    assert((h.match(/<h1[ >]/g) || []).length === 1, 'not exactly one h1');
    return 'fallback, 0 digits, 1 h1';
  });
  await test('P-9b /exams with data → only live counts; an active listed exam is not shown as coming soon', async () => {
    landingData = { ok: true, totalPublishedMocks: 3, totalPublishedGuides: 2, currentAffairsPublished: 0, exams: [
      { slug: 'ssc-cgl', title: 'SSC CGL', category: 'SSC', publishedMocks: 3, publishedGuides: 2, syllabusAvailable: true },
      { slug: 'ssc-chsl', title: 'SSC CHSL', category: 'SSC', publishedMocks: 0, publishedGuides: 0, syllabusAvailable: false },
    ] };
    const h = await html(examsPage());
    const t = text(h);
    assert(/3 free mock tests/.test(t) && /2 exam guides/.test(t) && /Syllabus available/.test(t), 'live counts missing');
    assert(/Mock tests coming soon/.test(t), 'no-mocks badge missing');
    assert((h.match(/href="\/exams\/ssc-chsl"/g) || []).length === 1 && /href="\/exams\/ssc-mts"/.test(h), 'an active listed exam must appear once (as active), the inactive one as coming soon');
    const digits = (t.match(/\d+/g) || []).filter((d) => !['3', '2'].includes(d));
    assert(digits.length === 0, `unexpected numbers: ${digits.join(', ')}`);
    return 'counts 3 / 2 only from data';
  });
  await test('P-9c coming-soon hub → badge, planned list, links back, no numbers', async () => {
    const { ComingSoonHub } = require(path.join(ROOT, 'components/public/coming-soon-hub.tsx'));
    const React = require('react');
    const h = renderToStaticMarkup(React.createElement(ComingSoonHub, { title: 'SSC MTS' }));
    const t = text(h);
    assert(/data-coming-soon-hub/.test(h) && /Coming soon/.test(t) && /What we plan to add/.test(t), 'hub content missing');
    assert(/href="\/exams\/ssc-cgl"/.test(h) && /href="\/exams"/.test(h), 'links back missing');
    assert(!/\d/.test(t), 'digits rendered');
    return 'honest hub';
  });
  await test('P-9e exam hub: a listed exam that is not FOUND (anonymous RLS → NOT_FOUND, or INACTIVE) renders the noindex hub; unlisted → 404', async () => {
    const hubMod = require(path.join(ROOT, 'app/exams/[slug]/page.tsx'));
    const out = [];
    for (const status of ['NOT_FOUND', 'INACTIVE']) {
      examStatus = status;
      const h = renderToStaticMarkup(await hubMod.default({ params: Promise.resolve({ slug: 'ssc-chsl' }) }));
      assert(/data-coming-soon-hub/.test(h) && /SSC CHSL/.test(text(h)), `${status}: hub not rendered for ssc-chsl`);
      const meta = await hubMod.generateMetadata({ params: Promise.resolve({ slug: 'ssc-chsl' }) });
      assert(meta.robots && meta.robots.index === false, `${status}: hub metadata is indexable`);
      for (const slug of ['ssc-gd', 'qa-syllabus-test']) {
        let nf = false;
        try { await hubMod.default({ params: Promise.resolve({ slug }) }); } catch (e) { nf = e instanceof NotFoundSignal; }
        assert(nf, `${status}: ${slug} did not 404`);
      }
      out.push(status);
    }
    return `${out.join(' / ')}: CHSL hub noindex; GD + QA exam 404`;
  });
  await test('P-9d legal pages → the draft notice renders before the first section', async () => {
    for (const f of ['app/privacy/page.tsx', 'app/terms/page.tsx']) {
      const h = await html(require(path.join(ROOT, f)).default());
      const i = h.indexOf('data-legal-draft');
      assert(i > 0 && i < h.indexOf('id="legal-0"') && /Draft — under legal review/.test(text(h)), `${f}: notice missing or not first`);
    }
    return 'privacy + terms';
  });
}

// ---------- live (CI live job) ----------
async function live() {
  const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
  assert(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE), '--live needs BASE_URL on a local host (scripts/live/with-server.cjs)');
  const get = async (p, redirect = 'manual') => {
    for (let i = 1; i <= 3; i++) {
      try {
        const r = await fetch(BASE + p, { redirect, signal: AbortSignal.timeout(30000) });
        return { status: r.status, location: r.headers.get('location') || '', body: await r.text() };
      } catch (e) {
        if (i === 3) throw e;
      }
    }
  };
  const visible = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  await test('W-1 every new public page → 200 with exactly one h1', async () => {
    const bad = [];
    for (const p of [...PUBLIC_ROUTES, '/exams']) {
      const r = await get(p);
      const h1 = (r.body.match(/<h1[ >]/g) || []).length;
      if (r.status !== 200 || h1 !== 1) bad.push(`${p}: ${r.status}, ${h1} h1`);
    }
    assert(bad.length === 0, bad.join('; '));
    return `${PUBLIC_ROUTES.length + 1} pages`;
  });
  await test('W-2 /premium → 308 /pricing', async () => {
    const r = await get('/premium');
    assert(r.status === 308 && /\/pricing$/.test(r.location), `${r.status} → ${r.location}`);
    return '308';
  });
  await test('W-3 every coming-soon slug answers 200: a hub is noindex (an activated exam is its real page); unlisted inactive exam → 404', async () => {
    assert(SOON_SLUGS.length > 0, 'no coming-soon slugs parsed from content/landing.ts');
    for (const slug of SOON_SLUGS) {
      const r = await get(`/exams/${slug}`);
      assert(r.status === 200, `${slug}: ${r.status}`);
      if (/data-coming-soon-hub/.test(r.body)) {
        assert(/<meta name="robots" content="noindex/.test(r.body), `${slug}: coming-soon hub without noindex`);
        hubSlugs.add(slug);
      }
    }
    const q = await get('/exams/qa-syllabus-test');
    assert(q.status === 404, `qa exam: ${q.status}`);
    return `${hubSlugs.size} hub(s) noindex (${[...hubSlugs].join(', ') || 'none'}), ${SOON_SLUGS.length - hubSlugs.size} activated; qa exam 404`;
  });
  await test('W-4 sitemap lists the six public pages and no coming-soon hub', async () => {
    const r = await get('/sitemap.xml');
    const missing = PUBLIC_ROUTES.filter((p) => !new RegExp(`<loc>[^<]*${p}</loc>`).test(r.body));
    const listedHubs = [...hubSlugs].filter((sl) => r.body.includes(`/exams/${sl}<`) || r.body.includes(`/exams/${sl}/`));
    assert(r.status === 200 && missing.length === 0 && listedHubs.length === 0, `${r.status}; missing ${missing.join(', ')}; hubs listed ${listedHubs.join(', ')}`);
    return `six pages; none of the ${hubSlugs.size} coming-soon hub(s)`;
  });
  await test('W-5 no audience-size claims or prices on the new pages; legal pages show the draft notice', async () => {
    const bad = [];
    for (const p of [...PUBLIC_ROUTES, '/exams', '/exams/ssc-chsl']) {
      const t = visible((await get(p)).body);
      if (/\b(thousands|lakhs|millions) of\b/i.test(t)) bad.push(`${p}: audience claim`);
      if (/₹\s?[1-9]|\bRs\.?\s?[1-9]|\+ ?18% GST/i.test(t)) bad.push(`${p}: price`);
    }
    for (const p of ['/privacy', '/terms']) if (!/Draft — under legal review/.test(visible((await get(p)).body))) bad.push(`${p}: no draft notice`);
    assert(bad.length === 0, bad.join('; '));
    return 'clean';
  });
}

(async () => {
  console.log(`UX-2b public pages (${LIVE ? 'live' : 'offline'})`);
  if (LIVE) await live();
  else await offline();
  console.log(`\nUX-2b public: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(`UX-2b SUITE ERROR ${e && e.message}`);
  process.exit(2);
});
