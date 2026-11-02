import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Card, CardLink, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/layout";
import { CategoryIcon } from "@/components/exams/category-icon";
import { ExamLogoBadge, NotAffiliatedLine } from "@/components/exams/exam-logo-badge";
import { siteConfig } from "@/config/site";
import { categoryIntro, type CategoryExam, type PublicCategory } from "@/lib/exams/categories";

/**
 * HOME-1: /exams/<category> — the category (icon + name inline, one line) and its exams: active ones are links (logo +
 * name), listed future exams are honest "Coming soon" rows (not links). No numbers we cannot show from live data.
 */
export function CategoryPage({ category, exams, examsFailed = false }: { category: PublicCategory; exams: CategoryExam[]; examsFailed?: boolean }) {
  const intro = examsFailed ? null : categoryIntro(category.name, exams);
  return (
    <div data-category-page={category.slug}>
      <section aria-labelledby="page-title" className="border-b border-line bg-gradient-to-b from-primary-50 to-canvas">
        <Container className="flex flex-col items-start gap-4 py-8 lg:py-12">
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Exams", href: "/exams" }, { label: category.name }]} structuredDataBaseUrl={siteConfig.url} />
          <div className="flex items-center gap-3">
            <CategoryIcon category={category} px={48} priority />
            <h1 id="page-title" className="text-h1 font-bold tracking-tight text-fg">
              {category.name} exams
            </h1>
          </div>
          {/* UX-IMP-1: the intro comes from the listed exams only (categoryIntro), never the admin free text */}
          {intro && (
            <p className="max-w-2xl text-body-lg text-fg-secondary" data-category-intro="">
              {intro}
            </p>
          )}
        </Container>
      </section>
      <Container className="py-8 lg:py-12">
        {examsFailed ? (
          <p role="status" className="rounded-card border border-line bg-surface px-5 py-6 text-body text-fg-secondary" data-category-unavailable="">
            The exam list could not be loaded right now. Reload the page, or{" "}
            <Link className="font-semibold text-link underline-offset-4 hover:underline" href="/exams">
              see all exams
            </Link>
            .
          </p>
        ) : exams.length === 0 ? (
          <p className="rounded-card border border-line bg-surface px-5 py-6 text-body text-fg-secondary" data-category-empty="">
            Exams for {category.name} are coming soon. <Link className="font-semibold text-link underline-offset-4 hover:underline" href="/exams">See all exams</Link>
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label={`${category.name} exams`}>
            {exams.map((e) => (
              <li key={e.slug} className="flex">
                {e.status === "ACTIVE" ? (
                  <Card variant="interactive" className="w-full" data-category-exam="active">
                    <div className="flex items-center gap-3">
                      <ExamLogoBadge logo={e.logo} name={e.bodyName || e.title} size="sm" />
                      <CardTitle as="h2">
                        <CardLink href={`/exams/${e.slug}`}>{e.title}</CardLink>
                      </CardTitle>
                    </div>
                    <p className="mt-3 inline-flex items-center gap-1 text-body-sm font-semibold text-link" aria-hidden="true">
                      Open exam <ArrowRight aria-hidden="true" className="size-4" />
                    </p>
                  </Card>
                ) : (
                  <div className="flex w-full items-center justify-between gap-3 rounded-card border border-dashed border-line bg-surface px-5 py-4" data-category-exam="soon">
                    <h2 className="text-body-lg font-semibold text-fg">{e.title}</h2>
                    <span className="rounded-full border border-line bg-ink-50 px-2.5 py-1 text-[14px] font-semibold text-fg-secondary">Coming soon</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-8">
          <NotAffiliatedLine body="any exam conducting body" />
        </div>
      </Container>
    </div>
  );
}
