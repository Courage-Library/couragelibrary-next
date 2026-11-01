import React from "react";
import { MistakeService } from "@/services/mistake.service";
import { BookmarkService } from "@/services/bookmark.service";
import { MistakeLongitudinalIntelligenceService } from "@/services/mistake-longitudinal-intelligence.service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/layout";
import { Accordion } from "@/components/ui/accordion";
import { MistakeHero } from "@/components/mistakes/mistake-hero";
import { MistakeKpiStrip } from "@/components/mistakes/mistake-kpi-strip";
import { MistakeRevisionToday, MistakeRevisionPlan } from "@/components/mistakes/mistake-revision-health";
import { MistakeLongitudinalCard } from "@/components/mistakes/mistake-longitudinal-card";
import { MistakeFilterBar } from "@/components/mistakes/mistake-filter-bar";
import { MistakeCard } from "@/components/mistakes/mistake-card";
import { MistakePagination } from "@/components/mistakes/mistake-pagination";
import { MistakeEmptyState, type MistakeEmptyStateType } from "@/components/mistakes/mistake-empty-state";
import { MistakeReasons, MistakeFocusTopics } from "@/components/mistakes/mistake-sidebar";

export const revalidate = 0; // Dynamic server

interface Props {
  searchParams: Promise<{
    status?: string;
    repeated?: string;
    bookmarked?: string;
    subject?: string;
    topic?: string;
    cognitive?: string;
    sort?: "recent" | "repeated" | "oldest" | "topic" | "priority";
    focus?: string;
    dueOnly?: string;
    highPriorityOnly?: string;
    q?: string;
    page?: string;
  }>;
}

export default async function MistakeVaultPage({ searchParams }: Props) {
  const params = await searchParams;
  const status = params.status || "ALL";
  const isRepeated = params.repeated === "true";
  const isBookmarked = params.bookmarked === "true";
  const subjectId = params.subject || "ALL";
  const topicId = params.topic || "ALL";
  const cognitiveType = params.cognitive || "ALL";
  const sortBy = (params.sort as any) || "recent";
  const searchQuery = params.q || "";
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [summary, paginatedData, filterOptions, intelligence, longitudinalData] = await Promise.all([
    MistakeService.getMistakeVaultSummary(),
    MistakeService.getPaginatedMistakesList({
      status: status === "ALL" ? undefined : status,
      repeatedOnly: isRepeated,
      bookmarkedOnly: isBookmarked,
      subjectId: subjectId === "ALL" ? undefined : subjectId,
      topicId: topicId === "ALL" ? undefined : topicId,
      cognitiveType: cognitiveType === "ALL" ? undefined : cognitiveType,
      sortBy,
      focus: params.focus,
      dueOnly: params.dueOnly === "true",
      highPriorityOnly: params.highPriorityOnly === "true",
      searchQuery: searchQuery.trim() || undefined,
      page,
      pageSize: 20,
    }),
    MistakeService.getAvailableFilterOptions(),
    MistakeService.getRevisionHealthIntelligence(),
    user
      ? MistakeLongitudinalIntelligenceService.getLongitudinalOverview(supabase, user.id, {
          windowDays: "30D",
        }).catch((err) => {
          console.error("[MistakeVaultPage] Failed to fetch longitudinal intelligence:", err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  // Batch query bookmark status and learning resources for the current page items in 2 single batch queries (0 N+1)
  const pageQuestionIds = paginatedData.items.map((m) => m.questionId);
  const pageTopicIds = Array.from(new Set(paginatedData.items.map((m) => m.topicId).filter(Boolean) as string[]));

  const [bookmarkMap, learningContentMap] = await Promise.all([
    BookmarkService.getBookmarkedQuestionIdMap(pageQuestionIds),
    MistakeService.getBatchLearningContentForTopics(pageTopicIds),
  ]);

  const otherFiltersActive = Boolean(searchQuery.trim()) || subjectId !== "ALL" || cognitiveType !== "ALL";
  const determineEmptyStateType = (): MistakeEmptyStateType => {
    if (summary.totalMistakes === 0) {
      return "NO_MISTAKES_EVER";
    }
    if (summary.activeMistakesCount === 0 && (!params.status || params.status === "ALL") && !isRepeated && !isBookmarked) {
      return "ALL_MASTERED";
    }
    if (isRepeated && summary.repeatedCount === 0) {
      return "NO_REPEATED";
    }
    if (status === "REVISITING" && summary.revisitingCount === 0) {
      return "NO_IMPROVING";
    }
    if (isBookmarked && !otherFiltersActive) {
      return "NO_BOOKMARKED";
    }
    return "NO_FILTER_MATCH";
  };

  const hasMistakes = summary.totalMistakes > 0;
  const query: Record<string, string | undefined> = { ...params, page: undefined };

  return (
    <Container className="flex flex-col gap-6 py-8 lg:py-10">
      {/* 1. Header */}
      <MistakeHero activeMistakesCount={summary.activeMistakesCount} totalMistakesCount={summary.totalMistakes} />

      {!hasMistakes ? (
        <MistakeEmptyState type="NO_MISTAKES_EVER" />
      ) : (
        <>
          {/* 2. Primary task: what to revise today, one primary action */}
          <MistakeRevisionToday intelligence={intelligence} />

          {/* 3. Counts */}
          <MistakeKpiStrip
            activeMistakesCount={summary.activeMistakesCount}
            unresolvedCount={summary.unresolvedCount}
            repeatedCount={summary.repeatedCount}
            revisitingCount={summary.revisitingCount}
            masteredCount={summary.masteredCount}
          />

          {/* 4. List (filters + cards) and secondary insights */}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            <section aria-labelledby="mistake-list-title" className="flex flex-col gap-4 lg:col-span-8">
              <h2 id="mistake-list-title" className="text-h2 font-semibold text-fg">
                Your mistakes
              </h2>
              <MistakeFilterBar
                subjects={filterOptions.subjects}
                cognitiveTypes={filterOptions.cognitiveTypes}
                currentStatus={status}
                currentRepeated={isRepeated}
                currentBookmarked={isBookmarked}
                currentSubject={subjectId}
                currentCognitive={cognitiveType}
                currentSort={sortBy}
                currentQuery={searchQuery}
                query={query}
              />

              {paginatedData.items.length === 0 ? (
                <MistakeEmptyState type={determineEmptyStateType()} />
              ) : (
                <>
                  <ul className="flex flex-col gap-3">
                    {paginatedData.items.map((m) => {
                      const topicRes = m.topicId ? learningContentMap[m.topicId] : null;
                      const learningInfo =
                        topicRes?.hasLearningContent && topicRes.primaryResource
                          ? {
                              hasContent: true,
                              title: topicRes.primaryResource.title,
                              canonicalUrl: topicRes.primaryResource.canonicalUrl,
                              isLocked: topicRes.primaryResource.isLocked,
                            }
                          : null;

                      return (
                        <li key={m.vaultId}>
                          <MistakeCard mistake={m} isBookmarked={bookmarkMap[m.questionId] ?? false} learningContent={learningInfo} />
                        </li>
                      );
                    })}
                  </ul>
                  <MistakePagination
                    currentPage={paginatedData.page}
                    totalPages={paginatedData.totalPages}
                    totalCount={paginatedData.totalCount}
                    pageSize={paginatedData.pageSize}
                    query={query}
                  />
                </>
              )}
            </section>

            <section aria-labelledby="mistake-insights-title" className="flex flex-col gap-4 lg:col-span-4">
              <h2 id="mistake-insights-title" className="text-h2 font-semibold text-fg">
                More about your mistakes
              </h2>
              <Accordion
                type="multiple"
                headingLevel={3}
                items={[
                  { id: "plan", title: "Revision plan", content: <MistakeRevisionPlan intelligence={intelligence} /> },
                  { id: "progress", title: "Your progress over time", content: <MistakeLongitudinalCard initialData={longitudinalData} /> },
                  {
                    id: "reasons",
                    title: "Why you got it wrong",
                    content: (
                      <MistakeReasons
                        cognitiveBreakdown={summary.cognitiveBreakdown}
                        currentCognitive={cognitiveType !== "ALL" ? cognitiveType : undefined}
                        currentStatus={status !== "ALL" ? status : undefined}
                      />
                    ),
                  },
                  { id: "topics", title: "Topics to focus on", content: <MistakeFocusTopics weakTopics={summary.weakTopics} /> },
                ]}
              />
            </section>
          </div>
        </>
      )}
    </Container>
  );
}
