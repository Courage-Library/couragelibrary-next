import React from "react";
import { AdminService } from "@/services/admin.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";

export const revalidate = 0;

export default async function AdminInstitutesPage() {
  const institutes = await AdminService.getAdminInstitutes();

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-teal-600" /> Institute Verification & Management
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Manage Phase 3P coaching institutes, verification status, and partner portal access.
          </p>
        </div>
        <Badge variant="indigo" className="text-xs">
          {institutes.length} Institutes Listed
        </Badge>
      </div>

      <Card className="p-6 border-slate-200 bg-white">
        {institutes.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No coaching institutes found in database.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-mono">
                  <th className="pb-3">INSTITUTE NAME</th>
                  <th className="pb-3">SLUG</th>
                  <th className="pb-3">CREATED</th>
                  <th className="pb-3">VERIFICATION STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {institutes.map((inst) => (
                  <tr key={inst.id} className="hover:bg-slate-50">
                    <td className="py-3 font-semibold text-slate-900">{inst.name}</td>
                    <td className="py-3 font-mono text-slate-500">{inst.slug}</td>
                    <td className="py-3 font-mono text-slate-500">{new Date(inst.createdAt).toLocaleDateString()}</td>
                    <td className="py-3">
                      <Badge variant={inst.verificationStatus === "VERIFIED" ? "success" : "warning"} className="text-[10px]">
                        {inst.verificationStatus}
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
