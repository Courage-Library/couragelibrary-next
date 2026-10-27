/**
 * CA-4: the machine-translation seam (architect ruling: "a later flag — interface only now, no provider"). Nothing here
 * calls a network; getTranslationProvider() returns null until a provider is added behind LESSON_MT_ENABLED in a later,
 * separately approved phase. The paste flow (lib/prompts/translate-prompt.ts) is the only Hindi path today.
 */
import type { LessonBlock, LessonMeta } from "@/lib/lessons/blocks";

export interface TranslationProvider {
  readonly id: string;
  /** Returns the pasted-answer text for parseTranslationPaste (so a provider passes exactly the same checks). */
  translateLesson(input: { meta: LessonMeta; blocks: LessonBlock[]; prompt: string }): Promise<string>;
}

/** Off: no provider is configured or bundled. */
export const LESSON_MT_ENABLED = false;

export function getTranslationProvider(): TranslationProvider | null {
  return null;
}
