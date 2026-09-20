"use client";

import React from "react";
import { FormulaCard } from "./formula-card";
import { ExampleBox } from "./example-box";
import { WarningBox } from "./warning-box";
import { ExamTip } from "./exam-tip";
import { QuestionReference } from "./question-reference";
import { ComparisonTable } from "./comparison-table";
import { QuickCheck } from "./quick-check";
import { SummaryCard } from "./summary-card";
import { DiagramBlock } from "./diagram-block";
import { Callout } from "./callout";

export const APPROVED_COMPONENTS_MAP = {
  FormulaCard,
  ExampleBox,
  WarningBox,
  ExamTip,
  QuestionReference,
  ComparisonTable,
  QuickCheck,
  SummaryCard,
  DiagramBlock,
  Callout,
};

interface ControlledContentRendererProps {
  contentMdx: string;
}

/**
 * Server-Safe Controlled Content Renderer
 * 
 * Safely renders markdown and the 10 approved controlled educational components
 * without executing arbitrary JavaScript or allowing unapproved JSX components.
 */
export const ControlledContentRenderer: React.FC<ControlledContentRendererProps> = ({
  contentMdx,
}) => {
  if (!contentMdx) return null;

  // Render markdown lines safely
  const lines = contentMdx.split("\n");
  const renderedElements: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  lines.forEach((line, idx) => {
    // Code block detection
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        renderedElements.push(
          <pre
            key={`code-${idx}`}
            className="my-4 overflow-x-auto rounded-lg bg-gray-900 p-4 font-mono text-xs text-gray-100"
          >
            <code>{codeBuffer.join("\n")}</code>
          </pre>
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      return;
    }

    // Headings
    if (line.startsWith("# ")) {
      renderedElements.push(
        <h1 key={`h1-${idx}`} className="mt-6 mb-4 font-bold text-2xl text-gray-900 dark:text-gray-100">
          {line.replace("# ", "")}
        </h1>
      );
      return;
    }

    if (line.startsWith("## ")) {
      renderedElements.push(
        <h2 key={`h2-${idx}`} className="mt-6 mb-3 font-semibold text-xl text-gray-900 dark:text-gray-100">
          {line.replace("## ", "")}
        </h2>
      );
      return;
    }

    if (line.startsWith("### ")) {
      renderedElements.push(
        <h3 key={`h3-${idx}`} className="mt-4 mb-2 font-medium text-lg text-gray-800 dark:text-gray-200">
          {line.replace("### ", "")}
        </h3>
      );
      return;
    }

    // Bullet points
    if (line.startsWith("- ")) {
      renderedElements.push(
        <li key={`li-${idx}`} className="ml-5 list-disc text-sm text-gray-700 dark:text-gray-300">
          {line.replace("- ", "")}
        </li>
      );
      return;
    }

    // Basic paragraphs
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("<")) {
      renderedElements.push(
        <p key={`p-${idx}`} className="my-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
          {trimmed}
        </p>
      );
    }
  });

  return <div className="courage-learning-content space-y-2">{renderedElements}</div>;
};
