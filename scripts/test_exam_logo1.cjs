#!/usr/bin/env node
/**
 * EXAM-LOGO-1 — offline gate (the database side is scripts/live/test_exam_logo1.cjs).
 *   P-1 a real PNG / JPEG / WebP becomes a 512 × 512 WebP: re-encoded (new bytes), metadata stripped (no EXIF / XMP /
 *       ICC), content hash = sha256 of the output; a non-square image is padded with transparency
 *   P-2 refused by its BYTES: SVG and HTML renamed .png, a PNG header on garbage, a GIF, an empty file
 *   P-3 refused: over 1 MB; under 256 × 256
 *   E-1 createExamDraft (every caller): no body → refused; an inactive or unknown body → refused; a body without a logo →
 *       refused; with a logo → created. NO "first org" fallback query and NO inline body creation (negative control:
 *       the old fallback would have picked the first body)
 *   E-2 the importer refuses a spec without organization.name before any write
 *   E-3 the logo actions are ADMIN only (guardAdminAction with no allowStaff), process before storing, store under the
 *       content hash, delete an old file only after the row switched; the create action refuses an inline new body
 *   D-1 display: the logo badge always has a fixed box (width / height; no layout shift), lazy unless priority; the exam
 *       layout shows the logo + the not-affiliated line; the exams list, the landing cards, the admin list (+ "Logo
 *       missing") and Today use it; the upload input accepts PNG / JPG / WebP only (never SVG)
 * Run: node scripts/test_exam_logo1.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {};
  if (request === '@/lib/supabase/server' || /lib[\\/]supabase[\\/]server/.test(request)) return { createAdminServerSupabaseClient: () => { throw new Error('a stub client is passed in the gate'); }, createServerSupabaseClient: async () => { throw new Error('not used'); } };
  return origLoad.call(this, request, parent, isMain);
};
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};
const sharp = require(path.join(ROOT, 'node_modules/sharp'));

let passed = 0;
let failed = 0;
const results = [];
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 700)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const LI = require(path.join(ROOT, 'lib/logos/logo-image.ts'));
const svcMod = require(path.join(ROOT, 'services/exam-onboarding/exam-onboarding.service.ts'));

const img = (w, h, fmt, opts = {}) => {
  let p = sharp({ create: { width: w, height: h, channels: 4, background: { r: 30, g: 64, b: 175, alpha: 1 } } });
  if (opts.exif) p = p.withMetadata({ exif: { IFD0: { Copyright: 'SECRET-OWNER-NOTE', Artist: 'someone' } } });
  return p[fmt](fmt === 'jpeg' ? { quality: 90 } : {}).toBuffer();
};

(async () => {
  await test('P-1 PNG / JPEG / WebP → a re-encoded 512 × 512 WebP, metadata stripped, hash = sha256(output); non-square padded with transparency', async () => {
    for (const fmt of ['png', 'jpeg', 'webp']) {
      const input = await img(400, 400, fmt, { exif: fmt === 'jpeg' });
      const r = await LI.processLogo(input);
      assert(r.ok, `${fmt}: ${r.message}`);
      const m = await sharp(r.webp).metadata();
      assert(m.format === 'webp' && m.width === 512 && m.height === 512, `${fmt}: out ${m.format} ${m.width}×${m.height}`);
      assert(!m.exif && !m.xmp && !m.icc && !m.iptc, `${fmt}: metadata kept`);
      assert(!r.webp.equals(input) && r.sha256 === crypto.createHash('sha256').update(r.webp).digest('hex'), `${fmt}: hash / re-encode`);
      if (fmt === 'jpeg') assert(!r.webp.includes(Buffer.from('SECRET-OWNER-NOTE')), 'EXIF text survived');
    }
    const wide = await LI.processLogo(await img(800, 300, 'png'));
    const px = await sharp(wide.webp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x, y) => px.data[(y * px.info.width + x) * 4 + 3];
    assert(wide.ok && alphaAt(256, 5) === 0 && alphaAt(256, 256) > 0, 'a wide image is padded top / bottom with transparency');
    return 'png, jpeg (EXIF stripped), webp; 800×300 padded';
  });

  await test('P-2 refused by the bytes: SVG / HTML renamed .png, a PNG header on garbage, a GIF, an empty file', async () => {
    const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><script>alert(1)</script><rect width="512" height="512"/></svg>');
    const html = Buffer.from('<!doctype html><html><body><img src=x onerror=alert(1)></body></html>');
    const fakePng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(2048)]);
    const gif = Buffer.from('GIF89a' + 'x'.repeat(100));
    const out = {};
    for (const [k, b] of Object.entries({ svg, html, fakePng, gif, empty: Buffer.alloc(0) })) out[k] = (await LI.processLogo(b)).code;
    assert(out.svg === 'NOT_AN_IMAGE' && out.html === 'NOT_AN_IMAGE' && out.gif === 'NOT_AN_IMAGE' && out.empty === 'EMPTY' && ['UNREADABLE', 'NOT_AN_IMAGE'].includes(out.fakePng), JSON.stringify(out));
    assert(LI.sniffLogoFormat(svg) === null && LI.sniffLogoFormat(await img(300, 300, 'png')) === 'png', 'sniffer');
    return JSON.stringify(out);
  });

  await test('P-3 refused: over 1 MB; under 256 × 256', async () => {
    const big = await sharp(crypto.randomBytes(900 * 900 * 3), { raw: { width: 900, height: 900, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
    assert(big.length > 1024 * 1024, `noise image only ${big.length} bytes`);
    const r1 = await LI.processLogo(big);
    const r2 = await LI.processLogo(await img(200, 300, 'png'));
    assert(r1.code === 'TOO_LARGE' && r2.code === 'TOO_SMALL', JSON.stringify([r1.code, r2.code]));
    return `${(big.length / 1048576).toFixed(2)} MB refused; 200×300 refused`;
  });

  // a recording stub of the supabase query builder for the create path
  const stub = (orgRow) => {
    const calls = [];
    const builder = (table) => {
      const st = { table, ops: [] };
      const b = {
        select: (c) => (st.ops.push(['select', c]), b),
        eq: (c, v) => (st.ops.push(['eq', c, v]), b),
        limit: (n) => (st.ops.push(['limit', n]), b),
        or: (x) => (st.ops.push(['or', x]), b),
        insert: (row) => (st.ops.push(['insert', row]), b),
        maybeSingle: async () => {
          calls.push(st);
          if (table === 'conducting_orgs') return { data: st.ops.some((o) => o[0] === 'eq' && o[1] === 'id') ? orgRow : { id: 'first-org' } };
          return { data: null };
        },
        single: async () => (calls.push(st), { data: { id: 'new-exam', title: 'T', slug: 't' }, error: null }),
      };
      return b;
    };
    return { calls, from: builder };
  };
  await test('E-1 createExamDraft: no body / unknown / inactive / no logo → refused; with a logo → created; NO first-org fallback, NO inline body', async () => {
    const S = svcMod.ExamOnboardingService;
    const run = async (params, orgRow) => {
      const sb = stub(orgRow);
      try { await S.createExamDraft({ title: 'Test Exam', slug: 'test-exam', ...params }, sb); return { ok: true, calls: sb.calls }; }
      catch (e) { return { ok: false, logo: e instanceof svcMod.ExamLogoRequiredError, msg: e.message, calls: sb.calls }; }
    };
    const none = await run({}, null);
    const unknown = await run({ orgId: 'o1' }, null);
    const inactive = await run({ orgId: 'o1' }, { id: 'o1', name: 'Board', is_active: false, logo_path: 'orgs/x.webp' });
    const noLogo = await run({ orgId: 'o1' }, { id: 'o1', name: 'Board', is_active: true, logo_path: null });
    const good = await run({ orgId: 'o1' }, { id: 'o1', name: 'Board', is_active: true, logo_path: 'orgs/o1/a.webp' });
    const inline = await run({ newOrgName: 'Brand New Board' }, null);
    assert(!none.ok && none.logo && !unknown.ok && unknown.logo && !inactive.ok && !noLogo.ok && noLogo.logo && /has no logo yet/.test(noLogo.msg), JSON.stringify([none.msg, unknown.msg, inactive.msg, noLogo.msg]));
    assert(good.ok && good.calls.some((c) => c.table === 'exams' && c.ops.some((o) => o[0] === 'insert' && o[1].org_id === 'o1')), 'a body with a logo should create the exam');
    assert(!inline.ok && inline.logo, 'an inline new body must be refused');
    const all = [none, unknown, inactive, noLogo, good, inline].flatMap((r) => r.calls);
    assert(!all.some((c) => c.table === 'conducting_orgs' && c.ops.some((o) => o[0] === 'limit')), 'a "first org" (limit 1) query was made — the fallback is back');
    assert(!all.some((c) => c.table === 'conducting_orgs' && c.ops.some((o) => o[0] === 'insert')), 'a body was created inline');
    const src = read('services/exam-onboarding/exam-onboarding.service.ts');
    assert(!/from\('conducting_orgs'\)\.select\('id'\)\.limit\(1\)/.test(src) && !/newOrgName/.test(src.slice(src.indexOf('static async createExamDraft'), src.indexOf('static async createExamDraft') + 3000)), 'fallback / inline body in the source');
    return 'refused ×5, created ×1; no fallback query';
  });

  await test('E-2 the importer refuses a spec without organization.name before any write', async () => {
    const I = require(path.join(ROOT, 'services/exam-onboarding/exam-onboarding-importer.service.ts'));
    const sb = stub(null);
    let err = null;
    try { await I.ExamOnboardingImporterService.commitImportDraft({ exam: { title: 'X Exam', slug: 'x-exam' } }, { customSupabase: sb }); } catch (e) { err = e; }
    assert(err && err instanceof svcMod.ExamLogoRequiredError && /must name the exam's conducting body/.test(err.message) && sb.calls.length === 0, `${err && err.message} / ${sb.calls.length} call(s)`);
    assert(!/Central Recruitment Commission/.test(read('services/exam-onboarding/exam-onboarding-importer.service.ts')), 'the default body is back');
  });

  await test('E-3 logo actions: admin only, processed before stored, content-hash path, old file deleted only after the row switched; inline new body refused by the create action', async () => {
    const a = read('app/admin/exams/logo-actions.ts');
    const exported = [...a.matchAll(/export async function (\w+)\([^)]*\)[^\n]*\{\n\s*const auth = await guardAdminAction\(\);/g)].map((m) => m[1]);
    assert(exported.length === 5 && (a.match(/^export async function /gm) || []).length === 5 && !/allowStaff/.test(a), `every exported logo action must call the admin-only guard first: ${exported}`);
    const order = ['processLogo(', '.upload(path', 'rpc("fn_logo_set"', 'remove([oldPath])'].map((x) => a.indexOf(x));
    assert(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), `order ${order}`);
    assert(/\$\{processed\.sha256\}\.webp/.test(a) && /contentType: "image\/webp"/.test(a) && /upsert: false/.test(a), 'content-hash path, webp, no overwrite');
    assert(/if \(!existed\) await db\.storage\.from\(LOGO_BUCKET\)\.remove\(\[path\]\)/.test(a), 'a failed save removes only the new file');
    const act = read('app/admin/exams/actions.ts');
    assert(/formData\.get\("newOrgName"\)[\s\S]{0,80}\.trim\(\)\) \{\s*return \{ error: "Add the conducting body/.test(act), 'create action: inline body');
  });

  await test('D-1 display + inputs: fixed box, lazy; the exam layout shows the logo + the not-affiliated line; lists / landing / admin (+ Logo missing) / Today use it; upload inputs PNG / JPG / WebP only', async () => {
    const badge = read('components/exams/exam-logo-badge.tsx');
    assert(/width=\{px\} height=\{px\}/.test(badge) && /style=\{\{ width: px, height: px \}\}/.test(badge) && /priority=\{priority\}/.test(badge) && /Courage Library is an independent platform and is not affiliated with \{body\}\./.test(badge), 'badge');
    const layout = read('app/exams/[slug]/layout.tsx');
    assert(/<ExamLogoBadge logo=\{brand\.logo\}/.test(layout) && /<NotAffiliatedLine body=\{brand\.bodyName\} \/>/.test(layout) && /if \(!brand\) return <>\{children\}<\/>;/.test(layout), 'exam layout');
    for (const f of ['app/exams/page.tsx', 'components/landing/landing-sections.tsx']) assert(/<ExamLogoBadge logo=\{exam\.logo\}/.test(read(f)), f);
    const view = read('components/admin/exam-onboarding/exam-management-view.tsx');
    assert(/<ExamLogoBadge/.test(view) && /Logo missing/.test(view) && /<ConductingBodiesPanel orgs=\{conductingOrgs\} canEdit=\{canEditLogos\} \/>/.test(view), 'admin list');
    assert(/examsWithoutLogo/.test(read('lib/admin/today.ts')) && /Exams without a logo/.test(read('app/admin/page.tsx')), 'Today');
    for (const f of ['components/admin/exam-onboarding/conducting-bodies-panel.tsx', 'components/admin/exam-onboarding/exam-logo-override.tsx']) {
      const s = read(f);
      const accepts = [...s.matchAll(/accept="([^"]*)"/g)].map((m) => m[1]);
      assert(accepts.length >= 1 && accepts.every((x) => x === 'image/png,image/jpeg,image/webp'), `${f}: accept list ${accepts}`);
    }
    assert(!/svg/i.test(read('lib/logos/logo-image.ts').replace(/(\/\*[\s\S]*?\*\/|\/\/.*$)/gm, '').replace(/"Upload a PNG, JPG or WebP image \(SVG and other files are not accepted\)\."/g, '')), 'the processor must not handle SVG');
  });

  console.log(`\nEXAM-LOGO-1 offline: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
