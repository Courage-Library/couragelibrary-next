#!/usr/bin/env node
/**
 * MAP-REVIEW-1 (architect 2026-10-27): the CONTENT-IMPORT-1 rows whose legacy topic has NO exact canonical topic →
 * docs/content/MAP_REVIEW_1.csv for the OWNER to confirm. Never auto-maps: it only SUGGESTS up to 3 canonical topics
 * (slugs that exist under the row's subject) per legacy topic, with the reason. Row refs only (file#line) — no question
 * text (public repo). Offline: reads the dry-run report JSON (outside the repo) + the topic map.
 * Run: node scripts/content/map-review-1.cjs --report=<report-*.json>
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const report = (process.argv.find((a) => a.startsWith('--report=')) || '').slice(9);
if (!report) throw new Error('--report=<dry-run report json> is required');
const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'content-import-1.topic-map.json'), 'utf8'));

// suggestions per legacy topic: canonical slugs under the SAME subject, nearest first, + why (a human confirms)
const SUGGEST = {
  'English.csv': {
    Comprehension: [['english-comprehension-general'], 'reading-comprehension passages: no "Comprehension" topic yet; the subject\'s general bucket is the only fit'],
  },
  'GA.csv': {
    'Awards & Honours': [['general-awareness-general', 'sports'], 'no awards topic; most items are general awareness, some are sports awards'],
    'Current Affairs': [['general-awareness-general', 'economy', 'polity'], '2025 current affairs (dated content): no current-affairs topic; stale items may be better rejected than mapped'],
    'Books & Authors': [['general-awareness-general', 'history'], 'no books / authors topic; nearest are the general bucket or history'],
  },
  'QA.csv': {
    Simplification: [['quantitative-aptitude-general', 'number-system', 'percentage'], 'no simplification topic; BODMAS / approximation sits closest to number system'],
  },
  'Reasoning.csv': {
    'Seating Arrangement': [['general-intelligence-and-reasoning-general', 'direction-sense'], 'no arrangement topic; linear / circular seating is closest to direction sense'],
    'Mathematical Operations': [['general-intelligence-and-reasoning-general', 'number-series'], 'no operations topic; symbol substitution is a reasoning general item'],
    'Alphabet Series': [['number-series', 'coding-decoding', 'general-intelligence-and-reasoning-general'], 'letter series: the series topic is numeric only; letter shifts also resemble coding-decoding'],
    'Alpha Series': [['number-series', 'coding-decoding', 'general-intelligence-and-reasoning-general'], 'same as "Alphabet Series" (legacy spelling variant)'],
    'Missing Number': [['number-series', 'general-intelligence-and-reasoning-general'], 'missing-number grids / series'],
    'Mirror Image': [['general-intelligence-and-reasoning-general'], 'non-verbal (needs the figure): no non-verbal topic; likely NEEDS_FIGURE as well'],
    'Paper Folding': [['general-intelligence-and-reasoning-general'], 'non-verbal (needs the figure): no non-verbal topic; likely NEEDS_FIGURE as well'],
    'Figure Series': [['general-intelligence-and-reasoning-general'], 'non-verbal (needs the figure): no non-verbal topic; likely NEEDS_FIGURE as well'],
    'Venn Diagram': [['general-intelligence-and-reasoning-general', 'syllogism', 'classification'], 'Venn / set relations: closest to syllogism or classification'],
    'Dice Problems': [['general-intelligence-and-reasoning-general'], 'non-verbal (needs the figure): no dice topic; likely NEEDS_FIGURE as well'],
    'Classification': [['classification'], 'should have matched exactly — check the legacy label (spacing / case)'],
  },
};

const { rows } = JSON.parse(fs.readFileSync(report, 'utf8'));
const pick = rows.filter((r) => r.skip === 'UNMAPPED_TOPIC');
const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const out = [['row_ref', 'subject', 'legacy_topic', 'suggestion_1', 'suggestion_2', 'suggestion_3', 'reason', 'owner_decision'].join(',')];
const missing = new Set();
for (const r of pick) {
  const s = (SUGGEST[r.file] || {})[r.topicLabel];
  if (!s) missing.add(`${r.file}:${r.topicLabel}`);
  const [slugs, why] = s || [[], 'no suggestion — owner to choose'];
  out.push([r.ref, MAP[r.file]?.subject ?? '', r.topicLabel, slugs[0] ?? '', slugs[1] ?? '', slugs[2] ?? '', why, ''].map(esc).join(','));
}
fs.writeFileSync(path.join(ROOT, 'docs/content/MAP_REVIEW_1.csv'), out.join('\n') + '\n');
console.log(`MAP_REVIEW_1.csv: ${pick.length} rows${missing.size ? `; no suggestion for ${[...missing].join(', ')}` : ''}`);
