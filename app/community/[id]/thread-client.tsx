"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThreadDetail, DiscussionMessageItem } from "@/services/community.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CheckCircle2,
  ThumbsUp,
  MessageSquare,
  Send,
  Flag,
  Target,
  Award,
  ShieldAlert,
} from "lucide-react";

interface DiscussionThreadClientProps {
  detail: ThreadDetail;
}

export function DiscussionThreadClient({ detail }: DiscussionThreadClientProps) {
  const router = useRouter();
  const { thread, messages, topicId, isAuthor } = detail;

  const [replyText, setReplyText] = useState("");
  const [replyParentId, setReplyParentId] = useState<string | undefined>(undefined);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Voting handler
  const handleVote = async (msg: DiscussionMessageItem) => {
    const action = msg.userHasVoted ? "REMOVE" : "ADD";
    try {
      const res = await fetch("/api/community/vote-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: msg.id, action }),
      });
      const data = await res.json();
      if (data.success) {
        router.refresh();
      }
    } catch {
      // Silent error
    }
  };

  // Mark accepted answer handler
  const handleMarkAccepted = async (msgId: string) => {
    try {
      const res = await fetch("/api/community/mark-accepted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: thread.id, messageId: msgId }),
      });
      const data = await res.json();
      if (data.success) {
        router.refresh();
      } else {
        alert(data.error || "Failed to mark accepted answer");
      }
    } catch {
      alert("Network error marking accepted answer");
    }
  };

  // Post reply handler
  const handlePostReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    setErrorMsg(null);
    setIsSubmittingReply(true);

    try {
      const res = await fetch("/api/community/post-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: thread.id,
          contentMarkdown: replyText,
          parentMessageId: replyParentId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setReplyText("");
        setReplyParentId(undefined);
        router.refresh();
      } else {
        setErrorMsg(data.error || "Failed to post reply.");
      }
    } catch {
      setErrorMsg("Network error posting reply.");
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // Flag content handler
  const handleFlag = async (targetType: "THREAD" | "MESSAGE", targetId: string) => {
    const reason = prompt("Enter reason for reporting (SPAM, TOXICITY, INAPPROPRIATE, MISINFORMATION, OTHER):", "SPAM");
    if (!reason) return;

    try {
      const res = await fetch("/api/community/flag-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason: reason.toUpperCase() }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Content reported for moderation.");
      } else {
        alert(data.error || "Failed to report content.");
      }
    } catch {
      alert("Network error reporting content.");
    }
  };

  return (
    <div className="py-8 bg-slate-50/50 min-h-[calc(100vh-4rem)] px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation */}
        <Link
          href="/community"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Community Forum
        </Link>

        {/* Thread Banner */}
        <Card className="p-6 sm:p-8 space-y-4 border-slate-200 shadow-sm bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge variant={thread.status === "RESOLVED" ? "success" : "warning"} className="text-[10px]">
                {thread.status}
              </Badge>
              <Badge variant="indigo" className="text-[10px]">
                {thread.contextType}
              </Badge>
              {thread.hasFacultyAnswer && (
                <Badge variant="indigo" className="text-[10px] bg-purple-700 text-white">
                  FACULTY ANSWERED
                </Badge>
              )}
            </div>

            <button
              onClick={() => handleFlag("THREAD", thread.id)}
              className="text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1 font-semibold"
            >
              <Flag className="w-3.5 h-3.5" /> Report Thread
            </button>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-snug">
            {thread.title}
          </h1>

          <div className="flex items-center justify-between text-xs text-slate-500 font-mono pt-2 border-t border-slate-100">
            <span>Posted: {new Date(thread.createdAt).toLocaleString()}</span>
            <span>{thread.messageCount} Messages</span>
          </div>

          {/* Learn More Topic Action Integration */}
          {topicId && (
            <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-100 space-y-2 font-sans text-xs">
              <div className="flex items-center gap-2 font-bold text-indigo-900">
                <Target className="w-4 h-4 text-indigo-600" />
                Related Topic Resources
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link href={`/practice?topic=${topicId}`}>
                  <Button size="sm" variant="default" className="bg-indigo-600 hover:bg-indigo-700 font-bold text-xs">
                    Practice Topic Questions
                  </Button>
                </Link>
                <Link href="/articles">
                  <Button size="sm" variant="outline" className="text-xs font-semibold">
                    Read Topic Articles
                  </Button>
                </Link>
                <Link href="/courses">
                  <Button size="sm" variant="outline" className="text-xs font-semibold">
                    Study Courses
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </Card>

        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Replies List */}
        <div className="space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-600" /> Discussion Replies ({messages.length})
          </h2>

          {messages.map((m) => {
            const isAccepted = thread.acceptedAnswerId === m.id;

            return (
              <Card
                key={m.id}
                className={`p-5 space-y-3 transition-all ${
                  isAccepted ? "border-emerald-300 bg-emerald-50/30" : "border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 font-mono text-slate-500">
                    <span className="font-bold text-slate-800">Author: {m.authorId.slice(0, 8)}...</span>
                    <span>• {new Date(m.createdAt).toLocaleString()}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isAccepted && (
                      <Badge variant="success" className="text-[10px] flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> ACCEPTED ANSWER
                      </Badge>
                    )}
                    {m.isFacultyVerified && (
                      <Badge variant="indigo" className="text-[10px] bg-purple-700 text-white">
                        FACULTY VERIFIED
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs sm:text-sm text-slate-900 leading-relaxed font-serif whitespace-pre-wrap">
                  {m.contentMarkdown}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <button
                    onClick={() => handleVote(m)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-mono text-xs font-bold transition-all ${
                      m.userHasVoted
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" /> {m.upvoteCount}
                  </button>

                  <div className="flex items-center gap-2">
                    {(isAuthor || m.isFacultyVerified) && !isAccepted && (
                      <button
                        onClick={() => handleMarkAccepted(m.id)}
                        className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1"
                      >
                        <Award className="w-3.5 h-3.5 text-emerald-600" /> Accept Answer
                      </button>
                    )}

                    <button
                      onClick={() => handleFlag("MESSAGE", m.id)}
                      className="text-[11px] text-slate-400 hover:text-rose-600"
                    >
                      Report
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Reply Composer */}
        <Card className="p-6 space-y-4 border-slate-200 shadow-sm bg-white">
          <h3 className="font-bold text-slate-900 text-sm">Post a Reply</h3>

          <form onSubmit={handlePostReply} className="space-y-4">
            <textarea
              rows={4}
              required
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write your explanation or answer (Markdown supported)..."
              className="w-full p-4 rounded-xl border border-slate-200 text-xs sm:text-sm font-serif leading-relaxed outline-none focus:border-indigo-600 resize-y"
            />

            <div className="flex justify-end">
              <Button
                type="submit"
                size="md"
                variant="default"
                className="bg-indigo-600 hover:bg-indigo-700 font-bold px-6 text-xs"
                isLoading={isSubmittingReply}
              >
                <Send className="w-4 h-4 mr-2" /> Post Reply
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
