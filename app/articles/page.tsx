import React from "react";
import Link from "next/link";
import { ContentService } from "@/services/content.service";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Clock, ArrowRight, FileText } from "lucide-react";

export const revalidate = 30;

export default async function ArticleLibraryPage() {
  const articles = await ContentService.getArticles();

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-8 max-w-5xl">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-teal-950 via-slate-900 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white shadow-lg space-y-3">
          <Badge variant="indigo" className="bg-white/20 text-white border-white/20">
            Phase 3E Editorial Knowledge Base
          </Badge>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-teal-400" />
            Articles & Exam Study Notes
          </h1>
          <p className="text-teal-100 text-sm max-w-2xl">
            In-depth conceptual articles, revision notes, and exam briefs designed for competitive exam preparation.
          </p>
        </div>

        {/* Articles Grid */}
        {articles.length === 0 ? (
          <Card className="p-12 text-center text-slate-400 space-y-3">
            <FileText className="w-10 h-10 mx-auto opacity-50" />
            <h3 className="text-base font-bold text-slate-700">No Published Articles Available</h3>
            <p className="text-xs">Articles and study notes will be published here soon.</p>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {articles.map((art) => (
              <Card key={art.id} className="p-5 flex flex-col justify-between hover:border-teal-300 hover:shadow-md transition-all space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant={art.accessLevel === "FREE" ? "success" : "warning"} className="text-[10px]">
                      {art.accessLevel}
                    </Badge>
                    <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {art.readingTimeMinutes} min read
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-base leading-snug line-clamp-2">
                    {art.title}
                  </h3>

                  {art.excerpt && (
                    <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                      {art.excerpt}
                    </p>
                  )}

                  {art.topicName && (
                    <span className="inline-block text-[11px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100 font-mono">
                      Topic: {art.topicName}
                    </span>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <Link href={`/articles/${art.slug}`}>
                    <Button variant="default" size="sm" className="w-full bg-teal-700 hover:bg-teal-800 font-bold text-xs">
                      Read Article <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}
