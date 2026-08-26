import React from "react";
import Link from "next/link";
import { CommunityService } from "@/services/community.service";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Plus, ThumbsUp, Pin, HelpCircle } from "lucide-react";

export const revalidate = 0;

interface Props {
  searchParams: Promise<{ status?: string }>;
}

export default async function CommunityPage({ searchParams }: Props) {
  const { status = "ALL" } = await searchParams;
  const threads = await CommunityService.getDiscussionThreads({ status });

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-8 max-w-5xl">
        {/* Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 rounded-3xl p-6 sm:p-8 text-white shadow-lg">
          <div className="space-y-2">
            <Badge variant="indigo" className="bg-white/20 text-white border-white/20">
              Phase 3L Doubt Resolution Forum
            </Badge>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight flex items-center gap-3">
              <MessageSquare className="w-8 h-8 text-indigo-400" />
              Community Knowledge Exchange
            </h1>
            <p className="text-indigo-100 text-sm max-w-xl">
              Ask doubts, discuss exam strategy, solve questions together, and learn with peers and faculty.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/community/new">
              <Button size="lg" variant="default" className="bg-indigo-600 hover:bg-indigo-700 font-bold text-xs shadow-md">
                <Plus className="w-4 h-4 mr-2" /> Ask a Question / Start Thread
              </Button>
            </Link>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { label: "All Discussions", val: "ALL" },
            { label: "Open Doubts", val: "OPEN" },
            { label: "Resolved", val: "RESOLVED" },
          ].map((tab) => (
            <Link
              key={tab.val}
              href={`/community?status=${tab.val}`}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                status === tab.val
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {/* Threads List */}
        {threads.length === 0 ? (
          <Card className="p-12 text-center text-slate-400 space-y-3">
            <HelpCircle className="w-10 h-10 mx-auto opacity-50" />
            <h3 className="text-base font-bold text-slate-700">No Community Discussions Found</h3>
            <p className="text-xs">Be the first to ask a doubt or start a discussion thread!</p>
          </Card>
        ) : (
          <div className="space-y-3.5">
            {threads.map((t) => (
              <div
                key={t.id}
                className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-xs transition-all space-y-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {t.isPinned && (
                      <Badge variant="indigo" className="text-[10px] bg-indigo-600">
                        <Pin className="w-3 h-3 mr-1" /> PINNED
                      </Badge>
                    )}
                    <Badge variant={t.status === "RESOLVED" ? "success" : "warning"} className="text-[10px]">
                      {t.status}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {t.contextType}
                    </Badge>
                    {t.hasFacultyAnswer && (
                      <Badge variant="indigo" className="text-[10px] bg-purple-700 text-white">
                        FACULTY VERIFIED
                      </Badge>
                    )}
                  </div>

                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(t.lastActivityAt).toLocaleDateString()}
                  </span>
                </div>

                <Link href={`/community/${t.id}`} className="block group">
                  <h3 className="font-bold text-slate-900 text-base leading-snug group-hover:text-indigo-600 transition-colors">
                    {t.title}
                  </h3>
                </Link>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs font-mono text-slate-500">
                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" /> {t.messageCount} Replies
                    </span>
                    <span className="flex items-center gap-1">
                      <ThumbsUp className="w-3.5 h-3.5" /> {t.upvoteCount} Upvotes
                    </span>
                    {t.topicName && (
                      <span className="text-slate-400 font-sans">• Topic: {t.topicName}</span>
                    )}
                  </div>

                  <Link href={`/community/${t.id}`} className="font-sans font-bold text-indigo-600 hover:underline">
                    View Thread →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}
