#!/usr/bin/env node
/**
 * LOGO-P0 (2026-10-31) SHARP-TRACE: after `next build`, prove the logo pipeline works from ONLY the files Next traced for
 * the routes that run it — the same file set a Vercel function ships (a local run always has the full node_modules,
 * which is how a missing native file reached production unseen).
 *   T-0 (information only) what the tracer finds for sharp alone, without the next.config includes (root-cause evidence)
 *   T-1 for each route below, its .nft.json lists sharp, the platform binary package and (Linux) the libvips package
 *   T-2 the traced files copied into an isolated temp dir (outside the repo) load sharp and encode a 256 × 256 PNG into
 *       a 512 × 512 WebP there
 *   T-3 negative control: the same isolated set WITHOUT the libvips package (Linux) / the platform package (other OS)
 *       must FAIL to encode — proving T-2 really ran from the traced set only
 * Run (CI server-checks, after the production build): node scripts/ci/sharp-trace-check.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const ROUTES = ['.next/server/app/admin/exams/page.js.nft.json', '.next/server/app/api/health/image/route.js.nft.json'];
const PLATFORM = `${process.platform}-${process.arch}`;
const NATIVE = `@img/sharp-${PLATFORM}`;
const LIBVIPS = process.platform === 'linux' ? `@img/sharp-libvips-${PLATFORM}` : null; // other OSes bundle libvips in NATIVE

let failed = 0;
const line = (ok, name, info = '') => { if (!ok) failed++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`); };

const PROBE = `
const sharp = require('sharp');
(async () => {
  const png = await sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 29, g: 78, b: 216, alpha: 1 } } }).png().toBuffer();
  const webp = await sharp(png).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90 }).toBuffer();
  const m = await sharp(webp).metadata();
  if (m.format !== 'webp' || m.width !== 512) throw new Error('bad output');
  console.log('ENCODED');
})().catch(() => { console.log('NOT ENCODED'); process.exit(1); });
`;

function tracedFiles(nftRel) {
  const nft = path.join(ROOT, nftRel);
  const j = JSON.parse(fs.readFileSync(nft, 'utf8'));
  return j.files.map((f) => path.resolve(path.dirname(nft), f)).filter((f) => f.startsWith(ROOT + path.sep) && f.includes(`${path.sep}node_modules${path.sep}`));
}

function isolate(files, drop) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sharp-trace-'));
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    if (drop && rel.split(path.sep).join('/').includes(`node_modules/${drop}/`)) continue;
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) continue;
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.copyFileSync(f, path.join(dir, rel));
  }
  fs.writeFileSync(path.join(dir, 'probe.cjs'), PROBE);
  const r = spawnSync(process.execPath, ['probe.cjs'], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT || '' }, timeout: 60000 });
  fs.rmSync(dir, { recursive: true, force: true });
  return (r.stdout || '').trim() === 'ENCODED' && r.status === 0;
}

(async () => {
// T-0 (information, root-cause evidence): what Next's file tracer finds for sharp ON ITS OWN, without the
// next.config outputFileTracingIncludes — on Linux the libvips package is reached only through the native binary's RPATH
try {
  const { nodeFileTrace } = require('next/dist/compiled/@vercel/nft');
  const r = await nodeFileTrace([path.join(ROOT, 'node_modules/sharp/lib/index.js')], { base: ROOT });
  const found = [...new Set([...r.fileList].map((f) => (/node_modules[\\/](@img[\\/][^\\/]+)/.exec(f) || [])[1]).filter(Boolean).map((x) => x.replace(/\\/g, '/')))];
  const say = (pkg) => `${pkg} ${found.includes(pkg) ? 'traced' : 'NOT traced'}`;
  console.log(`  INFO  T-0 the tracer alone finds: ${found.join(' ') || 'no @img package'} — ${[NATIVE, LIBVIPS].filter(Boolean).map(say).join(', ')}`);
} catch (e) {
  console.log(`  INFO  T-0 tracer unavailable (${e.code || e.name})`);
}

for (const route of ROUTES) {
  const id = route.replace(/^\.next\/server\/app\//, '/').replace(/\/(page|route)\.js\.nft\.json$/, '');
  if (!fs.existsSync(path.join(ROOT, route))) { line(false, `T-1 ${id}: no trace file (run next build first)`); continue; }
  const files = tracedFiles(route);
  const pkgs = new Set(files.map((f) => (/node_modules[\\/](@img[\\/][^\\/]+|sharp)[\\/]/.exec(f) || [])[1]).filter(Boolean).map((p) => p.replace(/\\/g, '/')));
  const need = ['sharp', NATIVE, LIBVIPS].filter(Boolean);
  const missing = need.filter((p) => !pkgs.has(p));
  line(missing.length === 0, `T-1 ${id}: traced ${need.join(' + ')}`, missing.length ? `missing ${missing.join(', ')}` : '');
  line(isolate(files, null), `T-2 ${id}: traced files alone load sharp and encode PNG → WebP (isolated dir)`);
  const drop = LIBVIPS || NATIVE;
  line(!isolate(files, drop), `T-3 ${id}: negative control — without ${drop} the encode FAILS`);
}
console.log(`\nSHARP-TRACE: ${failed ? `${failed} FAILED` : 'all passed'} (${PLATFORM})`);
process.exit(failed ? 1 : 0);
})();
