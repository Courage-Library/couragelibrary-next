#!/usr/bin/env node
/**
 * PAY-1 B3 part 1 — EXECUTED proof for migration 147 (owner decisions 2026-11-15). ONE transaction, always rolled back.
 * Codes / counts only; no content, ids or e-mails printed. The free student is SYNTHETIC (created in the transaction).
 *   B3-S seeds: MISTAKE_VAULT FREE (unless an admin changed it), MISTAKE_DRILLS PRO
 *   B3-M fn_access_allowed_many answers exactly what fn_access_allowed answers, key by key, in every state (switch off /
 *        on × anon / free student / FREE / PRO / unknown keys); > 500 keys refused; DEFINER, search_path "", anon EXECUTE
 *   B3-P catalog: p_threads_read_public and p_fcards_select call fn_access_allowed and read no user_entitlements; no
 *        search_indexes read policy is left
 *   B3-F flashcards as the free student: a PRO curated deck's card 4+ → hidden with the paywall ON and FLASHCARDS = PRO;
 *        visible with the switch OFF or FLASHCARDS = FREE (the central check decides, both in the policy and in
 *        fn_submit_flashcard_review)
 *   B3-B battles: asking for a PRO arena → refused ("not available"); joining a PRO room → refused; FREE unaffected
 * Run: node scripts/live/test_pay1_b3.cjs [--pre]                 (project DB; --pre applies 147 in the transaction)
 *      node scripts/live/test_pay1_b3.cjs --local=54329 [--pre]   (local copy)
 */
require('../db/safe-net.cjs'); // SAFE-NET
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { pgClient } = require(path.join(ROOT, 'scripts/db/safe-net.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const LOCAL = (process.argv.find((a) => a.startsWith('--local=')) || '').slice('--local='.length);
const SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261116000147_pay1_b3_central_checks.sql'), 'utf8');
const ACTOR = 'pay1-b3@courage-library.test';

let ok = true;
const chk = (n, cond, info) => {
  if (!cond) ok = false;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + String(info ?? '').slice(0, 600)}`);
};
const skip = (n, why) => console.log(`SKIP ${n} — ${why}`);
function client() {
  if (!LOCAL) return pgClient();
  if (!/^\d{4,5}$/.test(LOCAL)) throw new Error('--local=<port>');
  const c = new Client({ host: '127.0.0.1', port: Number(LOCAL), user: 'postgres', database: 'postgres' });
  c.on('error', () => {});
  return c;
}

(async () => {
  const c = client();
  await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  const one = async (s, p) => (await q(s, p))[0];
  let sp = 0;
  const as = async (role, claims, s, p) => {
    const n = `s${++sp}`;
    await c.query(`SAVEPOINT ${n}`);
    try {
      await c.query(`SET LOCAL ROLE ${role}`);
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      const r = await c.query(s, p);
      await c.query('RESET ROLE');
      await c.query(`RELEASE SAVEPOINT ${n}`);
      return { code: null, rows: r.rows };
    } catch (e) {
      await c.query(`ROLLBACK TO SAVEPOINT ${n}`);
      await c.query('RESET ROLE');
      return { code: e.code || 'ERR', msg: String(e.message || ''), rows: [] };
    }
  };
  const switchTo = (on) => q(`select public.fn_paywall_set($1, null, $2)`, [on, ACTOR]);
  const setTier = (kind, key, tier) => q(`select public.fn_access_policy_set($1, $2, $3, null, $4)`, [kind, key, tier, ACTOR]);
  try {
    await withLiveTransaction(c, async () => {
      if (PRE) await c.query(SQL);
      const sid = (await one(`insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'pay1-b3-' || substr(md5(random()::text), 1, 8) || '@courage-library.test', 'authenticated', 'authenticated') returning id::text id`)).id;
      const STUDENT = ['authenticated', { sub: sid, role: 'authenticated' }];
      const ANON = ['anon', { role: 'anon' }];

      // ---------- B3-S seeds
      const seeds = await q(`select item_key k, tier, updated_by is null untouched from public.access_policies where item_kind = 'FEATURE' and item_key in ('MISTAKE_VAULT', 'MISTAKE_DRILLS')`);
      const by = Object.fromEntries(seeds.map((r) => [r.k, r]));
      chk('B3-S seeds: MISTAKE_DRILLS PRO; MISTAKE_VAULT FREE (or left as an admin set it)',
        by.MISTAKE_DRILLS?.tier === 'PRO' && (by.MISTAKE_VAULT?.tier === 'FREE' || by.MISTAKE_VAULT?.untouched === false), JSON.stringify(by));

      // ---------- B3-M the batched check equals the single check, key by key, in every state
      const keys = ['ADVANCED_ANALYTICS', 'MISTAKE_VAULT', 'MISTAKE_DRILLS', 'MEMORY_LOCK', 'FLASHCARDS', 'NO_SUCH_FEATURE_B3'];
      const diffs = [];
      for (const on of [false, true]) {
        await switchTo(on);
        for (const [label, who] of [['anon', ANON], ['student', STUDENT]]) {
          const many = await as(...who, `select item_key k, tier, allowed from public.fn_access_allowed_many('FEATURE', $1::text[])`, [keys]);
          if (many.code) { diffs.push(`${label}/${on}: ${many.code}`); continue; }
          for (const k of keys) {
            const single = await as(...who, `select public.fn_access_allowed('FEATURE', $1) a, public.fn_access_tier('FEATURE', $1) t`, [k]);
            const m = many.rows.find((r) => r.k === k);
            if (!m || m.allowed !== single.rows[0].a || m.tier !== single.rows[0].t) diffs.push(`${label}/switch ${on}/${k}: many ${m && `${m.tier}:${m.allowed}`} ≠ single ${single.rows[0].t}:${single.rows[0].a}`);
          }
        }
      }
      await switchTo(false);
      const big = await as(...ANON, `select count(*) from public.fn_access_allowed_many('FEATURE', array(select 'K' || g from generate_series(1, 501) g))`);
      const cat = await one(`select p.prosecdef d, p.provolatile v, p.proconfig cfg, has_function_privilege('anon', p.oid, 'EXECUTE') a
            from pg_proc p where p.oid = to_regprocedure('public.fn_access_allowed_many(text, text[])')`);
      chk('B3-M fn_access_allowed_many = fn_access_allowed key by key (switch off / on × anon / free student; FREE / PRO / unknown keys); 501 keys refused; DEFINER, STABLE, search_path "", anon EXECUTE',
        diffs.length === 0 && big.code === '22023' && cat && cat.d && cat.v === 's' && (cat.cfg || []).includes('search_path=""') && cat.a, JSON.stringify({ diffs: diffs.slice(0, 4), big: big.code, cat }));

      // ---------- B3-P catalog
      const pol = await q(`select tablename t, policyname n, coalesce(qual, '') e from pg_policies where schemaname = 'public'
            and ((tablename = 'discussion_threads' and policyname = 'p_threads_read_public') or (tablename = 'flashcards' and policyname = 'p_fcards_select'))`);
      const search = await q(`select policyname from pg_policies where schemaname = 'public' and tablename = 'search_indexes' and cmd = 'SELECT'
            and policyname in ('p_search_indexes_read_public', 'p_search_indexes_read_auth')`);
      chk('B3-P the thread and flashcard read policies call fn_access_allowed and read no user_entitlements; the two search_indexes read policies are gone',
        pol.length === 2 && pol.every((p) => /fn_access_allowed\(/.test(p.e) && !/user_entitlements/.test(p.e)) && search.length === 0, JSON.stringify({ pol: pol.map((p) => p.n), search: search.length }));

      // ---------- B3-F flashcards (a PRO curated deck with ≥ 4 cards; local: synthetic)
      // a SYNTHETIC published, curated PRO deck with one card beyond the free preview (created in this rolled-back tx)
      let deck = null;
      const d = await as('postgres', {}, `insert into public.flashcard_decks (slug, title_en, is_published, is_curated, access_tier)
            values ('pay1-b3-deck-' || substr(md5(random()::text), 1, 8), 'B3 gate deck', true, true, 'PRO') returning id::text id`);
      if (!d.code) {
        const card = await as('postgres', {}, `insert into public.flashcards (deck_id, front_markdown_en, back_markdown_en, card_order, is_active)
              values ($1, 'front', 'back', 9, true) returning id::text id`, [d.rows[0].id]);
        if (!card.code) deck = { id: d.rows[0].id, card: card.rows[0].id };
        else console.log(`  note: card fixture ${card.code}`);
      } else console.log(`  note: deck fixture ${d.code}`);
      if (!deck || !deck.card) (LOCAL ? skip : (n, w) => chk(n, false, w))('B3-F flashcards', 'no flashcard deck with a card in this database');
      else {
        // clients read no flashcard rows directly (no SELECT on flashcard_decks: the app reads them on the server); the
        // review RPC (DEFINER) is the client path, and it follows the central check
        const direct = await as(...STUDENT, `select count(*)::int n from public.flashcards where id = $1`, [deck.card]);
        const review = async () => { const r = await as(...STUDENT, `select public.fn_submit_flashcard_review($1, 4) r`, [deck.card]); return r.code ? `ERR ${r.code}` : (r.rows[0].r && r.rows[0].r.success === false ? `REFUSED ${String(r.rows[0].r.error).slice(0, 40)}` : 'OK'); };
        await setTier('FEATURE', 'FLASHCARDS', 'PRO');
        await switchTo(true);
        const onPro = await review();
        await setTier('FEATURE', 'FLASHCARDS', 'FREE');
        const onFree = await review();
        await setTier('FEATURE', 'FLASHCARDS', 'PRO');
        await switchTo(false);
        const off = await review();
        const gated = (r) => /REFUSED PRO/.test(r);
        chk('B3-F flashcards: no direct client read of cards (42501); reviewing a PRO deck\'s card 4+ as the free student → refused with the switch ON and FLASHCARDS = PRO; NOT refused for Pro with FLASHCARDS = FREE or the switch OFF',
          direct.code === '42501' && gated(onPro) && !gated(onFree) && !gated(off), JSON.stringify({ direct: direct.code, onPro, onFree, off }));
      }

      // ---------- B3-B battles
      const arena = await as(...STUDENT, `select public.fn_find_or_create_battle_room(null::uuid, false, 'PRO') r`);
      const free = await as(...STUDENT, `select public.fn_find_or_create_battle_room(null::uuid, true, 'FREE') r`);
      let joinPro = { code: 'SKIP' };
      const room = await one(`select id::text id, room_code from public.quiz_battle_rooms limit 1`);
      if (room) {
        await q(`update public.quiz_battle_rooms set access_tier = 'PRO', status = 'WAITING' where id = $1`, [room.id]);
        joinPro = await as(...STUDENT, `select public.fn_join_battle_by_code($1) r`, [room.room_code]);
      } else if (free.rows[0]?.r?.room_code) {
        await q(`update public.quiz_battle_rooms set access_tier = 'PRO' where room_code = $1`, [free.rows[0].r.room_code]);
        joinPro = await as(...STUDENT, `select public.fn_join_battle_by_code($1) r`, [free.rows[0].r.room_code]);
      }
      const refused = (r) => r.code === null && r.rows[0]?.r?.success === false && /not available/.test(r.rows[0].r.error || '');
      // a FREE arena opens on the project DB; the local copy has no questions, so there it only must NOT be refused by
      // the PRO rule ("not available")
      const freeOk = free.code === null && (free.rows[0]?.r?.success !== false || (!!LOCAL && !/not available/.test(free.rows[0]?.r?.error || '')));
      chk('B3-B battles: a PRO arena / a PRO room → refused ("not available"); a FREE private arena still opens',
        refused(arena) && (joinPro.code === 'SKIP' ? !!LOCAL : refused(joinPro)) && freeOk,
        JSON.stringify({ arena: arena.code || arena.rows[0]?.r, join: joinPro.code || joinPro.rows?.[0]?.r, free: free.code || free.rows[0]?.r?.success }));
    });
  } catch (e) {
    ok = false;
    console.log(`FAIL — ${String(e && e.message ? e.message : e).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(`PAY-1 B3 (147) live${LOCAL ? ' [LOCAL]' : ''}: ${ok ? 'ALL PASS' : 'FAILURES'}`);
  process.exitCode = ok ? 0 : 1;
})();
