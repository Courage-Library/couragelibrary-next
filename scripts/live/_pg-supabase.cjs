/**
 * GATE-SCOPE-SWEEP (2026-10-29) — a READ-ONLY stand-in for the few supabase-js query-builder calls a lib reader makes,
 * answered by the gate's OWN pg connection, so a reader sees the fixtures the gate built inside its rolled-back
 * transaction (an HTTP client cannot). Supported: from(table).select(cols).eq(col, v).in(col, list).limit(n)
 * [.maybeSingle()], awaited → { data, error }. A select column `child_table(col)` is a one-level embed of the child rows
 * whose FK points at this row (`<child>.<singular parent>_id` = id, e.g. exam_syllabus_canonical_mappings.syllabus_node_id
 * for exam_syllabus_nodes). Identifiers are checked against a strict pattern; values are always parameters.
 */
const IDENT = /^[a-z_][a-z0-9_]*$/;
const id = (x) => { if (!IDENT.test(x)) throw new Error(`pg-supabase: bad identifier ${x}`); return x; };
const EMBED_FK = { exam_syllabus_nodes: { exam_syllabus_canonical_mappings: 'syllabus_node_id' } };

function pgSupabase(client) {
  const from = (table) => {
    const st = { table: id(table), cols: '*', where: [], params: [], limit: null, single: false, embeds: [] };
    const b = {
      select(cols) {
        const plain = [];
        for (const raw of String(cols).split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean)) {
          const m = raw.match(/^([a-z_][a-z0-9_]*)\(([^)]*)\)$/);
          if (m) {
            const fk = (EMBED_FK[st.table] || {})[m[1]];
            if (!fk) throw new Error(`pg-supabase: unsupported embed ${st.table} → ${m[1]}`);
            st.embeds.push({ table: id(m[1]), fk, cols: m[2].split(',').map((x) => id(x.trim())) });
          } else plain.push(id(raw));
        }
        if (st.embeds.length && !plain.includes('id')) plain.push('id');
        st.cols = plain.join(', ');
        return b;
      },
      eq(col, v) { st.params.push(v); st.where.push(`${id(col)} = $${st.params.length}`); return b; },
      in(col, list) { st.params.push(list); st.where.push(`${id(col)} = any($${st.params.length})`); return b; },
      limit(n) { st.limit = Number(n); return b; },
      maybeSingle() { st.single = true; return b; },
      then(res, rej) { return run().then(res, rej); },
    };
    const run = async () => {
      try {
        const sql = `select ${st.cols} from public.${st.table}${st.where.length ? ' where ' + st.where.join(' and ') : ''}${st.limit ? ` limit ${st.limit}` : ''}`;
        const rows = (await client.query(sql, st.params)).rows;
        for (const e of st.embeds) {
          const kids = rows.length ? (await client.query(`select ${e.fk}, ${e.cols.join(', ')} from public.${e.table} where ${e.fk} = any($1)`, [rows.map((r) => r.id)])).rows : [];
          for (const r of rows) r[e.table] = kids.filter((k) => k[e.fk] === r.id).map((k) => Object.fromEntries(e.cols.map((c) => [c, k[c]])));
        }
        if (st.single) return { data: rows[0] ?? null, error: rows.length > 1 ? { message: 'more than one row' } : null };
        return { data: rows, error: null };
      } catch (e) {
        return { data: null, error: { message: String(e.message) } };
      }
    };
    return b;
  };
  return { from };
}

module.exports = { pgSupabase };
