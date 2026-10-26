import "server-only";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { reportWriteFailure } from "@/lib/ops/write-failure";
import {
  emailMatches,
  MAX_SCAN_PAGES,
  SCAN_PAGE_SIZE,
  toDirectoryUser,
  USERS_PER_PAGE,
  type AuthUserLike,
  type DirectoryUser,
  type ProfileLike,
} from "./users-directory-core";

/**
 * D-2 (ADMIN-UX-1 Q2): the admin users directory. auth.admin.* needs the service role, so this module is server-only and
 * is called ONLY from the admin-only /admin/users page after requireAdminPage (unchanged). The service-role client never
 * leaves the server; the page passes plain rows to the client component. Real server paging (no 50 cap) and a
 * server-side email search (bounded scan: MAX_SCAN_PAGES × SCAN_PAGE_SIZE accounts).
 */
export interface DirectoryPage {
  users: DirectoryUser[];
  /** total auth users (all) — or the number of matches when searching */
  total: number;
  totalAuthUsers: number;
  totalProfiles: number;
  page: number;
  perPage: number;
  query: string;
  /** the email scan hit its bound (more accounts exist than were searched) */
  truncated: boolean;
  loadError: boolean;
}

const logRead = (op: string, code: string | undefined) =>
  reportWriteFailure({ fn: "AdminUsersDirectory.listUsers", table: "auth.users", op: "select", code: code ?? null, ids: { op } });

export async function listDirectoryUsers(opts: { page: number; query: string }): Promise<DirectoryPage> {
  const admin = createAdminServerSupabaseClient();
  const perPage = USERS_PER_PAGE;
  const empty: DirectoryPage = { users: [], total: 0, totalAuthUsers: 0, totalProfiles: 0, page: opts.page, perPage, query: opts.query, truncated: false, loadError: true };

  const { count: profileCount, error: countError } = await admin.from("user_profiles").select("id", { count: "exact", head: true });
  if (countError) logRead("profiles.count", countError.code);

  let pageUsers: AuthUserLike[] = [];
  let total = 0;
  let totalAuthUsers = 0;
  let truncated = false;

  if (!opts.query) {
    const { data, error } = await admin.auth.admin.listUsers({ page: opts.page, perPage });
    if (error) {
      logRead("listUsers", error.code);
      return empty;
    }
    pageUsers = data.users as AuthUserLike[];
    total = totalAuthUsers = typeof data.total === "number" ? data.total : pageUsers.length;
  } else {
    const matches: AuthUserLike[] = [];
    for (let p = 1; p <= MAX_SCAN_PAGES; p++) {
      const { data, error } = await admin.auth.admin.listUsers({ page: p, perPage: SCAN_PAGE_SIZE });
      if (error) {
        logRead("listUsers.scan", error.code);
        return empty;
      }
      if (p === 1) totalAuthUsers = typeof data.total === "number" ? data.total : data.users.length;
      for (const u of data.users as AuthUserLike[]) if (emailMatches(u.email, opts.query)) matches.push(u);
      if (data.users.length < SCAN_PAGE_SIZE) break;
      if (p === MAX_SCAN_PAGES) truncated = true;
    }
    total = matches.length;
    pageUsers = matches.slice((opts.page - 1) * perPage, opts.page * perPage);
  }

  const ids = pageUsers.map((u) => u.id);
  let profiles: ProfileLike[] = [];
  if (ids.length) {
    const { data, error } = await admin.from("user_profiles").select("id, full_name, language_preference, is_active").in("id", ids);
    if (error) logRead("profiles.page", error.code);
    profiles = (data ?? []) as ProfileLike[];
  }
  const byId = new Map(profiles.map((p) => [p.id, p]));

  return {
    users: pageUsers.map((u) => toDirectoryUser(u, byId.get(u.id))),
    total,
    totalAuthUsers,
    totalProfiles: profileCount ?? 0,
    page: opts.page,
    perPage,
    query: opts.query,
    truncated,
    loadError: false,
  };
}
