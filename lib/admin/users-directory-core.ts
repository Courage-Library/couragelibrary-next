/**
 * D-2 (ADMIN-UX-1 Q2, architect 2026-10-26): pure helpers for the admin users directory (no clients, no env, so the
 * offline gate can load them). The server wiring is lib/admin/users-directory.ts (server-only, service role).
 */
export const USERS_PER_PAGE = 25;
/** Email search scans auth users in pages of this size; bounded so a request can never loop forever. */
export const SCAN_PAGE_SIZE = 1000;
export const MAX_SCAN_PAGES = 50;

export interface AuthUserLike {
  id: string;
  email?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}

export interface ProfileLike {
  id: string;
  full_name: string | null;
  language_preference: string | null;
  is_active: boolean;
}

export interface DirectoryUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  languagePreference: string;
  isActive: boolean;
  hasProfile: boolean;
  profileStatus: "Synced" | "Profile Missing";
  createdAt: string;
  lastSignInAt: string | null;
}

/** ?page= → a positive integer (1 for anything else). */
export function parsePage(raw: unknown): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : 1;
}

/** ?q= → a trimmed, lower-cased email fragment (max 120 chars), or "" for no search. */
export function parseEmailQuery(raw: unknown): string {
  const s = String(Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "")).trim().toLowerCase();
  return s.slice(0, 120);
}

export function emailMatches(email: string | null | undefined, query: string): boolean {
  return query.length > 0 && typeof email === "string" && email.toLowerCase().includes(query);
}

/** AUTH-1 #60: the displayed role comes from the same source as the guard (app_metadata), never user_metadata. */
export function displayRole(u: AuthUserLike): string {
  const r = u.app_metadata?.role;
  return r === "admin" || r === "staff" ? r : "student";
}

export function toDirectoryUser(u: AuthUserLike, profile: ProfileLike | undefined): DirectoryUser {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const metaName = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null;
  return {
    id: u.id,
    email: u.email || "No email",
    fullName: profile?.full_name || metaName || u.email?.split("@")[0] || "Student",
    role: displayRole(u),
    languagePreference: profile?.language_preference === "hi" ? "Hindi" : "English",
    isActive: profile ? profile.is_active : true,
    hasProfile: Boolean(profile),
    profileStatus: profile ? "Synced" : "Profile Missing",
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? null,
  };
}

/** Page count for a total (at least 1). */
export function pageCount(total: number, perPage: number = USERS_PER_PAGE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / perPage));
}
