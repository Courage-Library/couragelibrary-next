import React from "react";
import { MistakeService } from "@/services/mistake.service";
import { BookmarkService } from "@/services/bookmark.service";
import { MistakeLongitudinalIntelligenceService } from "@/services/mistake-longitudinal-intelligence.service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/container";
import { MistakeHero } from "@/components/mistakes/mistake-hero";
import { MistakeKpiStrip } from "@/components/mistakes/mistake-kpi-strip";
import { MistakeRevisionHealth } from "@/components/mistakes/mistake-revision-health";
import { MistakeLongitudinalCard } from "@/components/mistakes/mistake-longitudinal-card";
import { MistakeFilterBar } from "@/components/mistakes/mistake-filter-bar";
import { MistakeCard } from "@/components/mistakes/mistake-card";
import { MistakePagination } from "@/components/mistakes/mistake-pagination";
import { MistakeEmptyState } from "@/components/mistakes/mistake-empty-state";
import { MistakeSidebar } from "@/components/mistakes/mistake-sidebar";

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
      ? MistakeLongitudinalIntelligenceService.getLongitudinalOverview(supabase as any, user.id, {
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

  const determineEmptyStateType = () => {
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
    return "NO_FILTER_MATCH";
  };

  return (
    <div className="py-8 sm:py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-6 sm:space-y-8">
        {/* 1. Header / Hero */}
        <MistakeHero
          activeMistakesCount={summary.activeMistakesCount}
          totalMistakesCount={summary.totalMistakes}
        />

        {/* 2. KPI Strip */}
        <MistakeKpiStrip
          activeMistakesCount={summary.activeMistakesCount}
          unresolvedCount={summary.unresolvedCount}
          repeatedCount={summary.repeatedCount}
          revisitingCount={summary.revisitingCount}
          masteredCount={summary.masteredCount}
          currentStatus={status}
          isRepeated={isRepeated}
        />

        {/* 3. Revision Health & Spaced Intelligence Dashboard */}
        <MistakeRevisionHealth intelligence={intelligence} />

        {/* 4. Longitudinal Journey & Cross-Exam Intelligence */}
        <MistakeLongitudinalCard initialData={longitudinalData} />

        {/* 5. Main Content Grid (Feed + Sidebar) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
          {/* Main Feed Column */}
          <div className="lg:col-span-8 space-y-4">
            {/* Composable Filter Bar */}
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
            />

            {/* Mistakes List or Context-Aware Empty State */}
            {paginatedData.items.length === 0 ? (
              <MistakeEmptyState type={determineEmptyStateType()} />
            ) : (
              <div className="space-y-3.5">
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
                    <MistakeCard
                      key={m.vaultId}
                      mistake={m}
                      isBookmarked={bookmarkMap[m.questionId] ?? false}
                      learningContent={learningInfo}
                    />
                  );
                })}

                {/* Pagination Controls */}
                <MistakePagination
                  currentPage={paginatedData.page}
                  totalPages={paginatedData.totalPages}
                  totalCount={paginatedData.totalCount}
                  pageSize={paginatedData.pageSize}
                />
              </div>
            )}
          </div>

          {/* Right Sidebar Column */}
          <div className="lg:col-span-4">
            <MistakeSidebar
              cognitiveBreakdown={summary.cognitiveBreakdown}
              weakTopics={summary.weakTopics}
              currentCognitive={cognitiveType !== "ALL" ? cognitiveType : undefined}
              currentStatus={status !== "ALL" ? status : undefined}
            />
          </div>
        </div>
      </Container>
    </div>
  );
}
