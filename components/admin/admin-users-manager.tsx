"use client";

import React, { useState, useMemo } from "react";
import { AdminUserListItem } from "@/services/admin.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Search, CheckCircle2, AlertTriangle, Mail } from "lucide-react";

interface Props {
  users: AdminUserListItem[];
  totalAuthUsers: number;
  totalProfiles: number;
  missingProfilesCount: number;
}

export function AdminUsersManager({ users, totalAuthUsers, totalProfiles, missingProfilesCount }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = u.fullName.toLowerCase().includes(q);
        const matchesEmail = u.email.toLowerCase().includes(q);
        const matchesRole = u.role.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesRole) return false;
      }

      if (selectedStatus === "SYNCED" && !u.hasProfile) return false;
      if (selectedStatus === "MISSING" && u.hasProfile) return false;

      return true;
    });
  }, [users, searchQuery, selectedStatus]);

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" /> User Accounts &amp; Profile Synchronization
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Monitor registered Supabase Auth identities, profile synchronization status, and roles.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 bg-white border-slate-200">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
            Auth Users
          </span>
          <p className="text-2xl font-black text-slate-900 mt-1">{totalAuthUsers}</p>
          <span className="text-[10px] text-slate-400 font-medium">Supabase auth.users</span>
        </Card>

        <Card className="p-4 bg-emerald-50/60 border-emerald-200">
          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider font-mono">
            Synced Profiles
          </span>
          <p className="text-2xl font-black text-emerald-900 mt-1">{totalProfiles}</p>
          <span className="text-[10px] text-emerald-700 font-medium">user_profiles table</span>
        </Card>

        <Card className={`p-4 ${missingProfilesCount > 0 ? "bg-rose-50/60 border-rose-200" : "bg-slate-50 border-slate-200"}`}>
          <span className="text-[11px] font-bold uppercase tracking-wider font-mono text-slate-600">
            Missing Profiles
          </span>
          <p className={`text-2xl font-black mt-1 ${missingProfilesCount > 0 ? "text-rose-900" : "text-slate-900"}`}>
            {missingProfilesCount}
          </p>
          <span className="text-[10px] text-slate-500 font-medium">Un-synced accounts</span>
        </Card>

        <Card className="p-4 bg-blue-50/60 border-blue-200">
          <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider font-mono">
            Sync Health
          </span>
          <p className="text-2xl font-black text-blue-900 mt-1">
            {totalAuthUsers > 0 ? Math.round((totalProfiles / totalAuthUsers) * 100) : 100}%
          </p>
          <span className="text-[10px] text-blue-700 font-medium">1:1 Synchronization</span>
        </Card>
      </div>

      {/* Filter & Search Bar */}
      <Card className="p-4 bg-white border-slate-200 flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users by name, email, or role..."
            className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-hidden focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="p-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
          >
            <option value="ALL">All Profile Statuses</option>
            <option value="SYNCED">Synced Only</option>
            <option value="MISSING">Profile Missing Only</option>
          </select>
        </div>
      </Card>

      {/* Users Table */}
      <Card className="p-0 border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-900">
            Showing {filteredUsers.length} User Account{filteredUsers.length === 1 ? "" : "s"}
          </span>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Users className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs text-slate-500 font-medium">No users match the search criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-mono text-[11px]">
                  <th className="py-3 px-4 font-bold">USER &amp; EMAIL</th>
                  <th className="py-3 px-3 font-bold">ROLE</th>
                  <th className="py-3 px-3 font-bold">LANGUAGE</th>
                  <th className="py-3 px-3 font-bold">PROFILE STATUS</th>
                  <th className="py-3 px-3 font-bold">CREATED AT</th>
                  <th className="py-3 px-4 font-bold text-right">AUTH ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* User & Email */}
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 block">{u.fullName}</span>
                      <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                        <Mail className="w-3 h-3 text-slate-400" /> {u.email}
                      </span>
                    </td>

                    {/* Role */}
                    <td className="py-3 px-3">
                      <Badge variant={u.role === "admin" ? "indigo" : "outline"} className="text-[10px] font-bold uppercase">
                        {u.role}
                      </Badge>
                    </td>

                    {/* Language */}
                    <td className="py-3 px-3">
                      <span className="text-slate-600 font-medium">{u.languagePreference}</span>
                    </td>

                    {/* Profile Status */}
                    <td className="py-3 px-3">
                      {u.hasProfile ? (
                        <Badge variant="success" className="text-[10px] font-bold flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> SYNCED
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px] font-bold flex items-center gap-1 w-fit">
                          <AlertTriangle className="w-3 h-3 text-rose-600" /> PROFILE MISSING
                        </Badge>
                      )}
                    </td>

                    {/* Created At */}
                    <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                      {new Date(u.createdAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>

                    {/* Auth ID */}
                    <td className="py-3 px-4 text-right font-mono text-[10px] text-slate-400">
                      {u.id.slice(0, 8)}...{u.id.slice(-4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
