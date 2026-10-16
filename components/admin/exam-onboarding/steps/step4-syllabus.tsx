"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";

/** Canonical syllabus status of the exam (exam_syllabus_versions), shown in the onboarding wizard. */
export interface OnboardingSyllabusStatus {
  publishedVersionNumber: number | null;
  draftCount: number;
}

interface Props {
  examId: string;
  status: OnboardingSyllabusStatus | null;
  onContinue: () => void;
  onBack: () => void;
}

/**
 * GAP2-4b: the syllabus is authored in the dedicated editor (/admin/syllabus) — staff build a DRAFT through the
 * role-checked, audited RPCs and an admin publishes it. Onboarding no longer writes a separate (legacy) projection;
 * this step shows the canonical status and hands off to the editor.
 */
export function Step4Syllabus({ examId, status, onContinue, onBack }: Props) {
  return (
    <section aria-labelledby="step4-title" className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6 font-sans text-fg">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-primary-50 text-primary-700">
          <BookOpen className="size-5" />
        </span>
        <div className="flex flex-col">
          <h2 id="step4-title" className="text-h3 font-semibold">
            Syllabus
          </h2>
          <p className="text-body-sm text-fg-secondary">Built in the syllabus editor: sections, units and canonical topics.</p>
        </div>
      </div>

      {!examId ? (
        <Alert tone="info">Save the exam identity first (step 1); then build its syllabus in the editor.</Alert>
      ) : !status ? (
        <Alert tone="warning">The syllabus status could not be loaded. Open the editor to check.</Alert>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-body-sm">
          {status.publishedVersionNumber !== null ? (
            <Badge tone="success">Published: version {status.publishedVersionNumber}</Badge>
          ) : (
            <Badge tone="warning">Not published yet</Badge>
          )}
          <Badge tone="neutral">
            {status.draftCount} draft{status.draftCount === 1 ? "" : "s"}
          </Badge>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {examId && (
          <Link href={`/admin/syllabus?exam=${examId}`} className={buttonClasses({ variant: "primary" })}>
            Open the syllabus editor
          </Link>
        )}
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button variant="ghost" onClick={onContinue}>
          Continue to knowledge
        </Button>
      </div>
    </section>
  );
}
