import React from "react";
import { AdminContentStudioService } from "@/services/admin-content-studio.service";
import { CurriculumCoverageService } from "@/services/curriculum-coverage.service";
import { AuthoringQueueService } from "@/services/authoring-queue.service";
import { ContentStudioView } from "@/components/admin/content-studio/content-studio-view";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

export default async function AdminContentPage() {
  await requireAdminPage({ allowStaff: true, path: "/admin/content" });
  const [stats, tree, coverage, matrix, queue] = await Promise.all([
    AdminContentStudioService.getDashboardStats().catch(() => ({
      totalLearningUnits: 0,
      unitsWithDocuments: 0,
      totalDocuments: 0,
      draftVersions: 0,
      inReviewVersions: 0,
      approvedVersions: 0,
      compiledVersions: 0,
      publishedVersions: 0,
      totalAssets: 0,
      totalAssetBindings: 0,
      overallCoveragePct: 0,
    })),
    AdminContentStudioService.getAcademicHierarchy().catch(() => []),
    AdminContentStudioService.getCurriculumCoverage().catch(() => ({
      totalUnits: 0,
      publishedUnits: 0,
      coveragePct: 0,
      subjectBreakdown: [],
    })),
    CurriculumCoverageService.getCurriculumCoverageMatrix().catch(() => undefined),
    AuthoringQueueService.getAuthoringQueue().catch(() => undefined),
  ]);

  return (
    <ContentStudioView
      initialStats={stats}
      initialTree={tree}
      initialCoverage={coverage}
      initialMatrix={matrix}
      initialQueue={queue}
    />
  );
}
