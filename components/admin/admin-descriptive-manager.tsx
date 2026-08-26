"use client";

import React, { useState, useActionState } from "react";
import { createDescriptiveAction } from "@/app/admin/actions";
import { BulkImportModal } from "@/components/admin/bulk-import-modal";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { PenTool, Plus, FileUp, Sparkles } from "lucide-react";

interface DescriptiveItem {
  id: string;
  title: string;
  minWords: number;
  maxWords: number;
  totalMarks: number;
  isActive: boolean;
  createdAt: string;
  examName: string;
}

interface Props {
  items: DescriptiveItem[];
}

export function AdminDescriptiveManager({ items }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [state, formAction, isPending] = useActionState(createDescriptiveAction, null);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <PenTool className="w-6 h-6 text-blue-600" /> Mains Descriptive Questions CMS
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Manage Mains essay & GS questions, evaluation rubrics, word limits, and marks allocation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="indigo" className="text-xs">
            {items.length} Questions Listed
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
            <Plus className="w-4 h-4 mr-1.5" /> Create Question
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card className="p-5 border-blue-200 bg-blue-50/30 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-blue-600" /> Create Mains Descriptive Question
          </h3>
          {state?.error && <Alert variant="error">{state.error}</Alert>}
          {state?.message && <Alert variant="success">{state.message}</Alert>}

          <form action={formAction} className="space-y-3">
            <Input label="Question Title / Brief" name="title" placeholder="e.g. Critical Analysis of Article 370 Abrogation" required />
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Full Question Prompt</label>
              <textarea
                name="questionText"
                rows={4}
                placeholder="Discuss the socio-economic and security implications..."
                required
                className="w-full p-3 rounded-xl border border-slate-200 font-sans text-xs text-slate-800 bg-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Max Word Limit</label>
                <input
                  type="number"
                  name="maxWords"
                  defaultValue={250}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Total Marks</label>
                <input
                  type="number"
                  name="totalMarks"
                  defaultValue={15}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="default" size="sm" isLoading={isPending} className="font-bold bg-blue-600 hover:bg-blue-700">
                Save & Activate Question
              </Button>
            </div>
          </form>
        </Card>
      )}

      {showBulkImport && (
        <BulkImportModal defaultEntity="descriptive" onClose={() => setShowBulkImport(false)} />
      )}

      <Card className="p-6 border-slate-200 bg-white">
        {items.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No descriptive questions found in database.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-mono">
                  <th className="pb-3">TITLE</th>
                  <th className="pb-3">EXAM ASSOCIATION</th>
                  <th className="pb-3">WORD LIMIT</th>
                  <th className="pb-3">MARKS</th>
                  <th className="pb-3">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="py-3 font-bold text-slate-900">{d.title}</td>
                    <td className="py-3 font-mono text-slate-600">{d.examName}</td>
                    <td className="py-3 font-mono text-slate-600">{d.minWords}-{d.maxWords} words</td>
                    <td className="py-3 font-mono font-bold text-blue-700">{d.totalMarks} Marks</td>
                    <td className="py-3">
                      <Badge variant={d.isActive ? "success" : "warning"} className="text-[10px]">
                        {d.isActive ? "ACTIVE" : "INACTIVE"}
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
