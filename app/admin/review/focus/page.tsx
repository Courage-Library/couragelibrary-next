import React from "react";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { AdminQuestionFactoryService } from "@/services/question-factory/admin-question-factory.service";
import { getAdminStudioSettings } from "@/lib/admin/studio-settings";
import { getMyReviewStats } from "@/lib/admin/today";
import { FocusReview } from "@/components/admin/studio/focus-review";

export const dynamic = "force-dynamic";

export const revalidate = 0;

/**
 * Courage Studio — FOCUS REVIEW (decision #84). One question at a time from the IN_REVIEW queue (oldest first).
 * Same guard as Question drafts (staff + admin); every decision goes through the EXISTING guarded QF server actions,
 * and the auto checks are computed on the server (qfGetFocusItemAction). Only version ids leave this page.
 */
export default async function FocusReviewPage() {
  const ctx = await requireAdminPage({ allowStaff: true, path: "/admin/review/focus" });
  const [queue, settings] = await Promise.all([
    AdminQuestionFactoryService.listReviewQueue({ lifecycleStatus: "IN_REVIEW", limit: 200 }),
    getAdminStudioSettings(),
  ]);
  const stats = await getMyReviewStats(ctx.userId, settings.dailyReviewGoal);
  const ids = queue.success && queue.data ? [...queue.data].reverse().map((q) => q.versionId) : null;

  return <FocusReview queue={ids} goal={settings.dailyReviewGoal} doneBefore={stats?.doneToday ?? null} />;
}
