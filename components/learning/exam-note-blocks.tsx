import React from "react";
import { LessonBlocksRenderer } from "@/components/learning/lesson-blocks-renderer";
import { KatexMath } from "@/components/learning/katex-math";
import type { LessonBlock } from "@/lib/lessons/blocks";

/**
 * CA-7: an exam note's blocks (unique exam-specific content: how the exam asks the node). Never the master lesson's
 * body — the exam-topic page still links to the lesson instead of rendering it. Notes carry no internal links.
 */
export function ExamNoteBlocks({ blocks }: { blocks: LessonBlock[] }) {
  return <LessonBlocksRenderer blocks={blocks} links={{ nodes: {}, images: {} }} Math={KatexMath} />;
}
