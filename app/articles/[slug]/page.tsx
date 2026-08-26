import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentService } from "@/services/content.service";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Target } from "lucide-react";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ArticleReaderPage({ params }: Props) {
  const { slug } = await params;
  const article = await ContentService.getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-6 max-w-3xl">
        <Link
          href="/articles"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Articles Library
        </Link>

        {/* Article Reader Card */}
        <Card className="p-6 sm:p-10 space-y-6 border-slate-200 shadow-sm bg-white">
          <div className="space-y-3 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Badge variant="indigo" className="text-xs bg-teal-700 text-white">
                ARTICLE
              </Badge>
              <Badge variant="outline" className="text-xs font-mono">
                {article.readingTimeMinutes} MIN READ
              </Badge>
              {article.topicName && (
                <span className="text-xs font-bold text-slate-500 font-mono">
                  • {article.topicName}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
              {article.title}
            </h1>

            {article.excerpt && (
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                {article.excerpt}
              </p>
            )}
          </div>

          {/* Article Body */}
          <div className="prose prose-slate max-w-none text-sm sm:text-base text-slate-800 leading-relaxed font-serif whitespace-pre-wrap">
            {article.contentBody}
          </div>

          {/* Learn More Topic Action Integration */}
          {article.relatedTopicId && (
            <div className="p-5 rounded-2xl bg-gradient-to-r from-teal-900 to-slate-900 text-white space-y-3 mt-8">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Target className="w-4 h-4 text-teal-400" />
                Closed Learning Loop: Master This Topic
              </div>
              <p className="text-xs text-teal-100">
                Reinforce what you learned in this article by testing your recall with practice questions or flashcards.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link href={`/practice?topic=${article.relatedTopicId}`}>
                  <Button size="sm" variant="default" className="bg-teal-500 hover:bg-teal-600 font-bold text-xs">
                    Practice Topic Questions
                  </Button>
                </Link>
                <Link href="/flashcards">
                  <Button size="sm" variant="outline" className="border-white/30 text-white hover:bg-white/10 font-semibold text-xs">
                    Review Flashcards
                  </Button>
                </Link>
                <Link href="/mock-tests">
                  <Button size="sm" variant="outline" className="border-white/30 text-white hover:bg-white/10 font-semibold text-xs">
                    Take Full Mock Test
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </Card>
      </Container>
    </div>
  );
}
