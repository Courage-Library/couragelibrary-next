"use client";

import React, { useState, useActionState } from "react";
import { createArticleAction, createCourseAction } from "@/app/admin/actions";
import { BulkImportModal } from "@/components/admin/bulk-import-modal";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { BookOpen, Plus, FileUp, Sparkles, GraduationCap } from "lucide-react";

interface ArticleItem {
  id: string;
  title: string;
  slug: string;
  status: string;
  readingTime: number;
  accessLevel: string;
  createdAt: string;
}

interface CourseItem {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
  accessTier: string;
  priceInr: number;
  createdAt: string;
}

interface Props {
  articles: ArticleItem[];
  courses: CourseItem[];
}

export function AdminContentManager({ articles, courses }: Props) {
  const [activeTab, setActiveTab] = useState<"articles" | "courses">("articles");
  const [showCreateArticle, setShowCreateArticle] = useState(false);
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);

  const [artState, artAction, artPending] = useActionState(createArticleAction, null);
  const [crsState, crsAction, crsPending] = useActionState(createCourseAction, null);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-teal-600" /> Articles & Video Courses CMS
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Manage editorial study briefs, article version history, video courses, modules, and lessons.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBulkImport(true)}
            className="font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50"
          >
            <FileUp className="w-4 h-4 mr-1.5" /> Bulk Import JSON
          </Button>
          {activeTab === "articles" ? (
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowCreateArticle(!showCreateArticle)}
              className="font-bold bg-teal-700 hover:bg-teal-800 shadow-xs text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Create Article
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowCreateCourse(!showCreateCourse)}
              className="font-bold bg-indigo-600 hover:bg-indigo-700 shadow-xs text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Create Course
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("articles")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "articles" ? "bg-teal-700 text-white shadow-xs" : "bg-white text-slate-600 border border-slate-200"
          }`}
        >
          Articles & Study Notes ({articles.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("courses")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "courses" ? "bg-indigo-600 text-white shadow-xs" : "bg-white text-slate-600 border border-slate-200"
          }`}
        >
          Video Courses & Modules ({courses.length})
        </button>
      </div>

      {showCreateArticle && activeTab === "articles" && (
        <Card className="p-5 border-teal-200 bg-teal-50/30 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-teal-600" /> Create Editorial Study Article
          </h3>
          {artState?.error && <Alert variant="error">{artState.error}</Alert>}
          {artState?.message && <Alert variant="success">{artState.message}</Alert>}

          <form action={artAction} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Article Title" name="title" placeholder="e.g. Mastering Vedic Mathematics" required />
              <Input label="URL Slug" name="slug" placeholder="vedic-mathematics-shortcuts" required />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Markdown Body Content</label>
              <textarea
                name="contentMarkdown"
                rows={6}
                placeholder="# Article Header..."
                required
                className="w-full p-3 rounded-xl border border-slate-200 font-mono text-xs text-slate-800 bg-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateArticle(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="default" size="sm" isLoading={artPending} className="font-bold bg-teal-700 hover:bg-teal-800">
                Save & Publish Article
              </Button>
            </div>
          </form>
        </Card>
      )}

      {showCreateCourse && activeTab === "courses" && (
        <Card className="p-5 border-indigo-200 bg-indigo-50/30 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
            <GraduationCap className="w-4 h-4 text-indigo-600" /> Create Video Course
          </h3>
          {crsState?.error && <Alert variant="error">{crsState.error}</Alert>}
          {crsState?.message && <Alert variant="success">{crsState.message}</Alert>}

          <form action={crsAction} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Course Title" name="title" placeholder="e.g. Complete UPSC Civil Services GS-1 Masterclass" required />
              <Input label="URL Slug" name="slug" placeholder="upsc-gs1-masterclass" required />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Price (INR)</label>
              <input
                type="number"
                name="priceInr"
                defaultValue={0}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateCourse(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="default" size="sm" isLoading={crsPending} className="font-bold bg-indigo-600 hover:bg-indigo-700">
                Save & Publish Course
              </Button>
            </div>
          </form>
        </Card>
      )}

      {showBulkImport && (
        <BulkImportModal defaultEntity={activeTab} onClose={() => setShowBulkImport(false)} />
      )}

      <Card className="p-6 border-slate-200 bg-white">
        {activeTab === "articles" ? (
          articles.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">No articles found in database.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-mono">
                    <th className="pb-3">TITLE</th>
                    <th className="pb-3">SLUG</th>
                    <th className="pb-3">READ TIME</th>
                    <th className="pb-3">ACCESS</th>
                    <th className="pb-3">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {articles.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="py-3 font-bold text-slate-900">{a.title}</td>
                      <td className="py-3 font-mono text-slate-600">{a.slug}</td>
                      <td className="py-3 font-mono text-slate-600">{a.readingTime} mins</td>
                      <td className="py-3 font-mono font-bold text-teal-700">{a.accessLevel}</td>
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
          )
        ) : courses.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No courses found in database.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-mono">
                  <th className="pb-3">TITLE</th>
                  <th className="pb-3">SLUG</th>
                  <th className="pb-3">PRICE (INR)</th>
                  <th className="pb-3">ACCESS TIER</th>
                  <th className="pb-3">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {courses.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-3 font-bold text-slate-900">{c.title}</td>
                    <td className="py-3 font-mono text-slate-600">{c.slug}</td>
                    <td className="py-3 font-mono text-slate-600">₹{c.priceInr}</td>
                    <td className="py-3 font-mono font-bold text-indigo-700">{c.accessTier}</td>
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
  );
}
