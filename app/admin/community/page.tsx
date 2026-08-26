import React from "react";
import { AdminService } from "@/services/admin.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";

export const revalidate = 0;

export default async function AdminCommunityPage() {
  const flags = await AdminService.getAdminCommunityFlags();

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-600" /> Community Moderation Queue
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Review Phase 3L flagged discussion threads, reported messages, and spam resolution queues.
          </p>
        </div>
        <Badge variant="destructive" className="text-xs">
          {flags.length} Moderation Reports
        </Badge>
      </div>

      <Card className="p-6 border-slate-200 bg-white">
        {flags.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No moderation flags found in queue.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-mono">
                  <th className="pb-3">TARGET TYPE</th>
                  <th className="pb-3">TARGET ID</th>
                  <th className="pb-3">REASON</th>
                  <th className="pb-3">DETAILS</th>
                  <th className="pb-3">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {flags.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <td className="py-3 font-mono font-bold text-slate-800">{f.targetType}</td>
                    <td className="py-3 font-mono text-slate-500">{f.targetId.slice(0, 8)}...</td>
                    <td className="py-3 font-mono text-rose-600 font-bold">{f.reason}</td>
                    <td className="py-3 text-slate-600 max-w-xs truncate">{f.details || "—"}</td>
                    <td className="py-3">
                      <Badge variant={f.status === "PENDING" ? "warning" : "success"} className="text-[10px]">
                        {f.status}
                      </Badge>
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
