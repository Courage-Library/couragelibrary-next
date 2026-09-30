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
 * Safely parses JSX attribute strings into typed props.
 */
function parseAttributes(attrString: string): Record<string, any> {
  const attrs: Record<string, any> = {};
  const attrRegex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|{([^}]*)}))?/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(attrString)) !== null) {
    const key = match[1];
    const strVal = match[2];
    const exprVal = match[3];

    if (strVal !== undefined) {
      attrs[key] = strVal
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    } else if (exprVal !== undefined) {
      const trimmedExpr = exprVal.trim();
      if (trimmedExpr === "true") {
        attrs[key] = true;
      } else if (trimmedExpr === "false") {
        attrs[key] = false;
      } else if (!isNaN(Number(trimmedExpr)) && trimmedExpr !== "") {
        attrs[key] = Number(trimmedExpr);
      } else {
        try {
          attrs[key] = JSON.parse(trimmedExpr);
        } catch {
          attrs[key] = trimmedExpr;
        }
      }
    } else {
      attrs[key] = true;
    }
  }

  return attrs;
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

    const trimmed = line.trim();

    // 1. Approved Controlled Component Detection (<ComponentName ... />)
    const componentMatch = trimmed.match(/^<([A-Z][a-zA-Z0-9]+)\s*([^>]*?)\/?>$/);
    if (componentMatch) {
      const compName = componentMatch[1] as keyof typeof APPROVED_COMPONENTS_MAP;
      const attrString = componentMatch[2] || "";

      if (compName in APPROVED_COMPONENTS_MAP) {
        const Component = APPROVED_COMPONENTS_MAP[compName] as React.ComponentType<any>;
        const props = parseAttributes(attrString);
        renderedElements.push(<Component key={`comp-${idx}`} {...props} />);
        return;
      }
    }

    // 2. Headings
    if (line.startsWith("# ")) {
      renderedElements.push(
        <h1 key={`h1-${idx}`} className="mt-8 mb-4 font-bold text-2xl sm:text-3xl text-gray-900 dark:text-gray-100 tracking-tight">
          {line.replace("# ", "")}
        </h1>
      );
      return;
    }

    if (line.startsWith("## ")) {
      renderedElements.push(
        <h2 key={`h2-${idx}`} className="mt-6 mb-3 font-semibold text-xl text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-800 pb-2">
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

    // 3. Bullet points
    if (line.startsWith("- ")) {
      renderedElements.push(
        <li key={`li-${idx}`} className="ml-5 list-disc text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {line.replace("- ", "")}
        </li>
      );
      return;
    }

    // 4. Basic paragraphs
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
