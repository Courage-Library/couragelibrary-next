"use client";

import React, { useState, useActionState } from "react";
import { createInstituteAction } from "@/app/admin/actions";
import { BulkImportModal } from "@/components/admin/bulk-import-modal";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Building2, Plus, FileUp, Sparkles, ShieldCheck } from "lucide-react";

interface InstituteItem {
  id: string;
  name: string;
  slug: string;
  verificationStatus: string;
  createdAt: string;
}

interface Props {
  institutes: InstituteItem[];
}

export function AdminInstitutesManager({ institutes }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [state, formAction, isPending] = useActionState(createInstituteAction, null);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-indigo-600" /> Partner Coaching Institutes CMS
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Manage partner institute profiles, verification status, coaching batches, and assignments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="indigo" className="text-xs">
            {institutes.length} Institutes Listed
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
            className="font-bold bg-indigo-600 hover:bg-indigo-700 shadow-xs text-white"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Register Institute
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card className="p-5 border-indigo-200 bg-indigo-50/30 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-600" /> Register Partner Coaching Institute
          </h3>
          {state?.error && <Alert variant="error">{state.error}</Alert>}
          {state?.message && <Alert variant="success">{state.message}</Alert>}

          <form action={formAction} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Institute Name" name="name" placeholder="e.g. Vision IAS Academy" required />
              <Input label="URL Slug" name="slug" placeholder="vision-ias-academy" required />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="default" size="sm" isLoading={isPending} className="font-bold bg-indigo-600 hover:bg-indigo-700 text-white">
                Verify & Save Institute
              </Button>
            </div>
          </form>
        </Card>
      )}

      {showBulkImport && (
        <BulkImportModal defaultEntity="institutes" onClose={() => setShowBulkImport(false)} />
      )}

      <Card className="p-6 border-slate-200 bg-white">
        {institutes.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No partner coaching institutes found in database.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-mono">
                  <th className="pb-3">INSTITUTE NAME</th>
                  <th className="pb-3">SLUG</th>
                  <th className="pb-3">VERIFICATION STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {institutes.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="py-3 font-bold text-slate-900">{i.name}</td>
                    <td className="py-3 font-mono text-slate-600">{i.slug}</td>
                    <td className="py-3">
                      <Badge variant="success" className="text-[10px] flex items-center gap-1 w-fit">
                        <ShieldCheck className="w-3 h-3" /> {i.verificationStatus}
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
