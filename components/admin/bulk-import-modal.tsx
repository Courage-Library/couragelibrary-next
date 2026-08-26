"use client";

import React, { useState } from "react";
import { executeBulkImportAction } from "@/app/admin/actions";
import { BulkImportResult } from "@/lib/admin/bulk-importer";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { FileUp, AlertTriangle, X, Play, Eye } from "lucide-react";

interface BulkImportModalProps {
  defaultEntity?: string;
  onClose?: () => void;
}

export function BulkImportModal({ defaultEntity = "questions", onClose }: BulkImportModalProps) {
  const [entity, setEntity] = useState(defaultEntity);
  const [jsonContent, setJsonContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  const handlePreview = async () => {
    try {
      setIsLoading(true);
      const parsed = JSON.parse(jsonContent);
      const res = await executeBulkImportAction({
        entity,
        data: parsed,
        mode: "preview",
      });
      setResult(res);
    } catch (e: unknown) {
      const errMessage = e instanceof Error ? e.message : "Invalid JSON string";
      setResult({
        success: false,
        entity,
        totalRecords: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        brokenReferencesCount: 0,
        errors: [`JSON Parse Error: ${errMessage}`],
        warnings: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommit = async () => {
    try {
      setIsLoading(true);
      const parsed = JSON.parse(jsonContent);
      const res = await executeBulkImportAction({
        entity,
        data: parsed,
        mode: "commit",
      });
      setResult(res);
    } catch (e: unknown) {
      const errMessage = e instanceof Error ? e.message : "Execution failed";
      setResult({
        success: false,
        entity,
        totalRecords: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        brokenReferencesCount: 0,
        errors: [`Execution Error: ${errMessage}`],
        warnings: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl bg-white border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <CardTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
              <FileUp className="w-5 h-5 text-indigo-600" /> Server-Side Bulk Content Importer
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Validate and ingest structured JSON datasets with foreign-key resolution and idempotency checks.
            </CardDescription>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700">
              <X className="w-5 h-5" />
            </button>
          )}
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <label className="text-xs font-bold text-slate-700">Target Content Entity:</label>
            <select
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value);
                setResult(null);
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-slate-50 focus:bg-white"
            >
              <option value="questions">Questions & Options</option>
              <option value="mock_tests">Mock Tests</option>
              <option value="flashcards">Flashcard Decks & Cards</option>
              <option value="articles">Articles & Versions</option>
              <option value="courses">Courses & Modules</option>
              <option value="descriptive">Descriptive Questions & Rubrics</option>
              <option value="institutes">Coaching Institutes & Batches</option>
              <option value="taxonomy">Taxonomy (Categories & Exams)</option>
              <option value="subscription_plans">Subscription Plans</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">Paste JSON Dataset Payload:</label>
            <textarea
              rows={8}
              value={jsonContent}
              onChange={(e) => setJsonContent(e.target.value)}
              placeholder='[ { "question_text": "Sample...", "topic_slug": "ssc_math", "options": [...] } ]'
              className="w-full p-3 rounded-xl border border-slate-200 font-mono text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-slate-900 text-slate-100"
            />
          </div>

          {result && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <Badge variant={result.success ? "success" : "destructive"} className="text-xs">
                  {result.success ? "Validation Passed" : "Validation Failed"}
                </Badge>
                <span className="text-xs font-mono text-slate-500">
                  Total: {result.totalRecords} | Created: {result.created} | Updated: {result.updated} | Skipped: {result.skipped}
                </span>
              </div>

              {result.errors.length > 0 && (
                <Alert variant="error" className="text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> Errors Detected:
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 font-mono text-[11px]">
                    {result.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </Alert>
              )}

              {result.previewData && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                  <div className="font-bold text-slate-700 flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-indigo-600" /> Preview Sample ({result.previewData.length} Items Verified):
                  </div>
                  <pre className="font-mono text-[10px] text-slate-600 overflow-x-auto max-h-32 p-2 bg-white rounded-lg border border-slate-100">
                    {JSON.stringify(result.previewData.slice(0, 3), null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            {onClose && (
              <Button variant="outline" size="sm" onClick={onClose} className="font-semibold">
                Cancel
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreview}
              isLoading={isLoading}
              className="font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            >
              <Eye className="w-3.5 h-3.5 mr-1" /> Preview & Validate
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleCommit}
              isLoading={isLoading}
              disabled={!jsonContent.trim()}
              className="font-bold bg-indigo-600 hover:bg-indigo-700 shadow-xs"
            >
              <Play className="w-3.5 h-3.5 mr-1" /> Confirm & Ingest Payload
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
