import React from "react";
import Link from "next/link";
import { ContentService } from "@/services/content.service";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Clock, ArrowRight, FileText, Sparkles, GraduationCap } from "lucide-react";
import { constructMetadata } from "@/lib/seo/metadata";

export const revalidate = 30;

export const metadata = constructMetadata({
  title: "Articles & Exam Study Notes",
  description: "In-depth conceptual articles, revision notes, and exam briefs designed for competitive exam preparation.",
});

export default async function ArticleLibraryPage() {
  const articles = await ContentService.getArticles();

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-8 max-w-5xl">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-teal-950 via-slate-900 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white shadow-lg space-y-3">
          <Badge variant="indigo" className="bg-white/20 text-white border-white/20">
            Editorial Knowledge Base
          </Badge>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-teal-400" />
            Articles & Exam Study Notes
          </h1>
          <p className="text-teal-100 text-sm max-w-2xl">
            In-depth conceptual articles, revision notes, and exam briefs designed for competitive exam preparation.
          </p>
        </div>

        {/* Articles Grid / Empty State */}
        {articles.length === 0 ? (
          <Card className="border-slate-200/80 shadow-xs">
            <CardContent className="py-16 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto shadow-xs">
                <FileText className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="text-lg font-extrabold text-slate-900">No Published Articles Available</h3>
                <p className="text-xs text-slate-500">
                  Editorial study briefs and articles are being prepared. Explore structured video courses or practice topic-wise questions.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <Link href="/courses">
                  <Button variant="default" size="sm" className="bg-teal-700 hover:bg-teal-800 font-semibold shadow-xs">
                    <GraduationCap className="w-3.5 h-3.5 mr-1" /> View Courses
                  </Button>
                </Link>
                <Link href="/practice">
                  <Button variant="outline" size="sm" className="font-semibold">
                    <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-500" /> Practice Drills
                  </Button>
                </Link>
              </div>
            </CardContent>
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
