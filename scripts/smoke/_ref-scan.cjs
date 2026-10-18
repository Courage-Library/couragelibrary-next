/**
 * GATE-HYGIENE-1: project-ref leak scan for the anonymous smoke. The ref is never printed: candidate tokens (every
 * 20-character window of each [a-z0-9]{20,} run) are sha256-compared with the ref's hash.
 * Rule (architect): a check that passes having scanned 0 items is a defect — scanRef() reports what it scanned and
 * the caller must assert minimum coverage (≥ 1 HTML document, ≥ 1 same-origin JS chunk, ≥ 1 candidate token).
 */
const crypto = require('crypto');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** sources: [{ name, text }] → { sources, tokens, hits: [source names containing the ref] } */
function scanRef(sources, refHash) {
  let tokens = 0;
  const hits = [];
  for (const { name, text } of sources) {
    const seen = new Set();
    for (const run of text.match(/[a-z0-9]{20,}/g) || []) for (let i = 0; i + 20 <= run.length; i++) seen.add(run.slice(i, i + 20));
    tokens += seen.size;
    if ([...seen].some((t) => sha(t) === refHash)) hits.push(name);
  }
  return { sources: sources.length, tokens, hits };
}

/** same-origin JS chunk paths a page loads: <script src> plus chunk paths referenced in the inline RSC payload */
function chunkPaths(html) {
  const out = new Set();
  for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?#]+\.js)(?:\?[^"]*)?"/g)) out.add(m[1]);
  for (const m of html.matchAll(/\\?"(\/_next\/static\/chunks\/[^"\\?#]+\.js)/g)) out.add(m[1]);
  for (const m of html.matchAll(/"(static\/chunks\/[^"\\?#]+\.js)/g)) out.add('/_next/' + m[1]);
  return [...out];
}

/** offline self-test: a planted ref is caught; a clean page passes; empty input reports 0 coverage */
function selfTest() {
  const fakeRef = 'abcdefghijklmnopqrst';
  const h = sha(fakeRef);
  const planted = scanRef([{ name: 'page.html', text: '<html>ok</html>' }, { name: 'chunk.js', text: `var u="https://${fakeRef}.supabase.co";` }], h);
  const clean = scanRef([{ name: 'page.html', text: '<html>buildidzzzzzzzzzzzzzzzzzzz</html>' }, { name: 'chunk.js', text: 'var x="0123456789abcdefghij0";' }], h);
  const empty = scanRef([], h);
  const paths = chunkPaths('<script src="/_next/static/chunks/main-abc.js" async></script><script>self.__next_f.push([1,"1:I[\\"/_next/static/chunks/app/page-def.js\\"]"])</script>');
  const results = [
    ['planted ref in a chunk is caught', planted.hits.length === 1 && planted.hits[0] === 'chunk.js'],
    ['clean sources pass with tokens counted', clean.hits.length === 0 && clean.tokens > 0 && clean.sources === 2],
    ['empty input reports 0 sources / 0 tokens (caller must FAIL on it)', empty.sources === 0 && empty.tokens === 0],
    ['chunk paths found in <script src> and the RSC payload', paths.includes('/_next/static/chunks/main-abc.js') && paths.includes('/_next/static/chunks/app/page-def.js')],
  ];
  for (const [n, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  self-test: ${n}`);
  return results.every(([, ok]) => ok);
}

module.exports = { scanRef, chunkPaths, selfTest, sha };
