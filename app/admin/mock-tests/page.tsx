import React from "react";
import { AdminService } from "@/services/admin.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileCheck2 } from "lucide-react";

export const revalidate = 0;

export default async function AdminMockTestsPage() {
  const tests = await AdminService.getAdminMockTests();

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <FileCheck2 className="w-6 h-6 text-emerald-600" /> Mock Test Management
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Manage Phase 3B exam mock tests, section structures, and marking criteria.
          </p>
        </div>
        <Badge variant="indigo" className="text-xs">
          {tests.length} Mock Tests Listed
        </Badge>
      </div>

      <Card className="p-6 border-slate-200 bg-white">
        {tests.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No mock tests found in database.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-mono">
                  <th className="pb-3">TITLE</th>
                  <th className="pb-3">EXAM</th>
                  <th className="pb-3">DURATION</th>
                  <th className="pb-3">TOTAL MARKS</th>
                  <th className="pb-3">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tests.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="py-3 font-semibold text-slate-900">{t.title}</td>
                    <td className="py-3 font-mono text-slate-600">{t.examName}</td>
                    <td className="py-3 font-mono text-slate-600">{t.durationMinutes} mins</td>
                    <td className="py-3 font-mono text-slate-600">{t.totalMarks}</td>
                    <td className="py-3">
                      <Badge variant={t.isPublished ? "success" : "warning"} className="text-[10px]">
                        {t.isPublished ? "PUBLISHED" : "DRAFT"}
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
