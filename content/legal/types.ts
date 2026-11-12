/** LEGAL-PAGES-1: the shape of the generated legal text (content/legal/legal-pages.ts, from scripts/lib/legal-md.cjs). */
export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  /** head null = a table without a header row (Contact details): the first column labels each row */
  | { type: "table"; head: string[] | null; rows: string[][] };

export interface LegalTextSection {
  number: string;
  title: string;
  /** stable anchor (e.g. "grievance-officer" for 5.1) */
  id: string;
  /** Terms 1.5: rendered only while the lesson-coins flag is on */
  coins: boolean;
  blocks: LegalBlock[];
}

export interface LegalTextPage {
  number: string;
  title: string;
  lastUpdated: boolean;
  intro: LegalBlock[];
  sections: LegalTextSection[];
}
