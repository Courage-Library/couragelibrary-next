#!/usr/bin/env node
/**
 * HOME-1 brand: build the DEFAULT brand files in public/brand/ from the official logo (public/images/logo.png).
 * The logo is a brand asset: it is only resized (and, for the square icons, padded with its own white background) —
 * never recoloured or redrawn. Uploaded brand assets (Settings › Brand, migration 131) replace these at runtime.
 *   mark-32.webp / mark-64.webp / mark-96.webp   the mark at 32 px tall (1x / 2x / 3x) for the header, menu and footer
 *   icon-32.png / icon-180.png / icon-192.png / icon-512.png   favicon, apple-touch icon, app icons (square)
 * Note: the source is 245 × 229 px, so the 512 px icon is upscaled (a larger square mark should be uploaded).
 * Run: node scripts/content/brand-defaults.cjs   (deterministic; re-run only when the official logo file changes)
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'public/images/logo.png');
const OUT = path.join(ROOT, 'public/brand');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const meta = await sharp(SRC).metadata();
  const made = [];
  for (const h of [32, 64, 96]) {
    const file = `mark-${h}.webp`;
    const buf = await sharp(SRC).resize({ height: h }).webp({ quality: 92, effort: 6 }).toBuffer();
    fs.writeFileSync(path.join(OUT, file), buf);
    const m = await sharp(buf).metadata();
    made.push(`${file} ${m.width}x${m.height} ${buf.length} B`);
  }
  // square: pad the 245 × 229 mark to 245 × 245 with its own (white) background, centred, then resize
  const side = Math.max(meta.width, meta.height);
  const square = await sharp(SRC)
    .extend({ top: Math.floor((side - meta.height) / 2), bottom: Math.ceil((side - meta.height) / 2), left: Math.floor((side - meta.width) / 2), right: Math.ceil((side - meta.width) / 2), background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
  for (const s of [32, 180, 192, 512]) {
    const file = `icon-${s}.png`;
    const buf = await sharp(square).resize({ width: s, height: s, kernel: s > side ? 'lanczos3' : 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(path.join(OUT, file), buf);
    made.push(`${file} ${s}x${s} ${buf.length} B${s > side ? ' (upscaled from ' + side + ' px)' : ''}`);
  }
  console.log(`source ${meta.width}x${meta.height} ${meta.format}\n${made.join('\n')}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
