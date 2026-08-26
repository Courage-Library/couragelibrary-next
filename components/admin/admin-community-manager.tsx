"use client";

import React, { useState } from "react";
import { resolveCommunityFlagAction } from "@/app/admin/actions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, ShieldAlert, Check, X } from "lucide-react";

interface ModerationFlagItem {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
}

interface Props {
  flags: ModerationFlagItem[];
}

export function AdminCommunityManager({ flags }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleResolve = async (flagId: string, status: "RESOLVED" | "DISMISSED") => {
    setLoadingId(flagId);
    await resolveCommunityFlagAction(flagId, status);
    setLoadingId(null);
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-indigo-600" /> Community Discussion Moderation
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Review reported threads, messages, offensive content flags, and resolution decisions.
          </p>
        </div>
        <Badge variant="indigo" className="text-xs">
          {flags.length} Moderation Items Listed
        </Badge>
      </div>

      <Card className="p-6 border-slate-200 bg-white">
        {flags.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <ShieldAlert className="w-10 h-10 mx-auto text-emerald-500 opacity-60" />
            <h3 className="text-base font-bold text-slate-700">No Pending Moderation Flags</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              All reported community threads and messages have been reviewed and resolved.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-mono">
                  <th className="pb-3">TARGET TYPE</th>
                  <th className="pb-3">REASON</th>
                  <th className="pb-3">DETAILS</th>
                  <th className="pb-3">STATUS</th>
                  <th className="pb-3 text-right">MODERATE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {flags.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <td className="py-3 font-mono font-bold text-slate-700">{f.targetType}</td>
                    <td className="py-3 font-semibold text-slate-900">{f.reason}</td>
                    <td className="py-3 text-slate-600 max-w-xs truncate">{f.details || "N/A"}</td>
                    <td className="py-3">
                      <Badge variant={f.status === "PENDING" ? "warning" : "success"} className="text-[10px]">
                        {f.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-right flex items-center justify-end gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        isLoading={loadingId === f.id}
                        onClick={() => handleResolve(f.id, "RESOLVED")}
                        className="bg-emerald-600 hover:bg-emerald-700 text-[10px] py-0.5 px-2 font-bold"
                      >
                        <Check className="w-3 h-3 mr-1" /> Resolve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        isLoading={loadingId === f.id}
                        onClick={() => handleResolve(f.id, "DISMISSED")}
                        className="text-[10px] py-0.5 px-2 font-bold text-slate-500"
                      >
                        <X className="w-3 h-3 mr-1" /> Dismiss
                      </Button>
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
