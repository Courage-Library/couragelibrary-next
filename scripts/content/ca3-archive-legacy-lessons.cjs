#!/usr/bin/env node
/**
 * CA-3 step 1 — archive the legacy lesson files BEFORE any conversion (architect: "keep the old storage files archived
 * until the DB versions are verified"). READ ONLY: the DB is read under safeBegin (READ ONLY), Storage objects are only
 * downloaded (never moved or deleted). For every LEGACY (spec + MDX in Storage) document version it writes, to
 * <BACKUP_DIR>/ca3/legacy-lessons/<document_id>/v<n>/:
 *   spec.json + artifact.mdx (exact bytes) and manifest.json (keys, sizes, sha256, the DB row's recorded hashes).
 * Each download's sha256 must equal the hash recorded in document_versions, else the run fails (nothing to trust).
 * Prints counts + hash prefixes only (no content, no keys of other buckets, no secrets).
 * Run: node scripts/content/ca3-archive-legacy-lessons.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = class DummyWebSocket {}; // Node 20 (F1-a): no realtime used
const { createClient } = require('@supabase/supabase-js');
const { readEnv, dbTarget, redactor } = require('../db/_db-env.cjs');
const { safeBegin } = require('../db/live-safety.cjs'); // LIVE-LOCK-SWEEP: the one safe BEGIN

const BUCKET = 'learning-artifacts';
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

(async () => {
  const env = readEnv();
  const target = dbTarget();
  const red = redactor(target);
  const outRoot = path.join(target.backupDir, 'ca3', 'legacy-lessons');
  const c = new Client(target.pg);
  c.on('error', () => {});
  await c.connect();
  let rows;
  try {
    await safeBegin(c, { readOnly: true });
    rows = (await c.query(`select v.id, v.document_id, v.version_number, v.review_status, v.is_published, d.canonical_slug,
                                  v.source_spec_storage_key, v.source_spec_hash, v.compiled_artifact_storage_key, v.compiled_artifact_hash
                             from public.document_versions v join public.learning_documents d on d.id = v.document_id
                            where v.source_spec_storage_key is not null order by d.canonical_slug, v.version_number`)).rows;
    await c.query('ROLLBACK');
  } finally {
    await c.end().catch(() => {});
  }
  const sb = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const manifest = [];
  let bad = 0;
  for (const r of rows) {
    const dir = path.join(outRoot, r.document_id, `v${r.version_number}`);
    fs.mkdirSync(dir, { recursive: true });
    const entry = { version_id: r.id, document_id: r.document_id, slug: r.canonical_slug, version: r.version_number, review_status: r.review_status, files: {} };
    for (const [name, key, recorded] of [['spec.json', r.source_spec_storage_key, r.source_spec_hash], ['artifact.mdx', r.compiled_artifact_storage_key, r.compiled_artifact_hash]]) {
      const { data, error } = await sb.storage.from(BUCKET).download(key);
      if (error || !data) {
        bad++;
        console.log(`FAIL ${r.canonical_slug} v${r.version_number} ${name}: download failed (${red(String(error && error.message))})`);
        continue;
      }
      const buf = Buffer.from(await data.arrayBuffer());
      fs.writeFileSync(path.join(dir, name), buf);
      const h = sha(buf);
      // the recorded hash covers the stored bytes (spec JSON / compiled MDX)
      const matches = h === recorded;
      if (!matches) bad++;
      entry.files[name] = { storage_key: key, bytes: buf.length, sha256: h, recorded_hash: recorded, matches };
      console.log(`${matches ? 'ok  ' : 'FAIL'} ${r.canonical_slug} v${r.version_number} ${name}: ${buf.length} bytes sha256 ${h.slice(0, 12)}… ${matches ? '= recorded' : `≠ recorded ${String(recorded).slice(0, 12)}…`}`);
    }
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(entry, null, 2));
    manifest.push(entry);
  }
  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(path.join(outRoot, 'manifest.json'), JSON.stringify({ archivedAt: new Date().toISOString(), bucket: BUCKET, versions: manifest }, null, 2));
  console.log(`archived ${manifest.length} legacy version(s) → ${outRoot}; ${bad ? `${bad} PROBLEM(S)` : 'all hashes match the DB'}`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ARCHIVE FAILED', String(e && e.message ? e.message : e).slice(0, 200)); process.exit(2); });
