"use client";

import React, { useMemo, useState } from "react";
import {
  Info,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface ExamMdxArticleRendererProps {
  content: string;
  className?: string;
  hideLeadingTitle?: boolean;
}

export type BlockType =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "h4"; text: string }
  | { type: "callout"; variant: string; title: string; body: string }
  | { type: "blockquote"; text: string }
  | { type: "table"; headers: string[]; alignments: string[]; rows: string[][] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; lang: string; code: string }
  | { type: "p"; text: string };

const SAFE_PROTOCOLS = ["https:", "http:", "mailto:"];

export function isSafeUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return true;
  try {
    const parsed = new URL(trimmed);
    return SAFE_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Safely parse inline markdown formatting (bold, italic, code, links, bare URLs)
 * into structured React nodes without dangerouslySetInnerHTML.
 */
export function renderInlineMarkdown(text: string): React.ReactNode {
  if (!text || typeof text !== "string") return "";

  const regex =
    /(\[(?<linkText>[^\]]+)\]\((?<linkUrl>[^)]+)\))|(\*\*(?<boldText>[^*]+)\*\*)|(\*(?<italicText>[^*]+)\*)|(`(?<codeText>[^`]+)`)|(?<bareUrl>https?:\/\/[^\s<>"]+)/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }

    const groups = match.groups || {};

    if (groups.linkText && groups.linkUrl) {
      const rawUrl = groups.linkUrl.trim();
      if (isSafeUrl(rawUrl)) {
        const isExternal = rawUrl.startsWith("http");
        elements.push(
          <a
            key={`link-${keyCounter++}`}
            href={rawUrl}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className="text-blue-600 hover:text-blue-800 hover:underline font-semibold inline-flex items-center gap-0.5 break-words"
          >
            <span>{groups.linkText}</span>
            {isExternal && (
              <ExternalLink className="w-3 h-3 inline-block shrink-0 ml-0.5 text-blue-500" />
            )}
          </a>
        );
      } else {
        elements.push(groups.linkText);
      }
    } else if (groups.boldText) {
      elements.push(
        <strong key={`bold-${keyCounter++}`} className="font-bold text-slate-900">
          {groups.boldText}
        </strong>
      );
    } else if (groups.italicText) {
      elements.push(
        <em key={`italic-${keyCounter++}`} className="italic text-slate-800">
          {groups.italicText}
        </em>
      );
    } else if (groups.codeText) {
      elements.push(
        <code
          key={`code-${keyCounter++}`}
          className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-800 font-mono text-xs border border-slate-200"
        >
          {groups.codeText}
        </code>
      );
    } else if (groups.bareUrl) {
      const rawUrl = groups.bareUrl.trim();
      if (isSafeUrl(rawUrl)) {
        elements.push(
          <a
            key={`url-${keyCounter++}`}
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 hover:underline font-semibold inline-flex items-center gap-0.5 break-all"
          >
            <span>{rawUrl}</span>
            <ExternalLink className="w-3 h-3 inline-block shrink-0 ml-0.5 text-blue-500" />
          </a>
        );
      } else {
        elements.push(rawUrl);
      }
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return <>{elements}</>;
}

/**
 * Parses a markdown document string into an array of typed block AST nodes.
 */
export function parseMarkdownDocument(md: string): BlockType[] {
  if (!md || typeof md !== "string") return [];
  const lines = md.split("\n");
  const blocks: BlockType[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Code block
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ type: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    // Headings
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      blocks.push({ type: "h1", text: trimmed.slice(2).trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith("## ") && !trimmed.startsWith("### ")) {
      blocks.push({ type: "h2", text: trimmed.slice(3).trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith("### ") && !trimmed.startsWith("#### ")) {
      blocks.push({ type: "h3", text: trimmed.slice(4).trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith("#### ")) {
      blocks.push({ type: "h4", text: trimmed.slice(5).trim() });
      i++;
      continue;
    }

    // Blockquote or Callout
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (
        i < lines.length &&
        (lines[i].trim().startsWith(">") ||
          (quoteLines.length > 0 &&
            lines[i].trim() !== "" &&
            !lines[i].trim().startsWith("#") &&
            !lines[i].trim().startsWith("|") &&
            !lines[i].trim().startsWith("- ") &&
            !lines[i].trim().startsWith("* ") &&
            !/^\d+\.\s+/.test(lines[i].trim())))
      ) {
        const qLine = lines[i].trim();
        if (qLine.startsWith(">")) {
          quoteLines.push(qLine.replace(/^>\s?/, ""));
        } else {
          quoteLines.push(qLine);
        }
        i++;
      }

      const fullQuote = quoteLines.join("\n").trim();
      const calloutMatch = fullQuote.match(
        /^\*\*([A-Z_]+):\s*([^*]+)\*\*\s*\n?([\s\S]*)$/
      );
      if (calloutMatch) {
        blocks.push({
          type: "callout",
          variant: calloutMatch[1],
          title: calloutMatch[2].trim(),
          body: calloutMatch[3].trim(),
        });
      } else {
        blocks.push({
          type: "blockquote",
          text: fullQuote,
        });
      }
      continue;
    }

    // GFM Table
    if (
      trimmed.startsWith("|") &&
      i + 1 < lines.length &&
      lines[i + 1].trim().startsWith("|") &&
      lines[i + 1].includes("-")
    ) {
      const tableLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim().startsWith("|") &&
        lines[i].trim().endsWith("|")
      ) {
        tableLines.push(lines[i].trim());
        i++;
      }
      if (tableLines.length >= 2) {
        const parseRow = (r: string) =>
          r
            .slice(1, -1)
            .split("|")
            .map((c) => c.trim());
        const headers = parseRow(tableLines[0]);
        const alignments = parseRow(tableLines[1]).map((c) => {
          if (c.startsWith(":") && c.endsWith(":")) return "center";
          if (c.endsWith(":")) return "right";
          return "left";
        });
        const rows = tableLines.slice(2).map(parseRow);
        blocks.push({ type: "table", headers, alignments, rows });
        continue;
      }
    }

    // Unordered list
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const items: string[] = [];
      while (
        i < lines.length &&
        (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))
      ) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // Regular paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("#") &&
      !lines[i].trim().startsWith(">") &&
      !lines[i].trim().startsWith("|") &&
      !lines[i].trim().startsWith("- ") &&
      !lines[i].trim().startsWith("* ") &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("```")
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "p", text: paraLines.join(" ") });
    }
  }

  return blocks;
}

/**
 * Courage Library Canonical MDX / Markdown Article Renderer.
 * 
 * Provides single-source-of-truth rendering for:
 * 1. Candidate Exam Knowledge Articles
 * 2. Admin Review Workbench Candidate Preview
 */
export function ExamMdxArticleRenderer({
  content,
  className = "",
  hideLeadingTitle = true,
}: ExamMdxArticleRendererProps) {
  const [expandedFaqs, setExpandedFaqs] = useState<Record<number, boolean>>({});

  const toggleFaq = (idx: number) => {
    setExpandedFaqs((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const blocks = useMemo(() => {
    const rawBlocks = parseMarkdownDocument(content);
    if (!hideLeadingTitle || rawBlocks.length === 0) return rawBlocks;

    // If hideLeadingTitle is true and the first block is h1:
    let startIndex = 0;
    if (rawBlocks[0]?.type === "h1") {
      startIndex = 1;
      // Also skip immediate description blockquote if present
      if (rawBlocks[1]?.type === "blockquote") {
        startIndex = 2;
      }
    }
    return rawBlocks.slice(startIndex);
  }, [content, hideLeadingTitle]);

  if (!blocks || blocks.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-slate-400 font-mono">
        No article content available.
      </div>
    );
  }

  return (
    <div className={`courage-article-content space-y-6 text-slate-800 ${className}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case "h1":
            return (
              <h1
                key={idx}
                className="text-2xl sm:text-3xl font-black text-slate-900 mt-8 mb-4 tracking-tight leading-tight"
              >
                {renderInlineMarkdown(block.text)}
              </h1>
            );

          case "h2": {
            const isFaq = block.text.toLowerCase().includes("frequently asked questions");
            const isSources = block.text.toLowerCase().includes("official sources");

            return (
              <h2
                key={idx}
                className="text-xl sm:text-2xl font-black text-slate-900 mt-10 mb-4 pb-2.5 border-b border-slate-100 flex items-center gap-2.5 tracking-tight"
              >
                {isFaq ? (
                  <HelpCircle className="w-5 h-5 text-blue-600 shrink-0" />
                ) : isSources ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <span className="w-1.5 h-5 bg-blue-600 rounded-full inline-block shrink-0" />
                )}
                <span>{renderInlineMarkdown(block.text)}</span>
              </h2>
            );
          }

          case "h3":
            return (
              <h3
                key={idx}
                className="text-base sm:text-lg font-bold text-slate-900 mt-6 mb-2 flex items-center gap-2"
              >
                <HelpCircle className="w-4 h-4 text-blue-500 shrink-0" />
                <span>{renderInlineMarkdown(block.text)}</span>
              </h3>
            );

          case "h4":
            return (
              <h4
                key={idx}
                className="text-sm sm:text-base font-bold text-slate-800 mt-4 mb-1.5"
              >
                {renderInlineMarkdown(block.text)}
              </h4>
            );

          case "callout": {
            const variantUpper = (block.variant || "INFO").toUpperCase();
            const calloutStyles = {
              TIP: {
                bg: "bg-emerald-50/70 border-emerald-200/90 text-emerald-950",
                badgeBg: "bg-emerald-100 text-emerald-800",
                icon: <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />,
              },
              WARNING: {
                bg: "bg-amber-50/70 border-amber-200/90 text-amber-950",
                badgeBg: "bg-amber-100 text-amber-900",
                icon: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />,
              },
              IMPORTANT: {
                bg: "bg-rose-50/70 border-rose-200/90 text-rose-950",
                badgeBg: "bg-rose-100 text-rose-900",
                icon: <ShieldCheck className="w-4 h-4 text-rose-600 shrink-0" />,
              },
              CAUTION: {
                bg: "bg-orange-50/70 border-orange-200/90 text-orange-950",
                badgeBg: "bg-orange-100 text-orange-900",
                icon: <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0" />,
              },
              INFO: {
                bg: "bg-blue-50/70 border-blue-200/90 text-blue-950",
                badgeBg: "bg-blue-100 text-blue-800",
                icon: <Info className="w-4 h-4 text-blue-600 shrink-0" />,
              },
            }[variantUpper] || {
              bg: "bg-blue-50/70 border-blue-200/90 text-blue-950",
              badgeBg: "bg-blue-100 text-blue-800",
              icon: <Info className="w-4 h-4 text-blue-600 shrink-0" />,
            };

            return (
              <div
                key={idx}
                className={`my-5 p-4 rounded-xl border shadow-2xs space-y-2 ${calloutStyles.bg}`}
              >
                <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
                  {calloutStyles.icon}
                  <span
                    className={`px-2 py-0.5 rounded-md font-mono text-[10px] uppercase font-bold ${calloutStyles.badgeBg}`}
                  >
                    {variantUpper}
                  </span>
                  <span>{renderInlineMarkdown(block.title)}</span>
                </div>
                {block.body && (
                  <div className="text-xs sm:text-sm text-slate-700 leading-relaxed pl-6">
                    {renderInlineMarkdown(block.body)}
                  </div>
                )}
              </div>
            );
          }

          case "blockquote":
            return (
              <blockquote
                key={idx}
                className="my-5 pl-4 py-2.5 border-l-4 border-blue-500 bg-slate-50/80 rounded-r-xl text-slate-700 italic text-sm sm:text-base leading-relaxed"
              >
                {renderInlineMarkdown(block.text)}
              </blockquote>
            );

          case "table":
            return (
              <div
                key={idx}
                className="my-6 overflow-x-auto rounded-xl border border-slate-200 shadow-2xs"
              >
                <table className="w-full text-left text-xs sm:text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-mono text-[11px] sm:text-xs uppercase font-bold tracking-wider">
                      {block.headers.map((h, hIdx) => (
                        <th
                          key={hIdx}
                          className="py-3 px-4 font-bold text-slate-800"
                          style={{ textAlign: (block.alignments[hIdx] as any) || "left" }}
                        >
                          {renderInlineMarkdown(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
                    {block.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={
                          rIdx % 2 === 0
                            ? "bg-white hover:bg-slate-50/80 transition-colors"
                            : "bg-slate-50/40 hover:bg-slate-50/80 transition-colors"
                        }
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="py-2.5 px-4 text-slate-800 font-medium"
                            style={{ textAlign: (block.alignments[cIdx] as any) || "left" }}
                          >
                            {renderInlineMarkdown(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case "ul": {
            // Check if this UL is a list of official sources: [Title](url) (Authority)
            const isSourceList = block.items.every((item) =>
              /^\[([^\]]+)\]\(([^)]+)\)/.test(item.trim())
            );

            if (isSourceList) {
              return (
                <div key={idx} className="grid sm:grid-cols-2 gap-3 my-4">
                  {block.items.map((item, itemIdx) => {
                    const match = item.trim().match(/^\[(?<title>[^\]]+)\]\((?<url>[^)]+)\)\s*(?:\((?<auth>[^)]+)\))?$/);
                    if (match?.groups) {
                      const title = match.groups.title;
                      const url = match.groups.url;
                      const authority = match.groups.auth || "Official Commission";
                      const isSafe = isSafeUrl(url);

                      return (
                        <div
                          key={itemIdx}
                          className="p-3.5 rounded-xl bg-slate-50/90 border border-slate-200/80 text-xs flex items-center justify-between gap-3 shadow-2xs hover:bg-slate-100/70 transition-colors"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <span className="font-bold text-slate-900 block truncate">{title}</span>
                            <span className="text-slate-500 text-[11px] block">{authority}</span>
                          </div>
                          {isSafe && (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300 shadow-2xs shrink-0 transition-colors"
                              aria-label={`Open source ${title}`}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div key={itemIdx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                        {renderInlineMarkdown(item)}
                      </div>
                    );
                  })}
                </div>
              );
            }

            return (
              <ul
                key={idx}
                className="my-4 space-y-2 pl-5 list-disc text-slate-700 text-sm sm:text-base leading-relaxed"
              >
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="leading-relaxed">
                    {renderInlineMarkdown(item)}
                  </li>
                ))}
              </ul>
            );
          }

          case "ol":
            return (
              <ol
                key={idx}
                className="my-4 space-y-2 pl-5 list-decimal text-slate-700 text-sm sm:text-base leading-relaxed font-medium"
              >
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="leading-relaxed">
                    <span className="font-normal text-slate-700">
                      {renderInlineMarkdown(item)}
                    </span>
                  </li>
                ))}
              </ol>
            );

          case "code":
            return (
              <pre
                key={idx}
                className="my-5 overflow-x-auto rounded-xl bg-slate-900 p-4 font-mono text-xs text-slate-100 shadow-inner"
              >
                <code>{block.code}</code>
              </pre>
            );

          case "p":
          default:
            return (
              <p
                key={idx}
                className="my-3.5 text-sm sm:text-base text-slate-700 leading-relaxed font-normal"
              >
                {renderInlineMarkdown(block.text)}
              </p>
            );
        }
      })}
    </div>
  );
}
