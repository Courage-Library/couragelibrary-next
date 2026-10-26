#!/usr/bin/env node
/**
 * COINS-FREEZE (architect, 2026-10-26) — offline gate. No new coin awards from ANY path until F10.
 *   CF-01 flag COINS_ENABLED: on only for exactly "true" (default off)
 *   CF-02 app: the mock-completion reward returns 0 coins BEFORE the reward RPC while off (streak / badge still recorded)
 *   CF-03 app: live-test reward distribution and the ledger credit return before any RPC / wallet / ledger write
 *   CF-04 database (migration 112): the reward RPC returns frozen before any write; the accepted-answer and upvote
 *         rewards are removed; no notification promises coins
 *   CF-05 nothing deletes or rewrites existing coin rows (no DELETE / balance reset anywhere in the freeze)
 * Run: node scripts/test_coins_freeze.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 600)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  module._compile(out.outputText, filename);
};

test('CF-01 COINS_ENABLED: on only for exactly "true" (default off)', () => {
  const F = require(path.join(ROOT, 'lib/coins/flag.ts'));
  assert(F.isCoinsEnabled({}) === false && F.isCoinsEnabled({ COINS_ENABLED: '1' }) === false && F.isCoinsEnabled({ COINS_ENABLED: 'TRUE' }) === false && F.isCoinsEnabled({ COINS_ENABLED: 'true' }) === true);
});

test('CF-02 mock completion: 0 coins before the reward RPC while off', () => {
  const s = read('services/gamification.service.ts');
  const fn = s.slice(s.indexOf('static async awardMockCompletionReward('), s.indexOf('static async getStudentWallet('));
  const guard = fn.indexOf('if (!isCoinsEnabled()) {');
  const rpc = fn.indexOf('adminSb.rpc("fn_award_gamification_reward"');
  assert(guard > 0 && rpc > guard, 'guard before the RPC');
  const blk = fn.slice(guard, fn.indexOf('}\n', fn.indexOf('totalCoinsEarned: 0,', guard)));
  assert(/completionCoins: 0,/.test(blk) && /accuracyBonusCoins: 0,/.test(blk) && /streakCoins: 0,/.test(blk) && /totalCoinsEarned: 0,/.test(blk), 'zero coins returned');
});

test('CF-03 live-test rewards + ledger credit stop before any write', () => {
  const s = read('services/live-test-reward.service.ts');
  const d = s.slice(s.indexOf('static async distributeLiveEventRewards('));
  assert(d.indexOf('if (!isCoinsEnabled()) return') < d.indexOf('adminSb.rpc('), 'distribution');
  const c = s.slice(s.indexOf('private static async creditCoins('));
  assert(c.indexOf('if (!isCoinsEnabled()) return { ledgerId: null };') < c.indexOf('.from("coin_wallets")'), 'creditCoins');
});

test('CF-04 migration 112: reward RPC frozen before any write; discussion rewards removed; no coin promise', () => {
  const MIG = 'supabase/migrations/20261026000112_coins_freeze.sql';
  if (!fs.existsSync(path.join(ROOT, MIG))) return 'SKIP — 112 not in this tree';
  const sql = read(MIG);
  const parts = sql.split(/\n\n(?=CREATE OR REPLACE FUNCTION )/);
  const aw = parts.find((p) => p.includes('FUNCTION public.fn_award_gamification_reward('));
  assert(aw.indexOf("RETURN jsonb_build_object('success', true, 'coins_awarded', 0, 'frozen', true);") < aw.indexOf('INSERT INTO public.gamification_events'), 'frozen before writes');
  for (const f of ['fn_mark_accepted_answer', 'fn_vote_discussion_message']) {
    const p = parts.find((x) => x.includes(`FUNCTION public.${f}(`));
    assert(p && !/INSERT INTO public\.gamification_events/.test(p) && !/'REWARDED'/.test(p), `${f} still awards`);
  }
  assert(!/coins bonus/i.test(sql.replace(/^--.*$/gm, '')), 'a notification still promises coins');
});

test('CF-05 the freeze never deletes or resets existing coin data', () => {
  const sqlPath = 'supabase/migrations/20261026000112_coins_freeze.sql';
  const sql = fs.existsSync(path.join(ROOT, sqlPath)) ? read(sqlPath) : '';
  const code = [read('lib/coins/flag.ts'), sql].join('\n');
  assert(!/DELETE FROM public\.(coin_ledger|coin_wallets|gamification_events)|TRUNCATE|current_balance\s*=\s*0/i.test(code), 'deletes / resets');
});

console.log(`\nCOINS-FREEZE: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
