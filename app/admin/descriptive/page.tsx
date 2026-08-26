import React from "react";
import { AdminService } from "@/services/admin.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PenTool } from "lucide-react";

export const revalidate = 0;

export default async function AdminDescriptivePage() {
  const questions = await AdminService.getAdminDescriptive();

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <PenTool className="w-6 h-6 text-amber-600" /> Descriptive Mains Administration
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Manage Phase 3Q UPSC Mains descriptive answer writing questions, word limits, and total marks.
          </p>
        </div>
        <Badge variant="indigo" className="text-xs">
          {questions.length} Mains Questions Listed
        </Badge>
      </div>

      <Card className="p-6 border-slate-200 bg-white">
        {questions.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No descriptive questions found in database.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-mono">
                  <th className="pb-3">TITLE</th>
                  <th className="pb-3">EXAM</th>
                  <th className="pb-3">WORD LIMIT</th>
                  <th className="pb-3">MARKS</th>
                  <th className="pb-3">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {questions.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50">
                    <td className="py-3 font-semibold text-slate-900">{q.title}</td>
                    <td className="py-3 font-mono text-slate-600">{q.examName}</td>
                    <td className="py-3 font-mono text-slate-600">{q.minWords}–{q.maxWords} words</td>
                    <td className="py-3 font-mono text-slate-600">{q.totalMarks}</td>
                    <td className="py-3">
                      <Badge variant={q.isActive ? "success" : "warning"} className="text-[10px]">
                        {q.isActive ? "ACTIVE" : "INACTIVE"}
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
