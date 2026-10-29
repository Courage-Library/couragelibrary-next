/**
 * QB-KEY-1 round 2 (architect-audited gate amendment): what an exam hub's syllabus section must show is decided by
 * the canonical read model, never pinned in a gate.
 *   AVAILABLE   → the section renders the syllabus: every PAPER and SECTION title of the read model (every root title
 *                 when the tree has no PAPER / SECTION) and NOT the "Syllabus coming soon" text
 *   NO_SYLLABUS → the section shows "Syllabus coming soon"
 *   anything else (UNAVAILABLE, error) → FAIL
 * The read model is read anonymously through PostgREST (rpc fn_exam_syllabus_read_model), exactly as the app reads it.
 * Prints titles and states only — never hosts or keys.
 */
const COMING_SOON = 'Syllabus coming soon';

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const norm = (s) => decode(s).replace(/\s+/g, ' ').trim();

/** the visible text of the hub's syllabus section (from id="syllabus" to its closing </section>) */
function syllabusSectionText(html) {
  const start = html.indexOf('id="syllabus"');
  if (start < 0) return null;
  const end = html.indexOf('</section>', start);
  const raw = html.slice(start, end > 0 ? end : undefined);
  return norm(raw.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' '));
}

/** anon read model for an exam slug via PostgREST (bounded: ≤ 3 attempts per request) */
async function readModelForSlug(env, slug) {
  const url = env('NEXT_PUBLIC_SUPABASE_URL');
  const key = env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const req = async (p, init) => {
    for (let i = 1; i <= 3; i++) {
      try {
        const r = await fetch(`${url}/rest/v1/${p}`, { ...init, headers, signal: AbortSignal.timeout(20000) });
        if (r.ok) return r.json();
        if (i === 3) throw new Error(`read model request failed (${r.status})`);
      } catch (e) {
        if (i === 3) throw new Error(`read model request failed (${e.code || (e.cause && e.cause.code) || e.name})`);
      }
    }
  };
  const exams = await req(`exams?slug=eq.${encodeURIComponent(slug)}&select=id`, { method: 'GET' });
  if (!Array.isArray(exams) || exams.length !== 1) throw new Error(`exam ${slug} not found`);
  return req('rpc/fn_exam_syllabus_read_model', { method: 'POST', body: JSON.stringify({ p_exam_id: exams[0].id }) });
}

/** the titles an AVAILABLE section must show */
function expectedTitles(rm) {
  const nodes = (rm && rm.nodes) || [];
  const groups = nodes.filter((n) => n.kind === 'PAPER' || n.kind === 'SECTION');
  const pick = groups.length ? groups : nodes.filter((n) => !n.parent_id);
  return [...new Set(pick.map((n) => norm(n.title)))];
}

/** checks a hub's HTML against the read model; returns { ok, detail } */
function checkSyllabusSection(html, rm) {
  const text = syllabusSectionText(html);
  if (text === null) return { ok: false, detail: 'no id="syllabus" section' };
  const state = rm && rm.state;
  if (state === 'AVAILABLE') {
    const titles = expectedTitles(rm);
    const missing = titles.filter((t) => !text.includes(t));
    const problems = [];
    if (!titles.length) problems.push('AVAILABLE read model has no nodes');
    if (missing.length) problems.push(`missing titles: ${missing.join(' | ')}`);
    if (text.includes(COMING_SOON)) problems.push(`"${COMING_SOON}" shown although the syllabus is AVAILABLE`);
    return { ok: problems.length === 0, detail: problems.length ? `AVAILABLE — ${problems.join('; ')}` : `AVAILABLE — ${titles.length} paper / section titles shown, no coming-soon` };
  }
  if (state === 'NO_SYLLABUS') {
    const ok = text.includes(COMING_SOON);
    return { ok, detail: ok ? `NO_SYLLABUS — "${COMING_SOON}"` : `NO_SYLLABUS — "${COMING_SOON}" missing` };
  }
  return { ok: false, detail: `read model state ${state || 'unknown'} (expected AVAILABLE or NO_SYLLABUS)` };
}

/**
 * GATE-SCOPE-SWEEP (2026-10-29): the exam hub is ISR (app/exams/[slug]/page.tsx revalidate = 60). When the owner publishes or
 * edits the syllabus during a run, the page may show the previous version for up to 60 s. On a mismatch this waits ONE
 * revalidate window (65 s), re-reads BOTH the page and the read model, and checks again — the page must then match.
 * `load()` returns { html, rm }. Returns the check result + `retried`.
 */
const REVALIDATE_WAIT_MS = 65000;
async function checkSyllabusFresh(load) {
  const first = await load();
  const a = checkSyllabusSection(first.html, first.rm);
  if (a.ok) return { ...a, retried: false };
  await new Promise((r) => setTimeout(r, REVALIDATE_WAIT_MS));
  const second = await load(); // the first request after the window triggers the regeneration; the next one sees it
  const again = await load();
  const b = checkSyllabusSection(again.html, again.rm || second.rm);
  return { ...b, detail: `${b.detail} (re-checked after the ${REVALIDATE_WAIT_MS / 1000} s revalidate window; first: ${a.detail})`, retried: true };
}

module.exports = { COMING_SOON, syllabusSectionText, readModelForSlug, expectedTitles, checkSyllabusSection, checkSyllabusFresh };
