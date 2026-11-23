#!/usr/bin/env node
/**
 * DEPLOY-GATE-1 — is this push docs-only? (owner: the workflow runs on EVERY push and finishes fast on docs-only
 * commits, so the checks Vercel waits for always report.) Same rule as the old `push.paths` filter (CI-1): a file under
 * docs/** or any *.md is docs — EXCEPT under scripts/**, app/**, lib/**, services/**, components/**, supabase/**,
 * package*.json and .github/**, which are always code.
 * Reads the push event ($GITHUB_EVENT_PATH: commits[].added / modified / removed). Fails SAFE: not a push, no commit
 * list, 20+ commits (GitHub truncates the list), or no file lists → code=true (run everything).
 * Output: code=true|false appended to $GITHUB_OUTPUT.
 * Usage: node scripts/ci/change-scope.cjs     node scripts/ci/change-scope.cjs --self-test
 */
const fs = require('fs');

const ALWAYS_CODE = [/^scripts\//, /^app\//, /^lib\//, /^services\//, /^components\//, /^supabase\//, /^package[^/]*\.json$/, /^\.github\//];
const isDocs = (f) => !ALWAYS_CODE.some((r) => r.test(f)) && (/^docs\//.test(f) || /\.md$/i.test(f));

/** Pure: true = run the gates (code changed, or not knowable) · false = docs-only */
function scope(eventName, event) {
  if (eventName !== 'push') return true;
  const commits = (event && event.commits) || [];
  if (commits.length === 0 || commits.length >= 20) return true;
  const files = [];
  for (const c of commits) {
    if (!Array.isArray(c.added) || !Array.isArray(c.modified) || !Array.isArray(c.removed)) return true;
    files.push(...c.added, ...c.modified, ...c.removed);
  }
  if (files.length === 0) return true;
  return !files.every(isDocs);
}

function selfTest() {
  const c = (...files) => ({ added: [], modified: files, removed: [] });
  const cases = [
    ['docs only → false', 'push', { commits: [c('docs/ops/BACKLOG.md', 'README.md')] }, false],
    ['a .md under scripts → code', 'push', { commits: [c('scripts/README.md')] }, true],
    ['a .md under app → code', 'push', { commits: [c('docs/x.md', 'app/page.md')] }, true],
    ['package.json → code', 'push', { commits: [c('package.json')] }, true],
    ['workflow → code', 'push', { commits: [c('.github/workflows/ci-gates.yml')] }, true],
    ['an image under docs → docs', 'push', { commits: [c('docs/design/screens/a.jpg')] }, false],
    ['next.config.ts → code', 'push', { commits: [c('docs/a.md'), c('next.config.ts')] }, true],
    ['schedule → code', 'schedule', {}, true],
    ['dispatch → code', 'workflow_dispatch', {}, true],
    ['no commit list → code', 'push', { commits: [] }, true],
    ['20 commits (truncated) → code', 'push', { commits: Array.from({ length: 20 }, () => c('docs/a.md')) }, true],
    ['missing file lists → code', 'push', { commits: [{ modified: ['docs/a.md'] }] }, true],
    ['no files at all → code', 'push', { commits: [c()] }, true],
  ];
  let bad = 0;
  for (const [name, ev, payload, want] of cases) {
    const got = scope(ev, payload);
    if (got !== want) bad++;
    console.log(`${got === want ? 'PASS' : 'FAIL'}  change-scope self-test: ${name}`);
  }
  console.log(`change-scope self-test: ${cases.length - bad}/${cases.length} passed`);
  return bad === 0;
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
  let event = {};
  try {
    event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  } catch {
    event = {};
  }
  const code = scope(process.env.GITHUB_EVENT_NAME, event);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `code=${code}\n`);
  console.log(code ? 'scope: code — run every gate' : 'scope: docs-only — the gates finish at once (checks still report)');
}
module.exports = { scope, isDocs, selfTest };
