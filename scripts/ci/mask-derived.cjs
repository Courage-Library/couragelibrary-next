/**
 * CI-1 Stage 2 — mask values DERIVED from secrets (architect-approved). GitHub masks secret values automatically, but not
 * values computed from them: the project ref, the DB host / user / password, the pooler host. This emits one
 * `::add-mask::<value>` workflow command per derived value (GitHub consumes the command; the value is masked in every
 * later log line). It prints nothing else.
 * Outside GitHub Actions (GITHUB_ACTIONS !== 'true') it prints only a count — never a value.
 * Usage: node scripts/ci/mask-derived.cjs            node scripts/ci/mask-derived.cjs --self-test
 */
function derivedValues(env = process.env) {
  const out = new Set();
  try {
    const u = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
    out.add(u.hostname);
    out.add(u.hostname.split('.')[0]); // project ref
  } catch { /* not set */ }
  try {
    const u = new URL(env.POSTGRES_URL_NON_POOLING);
    for (const v of [u.hostname, decodeURIComponent(u.username), decodeURIComponent(u.password), u.hostname.split('.')[0]]) out.add(v);
    const user = decodeURIComponent(u.username);
    if (user.includes('.')) out.add(user.split('.').pop()); // pooler user "postgres.<ref>" → ref
  } catch { /* not set */ }
  return [...out].filter((v) => v && v.length >= 6);
}

function emit(env = process.env, write = (s) => process.stdout.write(s)) {
  const values = derivedValues(env);
  if (env.GITHUB_ACTIONS !== 'true') { write(`mask-derived: ${values.length} derived value(s) (not printed outside GitHub Actions)\n`); return values.length; }
  for (const v of values) write(`::add-mask::${v}\n`);
  return values.length;
}

function selfTest() {
  const fake = { NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', POSTGRES_URL_NON_POOLING: 'postgresql://postgres.abcdefghijklmnopqrst:fakepass987@aws-0-xx.pooler.example.net:6543/postgres' };
  const results = [];
  let out = '';
  const n1 = emit({ ...fake }, (s) => { out += s; });
  results.push(['outside GitHub Actions: count only, no value printed', n1 > 0 && !out.includes('abcdefghijklmnopqrst') && !out.includes('fakepass987') && !out.includes('::add-mask::')]);
  out = '';
  emit({ ...fake, GITHUB_ACTIONS: 'true' }, (s) => { out += s; });
  const lines = out.trim().split('\n');
  results.push(['on GitHub Actions: only ::add-mask:: lines', lines.length > 0 && lines.every((l) => l.startsWith('::add-mask::'))]);
  for (const v of ['abcdefghijklmnopqrst', 'abcdefghijklmnopqrst.supabase.co', 'fakepass987', 'aws-0-xx.pooler.example.net', 'postgres.abcdefghijklmnopqrst']) results.push([`masks ${v.replace(/fakepass987/, 'the DB password')}`, lines.includes(`::add-mask::${v}`)]);
  out = '';
  results.push(['no secrets set → nothing to mask', emit({ GITHUB_ACTIONS: 'true' }, (s) => { out += s; }) === 0 && out === '']);
  for (const [n, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  self-test: ${n}`);
  return results.every(([, ok]) => ok);
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
  emit();
}

module.exports = { derivedValues, emit, selfTest };
