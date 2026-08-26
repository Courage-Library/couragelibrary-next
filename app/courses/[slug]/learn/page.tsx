import React from "react";
import { notFound } from "next/navigation";
import { ContentService } from "@/services/content.service";
import { CoursePlayerClient } from "./course-player-client";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lesson?: string }>;
}

export default async function CourseLearnPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { lesson: lessonId } = await searchParams;
  const courseDetail = await ContentService.getCourseBySlug(slug);

  if (!courseDetail) {
    notFound();
  }

  return <CoursePlayerClient courseDetail={courseDetail} initialLessonId={lessonId} />;
}
