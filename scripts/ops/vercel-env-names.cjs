#!/usr/bin/env node
/**
 * PAY-1 B7 (owner condition, 2026-11-19): a READ-ONLY, NAMES-ONLY check of the Vercel environment variables.
 *   production  must have NONE of the payment switches / keys (so production checkout stays closed and S1 is meaningful)
 *   preview     the B7 variables exist ONLY for the branch pay-b7-e2e (never all Previews, never Production);
 *               after B7: --after checks they are gone
 * It lists variable NAMES and their targets / branch only. Values are never requested to be decrypted, never kept,
 * never printed. The token, project and team come from .env.local (VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID —
 * the owner pastes them; a token the owner deletes after B7). Nothing is written anywhere.
 * Usage: node scripts/ops/vercel-env-names.cjs [--after]
 */
require('../db/safe-net.cjs'); // SAFE-NET
const fs = require('fs');
const path = require('path');

const AFTER = process.argv.includes('--after');
const B7_BRANCH = 'pay-b7-e2e';
const PAYMENT_NAMES = ['PAYMENTS_ENABLED', 'PRO_ENABLED', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_LIVE_APPROVED'];
const B7_NAMES = ['PAYMENTS_ENABLED', 'PRO_ENABLED', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'CRON_SECRET'];
const NEEDED_ON_PREVIEW = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SITE_URL'];

function envLocal(name) {
  if (process.env[name]) return process.env[name];
  const f = path.resolve(__dirname, '..', '..', '.env.local');
  if (!fs.existsSync(f)) return '';
  const m = fs.readFileSync(f, 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^"|"$/g, '') : '';
}

let ok = true;
const chk = (n, cond, info) => {
  if (!cond) ok = false;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${info ? ' — ' + info : ''}`);
};

(async () => {
  const token = envLocal('VERCEL_TOKEN');
  const project = envLocal('VERCEL_PROJECT_ID');
  const team = envLocal('VERCEL_TEAM_ID');
  if (!token || !project) {
    console.log('FAIL setup — VERCEL_TOKEN and VERCEL_PROJECT_ID must be in .env.local (owner step; names only are read)');
    process.exit(1);
  }
  const url = `https://api.vercel.com/v10/projects/${encodeURIComponent(project)}/env${team ? `?teamId=${encodeURIComponent(team)}` : ''}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) }).catch((e) => ({ ok: false, status: 0, err: e }));
  if (!res.ok) {
    console.log(`FAIL the Vercel API answered ${res.status || 'no response'} (check the token / project id; nothing was changed)`);
    process.exit(1);
  }
  const body = await res.json();
  // keep NAMES, targets and branch only — the value field is dropped here and never used
  const vars = (Array.isArray(body.envs) ? body.envs : []).map((e) => ({ key: String(e.key), target: Array.isArray(e.target) ? e.target : [e.target].filter(Boolean), branch: e.gitBranch || null }));
  const onProd = vars.filter((v) => v.target.includes('production')).map((v) => v.key);
  const badProd = PAYMENT_NAMES.filter((n) => onProd.includes(n));
  chk('E-1 production has NO payment switch or key', badProd.length === 0, badProd.length ? `present on production: ${badProd.join(', ')}` : `checked: ${PAYMENT_NAMES.join(', ')}`);
  const previewAll = vars.filter((v) => v.target.includes('preview') && !v.branch && B7_NAMES.includes(v.key)).map((v) => v.key);
  chk('E-2 no B7 variable is set for ALL Previews (branch-scoped only)', previewAll.length === 0, previewAll.length ? `all-Preview: ${previewAll.join(', ')}` : '');
  const onB7 = vars.filter((v) => v.target.includes('preview') && v.branch === B7_BRANCH).map((v) => v.key);
  if (!AFTER) {
    const missing = B7_NAMES.filter((n) => !onB7.includes(n));
    chk(`E-3 the B7 variables exist for the branch ${B7_BRANCH}`, missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : B7_NAMES.join(', '));
    const live = onB7.includes('RAZORPAY_LIVE_APPROVED') || onB7.includes('EMAIL_APP_ENABLED');
    chk('E-4 RAZORPAY_LIVE_APPROVED and EMAIL_APP_ENABLED are NOT set for the B7 branch', !live);
    const previewNames = new Set(vars.filter((v) => v.target.includes('preview') && (!v.branch || v.branch === B7_BRANCH)).map((v) => v.key));
    const noSb = NEEDED_ON_PREVIEW.filter((n) => !previewNames.has(n));
    const anyAnon = previewNames.has('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || previewNames.has('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    chk('E-5 the Preview has the Supabase / site variables the app needs', noSb.length === 0 && anyAnon, noSb.length || !anyAnon ? `missing: ${[...noSb, ...(anyAnon ? [] : ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or _ANON_KEY'])].join(', ')}` : '');
  } else {
    chk(`E-3 after B7: no B7 variable is left for the branch ${B7_BRANCH}`, onB7.filter((n) => B7_NAMES.includes(n)).length === 0, onB7.length ? `left: ${onB7.join(', ')}` : '');
  }
  console.log(ok ? 'VERCEL-ENV (names only): ALL PASS' : 'VERCEL-ENV (names only): FAILURES');
  process.exit(ok ? 0 : 1);
})();
