"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CandidateExamPost } from "@/types/exam-knowledge";

interface ExamPostsTableProps {
  posts: CandidateExamPost[];
}

export function ExamPostsTable({ posts }: ExamPostsTableProps) {
  if (!posts || posts.length === 0) {
    return (
      <Card className="p-6 text-center text-slate-400">
        <p className="text-xs">Post cadres and pay levels are being cataloged for this examination.</p>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 overflow-hidden shadow-xs">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">Post Designation</th>
                <th className="px-5 py-3.5">Department / Ministry</th>
                <th className="px-5 py-3.5">Cadre Group</th>
                <th className="px-5 py-3.5">7th CPC Pay Level</th>
                <th className="px-5 py-3.5">Basic Pay Scale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {posts.map((post) => (
                <tr key={post.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3.5 font-bold text-slate-900">
                    {post.postName}
                    {post.postCode && (
                      <span className="text-[10px] font-mono text-slate-400 ml-1.5">
                        ({post.postCode})
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">
                    {post.department || post.ministry || "Government Department"}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant="outline" className="text-[10px]">
                      {post.classificationGroup || "Group B/C"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 font-bold text-blue-700">
                    Level {post.payLevel}
                    {post.gradePay && (
                      <span className="text-[10px] text-slate-500 font-normal ml-1">
                        (GP ₹{post.gradePay})
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-slate-600">
                    {post.cpcBasicPayMin && post.cpcBasicPayMax
                      ? `₹${post.cpcBasicPayMin.toLocaleString()} – ₹${post.cpcBasicPayMax.toLocaleString()}`
                      : "Standard CPC Matrix"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
