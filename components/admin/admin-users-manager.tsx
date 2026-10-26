import React from "react";
import Link from "next/link";
import type { DirectoryUser } from "@/lib/admin/users-directory-core";
import { pageCount } from "@/lib/admin/users-directory-core";
import { Card } from "@/components/ui/legacy/card";
import { Badge } from "@/components/ui/legacy/badge";
import { Users, Search, CheckCircle2, AlertTriangle, Mail } from "lucide-react";

/**
 * D-2 (ADMIN-UX-1 Q2): server-rendered users directory. Search (by email) and paging run on the server through
 * lib/admin/users-directory.ts (service role, server-only); this component only renders the page it is given.
 * The full template (drawer, sortable table) arrives in ADMIN-UX-1 phase C.
 */
interface Props {
  users: DirectoryUser[];
  total: number;
  totalAuthUsers: number;
  totalProfiles: number;
  page: number;
  perPage: number;
  query: string;
  truncated: boolean;
  loadError: boolean;
}

function href(page: number, query: string): string {
  const p = new URLSearchParams();
  if (query) p.set("q", query);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `/admin/users?${s}` : "/admin/users";
}

export function AdminUsersManager({ users, total, totalAuthUsers, totalProfiles, page, perPage, query, truncated, loadError }: Props) {
  const missingProfilesCount = Math.max(0, totalAuthUsers - totalProfiles);
  const pages = pageCount(total, perPage);
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" aria-hidden="true" /> User Accounts &amp; Profile Synchronization
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Registered accounts, profile synchronization status and roles. Search by email; 25 per page.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 bg-white border-slate-200">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">Auth Users</span>
          <p className="text-2xl font-black text-slate-900 mt-1">{totalAuthUsers}</p>
          <span className="text-[10px] text-slate-400 font-medium">all accounts</span>
        </Card>
        <Card className="p-4 bg-emerald-50/60 border-emerald-200">
          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider font-mono">Synced Profiles</span>
          <p className="text-2xl font-black text-emerald-900 mt-1">{totalProfiles}</p>
          <span className="text-[10px] text-emerald-700 font-medium">user_profiles table</span>
        </Card>
        <Card className={`p-4 ${missingProfilesCount > 0 ? "bg-rose-50/60 border-rose-200" : "bg-slate-50 border-slate-200"}`}>
          <span className="text-[11px] font-bold uppercase tracking-wider font-mono text-slate-600">Missing Profiles</span>
          <p className={`text-2xl font-black mt-1 ${missingProfilesCount > 0 ? "text-rose-900" : "text-slate-900"}`}>{missingProfilesCount}</p>
          <span className="text-[10px] text-slate-500 font-medium">accounts without a profile</span>
        </Card>
        <Card className="p-4 bg-blue-50/60 border-blue-200">
          <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider font-mono">Sync Health</span>
          <p className="text-2xl font-black text-blue-900 mt-1">{totalAuthUsers > 0 ? Math.round((totalProfiles / totalAuthUsers) * 100) : 100}%</p>
          <span className="text-[10px] text-blue-700 font-medium">profiles ÷ accounts</span>
        </Card>
      </div>

      <form method="get" action="/admin/users" role="search" className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex-1">
          <label htmlFor="users-q" className="block text-xs font-bold text-slate-700 mb-1">
            Search by email
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              id="users-q"
              name="q"
              type="search"
              defaultValue={query}
              autoComplete="off"
              className="focus-ring w-full min-h-11 pl-9 pr-3 text-sm rounded-lg border border-slate-300 bg-white"
            />
          </div>
        </div>
        <button type="submit" className="focus-ring min-h-11 px-4 rounded-lg bg-primary-700 text-white text-sm font-semibold hover:bg-primary-800">
          Search
        </button>
        {query && (
          <Link href="/admin/users" className="focus-ring min-h-11 inline-flex items-center px-3 text-sm font-semibold text-primary-700">
            Clear
          </Link>
        )}
      </form>

      {loadError && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-900">
          The user list could not be loaded. Please reload the page.
        </p>
      )}
      {truncated && (
        <p role="status" className="rounded-lg border border-accent-200 bg-accent-50 p-3 text-sm text-accent-900">
          Search covered the first 50,000 accounts only. Use a more specific email.
        </p>
      )}

      <Card className="p-0 border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-900" role="status">
            {query ? `${total} match${total === 1 ? "" : "es"} for “${query}”` : `${total} account${total === 1 ? "" : "s"}`}
            {total > 0 ? ` · showing ${from}–${to}` : ""}
          </span>
        </div>

        {users.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Users className="w-8 h-8 mx-auto text-slate-300" aria-hidden="true" />
            <p className="text-xs text-slate-500 font-medium">{query ? "No account matches this email." : "No accounts on this page."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">User accounts</caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-mono text-[11px]">
                  <th scope="col" className="py-3 px-4 font-bold">USER &amp; EMAIL</th>
                  <th scope="col" className="py-3 px-3 font-bold">ROLE</th>
                  <th scope="col" className="py-3 px-3 font-bold">LANGUAGE</th>
                  <th scope="col" className="py-3 px-3 font-bold">PROFILE STATUS</th>
                  <th scope="col" className="py-3 px-3 font-bold">CREATED AT</th>
                  <th scope="col" className="py-3 px-4 font-bold text-right">AUTH ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 block">{u.fullName}</span>
                      <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                        <Mail className="w-3 h-3 text-slate-400" aria-hidden="true" /> {u.email}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <Badge variant={u.role === "admin" ? "indigo" : "outline"} className="text-[10px] font-bold uppercase">
                        {u.role}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-slate-600">{u.languagePreference}</td>
                    <td className="py-3 px-3">
                      {u.hasProfile ? (
                        <Badge variant="success" className="text-[10px] font-bold flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" aria-hidden="true" /> SYNCED
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px] font-bold flex items-center gap-1 w-fit">
                          <AlertTriangle className="w-3 h-3 text-rose-600" aria-hidden="true" /> PROFILE MISSING
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                      {new Date(u.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[10px] text-slate-400">
                      {u.id.slice(0, 8)}…{u.id.slice(-4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          <span className="text-slate-600">
            Page {page} of {pages}
          </span>
          <span className="flex gap-2">
            {page > 1 ? (
              <Link href={href(page - 1, query)} className="focus-ring min-h-11 inline-flex items-center rounded-lg border border-slate-300 px-3 font-semibold">
                Previous
              </Link>
            ) : null}
            {page < pages ? (
              <Link href={href(page + 1, query)} className="focus-ring min-h-11 inline-flex items-center rounded-lg border border-slate-300 px-3 font-semibold">
                Next
              </Link>
            ) : null}
          </span>
        </nav>
      )}
    </div>
  );
}
