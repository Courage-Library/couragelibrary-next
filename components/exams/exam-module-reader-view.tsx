"use client";

import React from "react";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ShieldCheck, ExternalLink, HelpCircle } from "lucide-react";
import { CandidatePublishedModule } from "@/types/exam-knowledge";
import { ExamFaqAccordion } from "./exam-faq-accordion";
import { ExamMdxArticleRenderer } from "./exam-mdx-article-renderer";

interface ExamModuleReaderViewProps {
  examSlug: string;
  examTitle: string;
  moduleData: CandidatePublishedModule;
  cycleYear?: number;
  isPreview?: boolean;
}

export function ExamModuleReaderView({
  examSlug,
  examTitle,
  moduleData,
  cycleYear,
  isPreview = false,
}: ExamModuleReaderViewProps) {
  const backHref = cycleYear ? `/exams/${examSlug}/cycle/${cycleYear}` : `/exams/${examSlug}`;

  const hasCompiledFaqs = Boolean(
    moduleData.compiledMdx && moduleData.compiledMdx.includes("## Frequently Asked Questions")
  );
  const hasCompiledSources = Boolean(
    moduleData.compiledMdx && moduleData.compiledMdx.includes("## Official Sources")
  );

  return (
    <div className={isPreview ? "py-2" : "py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]"}>
      <Container className={`space-y-6 ${isPreview ? "p-0 max-w-none" : "max-w-4xl"}`}>
        {!isPreview && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to {examTitle} Hub
          </Link>
        )}

        {/* Module Header Card */}
        <Card className="p-6 sm:p-10 space-y-6 border-slate-200 shadow-sm bg-white">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="indigo" className="text-xs">
                {moduleData.displayName}
              </Badge>
              {cycleYear && (
                <Badge variant="outline" className="text-xs font-mono">
                  Cycle {cycleYear}
                </Badge>
              )}
              {moduleData.lastVerifiedDate && (
                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/60">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Verified: {moduleData.lastVerifiedDate}</span>
                </div>
              )}
            </div>

            <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
              {moduleData.title}
            </h1>

            {moduleData.description && (
              <p className="text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
                {moduleData.description}
              </p>
            )}
          </div>

          <hr className="border-slate-100" />

          {/* Canonical MDX Guide Content Body */}
          {moduleData.compiledMdx ? (
            <ExamMdxArticleRenderer
              content={moduleData.compiledMdx}
              hideLeadingTitle={true}
            />
          ) : (
            <div className="py-12 text-center text-xs text-slate-400 font-mono">
              Guide content is pending compilation.
            </div>
          )}

          {/* Fallback Official Sources Citation Section (if not already embedded in compiled MDX) */}
          {!hasCompiledSources && moduleData.officialSources && moduleData.officialSources.length > 0 && (
            <div className="space-y-3 pt-6 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Authoritative Sources & Official Citations</span>
              </h3>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {moduleData.officialSources.map((src, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-bold text-slate-800 block">{src.title}</span>
                      <span className="text-slate-500 text-[11px]">{src.issuingAuthority}</span>
                    </div>
                    {src.sourceUrl && (
                      <a
                        href={src.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-white border border-slate-200 hover:text-blue-600 shadow-2xs"
                        aria-label={`Open source ${src.title}`}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fallback Module FAQs Section (if not already embedded in compiled MDX) */}
          {!hasCompiledFaqs && moduleData.faqs && moduleData.faqs.length > 0 && (
            <div className="space-y-3 pt-6 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-blue-600" />
                <span>Frequently Asked Questions</span>
              </h3>
              <ExamFaqAccordion faqs={moduleData.faqs} />
            </div>
          )}
        </Card>
      </Container>
    </div>
  );
}
