"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, ShieldAlert, MessageSquare } from "lucide-react";

export function NewThreadClient() {
  const router = useRouter();
  const [contextType, setContextType] = useState<string>("TOPIC");
  const [contextId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [initialContent, setInitialContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (title.trim().length < 5) {
      setErrorMsg("Title must be at least 5 characters long.");
      return;
    }
    if (initialContent.trim().length < 2) {
      setErrorMsg("Initial content must be provided.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/community/create-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contextType,
          contextId: contextId.trim() || undefined,
          title,
          initialContent,
        }),
      });

      const data = await res.json();
      if (data.success && data.thread_id) {
        router.push(`/community/${data.thread_id}`);
      } else {
        setErrorMsg(data.error || "Failed to create thread.");
      }
    } catch {
      setErrorMsg("Network error creating thread.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="py-8 bg-slate-50/50 min-h-[calc(100vh-4rem)] px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          href="/community"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Community Forum
        </Link>

        <Card className="p-6 sm:p-8 space-y-6 border-slate-200 shadow-sm bg-white">
          <div className="space-y-1 pb-3 border-b border-slate-100">
            <Badge variant="indigo" className="text-[10px]">
              COMMUNITY DOUBT FORUM
            </Badge>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <MessageSquare className="w-6 h-6 text-indigo-600" /> Start Discussion / Ask a Doubt
            </h1>
          </div>

          {errorMsg && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Context Category</label>
              <select
                value={contextType}
                onChange={(e) => setContextType(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 bg-white font-medium outline-none"
              >
                <option value="TOPIC">Topic Discussion</option>
                <option value="QUESTION">Question Doubt</option>
                <option value="LESSON">Course Lesson Doubt</option>
                <option value="ARTICLE">Article Discussion</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Discussion Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., How to solve geometry angle bisector problems efficiently?"
                className="w-full p-3 rounded-xl border border-slate-200 font-medium outline-none focus:border-indigo-600"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Question / Discussion Details (Markdown Supported)</label>
              <textarea
                rows={8}
                required
                value={initialContent}
                onChange={(e) => setInitialContent(e.target.value)}
                placeholder="Describe your doubt in detail. Include any formulas or steps where you got stuck..."
                className="w-full p-4 rounded-xl border border-slate-200 font-serif leading-relaxed outline-none focus:border-indigo-600 resize-y"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Link href="/community">
                <Button type="button" variant="outline" size="lg" className="font-semibold">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                size="lg"
                variant="default"
                className="bg-indigo-600 hover:bg-indigo-700 font-bold px-8"
                isLoading={isSubmitting}
              >
                <Send className="w-4 h-4 mr-2" /> Post Thread
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
