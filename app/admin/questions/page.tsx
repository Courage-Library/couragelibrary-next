import React from "react";
import { AdminService } from "@/services/admin.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpCircle } from "lucide-react";

export const revalidate = 0;

export default async function AdminQuestionsPage() {
  const questions = await AdminService.getAdminQuestions();

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <HelpCircle className="w-6 h-6 text-blue-600" /> Question Bank Administration
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Manage canonical Phase 3A question bank entries, difficulty, and topic taxonomy.
          </p>
        </div>
        <Badge variant="indigo" className="text-xs">
          {questions.length} Items Listed
        </Badge>
      </div>

      <Card className="p-6 border-slate-200 bg-white">
        {questions.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No questions found in database.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-mono">
                  <th className="pb-3">QUESTION TEXT</th>
                  <th className="pb-3">TOPIC</th>
                  <th className="pb-3">DIFFICULTY</th>
                  <th className="pb-3">MARKS</th>
                  <th className="pb-3">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {questions.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50">
                    <td className="py-3 font-semibold text-slate-900 max-w-md truncate">{q.text}</td>
                    <td className="py-3 font-mono text-slate-600">{q.topicName}</td>
                    <td className="py-3 font-mono font-bold text-slate-700">{q.difficulty}</td>
                    <td className="py-3 font-mono text-slate-600">{q.marks}</td>
                    <td className="py-3">
                      <Badge variant={q.isPublished ? "success" : "warning"} className="text-[10px]">
                        {q.isPublished ? "PUBLISHED" : "DRAFT"}
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
