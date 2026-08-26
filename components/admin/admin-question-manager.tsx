"use client";

import React, { useState, useActionState } from "react";
import { createQuestionAction } from "@/app/auth/../admin/actions";
import { BulkImportModal } from "@/components/admin/bulk-import-modal";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { HelpCircle, Plus, FileUp, Sparkles } from "lucide-react";

interface QuestionItem {
  id: string;
  text: string;
  type: string;
  difficulty: string;
  marks: number;
  isPublished: boolean;
  createdAt: string;
  topicName: string;
}

interface Props {
  questions: QuestionItem[];
}

export function AdminQuestionManager({ questions }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [state, formAction, isPending] = useActionState(createQuestionAction, null);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <HelpCircle className="w-6 h-6 text-blue-600" /> Question Bank CMS & Ingestion
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Manage canonical question bank entries, difficulty, and topic taxonomy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="indigo" className="text-xs">
            {questions.length} Items Listed
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBulkImport(true)}
            className="font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50"
          >
            <FileUp className="w-4 h-4 mr-1.5" /> Bulk Import JSON
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowCreate(!showCreate)}
            className="font-bold bg-blue-600 hover:bg-blue-700 shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Single Question
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card className="p-5 border-blue-200 bg-blue-50/30 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-blue-600" /> Create Single Question Entry
          </h3>
          {state?.error && <Alert variant="error">{state.error}</Alert>}
          {state?.message && <Alert variant="success">{state.message}</Alert>}

          <form action={formAction} className="space-y-3">
            <Input
              label="Question Text"
              name="questionText"
              placeholder="e.g. Which of the following is the capital of India?"
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Difficulty</label>
                <select
                  name="difficulty"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                >
                  <option value="EASY">EASY</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HARD">HARD</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Marks</label>
                <input
                  type="number"
                  name="marks"
                  defaultValue={2}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="default" size="sm" isLoading={isPending} className="font-bold">
                Save & Publish Question
              </Button>
            </div>
          </form>
        </Card>
      )}

      {showBulkImport && (
        <BulkImportModal defaultEntity="questions" onClose={() => setShowBulkImport(false)} />
      )}

      <Card className="p-6 border-slate-200 bg-white">
        {questions.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <HelpCircle className="w-10 h-10 mx-auto text-slate-300" />
            <h3 className="text-base font-bold text-slate-700">No Questions Found in Database</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Use the single question creator above or click &quot;Bulk Import JSON&quot; to ingest questions from structured seed files.
            </p>
          </div>
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
