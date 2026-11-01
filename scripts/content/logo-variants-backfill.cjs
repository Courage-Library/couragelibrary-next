#!/usr/bin/env node
/**
 * HOME-1: create the sized copies (<sha>-64.webp, <sha>-128.webp) for logos / icons stored BEFORE the pipeline made them
 * (conducting_orgs.logo_path, exams.logo_override_path, exam_categories.icon_path). Content-hash names: a copy is derived
 * from exactly one original; existing copies are left alone (idempotent). Storage only (no DB row changes).
 *   --dry-run   list what would be created; write nothing (the first run of a new writer is non-writing)
 * Run: node scripts/content/logo-variants-backfill.cjs [--dry-run]
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const sharp = require('sharp');
// Node 20 has no global WebSocket; supabase-js only needs the name (no realtime is used) — as scripts/e2e/_e2e-env.cjs
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = class DummyWebSocket {};
const { createClient } = require('@supabase/supabase-js');
const { readEnv } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));

const DRY = process.argv.includes('--dry-run');
const BUCKET = 'org-logos';
const VARIANTS = [64, 128];
const mask = (s) => String(s).replace(/[a-z0-9.-]+\.supabase\.(co|com)/gi, '[host]');

(async () => {
  const env = readEnv();
  const db = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const [orgs, exams, cats] = await Promise.all([
    db.from('conducting_orgs').select('logo_path').not('logo_path', 'is', null),
    db.from('exams').select('logo_override_path').not('logo_override_path', 'is', null),
    db.from('exam_categories').select('icon_path').not('icon_path', 'is', null),
  ]);
  for (const r of [orgs, exams, cats]) if (r.error) throw new Error(`read failed (${r.error.code || 'error'})`);
  const paths = [...(orgs.data || []).map((r) => r.logo_path), ...(exams.data || []).map((r) => r.logo_override_path), ...(cats.data || []).map((r) => r.icon_path)];
  let created = 0;
  let present = 0;
  for (const p of paths) {
    const dir = p.slice(0, p.lastIndexOf('/'));
    const base = p.slice(p.lastIndexOf('/') + 1).replace(/\.webp$/, '');
    const { data: listed, error: le } = await db.storage.from(BUCKET).list(dir);
    if (le) throw new Error(`list failed (${le.message})`);
    const names = new Set((listed || []).map((o) => o.name));
    const missing = VARIANTS.filter((px) => !names.has(`${base}-${px}.webp`));
    present += VARIANTS.length - missing.length;
    if (!missing.length) continue;
    console.log(`${DRY ? 'WOULD CREATE' : 'CREATE'} ${dir}/${base}-{${missing.join(',')}}.webp`);
    if (DRY) continue;
    const { data: blob, error: de } = await db.storage.from(BUCKET).download(p);
    if (de || !blob) throw new Error(`download failed for ${dir}/…`);
    const original = Buffer.from(await blob.arrayBuffer());
    for (const px of missing) {
      const buf = await sharp(original).resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 85, effort: 4 }).toBuffer();
      const up = await db.storage.from(BUCKET).upload(`${dir}/${base}-${px}.webp`, buf, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
      if (up.error && !/exist|duplicate/i.test(up.error.message)) throw new Error(`upload failed (${up.error.message})`);
      created++;
    }
  }
  console.log(`${DRY ? 'DRY-RUN' : 'DONE'}: ${paths.length} stored logo(s); ${present} copies already present; ${DRY ? 'nothing written' : `${created} created`}`);
})().catch((e) => { console.log(`FAILED — ${mask(e.message).slice(0, 200)}`); process.exit(1); });
