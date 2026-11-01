import React from "react";
import { notFound } from "next/navigation";
import { DescriptiveService } from "@/services/descriptive.service";
import { AnswerWritingClient } from "./writing-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DescriptiveWritingPage({ params }: Props) {
  const { id } = await params;
  const question = await DescriptiveService.getDescriptiveQuestionDetail(id);

  if (!question) {
    notFound();
  }

  return <AnswerWritingClient question={question} />;
}
