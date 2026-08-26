import React from "react";
import { AdminService } from "@/services/admin.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, GraduationCap } from "lucide-react";

export const revalidate = 0;

export default async function AdminContentPage() {
  const { articles, courses } = await AdminService.getAdminContent();

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-purple-600" /> Articles & Structured Courses Management
        </h1>
        <p className="text-xs text-slate-500 font-medium">
          Manage Phase 3E/3F editorial articles, course modules, and access tiers.
        </p>
      </div>

      {/* Articles Section */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-teal-600" /> Editorial Articles ({articles.length})
        </h2>
        <Card className="p-6 border-slate-200 bg-white">
          {articles.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No articles found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-mono">
                    <th className="pb-3">TITLE</th>
                    <th className="pb-3">SLUG</th>
                    <th className="pb-3">READ TIME</th>
                    <th className="pb-3">ACCESS LEVEL</th>
                    <th className="pb-3">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {articles.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="py-3 font-semibold text-slate-900">{a.title}</td>
                      <td className="py-3 font-mono text-slate-500">{a.slug}</td>
                      <td className="py-3 font-mono text-slate-600">{a.readingTime}m</td>
                      <td className="py-3">
                        <Badge variant="outline" className="text-[10px]">{a.accessLevel}</Badge>
                      </td>
                      <td className="py-3">
                        <Badge variant={a.status === "PUBLISHED" ? "success" : "warning"} className="text-[10px]">
                          {a.status}
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

      {/* Courses Section */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-purple-600" /> Self-Paced Courses ({courses.length})
        </h2>
        <Card className="p-6 border-slate-200 bg-white">
          {courses.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No courses found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-mono">
                    <th className="pb-3">TITLE</th>
                    <th className="pb-3">SLUG</th>
                    <th className="pb-3">PRICE</th>
                    <th className="pb-3">ACCESS TIER</th>
                    <th className="pb-3">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {courses.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="py-3 font-semibold text-slate-900">{c.title}</td>
                      <td className="py-3 font-mono text-slate-500">{c.slug}</td>
                      <td className="py-3 font-mono text-slate-600">₹{c.priceInr}</td>
                      <td className="py-3">
                        <Badge variant="indigo" className="text-[10px]">{c.accessTier}</Badge>
                      </td>
                      <td className="py-3">
                        <Badge variant={c.isPublished ? "success" : "warning"} className="text-[10px]">
                          {c.isPublished ? "PUBLISHED" : "DRAFT"}
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
    </div>
  );
}
