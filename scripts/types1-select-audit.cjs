/**
 * TYPES-1: live select audit. Extracts every literal `.from("table").select("…")` pair from the given files and
 * executes it READ-ONLY against couragelibrary-next (ref-locked, service role, `limit 1`, no writes) to find
 * runtime drift that the type checker cannot see (non-existent columns / relationships, ambiguous embeds).
 *
 * Usage: node scripts/types1-select-audit.cjs <file…>     (exit 1 if any select fails)
 * Notes: only single-literal selects are checked (template / variable selects are listed as "skipped").
 *        `!inner` filters and RLS are not exercised (service role) — this audits shape, not authorization.
 *        Least privilege (#54): tables created after the default-ACL hardening grant service_role no SELECT (e.g.
 *        practice_answers, user_onboarding) and the app reads them as the signed-in student. A 42501 from the service
 *        role is therefore re-checked ONCE as the shared QA student (role authenticated, read-only, limit 1): PostgREST
 *        validates the select's shape before RLS filters rows, so shape drift still fails. No grant is widened for this.
 */
const fs = require('fs');
const path = require('path');
const { readEnv } = require('./db/_db-env.cjs');
const { refFromEnv, assertProjectRef } = require('./db/gen-types.cjs');

const ROOT = path.resolve(__dirname, '..');
const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node scripts/types1-select-audit.cjs <file…>'); process.exit(2); }

const env = readEnv();
assertProjectRef(refFromEnv(env)); // couragelibrary-next only
const { PostgrestClient } = require('@supabase/postgrest-js');
const key = env('SUPABASE_SERVICE_ROLE_KEY');
const db = new PostgrestClient(`${env('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });

function extract(src) {
  const out = [];
  // .from("table")<whitespace / chained calls without parentheses noise>.select("…" | '…' | `…` without ${})
  const re = /\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)\s*\.select\(\s*(["'`])((?:(?!\2)[^\\]|\\.)*)\2/g;
  let m;
  while ((m = re.exec(src))) {
    const line = src.slice(0, m.index).split('\n').length;
    if (m[2] === '`' && m[3].includes('${')) { out.push({ table: m[1], select: null, line }); continue; }
    out.push({ table: m[1], select: m[3].replace(/\s+/g, ' ').trim(), line });
  }
  return out;
}

let studentDb = null;
async function asStudent() {
  if (!studentDb) {
    const { qaAccessToken, projectConfig } = require('./live/qa-session.cjs');
    const cfg = projectConfig();
    const token = await qaAccessToken('qa-student@courage-library.test');
    studentDb = new PostgrestClient(`${cfg.url}/rest/v1`, { headers: { apikey: cfg.anon, Authorization: `Bearer ${token}` } });
  }
  return studentDb;
}

(async () => {
  let bad = 0;
  let asAuthenticated = 0;
  let ok = 0;
  let skipped = 0;
  for (const f of files) {
    const rel = path.relative(ROOT, path.resolve(f)).replace(/\\/g, '/');
    for (const q of extract(fs.readFileSync(path.resolve(f), 'utf8'))) {
      if (q.select === null) { skipped++; continue; }
      let r;
      for (let i = 1; i <= 3; i++) {
        r = await db.from(q.table).select(q.select).limit(1);
        if (!r.error || r.error.code) break; // retry only network-level failures
      }
      if (r.error && r.error.code === '42501') {
        // service role has no SELECT by design (#54): verify the shape as the authenticated student instead
        const s2 = await (await asStudent()).from(q.table).select(q.select).limit(1);
        if (!s2.error) { asAuthenticated++; ok++; continue; }
        r = s2;
      }
      if (r.error) {
        bad++;
        console.log(`FAIL  ${rel}:${q.line}  ${q.table}  ${r.error.code || ''} ${String(r.error.message || '').slice(0, 160)}`);
      } else ok++;
    }
  }
  console.log(`\nselect audit: ${ok} ok, ${bad} failing, ${skipped} skipped (template)${asAuthenticated ? `; ${asAuthenticated} verified as authenticated (no service_role SELECT by design)` : ''}`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('AUDIT ERROR', String(e.message).slice(0, 200)); process.exit(1); });
