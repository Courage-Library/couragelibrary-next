/**
 * ADMIN-UX-1 phase B — global search (Ctrl/Cmd+K): pure helpers (no clients / env; the offline gate loads them).
 * Which groups a role may search mirrors the target pages' existing guards: questions + tickets → staff and admin
 * (/admin/questions, /admin/support are allowStaff), users → admin only (/admin/users is admin only).
 */
/** ADMIN-IA-1: "Pages" and "Actions" come from the role-filtered nav (client side, no query to the server). */
export type SearchGroup = "Pages" | "Actions" | "Questions" | "Users" | "Tickets";

export interface AdminSearchResult {
  group: SearchGroup;
  id: string;
  label: string;
  detail: string | null;
  href: string;
}

export const MIN_QUERY = 2;
export const MAX_QUERY = 120;
export const PER_GROUP = 6;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TICKET_REF = /^CL-[0-9]{6}-[A-Z0-9]{6}$/;

export function normalizeQuery(raw: unknown): string | null {
  const q = String(raw ?? "").trim().replace(/\s+/g, " ");
  return q.length >= MIN_QUERY && q.length <= MAX_QUERY ? q : null;
}

/** Escapes LIKE wildcards so user text is matched literally inside %…%. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

export function searchableGroups(role: "admin" | "staff", supportEnabled: boolean): SearchGroup[] {
  const g: SearchGroup[] = ["Questions"];
  if (role === "admin") g.push("Users");
  if (supportEnabled) g.push("Tickets");
  return g;
}

/** A short single-line label from question text (markdown / HTML / LaTeX markers removed, ≤ 90 chars). */
export function snippet(text: string | null | undefined, max = 90): string {
  const s = String(text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[`*_#>$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s || "(no text)";
}
