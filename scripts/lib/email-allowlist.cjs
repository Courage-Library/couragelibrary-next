/**
 * Auth e-mail ALLOW-LISTS (architect ruling 2026-10-27, "EMAIL AMENDMENT"): the ONE definition used by AUTH-1 T-12
 * (scripts/test_auth1_2b2.cjs), BRAND-2 C-11 (scripts/test_brand2.cjs) and BRAND-1 B-05 (scripts/test_brand1.cjs), so the
 * three gates can never drift apart. Exact values only — nothing else is relaxed:
 *   <img> ONLY the 3 own-domain Brand Band images, each with alt + width + height
 *   href  ONLY the token_hash /auth/confirm link (button + plain-text fallback = exactly 2), the Government Exams tile,
 *         the CNTS tile and the support mailto. No utm_, no other link.
 */
const IMG_SRC = Object.freeze([
  'https://couragelibrary.in/email/banner.png',
  'https://couragelibrary.in/email/strip-main.png',
  'https://couragelibrary.in/email/strip-cnts.png',
]);
const EXTRA_HREFS = Object.freeze(['https://couragelibrary.in/', 'https://cnts.couragelibrary.in/', 'mailto:support@couragelibrary.in']);
const CONFIRM_RE = /^\{\{ \.SiteURL \}\}\/auth\/confirm\?token_hash=\{\{ \.TokenHash \}\}&type=([a-z_]+)&next=(\/[A-Za-z0-9/_-]*)$/;

const hrefsOf = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
const imgsOf = (html) => [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);

/** Problems with links / images in one template (empty = allowed). `confirmUrl`: the exact expected confirm link. */
function checkTemplate(html, confirmUrl) {
  const bad = [];
  const hrefs = hrefsOf(html);
  const confirm = hrefs.filter((h) => CONFIRM_RE.test(h));
  if (confirm.length !== 2) bad.push(`${confirm.length} confirm links (want 2: button + plain-text fallback)`);
  if (confirmUrl && confirm.some((h) => h !== confirmUrl)) bad.push(`confirm link differs from ${confirmUrl}`);
  for (const h of hrefs) if (!CONFIRM_RE.test(h) && !EXTRA_HREFS.includes(h)) bad.push(`link not allowed: ${h.slice(0, 80)}`);
  if (/utm_/i.test(html)) bad.push('utm_ parameter');
  for (const tag of imgsOf(html)) {
    const src = (tag.match(/\bsrc="([^"]*)"/) || [])[1];
    if (!IMG_SRC.includes(src)) bad.push(`image not allowed: ${String(src).slice(0, 80)}`);
    if (!/\balt="[^"]{3,}"/.test(tag)) bad.push(`image without alt text: ${src}`);
    if (!/\bwidth="\d+"/.test(tag) || !/\bheight="\d+"/.test(tag)) bad.push(`image without width / height: ${src}`);
  }
  if (/url\(|<link\b|<script\b|<iframe\b|<object\b|<embed\b|background="|srcset=/i.test(html)) bad.push('other remote resource / script');
  return bad;
}

module.exports = { IMG_SRC, EXTRA_HREFS, CONFIRM_RE, hrefsOf, imgsOf, checkTemplate };
