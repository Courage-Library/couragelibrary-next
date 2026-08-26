"use client";

import React, { useState, useActionState } from "react";
import { createMockTestAction, toggleMockTestPublishAction } from "@/app/admin/actions";
import { BulkImportModal } from "@/components/admin/bulk-import-modal";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Target, Plus, FileUp, Sparkles, Clock, Award } from "lucide-react";

interface MockTestItem {
  id: string;
  title: string;
  durationMinutes: number;
  totalMarks: number;
  isPublished: boolean;
  createdAt: string;
  examName: string;
}

interface Props {
  tests: MockTestItem[];
}

export function AdminMockTestsManager({ tests }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [state, formAction, isPending] = useActionState(createMockTestAction, null);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Target className="w-6 h-6 text-blue-600" /> Mock Test Blueprints CMS
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Manage full-length mock papers, duration, section blueprints, and question mappings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="indigo" className="text-xs">
            {tests.length} Papers Listed
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
            <Plus className="w-4 h-4 mr-1.5" /> Create Mock Test
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card className="p-5 border-blue-200 bg-blue-50/30 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-blue-600" /> Create Mock Test Paper Blueprint
          </h3>
          {state?.error && <Alert variant="error">{state.error}</Alert>}
          {state?.message && <Alert variant="success">{state.message}</Alert>}

          <form action={formAction} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Mock Test Title" name="title" placeholder="e.g. SSC CGL Tier-1 Full Mock 01" required />
              <Input label="URL Slug" name="slug" placeholder="ssc-cgl-tier1-full-mock-01" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Duration (Minutes)</label>
                <input
                  type="number"
                  name="durationMinutes"
                  defaultValue={60}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Total Marks</label>
                <input
                  type="number"
                  name="totalMarks"
                  defaultValue={200}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="default" size="sm" isLoading={isPending} className="font-bold">
                Save & Publish Test
              </Button>
            </div>
          </form>
        </Card>
      )}

      {showBulkImport && (
        <BulkImportModal defaultEntity="mock_tests" onClose={() => setShowBulkImport(false)} />
      )}

      <Card className="p-6 border-slate-200 bg-white">
        {tests.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <Target className="w-10 h-10 mx-auto text-slate-300" />
            <h3 className="text-base font-bold text-slate-700">No Published Mock Tests</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Use the mock test creator above or bulk import JSON blueprints to publish national level mock test papers.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-mono">
                  <th className="pb-3">TITLE</th>
                  <th className="pb-3">EXAM VERTICAL</th>
                  <th className="pb-3">DURATION</th>
                  <th className="pb-3">MARKS</th>
                  <th className="pb-3">STATUS</th>
                  <th className="pb-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tests.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="py-3 font-bold text-slate-900">{m.title}</td>
                    <td className="py-3 font-mono text-slate-600">{m.examName}</td>
                    <td className="py-3 font-mono text-slate-600">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" /> {m.durationMinutes} mins
                      </span>
                    </td>
                    <td className="py-3 font-mono text-slate-600">
                      <span className="flex items-center gap-1">
                        <Award className="w-3 h-3 text-slate-400" /> {m.totalMarks} Marks
                      </span>
                    </td>
                    <td className="py-3">
                      <Badge variant={m.isPublished ? "success" : "warning"} className="text-[10px]">
                        {m.isPublished ? "PUBLISHED" : "DRAFT"}
                      </Badge>
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await toggleMockTestPublishAction(m.id, m.isPublished);
                        }}
                        className="text-[10px] font-bold py-0.5 px-2"
                      >
                        {m.isPublished ? "Unpublish" : "Publish"}
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
