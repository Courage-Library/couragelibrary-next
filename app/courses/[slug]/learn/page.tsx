import { requireFeatureOrNotFound } from "@/lib/features/gates";
import React from "react";
import { notFound } from "next/navigation";
import { ContentService } from "@/services/content.service";
import { CoursePlayerClient } from "./course-player-client";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lesson?: string }>;
}

export default async function CourseLearnPage({ params, searchParams }: Props) {
  requireFeatureOrNotFound("COURSES"); // GAP2-2b: dormant behind FEATURE_COURSES (gate first, zero DB calls)
  const { slug } = await params;
  const { lesson: lessonId } = await searchParams;
  const courseDetail = await ContentService.getCourseBySlug(slug);

  if (!courseDetail) {
    notFound();
  }

  return <CoursePlayerClient courseDetail={courseDetail} initialLessonId={lessonId} />;
}
