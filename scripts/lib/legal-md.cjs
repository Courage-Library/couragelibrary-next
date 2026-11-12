/**
 * LEGAL-PAGES-1: a parser for the ONE trusted file docs/legal/LEGAL_PAGES_v1.md (owner-approved legal text). It knows
 * only the subset that file uses: "## N. Title" pages, "### N.M Title" sections, paragraphs, "- " and "1. " lists,
 * pipe tables, the "**Last updated:** {{LAST_UPDATED}}" line and the Coins HTML comment. Inline markers (**bold**,
 * [text](url)) stay in the strings; the page renderer formats them. Anything else throws, so a new construct in a future
 * text version cannot be silently dropped.
 * Used by scripts/content/legal-pages-1-gen.cjs (writes content/legal/legal-pages.ts) and the verbatim gate
 * scripts/test_legal_pages1.cjs. Not a general markdown parser; no dependency.
 */
const COINS_COMMENT = '<!-- RENDER ONLY WHEN THE COINS FEATURE FLAG IS ON -->';
const LAST_UPDATED_LINE = '**Last updated:** {{LAST_UPDATED}}';

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const cells = (line) => {
  const t = line.trim();
  if (!t.startsWith('|') || !t.endsWith('|')) throw new Error(`LEGAL-MD: not a table row: ${line}`);
  return t.slice(1, -1).split('|').map((c) => c.trim());
};

/** → [{ number, title, intro: Block[], sections: [{ number, title, id, coins, blocks: Block[] }] }] */
function parseLegalMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const pages = [];
  let page = null;
  let section = null;
  let i = 0;
  const target = () => {
    if (!page) throw new Error(`LEGAL-MD: content before the first page at line ${i + 1}`);
    return section ? section.blocks : page.intro;
  };
  // the preamble (title, notes) before the first "## " page is not page text
  while (i < lines.length && !/^## /.test(lines[i])) i++;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (t === '' || t === '---') {
      i++;
      continue;
    }
    let m;
    if ((m = /^## (\d+)\. (.+)$/.exec(t))) {
      page = { number: m[1], title: m[2], intro: [], sections: [], lastUpdated: false };
      section = null;
      pages.push(page);
      i++;
      continue;
    }
    if ((m = /^### (\d+\.\d+) (.+)$/.exec(t))) {
      section = { number: m[1], title: m[2], id: slug(m[2]), coins: false, blocks: [] };
      page.sections.push(section);
      i++;
      continue;
    }
    if (t === COINS_COMMENT) {
      if (!section) throw new Error('LEGAL-MD: Coins marker outside a section');
      section.coins = true;
      i++;
      continue;
    }
    if (t === LAST_UPDATED_LINE) {
      if (section || page.intro.length) throw new Error('LEGAL-MD: "Last updated" must open its page');
      page.lastUpdated = true;
      i++;
      continue;
    }
    if (t.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      if (rows.length < 2 || !rows[1].every((c) => /^-+$/.test(c))) throw new Error(`LEGAL-MD: table without a separator row near line ${i}`);
      const head = rows[0];
      target().push({ type: 'table', head: head.every((c) => c === '') ? null : head, rows: rows.slice(2) });
      continue;
    }
    if (/^- /.test(t)) {
      const items = [];
      while (i < lines.length && /^- /.test(lines[i].trim())) items.push(lines[i++].trim().slice(2));
      target().push({ type: 'ul', items });
      continue;
    }
    if (/^\d+\. /.test(t)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i].trim())) items.push(lines[i++].trim().replace(/^\d+\. /, ''));
      target().push({ type: 'ol', items });
      continue;
    }
    if (/^(#|<|>|```)/.test(t)) throw new Error(`LEGAL-MD: unsupported construct at line ${i + 1}: ${t.slice(0, 40)}`);
    target().push({ type: 'p', text: t });
    i++;
  }
  return pages;
}

/** Inline markers → plain text, as a reader sees it: "**x**" → "x", "[x](url)" → "x". */
const plainInline = (s) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1');

/** Every text unit of one page (paragraphs, list items, table cells), inline markers removed. */
function pageTexts(page, { coins }) {
  const out = [];
  const add = (blocks) => {
    for (const b of blocks) {
      if (b.type === 'p') out.push(plainInline(b.text));
      else if (b.type === 'ul' || b.type === 'ol') out.push(...b.items.map(plainInline));
      else if (b.type === 'table') out.push(...[...(b.head || []), ...b.rows.flat()].filter((c) => c !== '').map(plainInline));
    }
  };
  add(page.intro);
  for (const s of page.sections) if (coins || !s.coins) add(s.blocks);
  return out;
}

module.exports = { parseLegalMarkdown, pageTexts, plainInline, slug, COINS_COMMENT };
