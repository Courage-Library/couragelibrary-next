/**
 * Waits until a deployment serves the given commit: polls <baseUrl>/api/health until `version` equals the first
 * 7 characters of <sha> (TYPES-1 B6: /api/health exposes the deployed short SHA). Read-only GETs.
 *
 * Usage: node scripts/smoke/wait-for-deploy.cjs <baseUrl> <sha> [timeoutSeconds=900]
 * Exit 0 when the version matches, 1 on timeout.
 */
const [, , BASE_ARG, SHA_ARG, TIMEOUT_ARG] = process.argv;
if (!BASE_ARG || !SHA_ARG) { console.error('usage: node scripts/smoke/wait-for-deploy.cjs <baseUrl> <sha> [timeoutSeconds]'); process.exit(2); }
const base = BASE_ARG.replace(/\/$/, '');
const want = SHA_ARG.slice(0, 7).toLowerCase();
const deadline = Date.now() + Number(TIMEOUT_ARG || 900) * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let last = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/api/health`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      last = j.version || '(none)';
      if (last === want) { console.log(`deployed: ${want} (${r.status})`); process.exit(0); }
    } catch { last = '(unreachable)'; }
    await sleep(15000);
  }
  console.log(`timeout: wanted ${want}, last seen ${last}`);
  process.exit(1);
})();
