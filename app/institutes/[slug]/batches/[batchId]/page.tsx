import React from "react";
import { notFound } from "next/navigation";
import { InstituteService } from "@/services/institute.service";
import { BatchDashboardClient } from "./batch-client";

interface Props {
  params: Promise<{ slug: string; batchId: string }>;
}

export default async function BatchDashboardPage({ params }: Props) {
  const { batchId } = await params;
  const batchDetail = await InstituteService.getBatchDetail(batchId);

  if (!batchDetail) {
    notFound();
  }

  return <BatchDashboardClient batchDetail={batchDetail} />;
}
