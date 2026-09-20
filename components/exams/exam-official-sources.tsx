"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { CandidateOfficialSource } from "@/types/exam-knowledge";

interface ExamOfficialSourcesProps {
  sources: CandidateOfficialSource[];
}

export function ExamOfficialSources({ sources }: ExamOfficialSourcesProps) {
  if (!sources || sources.length === 0) {
    return (
      <Card className="p-6 text-center text-slate-400">
        <p className="text-xs">Official commission sources and circulars are being cataloged.</p>
      </Card>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {sources.map((src) => (
        <Card key={src.id} className="border-slate-200 hover:border-blue-300 hover:shadow-xs transition-all">
          <CardContent className="p-4 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <Badge variant="outline" className="text-[10px] uppercase">
                  {src.sourceType.replace(/_/g, " ")}
                </Badge>
              </div>
              <h5 className="text-xs font-bold text-slate-900 leading-snug">{src.title}</h5>
              <p className="text-[11px] text-slate-500">
                Issuing Body: {src.issuingAuthority}
                {src.publishedDate && ` • ${src.publishedDate}`}
              </p>
            </div>
            {src.sourceUrl && (
              <a
                href={src.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-500 hover:text-blue-700 transition-colors shrink-0"
                aria-label={`Open source document: ${src.title}`}
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
