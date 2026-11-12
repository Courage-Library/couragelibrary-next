/**
 * LEGAL-PAGES-1: formats ONE line of the trusted legal text into segments — never changes a character of it.
 *   - the two markers the text uses: **bold** and [text](https://…)
 *   - real links for what the text already names: the support email (mailto, with the subject the text names), the
 *     phone number (tel), and the other policies / pages by their exact names ("Privacy Policy", "Refund & Cancellation
 *     Policy", "Terms of Service", "Contact Us & Grievance", "Grievance Officer", "Help"); a page never links to itself
 * Pure; safe in server and client components. The concatenated segment text equals the line without its markers.
 */
import { GRIEVANCE_OFFICER, SUPPORT_EMAIL } from "@/content/support";

export type LegalInline = { kind: "text"; text: string } | { kind: "bold"; children: LegalInline[] } | { kind: "link"; text: string; href: string; external: boolean };

// the contact details come from their single source (content/support.ts), never retyped
const PHONE = GRIEVANCE_OFFICER.phone;

/** [exact phrase, href, the route that must not link to itself] — longest phrases first */
const PHRASES: Array<[string, string, string]> = [
  ["Refund & Cancellation Policy", "/refund-policy", "/refund-policy"],
  ["Contact Us & Grievance", "/contact#grievance-officer", "/contact"],
  ["Terms of Service", "/terms", "/terms"],
  ["Privacy Policy", "/privacy", "/privacy"],
  ["Grievance Officer", "/contact#grievance-officer", "/contact"],
];

function autolink(text: string, route: string): LegalInline[] {
  type Hit = { at: number; len: number; seg: LegalInline };
  const hits: Hit[] = [];
  const add = (needle: string, make: (s: string) => LegalInline) => {
    for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) {
      // inside a job title ("… & Grievance Officer") it is a name, not a pointer to the contact page
      if (needle === "Grievance Officer" && text.slice(Math.max(0, at - 2), at) === "& ") continue;
      hits.push({ at, len: needle.length, seg: make(needle) });
    }
  };
  // the email link carries the subject the text asks for: '… (subject: "Grievance")' / '… with the subject "Privacy request"'
  for (let at = text.indexOf(SUPPORT_EMAIL); at !== -1; at = text.indexOf(SUPPORT_EMAIL, at + SUPPORT_EMAIL.length)) {
    const subject = /^(?: \(subject: "([^"]+)"\)| with the subject "([^"]+)")/.exec(text.slice(at + SUPPORT_EMAIL.length));
    const s = subject ? subject[1] ?? subject[2] : null;
    hits.push({ at, len: SUPPORT_EMAIL.length, seg: { kind: "link", text: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}${s ? `?subject=${encodeURIComponent(s)}` : ""}`, external: false } });
  }
  add(PHONE, (s) => ({ kind: "link", text: s, href: `tel:${s.replace(/\s+/g, "")}`, external: false }));
  for (const [phrase, href, self] of PHRASES) if (route !== self) add(phrase, (s) => ({ kind: "link", text: s, href, external: false }));
  // "a ticket from Help": the Help page (only this exact use of the word)
  for (let at = text.indexOf("from Help"); at !== -1; at = text.indexOf("from Help", at + 9)) hits.push({ at: at + 5, len: 4, seg: { kind: "link", text: "Help", href: "/help", external: false } });
  hits.sort((a, b) => a.at - b.at || b.len - a.len);
  const out: LegalInline[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.at < pos) continue; // overlaps an earlier, longer match
    if (h.at > pos) out.push({ kind: "text", text: text.slice(pos, h.at) });
    out.push(h.seg);
    pos = h.at + h.len;
  }
  if (pos < text.length) out.push({ kind: "text", text: text.slice(pos) });
  return out;
}

export function legalInline(line: string, route: string): LegalInline[] {
  const out: LegalInline[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let pos = 0;
  for (const m of line.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > pos) out.push(...autolink(line.slice(pos, at), route));
    if (m[1] !== undefined) out.push({ kind: "bold", children: autolink(m[1], route) });
    else out.push({ kind: "link", text: m[2], href: m[3], external: true });
    pos = at + m[0].length;
  }
  if (pos < line.length) out.push(...autolink(line.slice(pos), route));
  return out;
}

/** The plain text of segments (what a reader sees). */
export const legalInlineText = (segs: LegalInline[]): string => segs.map((s) => (s.kind === "bold" ? legalInlineText(s.children) : s.text)).join("");
