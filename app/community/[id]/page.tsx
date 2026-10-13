import React from "react";
import { notFound } from "next/navigation";
import { CommunityService } from "@/services/community.service";
import { DiscussionThreadClient } from "./thread-client";
import { isFeatureEnabled } from "@/config/features";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ThreadDetailPage({ params }: Props) {
  const { id } = await params;
  const detail = await CommunityService.getThreadDetail(id);

  if (!detail) {
    notFound();
  }

  return <DiscussionThreadClient detail={detail} coursesEnabled={isFeatureEnabled("COURSES")} />;
}
