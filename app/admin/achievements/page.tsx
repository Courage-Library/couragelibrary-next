import React from "react";
import { Metadata } from "next";
import { LiveTestAchievementService } from "@/services/live-test-achievement.service";
import { Award, ShieldCheck, Trophy, Layers, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Live Test Achievements & Policy Definitions | Courage Library Admin",
  description: "Manage live mock test achievement definitions, policy versions, and evidence.",
};

export default async function AdminAchievementsPage() {
  const definitions = await LiveTestAchievementService.getAchievementDefinitions();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-1">
            <Award className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wider">
              Post-Competition Intelligence (Phase 5E.3)
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Achievement & Badge Policies
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Server-authoritative evaluation rules for National Ranks, Percentiles, Podium, Personal Bests, and Consistency.
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">Total Definitions</span>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {definitions.length}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">Active Policies</span>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {definitions.filter((d) => d.is_active).length}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">Event-Repeatable</span>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {definitions.filter((d) => d.is_repeatable).length}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">One-Time Milestones</span>
          <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
            {definitions.filter((d) => !d.is_repeatable).length}
          </p>
        </div>
      </div>

      {/* Definitions Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-500" />
            V1 Policy Definitions Catalog
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Badge Code & Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Condition Type</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Rule Config</th>
                <th className="px-4 py-3 text-center">Version</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {definitions.map((def) => (
                <tr key={def.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400">
                        {def.badge_code}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 block font-normal">
                      {def.badge_title || def.badge_description}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[10px]">
                      {def.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-600 dark:text-slate-400">
                    {def.condition_type}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40">
                      {def.scope}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-500 max-w-xs truncate">
                    {JSON.stringify(def.condition_config)}
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-xs">
                    v{def.policy_version}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        def.is_active ? "bg-emerald-500" : "bg-slate-400"
                      }`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
